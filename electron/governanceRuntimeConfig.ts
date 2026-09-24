import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { parseJsonWithoutDuplicateObjectKeys } from "../src/utils/json";
import {
  CBSI_CORE_API_BASE_URL_ENV,
  GOVERNANCE_VALIDATION_FEE_CONFIG_ENV,
  readCbsiCoreApiBaseUrl,
  readGovernanceValidationFeeConfig,
  type GovernanceValidationFeeEnabledConfig,
} from "./governanceValidationFee";

export const GOVERNANCE_RUNTIME_CONFIG_SCHEMA =
  "sora.wallet.governance-runtime.v1";
export const GOVERNANCE_RUNTIME_CONFIG_FILENAME = "governance-runtime.json";
export const GOVERNANCE_RUNTIME_CONFIG_IPC_CHANNEL =
  "governance:getValidationFeeRuntimeConfig";

const MAX_RUNTIME_CONFIG_BYTES = 1024 * 1024;
const RUNTIME_CONFIG_KEYS = Object.freeze([
  "cbsiCoreApiBaseUrl",
  "schema",
  "validationFee",
]);

export type GovernanceRuntimeConfig = {
  validationFee: GovernanceValidationFeeEnabledConfig;
  cbsiCoreApiBaseUrl: string;
};

type RuntimeConfigFileReader = (path: string) => string;

export type LoadGovernanceRuntimeConfigOptions = {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  readFile?: RuntimeConfigFileReader;
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const exactRecord = (
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const exactKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== exactKeys.length ||
    actualKeys.some((key, index) => key !== exactKeys[index])
  ) {
    throw new Error(`${label} fields must be exactly ${exactKeys.join(", ")}.`);
  }
  return record;
};

const defaultReadFile: RuntimeConfigFileReader = (path) => {
  let descriptor: number | null = null;
  try {
    const noFollow =
      typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      throw new Error(`Governance runtime config path is not a file: ${path}`);
    }
    if (before.size > BigInt(MAX_RUNTIME_CONFIG_BYTES)) {
      throw new Error(
        `Governance runtime config exceeds ${MAX_RUNTIME_CONFIG_BYTES} bytes: ${path}`,
      );
    }

    const bytes = Buffer.allocUnsafe(MAX_RUNTIME_CONFIG_BYTES + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset > MAX_RUNTIME_CONFIG_BYTES) {
      throw new Error(
        `Governance runtime config exceeds ${MAX_RUNTIME_CONFIG_BYTES} bytes: ${path}`,
      );
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (
      !after.isFile() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.size !== BigInt(offset)
    ) {
      throw new Error(
        `Governance runtime config changed while it was being read: ${path}`,
      );
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, offset),
    );
  } catch (error) {
    throw new Error(
      `Governance runtime config could not be read at ${path}: ${errorMessage(error)}`,
    );
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parseRuntimeConfig = (
  validationFeeSource: unknown,
  cbsiCoreApiBaseUrlSource: unknown,
  sourceLabel: string,
): GovernanceRuntimeConfig => {
  let serializedValidationFee: string;
  try {
    serializedValidationFee =
      typeof validationFeeSource === "string"
        ? validationFeeSource
        : JSON.stringify(validationFeeSource);
  } catch (error) {
    throw new Error(
      `${sourceLabel} validationFee could not be serialized: ${errorMessage(error)}`,
    );
  }
  if (!serializedValidationFee) {
    throw new Error(`${sourceLabel} is invalid: validationFee is required.`);
  }
  try {
    return {
      validationFee: readGovernanceValidationFeeConfig(serializedValidationFee),
      cbsiCoreApiBaseUrl: readCbsiCoreApiBaseUrl(
        typeof cbsiCoreApiBaseUrlSource === "string"
          ? cbsiCoreApiBaseUrlSource
          : "",
      ),
    };
  } catch (error) {
    throw new Error(`${sourceLabel} is invalid: ${errorMessage(error)}`);
  }
};

const loadFileRuntimeConfig = (
  userDataPath: string,
  readFile: RuntimeConfigFileReader,
): GovernanceRuntimeConfig => {
  const path = join(userDataPath, GOVERNANCE_RUNTIME_CONFIG_FILENAME);
  const serialized = readFile(path);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RUNTIME_CONFIG_BYTES) {
    throw new Error(
      `Governance runtime config exceeds ${MAX_RUNTIME_CONFIG_BYTES} bytes: ${path}`,
    );
  }
  let decoded: unknown;
  try {
    decoded = parseJsonWithoutDuplicateObjectKeys(
      serialized,
      "Governance runtime config",
    );
  } catch {
    throw new Error(`Governance runtime config is not valid JSON: ${path}`);
  }
  const record = exactRecord(
    decoded,
    RUNTIME_CONFIG_KEYS,
    "Governance runtime config",
  );
  if (record.schema !== GOVERNANCE_RUNTIME_CONFIG_SCHEMA) {
    throw new Error(
      `Governance runtime config schema must be ${GOVERNANCE_RUNTIME_CONFIG_SCHEMA}.`,
    );
  }
  return parseRuntimeConfig(
    record.validationFee,
    record.cbsiCoreApiBaseUrl,
    `Governance runtime config at ${path}`,
  );
};

export const governanceRuntimeConfigPath = (userDataPath: string): string =>
  join(userDataPath, GOVERNANCE_RUNTIME_CONFIG_FILENAME);

export const loadGovernanceRuntimeConfig = (
  options: LoadGovernanceRuntimeConfigOptions,
): GovernanceRuntimeConfig => {
  const env = options.env ?? process.env;
  const hasValidationFeeEnv = hasOwn(env, GOVERNANCE_VALIDATION_FEE_CONFIG_ENV);
  const hasCoreApiEnv = hasOwn(env, CBSI_CORE_API_BASE_URL_ENV);
  if (hasValidationFeeEnv || hasCoreApiEnv) {
    if (!hasValidationFeeEnv || !hasCoreApiEnv) {
      throw new Error(
        `${GOVERNANCE_VALIDATION_FEE_CONFIG_ENV} and ${CBSI_CORE_API_BASE_URL_ENV} must be set together; refusing to mix environment and file runtime configuration.`,
      );
    }
    return parseRuntimeConfig(
      env[GOVERNANCE_VALIDATION_FEE_CONFIG_ENV],
      env[CBSI_CORE_API_BASE_URL_ENV],
      "Governance runtime environment override",
    );
  }
  return loadFileRuntimeConfig(
    options.userDataPath,
    options.readFile ?? defaultReadFile,
  );
};
