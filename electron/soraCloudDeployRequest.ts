import { createRequire } from "node:module";
import { join } from "node:path";

import {
  configureIrohaJsNativeDir,
  resolveIrohaJsNativeDir,
} from "./irohaJsNativeDir";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";

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
  nativeModulePath: string,
) => unknown;

const defaultLoadNativeModule: LoadNativeSoraCloudModule = (
  moduleUrl,
  nativeModulePath,
) => {
  const require = createRequire(moduleUrl);
  return require(nativeModulePath);
};

const isNativeModuleLike = (value: unknown): value is NativeModuleLike =>
  typeof value === "object" && value !== null;

export const resolveSoraCloudHfDeployRequestBuilder = (
  moduleUrl: string = import.meta.url,
  env: NodeJS.ProcessEnv = process.env,
  loadNativeModule: LoadNativeSoraCloudModule = defaultLoadNativeModule,
): NativeBuildSoraCloudHfDeployRequestJson => {
  const nativeDir =
    configureIrohaJsNativeDir(moduleUrl, env) ??
    resolveIrohaJsNativeDir(moduleUrl);
  if (!nativeDir) {
    throw new Error(
      "SoraCloud HF deploy request signing requires the @iroha/iroha-js native binding. Run npm run build:native inside ../iroha/javascript/iroha_js.",
    );
  }

  const nativeModule = loadNativeModule(
    moduleUrl,
    join(nativeDir, NATIVE_MODULE_FILENAME),
  );
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
): Record<string, unknown> => {
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
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new Error(
      "SoraCloud HF deploy request builder returned invalid JSON.",
    );
  }
  return request as Record<string, unknown>;
};
