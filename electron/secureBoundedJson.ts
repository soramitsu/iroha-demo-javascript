import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  getInstalledIrohaJsNativeBinding,
  installGlobalIrohaJsNativeBinding,
  REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION,
} from "./irohaJsNativeDir";

type SecurePrivateFileNativeBinding = Readonly<{
  securePrivateFileAbiVersion(): number;
  securePrivateDirectoryEnsure(rootPath: string): void;
  securePrivateFileRead(
    rootPath: string,
    filename: string,
    maximumBytes: number,
  ): Buffer | null;
  securePrivateFileWriteAtomic(
    rootPath: string,
    filename: string,
    bytes: Uint8Array,
    maximumBytes: number,
  ): Buffer;
}>;

export type SecureBoundedPathOptions = Readonly<{
  label: string;
  maximumBytes: number;
}>;

export const GOVERNANCE_INTEGRITY_DIRECTORY_NAME = "governance-integrity-v1";

export const governanceIntegrityDirectoryPath = (
  userDataPath: string,
): string => join(userDataPath, GOVERNANCE_INTEGRITY_DIRECTORY_NAME);

export type SecureBoundedFile = Readonly<{
  path: string;
  bytes: Buffer;
  sha256: string;
}>;

const isSecurePrivateFileNativeBinding = (
  value: unknown,
): value is SecurePrivateFileNativeBinding =>
  Boolean(
    value &&
      typeof value === "object" &&
      "securePrivateFileAbiVersion" in value &&
      typeof value.securePrivateFileAbiVersion === "function" &&
      "securePrivateDirectoryEnsure" in value &&
      typeof value.securePrivateDirectoryEnsure === "function" &&
      "securePrivateFileRead" in value &&
      typeof value.securePrivateFileRead === "function" &&
      "securePrivateFileWriteAtomic" in value &&
      typeof value.securePrivateFileWriteAtomic === "function",
  );

const requireSecurePrivateFileNativeBinding =
  (): SecurePrivateFileNativeBinding => {
    const installed =
      getInstalledIrohaJsNativeBinding() ??
      installGlobalIrohaJsNativeBinding(import.meta.url);
    if (!isSecurePrivateFileNativeBinding(installed)) {
      throw new Error(
        "The reviewed Iroha native binding is missing secure private-file support.",
      );
    }
    let observedAbiVersion: unknown;
    try {
      observedAbiVersion = installed.securePrivateFileAbiVersion();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The reviewed Iroha native secure private-file ABI probe failed: ${reason}`,
      );
    }
    if (observedAbiVersion !== REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION) {
      throw new Error(
        `The reviewed Iroha native binding requires secure private-file ABI ${REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION}; observed ${String(
          observedAbiVersion,
        )}.`,
      );
    }
    return installed;
  };

const assertSecureBoundedPathOptions = (
  path: string,
  options: SecureBoundedPathOptions,
): {
  label: string;
  rootPath: string;
  filename: string;
} => {
  const label = String(options.label ?? "").trim();
  const filename = basename(path);
  const rootPath = dirname(path);
  if (
    !label ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    !filename ||
    filename === "." ||
    filename === ".." ||
    rootPath === path ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1
  ) {
    throw new Error(
      `${label || "Secure bounded file"} path or byte bound is invalid.`,
    );
  }
  return { label, rootPath, filename };
};

const nativeOperationError = (
  label: string,
  operation: string,
  error: unknown,
): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${label} ${operation} failed: ${reason}`);
  Object.defineProperty(wrapped, "cause", {
    configurable: true,
    enumerable: false,
    value: error,
    writable: true,
  });
  return wrapped;
};

/**
 * Read one current-user-private artifact through the provenance-verified native
 * boundary. The native host owns platform-specific ACL/mode, no-follow,
 * identity, hard-link, and bounded-read enforcement.
 */
export const secureReadBoundedFile = (
  path: string,
  options: SecureBoundedPathOptions,
): SecureBoundedFile => {
  const { label, rootPath, filename } = assertSecureBoundedPathOptions(
    path,
    options,
  );
  const native = requireSecurePrivateFileNativeBinding();
  let bytes: Buffer | null;
  try {
    native.securePrivateDirectoryEnsure(rootPath);
    bytes = native.securePrivateFileRead(
      rootPath,
      filename,
      options.maximumBytes,
    );
  } catch (error) {
    throw nativeOperationError(label, "read", error);
  }
  if (bytes === null) {
    const error = new Error(
      `${label} does not exist.`,
    ) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 1 ||
    bytes.length > options.maximumBytes
  ) {
    throw new Error(
      `${label} native read did not return non-empty bounded bytes.`,
    );
  }
  return {
    path,
    bytes: Buffer.from(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

/**
 * Atomically replace one current-user-private file through the native boundary,
 * then require its exact read-back bytes.
 */
export const secureWriteBoundedFile = (
  path: string,
  bytes: Buffer,
  options: SecureBoundedPathOptions,
): SecureBoundedFile => {
  const { label, rootPath, filename } = assertSecureBoundedPathOptions(
    path,
    options,
  );
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 1 ||
    bytes.length > options.maximumBytes
  ) {
    throw new Error(`${label} bytes exceed their non-empty bounded size.`);
  }
  const native = requireSecurePrivateFileNativeBinding();
  let readBack: Buffer;
  try {
    native.securePrivateDirectoryEnsure(rootPath);
    readBack = native.securePrivateFileWriteAtomic(
      rootPath,
      filename,
      bytes,
      options.maximumBytes,
    );
  } catch (error) {
    throw nativeOperationError(label, "atomic write", error);
  }
  if (
    !Buffer.isBuffer(readBack) ||
    readBack.length !== bytes.length ||
    !readBack.equals(bytes)
  ) {
    throw new Error(`${label} atomic write did not read back exactly.`);
  }
  return {
    path,
    bytes: Buffer.from(readBack),
    sha256: createHash("sha256").update(readBack).digest("hex"),
  };
};

class StrictJsonScanner {
  private index = 0;
  private depth = 0;

  constructor(private readonly source: string) {}

  scan(): void {
    this.value();
    this.whitespace();
    if (this.index !== this.source.length) this.invalid();
  }

  private invalid(): never {
    throw new Error(`strict JSON syntax failed near byte ${this.index}`);
  }

  private whitespace(): void {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private value(): void {
    this.whitespace();
    const token = this.source[this.index];
    if (token === "{") return this.object();
    if (token === "[") return this.array();
    if (token === '"') {
      this.string();
      return;
    }
    for (const literal of ["true", "false", "null"] as const) {
      if (this.source.startsWith(literal, this.index)) {
        this.index += literal.length;
        return;
      }
    }
    const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;
    number.lastIndex = this.index;
    const match = number.exec(this.source);
    if (!match) this.invalid();
    this.index = number.lastIndex;
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > 128)
      throw new Error("strict JSON nesting exceeds 128 levels");
  }

  private object(): void {
    this.enter();
    this.index += 1;
    this.whitespace();
    const keys = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index += 1;
      this.depth -= 1;
      return;
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') this.invalid();
      const key = this.string();
      if (keys.has(key))
        throw new Error(`strict JSON has duplicate key ${key}.`);
      keys.add(key);
      this.whitespace();
      if (this.source[this.index] !== ":") this.invalid();
      this.index += 1;
      this.value();
      this.whitespace();
      if (this.source[this.index] === "}") {
        this.index += 1;
        this.depth -= 1;
        return;
      }
      if (this.source[this.index] !== ",") this.invalid();
      this.index += 1;
      this.whitespace();
    }
    this.invalid();
  }

  private array(): void {
    this.enter();
    this.index += 1;
    this.whitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      this.depth -= 1;
      return;
    }
    while (this.index < this.source.length) {
      this.value();
      this.whitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        this.depth -= 1;
        return;
      }
      if (this.source[this.index] !== ",") this.invalid();
      this.index += 1;
    }
    this.invalid();
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const token = this.source[this.index];
      if (token === '"') {
        this.index += 1;
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
      if (token === "\\") {
        this.index += 2;
      } else {
        if ((token?.codePointAt(0) ?? 0) < 0x20) this.invalid();
        this.index += 1;
      }
    }
    return this.invalid();
  }
}

export const parseStrictJson = (serialized: string, label: string): unknown => {
  try {
    new StrictJsonScanner(serialized).scan();
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error(
      `${label} is not unambiguous strict JSON: ${String(error)}`,
    );
  }
};

export const loadSecureBoundedJson = (
  path: string,
  options: SecureBoundedPathOptions,
): { value: unknown; sha256: string } => {
  const loaded = secureReadBoundedFile(path, options);
  let serialized: string;
  try {
    serialized = loaded.bytes.toString("utf8");
    if (!Buffer.from(serialized, "utf8").equals(loaded.bytes)) {
      throw new Error("non-canonical UTF-8");
    }
  } catch (error) {
    throw new Error(`${options.label} is not strict UTF-8: ${String(error)}`);
  }
  return {
    value: parseStrictJson(serialized, options.label),
    sha256: loaded.sha256,
  };
};
