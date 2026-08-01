import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const MACH_O_64_LE_MAGIC = 0xfeedfacf;
const MACH_O_64_HEADER_BYTES = 32;
const LC_SEGMENT_64 = 0x19;
const LC_CODE_SIGNATURE = 0x1d;
const MAX_LOAD_COMMANDS = 4096;
const PE_DOS_HEADER_BYTES = 64;
const PE_SIGNATURE_BYTES = Buffer.from([0x50, 0x45, 0x00, 0x00]);
const PE_COFF_HEADER_BYTES = 20;
const PE_OPTIONAL_MAGIC_32 = 0x10b;
const PE_OPTIONAL_MAGIC_64 = 0x20b;
const PE_CHECKSUM_OFFSET = 64;
const PE_CERTIFICATE_DIRECTORY_INDEX = 4;
const PE_CERTIFICATE_ALIGNMENT = 8;

const failMachO = (message: string): never => {
  throw new TypeError(`invalid signed Mach-O native binding: ${message}`);
};

const readU32 = (bytes: Buffer, offset: number, label: string): number => {
  if (offset < 0 || offset + 4 > bytes.length) {
    failMachO(`${label} is out of bounds`);
  }
  return bytes.readUInt32LE(offset);
};

const failPe = (message: string): never => {
  throw new TypeError(`invalid Authenticode PE native binding: ${message}`);
};

const readPeU16 = (
  bytes: Buffer,
  offset: number,
  limit: number,
  label: string,
): number => {
  if (offset < 0 || offset + 2 > limit || offset + 2 > bytes.length) {
    failPe(`${label} is out of bounds`);
  }
  return bytes.readUInt16LE(offset);
};

const readPeU32 = (
  bytes: Buffer,
  offset: number,
  limit: number,
  label: string,
): number => {
  if (offset < 0 || offset + 4 > limit || offset + 4 > bytes.length) {
    failPe(`${label} is out of bounds`);
  }
  return bytes.readUInt32LE(offset);
};

const hasExactSegmentName = (
  bytes: Buffer,
  offset: number,
  name: string,
): boolean => {
  const field = bytes.subarray(offset, offset + 16);
  const expected = Buffer.from(name, "ascii");
  return (
    field.subarray(0, expected.length).equals(expected) &&
    field.subarray(expected.length).every((byte) => byte === 0)
  );
};

/**
 * Returns a signing-identity-independent SHA-256 for one thin, little-endian
 * 64-bit Mach-O image, or null when the input is not that file format.
 *
 * Only the final signature blob and its tightly bounded Mach-O container sizes
 * are excluded. Callers must still rely on macOS code-signature enforcement
 * before loading a binary accepted through this digest.
 */
export const machOSigningIndependentSha256 = (bytes: Buffer): string | null => {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("native artifact bytes must be a Buffer");
  }
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== MACH_O_64_LE_MAGIC) {
    return null;
  }
  if (bytes.length < MACH_O_64_HEADER_BYTES) {
    failMachO("header is truncated");
  }

  const commandCount = readU32(bytes, 16, "load-command count");
  const commandBytes = readU32(bytes, 20, "load-command byte length");
  if (commandCount === 0 || commandCount > MAX_LOAD_COMMANDS) {
    failMachO("load-command count is outside the supported bound");
  }
  const commandEnd = MACH_O_64_HEADER_BYTES + commandBytes;
  if (commandEnd < MACH_O_64_HEADER_BYTES || commandEnd > bytes.length) {
    failMachO("load-command table is out of bounds");
  }

  let offset = MACH_O_64_HEADER_BYTES;
  let codeSignatureCommand: number | undefined;
  let linkeditSegment: number | undefined;
  for (let index = 0; index < commandCount; index += 1) {
    if (offset + 8 > commandEnd) {
      failMachO("load-command header is truncated");
    }
    const command = readU32(bytes, offset, "load-command type");
    const size = readU32(bytes, offset + 4, "load-command size");
    if (size < 8 || size % 8 !== 0 || offset + size > commandEnd) {
      failMachO("load-command size is non-canonical");
    }
    if (command === LC_CODE_SIGNATURE) {
      if (codeSignatureCommand !== undefined || size !== 16) {
        failMachO("code-signature command is missing or duplicated");
      }
      codeSignatureCommand = offset;
    } else if (
      command === LC_SEGMENT_64 &&
      size >= 72 &&
      hasExactSegmentName(bytes, offset + 8, "__LINKEDIT")
    ) {
      if (linkeditSegment !== undefined) {
        failMachO("__LINKEDIT segment is duplicated");
      }
      linkeditSegment = offset;
    }
    offset += size;
  }
  if (offset !== commandEnd) {
    failMachO("load-command byte length is inconsistent");
  }
  if (codeSignatureCommand === undefined || linkeditSegment === undefined) {
    throw new TypeError(
      "invalid signed Mach-O native binding: required code-signature layout is absent",
    );
  }
  const codeSignatureCommandOffset = codeSignatureCommand;
  const linkeditSegmentOffset = linkeditSegment;

  const signatureOffset = readU32(
    bytes,
    codeSignatureCommandOffset + 8,
    "code-signature offset",
  );
  const signatureBytes = readU32(
    bytes,
    codeSignatureCommandOffset + 12,
    "code-signature byte length",
  );
  if (
    signatureOffset < commandEnd ||
    signatureBytes === 0 ||
    signatureOffset + signatureBytes !== bytes.length
  ) {
    failMachO("code signature must be the final non-empty file region");
  }

  const linkeditFileOffset = Number(
    bytes.readBigUInt64LE(linkeditSegmentOffset + 40),
  );
  const linkeditFileBytes = Number(
    bytes.readBigUInt64LE(linkeditSegmentOffset + 48),
  );
  if (
    !Number.isSafeInteger(linkeditFileOffset) ||
    !Number.isSafeInteger(linkeditFileBytes) ||
    linkeditFileOffset > signatureOffset ||
    linkeditFileOffset + linkeditFileBytes !== bytes.length
  ) {
    failMachO("__LINKEDIT does not contain the final code signature");
  }

  const normalized = Buffer.from(bytes.subarray(0, signatureOffset));
  normalized.fill(0, linkeditSegmentOffset + 32, linkeditSegmentOffset + 40);
  normalized.fill(0, linkeditSegmentOffset + 48, linkeditSegmentOffset + 56);
  normalized.fill(
    0,
    codeSignatureCommandOffset + 12,
    codeSignatureCommandOffset + 16,
  );
  return createHash("sha256").update(normalized).digest("hex");
};

/**
 * Returns a signing-identity-independent SHA-256 for one PE/COFF image, or
 * null when the input is not that file format.
 *
 * Authenticode may change only the checksum, certificate-directory entry,
 * bounded zero alignment padding, and one final certificate table. Callers
 * must still rely on Windows Authenticode enforcement before loading it.
 */
export const peSigningIndependentSha256 = (
  bytes: Buffer,
  unsignedSize: number = bytes?.length,
  options: { requireSigned?: boolean } = {},
): string | null => {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("native artifact bytes must be a Buffer");
  }
  if (bytes.length < 2 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    return null;
  }
  if (bytes.length < PE_DOS_HEADER_BYTES) {
    failPe("DOS header is truncated");
  }
  if (
    !Number.isSafeInteger(unsignedSize) ||
    unsignedSize < PE_DOS_HEADER_BYTES ||
    unsignedSize > bytes.length
  ) {
    failPe("unsigned byte length is outside the file bounds");
  }
  const requireSigned = options.requireSigned ?? false;
  if (typeof requireSigned !== "boolean") {
    throw new TypeError("requireSigned must be a boolean");
  }

  const peOffset = readPeU32(bytes, 0x3c, unsignedSize, "PE header offset");
  if (
    peOffset < PE_DOS_HEADER_BYTES ||
    peOffset + PE_SIGNATURE_BYTES.length + PE_COFF_HEADER_BYTES > unsignedSize
  ) {
    failPe("PE/COFF header is out of bounds");
  }
  if (!bytes.subarray(peOffset, peOffset + 4).equals(PE_SIGNATURE_BYTES)) {
    failPe("PE signature is missing");
  }

  const coffOffset = peOffset + PE_SIGNATURE_BYTES.length;
  const optionalBytes = readPeU16(
    bytes,
    coffOffset + 16,
    unsignedSize,
    "optional-header byte length",
  );
  const optionalOffset = coffOffset + PE_COFF_HEADER_BYTES;
  const optionalEnd = optionalOffset + optionalBytes;
  if (optionalBytes === 0 || optionalEnd > unsignedSize) {
    failPe("optional header is out of bounds");
  }
  const magic = readPeU16(
    bytes,
    optionalOffset,
    optionalEnd,
    "optional-header magic",
  );
  let directoryCountOffset: number;
  let directoryOffset: number;
  if (magic === PE_OPTIONAL_MAGIC_32) {
    directoryCountOffset = optionalOffset + 92;
    directoryOffset = optionalOffset + 96;
  } else if (magic === PE_OPTIONAL_MAGIC_64) {
    directoryCountOffset = optionalOffset + 108;
    directoryOffset = optionalOffset + 112;
  } else {
    throw new TypeError(
      "invalid Authenticode PE native binding: optional-header magic is unsupported",
    );
  }
  const directoryCount = readPeU32(
    bytes,
    directoryCountOffset,
    optionalEnd,
    "data-directory count",
  );
  if (directoryCount <= PE_CERTIFICATE_DIRECTORY_INDEX) {
    failPe("certificate-table directory is absent");
  }
  const certificateDirectory =
    directoryOffset + PE_CERTIFICATE_DIRECTORY_INDEX * 8;
  const certificateOffset = readPeU32(
    bytes,
    certificateDirectory,
    optionalEnd,
    "certificate-table file offset",
  );
  const certificateBytes = readPeU32(
    bytes,
    certificateDirectory + 4,
    optionalEnd,
    "certificate-table byte length",
  );
  const checksumOffset = optionalOffset + PE_CHECKSUM_OFFSET;
  readPeU32(bytes, checksumOffset, optionalEnd, "PE checksum");

  if (certificateOffset === 0 || certificateBytes === 0) {
    if (
      certificateOffset !== 0 ||
      certificateBytes !== 0 ||
      unsignedSize !== bytes.length
    ) {
      failPe("unsigned certificate-table layout is inconsistent");
    }
    if (requireSigned) {
      failPe("Authenticode certificate table is absent");
    }
  } else {
    if (
      certificateOffset % PE_CERTIFICATE_ALIGNMENT !== 0 ||
      certificateBytes < 8 ||
      certificateBytes % PE_CERTIFICATE_ALIGNMENT !== 0 ||
      certificateOffset < unsignedSize ||
      certificateOffset - unsignedSize >= PE_CERTIFICATE_ALIGNMENT ||
      certificateOffset + certificateBytes !== bytes.length
    ) {
      failPe("certificate table is not the final aligned file region");
    }
    if (
      !bytes
        .subarray(unsignedSize, certificateOffset)
        .every((byte) => byte === 0)
    ) {
      failPe("certificate alignment padding is non-zero");
    }
  }

  const normalized = Buffer.from(bytes.subarray(0, unsignedSize));
  normalized.fill(0, checksumOffset, checksumOffset + 4);
  normalized.fill(0, certificateDirectory, certificateDirectory + 8);
  return createHash("sha256").update(normalized).digest("hex");
};
