import {
  BscMainnetSccpProver,
  BscTestnetSccpProver,
  buildBscMainnetSccpDestinationProofRequest,
  buildBscMainnetSccpDestinationSubmission,
  buildBscTestnetSccpDestinationProofRequest,
  buildBscTestnetSccpDestinationSubmission,
  buildEvmSccpBridgeProofSubmitPayload,
  buildTronSccpBridgeProofSubmitPayload,
  buildTronSccpProofRequest,
  buildTronSccpSubmission,
  TronSccpProver,
  wrapBscMainnetSccpDestinationProofResult,
  wrapBscTestnetSccpDestinationProofResult,
  wrapTronSccpProofResult,
  type BinaryLike,
  type EvmSccpBridgeProofSubmitPayloadInput,
  type EvmSccpDestinationBindingInput,
  type EvmSccpProofRequestInput,
  type EvmSccpProofResult,
  type EvmSccpProveFn,
  type EvmSccpSubmission,
  type TronSccpBridgeProofSubmitPayloadInput,
  type TronSccpDestinationBindingInput,
  type TronSccpProofResult,
  type TronSccpProofRequestInput,
  type TronSccpProveFn,
  type TronSccpSubmission,
} from "@iroha/iroha-js/sccp";
import { snapshotSccpDataValue } from "@/utils/sccpDataSnapshot";

const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
const BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";

export type SerializedSccpValue =
  | null
  | string
  | number
  | boolean
  | SerializedSccpValue[]
  | { [key: string]: SerializedSccpValue };

export type TronSccpProofPackageInput = {
  witness: TronSccpProofRequestInput;
  proofBytes?: BinaryLike;
  proofResult?: TronSccpProofResult;
  authority?: string;
  messageBundle?: Record<string, unknown>;
  destinationBinding?: TronSccpDestinationBindingInput;
};

export type TronSccpProofGenerationInput = TronSccpProofPackageInput & {
  prove?: TronSccpProveFn;
};

export type TronSccpProofPackage = {
  request: SerializedSccpValue;
  submission: SerializedSccpValue | null;
  bridgePayload: SerializedSccpValue | null;
};

export type BscSccpProofPackageInput = {
  witness: EvmSccpProofRequestInput;
  proofBytes?: BinaryLike;
  proofResult?: EvmSccpProofResult;
  authority?: string;
  messageBundle?: Record<string, unknown>;
  destinationBinding?: EvmSccpDestinationBindingInput;
  canonicalPayloadHex?: string;
  proverModuleUrl?: string;
};

export type BscSccpProofGenerationInput = BscSccpProofPackageInput & {
  prove?: EvmSccpProveFn;
};

export type BscSccpProofPackage = {
  request: SerializedSccpValue;
  submission: SerializedSccpValue | null;
  bridgePayload: SerializedSccpValue | null;
  canonicalPayloadHex: string | null;
};

const snapshotProofPackageInput = <T>(input: T, label: string): T => {
  return snapshotSccpDataValue(input, label);
};

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const SCCP_SERIALIZED_VALUE_ERROR =
  "SCCP proof package values must contain only acyclic enumerable string-keyed data properties with JSON-compatible values or binary proof bytes.";

const isCanonicalArrayIndexKey = (key: string, length: number): boolean => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
};

const isPlainSerializableRecord = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const ownSerializableDataEntries = (
  value: object,
  options: { allowAccessors: boolean },
): Array<[string, unknown]> => {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries: Array<[string, unknown]> = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
        throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
      }
    }
  } else if (!isPlainSerializableRecord(value)) {
    throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      continue;
    }
    if (Array.isArray(value) && key === "length") {
      continue;
    }
    if (!descriptor.enumerable) {
      throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
    }
    if (
      typeof key !== "string" ||
      (Array.isArray(value) && !isCanonicalArrayIndexKey(key, value.length))
    ) {
      throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
    }
    if (!("value" in descriptor)) {
      if (!options.allowAccessors || typeof descriptor.get !== "function") {
        throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
      }
      entries.push([key, descriptor.get.call(value)]);
      continue;
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
};

const normalizeOptionalCanonicalPayloadHex = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be 0x-prefixed byte hex.`);
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized !== value.trim() ||
    !/^0x(?:[0-9a-f]{2})*$/u.test(normalized)
  ) {
    throw new Error(`${label} must be canonical 0x-prefixed byte hex.`);
  }
  return normalized;
};

const readOwnSccpProofDataProperty = (
  value: object,
  keys: readonly string[],
): unknown => {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor) {
      continue;
    }
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
    }
    return descriptor.value;
  }
  return undefined;
};

const BSC_NATIVE_EVM_PROVER_BUNDLE_HASH_KEYS = [
  "nativeEvmProverBundleHash",
  "native_evm_prover_bundle_hash",
] as const;

type BscRuntimeBoundProofRequest<T extends object> = T & {
  nativeEvmProverBundleHash?: string;
};

const readOptionalBscNativeEvmProverBundleHash = (
  value: unknown,
  label: string,
): string | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const hash = readOwnSccpProofDataProperty(
    value,
    BSC_NATIVE_EVM_PROVER_BUNDLE_HASH_KEYS,
  );
  if (hash === undefined || hash === null || hash === "") {
    return undefined;
  }
  if (typeof hash !== "string") {
    throw new Error(`${label} nativeEvmProverBundleHash must be canonical hex.`);
  }
  const normalized = hash.trim().toLowerCase();
  if (
    normalized !== hash.trim() ||
    !/^0x[0-9a-f]{64}$/u.test(normalized) ||
    /^0x0{64}$/u.test(normalized)
  ) {
    throw new Error(
      `${label} nativeEvmProverBundleHash must be a non-zero 32-byte hex value.`,
    );
  }
  return normalized;
};

const bindBscNativeEvmProverBundleHash = <T extends object>(
  request: T,
  nativeEvmProverBundleHash: string | undefined,
): BscRuntimeBoundProofRequest<T> =>
  nativeEvmProverBundleHash
    ? { ...request, nativeEvmProverBundleHash }
    : request;

const readBscProofPackageNetwork = (
  witness: EvmSccpProofRequestInput,
): "mainnet" | "testnet" => {
  const binding = readOwnSccpProofDataProperty(witness as object, [
    "destinationBinding",
    "destination_binding",
  ]);
  let networkId = BSC_TESTNET_NETWORK_ID_HEX;
  if (binding !== undefined && binding !== null) {
    if (
      typeof binding !== "object" ||
      Array.isArray(binding) ||
      !isPlainSerializableRecord(binding)
    ) {
      throw new Error(
        "BSC SCCP proof request destination binding must be a plain object.",
      );
    }
    const networkIdValue =
      readOwnSccpProofDataProperty(binding, [
        "networkId",
        "network_id",
        "networkIdHex",
        "network_id_hex",
      ]) ?? BSC_TESTNET_NETWORK_ID_HEX;
    if (typeof networkIdValue !== "string") {
      throw new Error(
        "BSC SCCP proof request network id must be canonical hex.",
      );
    }
    networkId = networkIdValue.trim().toLowerCase();
  }
  if (networkId === "0x38" || networkId === BSC_MAINNET_NETWORK_ID_HEX) {
    return "mainnet";
  }
  if (networkId === "0x61" || networkId === BSC_TESTNET_NETWORK_ID_HEX) {
    return "testnet";
  }
  throw new Error("BSC SCCP proof request must target BSC mainnet or testnet.");
};

const serializeSccpValueWithOptions = (
  value: unknown,
  options: { allowAccessors: boolean },
  visiting = new WeakSet<object>(),
): SerializedSccpValue => {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
    }
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  if (Array.isArray(value)) {
    if (visiting.has(value)) {
      throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
    }
    visiting.add(value);
    try {
      return ownSerializableDataEntries(value, options).map(([, entry]) =>
        serializeSccpValueWithOptions(entry, options, visiting),
      );
    } finally {
      visiting.delete(value);
    }
  }
  if (typeof value === "object") {
    if (visiting.has(value)) {
      throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
    }
    visiting.add(value);
    try {
      return Object.fromEntries(
        ownSerializableDataEntries(value, options).map(([key, entry]) => [
          key,
          serializeSccpValueWithOptions(entry, options, visiting),
        ]),
      );
    } finally {
      visiting.delete(value);
    }
  }
  throw new Error(SCCP_SERIALIZED_VALUE_ERROR);
};

export const serializeSccpValue = (value: unknown): SerializedSccpValue =>
  serializeSccpValueWithOptions(value, { allowAccessors: false });

const serializeTrustedSccpValue = (value: unknown): SerializedSccpValue =>
  serializeSccpValueWithOptions(value, { allowAccessors: true });

export const buildTronSccpProofPackage = (
  input: TronSccpProofPackageInput,
  snapshotInput = true,
): TronSccpProofPackage => {
  const packageInput = snapshotInput
    ? snapshotProofPackageInput(input, "TRON SCCP proof package input")
    : input;
  const request = buildTronSccpProofRequest(packageInput.witness);
  if (packageInput.proofResult) {
    if (packageInput.proofResult.requestHash !== request.requestHash) {
      throw new Error("TRON SCCP proof result must match the proof request.");
    }
    const submission: TronSccpSubmission = buildTronSccpSubmission({
      proofResult: packageInput.proofResult,
    });
    const bridgePayload =
      packageInput.authority &&
      packageInput.messageBundle &&
      packageInput.destinationBinding
        ? buildTronSccpBridgeProofSubmitPayload({
            authority: packageInput.authority,
            messageBundle: packageInput.messageBundle,
            tronSccpSubmission: submission,
            destinationBinding: packageInput.destinationBinding,
          } satisfies TronSccpBridgeProofSubmitPayloadInput)
        : null;

    return {
      request: serializeTrustedSccpValue(request),
      submission: serializeTrustedSccpValue(submission),
      bridgePayload: serializeTrustedSccpValue(bridgePayload),
    };
  }
  if (!packageInput.proofBytes) {
    return {
      request: serializeTrustedSccpValue(request),
      submission: null,
      bridgePayload: null,
    };
  }

  const proofResult = wrapTronSccpProofResult(packageInput.proofBytes, request);
  const submission: TronSccpSubmission = buildTronSccpSubmission({
    proofResult,
  });
  const bridgePayload =
    packageInput.authority &&
    packageInput.messageBundle &&
    packageInput.destinationBinding
      ? buildTronSccpBridgeProofSubmitPayload({
          authority: packageInput.authority,
          messageBundle: packageInput.messageBundle,
          tronSccpSubmission: submission,
          destinationBinding: packageInput.destinationBinding,
        } satisfies TronSccpBridgeProofSubmitPayloadInput)
      : null;

  return {
    request: serializeTrustedSccpValue(request),
    submission: serializeTrustedSccpValue(submission),
    bridgePayload: serializeTrustedSccpValue(bridgePayload),
  };
};

export const generateTronSccpProofPackage = async (
  input: TronSccpProofGenerationInput,
): Promise<TronSccpProofPackage> => {
  const { prove, ...packageInput } = input;
  if (typeof prove !== "function") {
    const error = new Error(
      "TRON SCCP Groth16 prover is not linked; provide a browser-safe prove function before generating production proofs.",
    );
    (error as Error & { code?: string }).code =
      "ERR_SCCP_TRON_PROVER_UNAVAILABLE";
    throw error;
  }
  const packageInputSnapshot = snapshotProofPackageInput(
    packageInput,
    "TRON SCCP proof package input",
  );
  const proverWitnessSnapshot = snapshotProofPackageInput(
    packageInputSnapshot.witness,
    "TRON SCCP proof witness",
  );
  const safeProve: TronSccpProveFn = async (request) =>
    snapshotProofPackageInput(await prove(request), "TRON SCCP proof result");
  const prover = new TronSccpProver({ prove: safeProve });
  const proofResult = await prover.prove(proverWitnessSnapshot);
  return buildTronSccpProofPackage(
    {
      ...packageInputSnapshot,
      proofResult,
    },
    false,
  );
};

export const buildBscSccpProofPackage = (
  input: BscSccpProofPackageInput,
  snapshotInput = true,
): BscSccpProofPackage => {
  const packageInput = snapshotInput
    ? snapshotProofPackageInput(input, "BSC SCCP proof package input")
    : input;
  const network = readBscProofPackageNetwork(packageInput.witness);
  const canonicalPayloadHex = normalizeOptionalCanonicalPayloadHex(
    packageInput.canonicalPayloadHex,
    "BSC SCCP proof package canonical payload bytes",
  );
  const request =
    network === "mainnet"
      ? buildBscMainnetSccpDestinationProofRequest(packageInput.witness)
      : buildBscTestnetSccpDestinationProofRequest(packageInput.witness);
  const nativeEvmProverBundleHash = readOptionalBscNativeEvmProverBundleHash(
    packageInput.witness,
    "BSC SCCP proof witness",
  );
  const runtimeRequest = bindBscNativeEvmProverBundleHash(
    request,
    nativeEvmProverBundleHash,
  );
  if (packageInput.proofResult) {
    if (packageInput.proofResult.requestHash !== request.requestHash) {
      throw new Error("BSC SCCP proof result must match the proof request.");
    }
    const submission: EvmSccpSubmission =
      network === "mainnet"
        ? buildBscMainnetSccpDestinationSubmission({
            proofResult: packageInput.proofResult,
          })
        : buildBscTestnetSccpDestinationSubmission({
            proofResult: packageInput.proofResult,
          });
    const bridgePayload =
      packageInput.authority &&
      packageInput.messageBundle &&
      packageInput.destinationBinding
        ? buildEvmSccpBridgeProofSubmitPayload({
            authority: packageInput.authority,
            messageBundle: packageInput.messageBundle,
            evmSccpSubmission: submission,
            destinationBinding: packageInput.destinationBinding,
          } satisfies EvmSccpBridgeProofSubmitPayloadInput)
        : null;

    return {
      request: serializeTrustedSccpValue(runtimeRequest),
      submission: serializeTrustedSccpValue(submission),
      bridgePayload: serializeTrustedSccpValue(bridgePayload),
      canonicalPayloadHex,
    };
  }
  if (!packageInput.proofBytes) {
    return {
      request: serializeTrustedSccpValue(runtimeRequest),
      submission: null,
      bridgePayload: null,
      canonicalPayloadHex,
    };
  }

  const proofResult =
    network === "mainnet"
      ? wrapBscMainnetSccpDestinationProofResult(
          packageInput.proofBytes,
          request,
        )
      : wrapBscTestnetSccpDestinationProofResult(
          packageInput.proofBytes,
          request,
        );
  const submission: EvmSccpSubmission =
    network === "mainnet"
      ? buildBscMainnetSccpDestinationSubmission({
          proofResult,
        })
      : buildBscTestnetSccpDestinationSubmission({
          proofResult,
        });
  const bridgePayload =
    packageInput.authority &&
    packageInput.messageBundle &&
    packageInput.destinationBinding
      ? buildEvmSccpBridgeProofSubmitPayload({
          authority: packageInput.authority,
          messageBundle: packageInput.messageBundle,
          evmSccpSubmission: submission,
          destinationBinding: packageInput.destinationBinding,
        } satisfies EvmSccpBridgeProofSubmitPayloadInput)
      : null;

  return {
    request: serializeTrustedSccpValue(runtimeRequest),
    submission: serializeTrustedSccpValue(submission),
    bridgePayload: serializeTrustedSccpValue(bridgePayload),
    canonicalPayloadHex,
  };
};

export const generateBscSccpProofPackage = async (
  input: BscSccpProofGenerationInput,
): Promise<BscSccpProofPackage> => {
  const { prove, proverModuleUrl: _proverModuleUrl, ...packageInput } = input;
  if (typeof prove !== "function") {
    const error = new Error(
      "BSC SCCP Groth16 prover is not linked; provide a browser-safe prove function before generating production proofs.",
    );
    (error as Error & { code?: string }).code =
      "ERR_SCCP_BSC_PROVER_UNAVAILABLE";
    throw error;
  }
  const packageInputSnapshot = snapshotProofPackageInput(
    packageInput,
    "BSC SCCP proof package input",
  );
  const proverWitnessSnapshot = snapshotProofPackageInput(
    packageInputSnapshot.witness,
    "BSC SCCP proof witness",
  );
  const nativeEvmProverBundleHash = readOptionalBscNativeEvmProverBundleHash(
    proverWitnessSnapshot,
    "BSC SCCP proof witness",
  );
  const safeProve: EvmSccpProveFn = async (request) =>
    snapshotProofPackageInput(
      await prove(
        bindBscNativeEvmProverBundleHash(
          request,
          nativeEvmProverBundleHash,
        ),
      ),
      "BSC SCCP proof result",
    );
  const prover =
    readBscProofPackageNetwork(proverWitnessSnapshot) === "mainnet"
      ? new BscMainnetSccpProver({ prove: safeProve })
      : new BscTestnetSccpProver({ prove: safeProve });
  const proofResult = await prover.prove(proverWitnessSnapshot);
  return buildBscSccpProofPackage(
    {
      ...packageInputSnapshot,
      proofResult,
    },
    false,
  );
};
