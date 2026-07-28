import { installGlobalIrohaJsNativeBinding } from "./irohaJsNativeDir";

type NativeModuleLike = Record<string, unknown>;

type NativeBuildSoraCloudHfDeployRequestJson = (
  repoId: string,
  revision: string | undefined,
  modelName: string,
  serviceName: string,
  apartmentName: string | undefined,
  storageClass: string,
  leaseTermMs: string,
  leaseAssetDefinitionId: string,
  baseFeeNanos: string,
  privateKeyHex: string,
) => string;

export type SoraCloudHfDeployRequest = {
  payload: Record<string, unknown>;
  provenance: SoraCloudManifestProvenance;
  generated_service_provenance: SoraCloudManifestProvenance;
  generated_apartment_provenance?: SoraCloudManifestProvenance;
};

export type SoraCloudManifestProvenance = {
  signer: string;
  signature: string;
};

export type SoraCloudHfDeployNativeInput = {
  repoId: string;
  revision?: string;
  modelName: string;
  serviceName: string;
  apartmentName?: string;
  storageClass: string;
  leaseTermMs: string | number;
  leaseAssetDefinitionId: string;
  baseFeeNanos: string;
  privateKeyHex: string;
};

export type LoadNativeSoraCloudModule = (
  moduleUrl: string,
  env: NodeJS.ProcessEnv,
) => unknown;

const defaultLoadNativeModule: LoadNativeSoraCloudModule = (moduleUrl, env) =>
  installGlobalIrohaJsNativeBinding(moduleUrl, env);

const isNativeModuleLike = (value: unknown): value is NativeModuleLike =>
  typeof value === "object" && value !== null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) => {
  const expected = new Set(expectedKeys);
  const missing = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const detail = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${detail}).`);
  }
};

const requireEqual = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label} does not match the reviewed launch.`);
  }
};

const storageClassTag = (storageClass: string) =>
  `${storageClass.slice(0, 1).toUpperCase()}${storageClass.slice(1)}`;

const requireProvenance = (
  value: unknown,
  label: string,
  expectedSigner?: string,
): SoraCloudManifestProvenance => {
  const provenance = requireRecord(value, label);
  requireExactKeys(provenance, ["signer", "signature"], label);
  const signer = provenance.signer;
  const signature = provenance.signature;
  if (typeof signer !== "string" || !signer || signer.trim() !== signer) {
    throw new Error(`${label}.signer must be canonical text.`);
  }
  if (
    typeof signature !== "string" ||
    !signature ||
    signature.trim() !== signature
  ) {
    throw new Error(`${label}.signature must be canonical text.`);
  }
  if (expectedSigner !== undefined && signer !== expectedSigner) {
    throw new Error(`${label}.signer does not match the launch signer.`);
  }
  return { signer, signature };
};

export const soraCloudXorQuantityFromNanos = (value: string): string => {
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error("baseFeeNanos must be a canonical positive integer.");
  }
  const nanos = BigInt(value);
  if (nanos > (1n << 128n) - 1n) {
    throw new Error("baseFeeNanos exceeds the unsigned 128-bit limit.");
  }
  const scale = 1_000_000_000n;
  const whole = nanos / scale;
  const fraction = (nanos % scale)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const validateSignedRequest = (
  value: unknown,
  input: SoraCloudHfDeployNativeInput,
): SoraCloudHfDeployRequest => {
  const request = requireRecord(value, "SoraCloud HF native deploy request");
  const expectedRootKeys = [
    "payload",
    "provenance",
    "generated_service_provenance",
    ...(input.apartmentName ? ["generated_apartment_provenance"] : []),
  ];
  requireExactKeys(
    request,
    expectedRootKeys,
    "SoraCloud HF native deploy request",
  );
  const payload = requireRecord(
    request.payload,
    "SoraCloud HF native deploy request.payload",
  );
  const expectedPayloadKeys = [
    "repo_id",
    ...(input.revision ? ["revision"] : []),
    "model_name",
    "service_name",
    ...(input.apartmentName ? ["apartment_name"] : []),
    "storage_class",
    "lease_term_ms",
    "lease_asset_definition_id",
    "base_fee",
  ];
  requireExactKeys(
    payload,
    expectedPayloadKeys,
    "SoraCloud HF native deploy request.payload",
  );
  requireEqual(payload.repo_id, input.repoId, "SoraCloud HF request repo_id");
  if (input.revision) {
    requireEqual(
      payload.revision,
      input.revision,
      "SoraCloud HF request revision",
    );
  }
  requireEqual(
    payload.model_name,
    input.modelName,
    "SoraCloud HF request model_name",
  );
  requireEqual(
    payload.service_name,
    input.serviceName,
    "SoraCloud HF request service_name",
  );
  if (input.apartmentName) {
    requireEqual(
      payload.apartment_name,
      input.apartmentName,
      "SoraCloud HF request apartment_name",
    );
  }
  const storageClass = requireRecord(
    payload.storage_class,
    "SoraCloud HF request storage_class",
  );
  requireExactKeys(
    storageClass,
    ["type", "value"],
    "SoraCloud HF request storage_class",
  );
  requireEqual(
    storageClass.type,
    storageClassTag(input.storageClass),
    "SoraCloud HF request storage_class.type",
  );
  requireEqual(
    storageClass.value,
    null,
    "SoraCloud HF request storage_class.value",
  );
  requireEqual(
    payload.lease_term_ms,
    Number(input.leaseTermMs),
    "SoraCloud HF request lease_term_ms",
  );
  requireEqual(
    payload.lease_asset_definition_id,
    input.leaseAssetDefinitionId,
    "SoraCloud HF request lease_asset_definition_id",
  );
  requireEqual(
    payload.base_fee,
    soraCloudXorQuantityFromNanos(input.baseFeeNanos),
    "SoraCloud HF request base_fee",
  );

  const provenance = requireProvenance(
    request.provenance,
    "SoraCloud HF native deploy request.provenance",
  );
  const generatedServiceProvenance = requireProvenance(
    request.generated_service_provenance,
    "SoraCloud HF native deploy request.generated_service_provenance",
    provenance.signer,
  );
  const generatedApartmentProvenance = input.apartmentName
    ? requireProvenance(
        request.generated_apartment_provenance,
        "SoraCloud HF native deploy request.generated_apartment_provenance",
        provenance.signer,
      )
    : undefined;

  return {
    payload,
    provenance,
    generated_service_provenance: generatedServiceProvenance,
    ...(generatedApartmentProvenance
      ? {
          generated_apartment_provenance: generatedApartmentProvenance,
        }
      : {}),
  };
};

export const resolveSoraCloudHfDeployRequestBuilder = (
  moduleUrl: string = import.meta.url,
  env: NodeJS.ProcessEnv = process.env,
  loadNativeModule: LoadNativeSoraCloudModule = defaultLoadNativeModule,
): NativeBuildSoraCloudHfDeployRequestJson => {
  const nativeModule = loadNativeModule(moduleUrl, env);
  if (!isNativeModuleLike(nativeModule)) {
    throw new Error("The @iroha/iroha-js native binding did not load.");
  }

  const buildRequestJson = nativeModule.soracloudBuildHfDeployRequestJson;
  if (typeof buildRequestJson !== "function") {
    throw new Error(
      "The @iroha/iroha-js native binding is missing soracloudBuildHfDeployRequestJson. Rebuild the sibling SDK with npm run build:native.",
    );
  }
  return buildRequestJson as NativeBuildSoraCloudHfDeployRequestJson;
};

export const buildSoraCloudHfDeployRequest = (
  input: SoraCloudHfDeployNativeInput,
  buildRequestJson: NativeBuildSoraCloudHfDeployRequestJson = resolveSoraCloudHfDeployRequestBuilder(),
): SoraCloudHfDeployRequest => {
  const rawRequest = buildRequestJson(
    input.repoId,
    input.revision,
    input.modelName,
    input.serviceName,
    input.apartmentName,
    input.storageClass,
    String(input.leaseTermMs),
    input.leaseAssetDefinitionId,
    input.baseFeeNanos,
    input.privateKeyHex,
  );
  const request = JSON.parse(rawRequest) as unknown;
  return validateSignedRequest(request, input);
};
