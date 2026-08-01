import { describe, expect, it, vi } from "vitest";

import {
  buildSoraCloudHfDeployRequest,
  resolveSoraCloudHfDeployRequestBuilder,
  soraCloudXorQuantityFromNanos,
} from "../electron/soraCloudDeployRequest";

describe("soraCloudDeployRequest", () => {
  it("builds a deploy request through the native JSON helper", () => {
    const buildRequestJson = vi.fn(() =>
      JSON.stringify({
        payload: {
          repo_id: "openai/demo-model",
          revision: "main",
          model_name: "demo-model",
          service_name: "alice-demo-model",
          apartment_name: "default",
          storage_class: { type: "Warm", value: null },
          lease_term_ms: 3_600_000,
          lease_asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
          base_fee: "0.000000001",
        },
        provenance: { signer: "ed0120", signature: "AA" },
        generated_service_provenance: {
          signer: "ed0120",
          signature: "AA",
        },
        generated_apartment_provenance: {
          signer: "ed0120",
          signature: "AA",
        },
      }),
    );

    const request = buildSoraCloudHfDeployRequest(
      {
        repoId: "openai/demo-model",
        revision: "main",
        modelName: "demo-model",
        serviceName: "alice-demo-model",
        apartmentName: "default",
        storageClass: "warm",
        leaseTermMs: 3_600_000,
        leaseAssetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
        baseFeeNanos: "1",
        privateKeyHex: "12".repeat(32),
      },
      buildRequestJson,
    );

    expect(buildRequestJson).toHaveBeenCalledWith(
      "openai/demo-model",
      "main",
      "demo-model",
      "alice-demo-model",
      "default",
      "warm",
      "3600000",
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
      "1",
      "12".repeat(32),
    );
    expect(request).toMatchObject({
      payload: {
        repo_id: "openai/demo-model",
        base_fee: "0.000000001",
      },
      provenance: { signer: "ed0120", signature: "AA" },
    });
  });

  it("rejects the retired native base_fee_nanos request shape", () => {
    expect(() =>
      buildSoraCloudHfDeployRequest(
        {
          repoId: "openai/demo-model",
          modelName: "demo-model",
          serviceName: "alice-demo-model",
          storageClass: "warm",
          leaseTermMs: 3_600_000,
          leaseAssetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
          baseFeeNanos: "10000",
          privateKeyHex: "12".repeat(32),
        },
        () =>
          JSON.stringify({
            payload: {
              repo_id: "openai/demo-model",
              model_name: "demo-model",
              service_name: "alice-demo-model",
              storage_class: { type: "Warm", value: null },
              lease_term_ms: 3_600_000,
              lease_asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
              base_fee_nanos: "10000",
            },
            provenance: { signer: "ed0120", signature: "AA" },
            generated_service_provenance: {
              signer: "ed0120",
              signature: "AA",
            },
          }),
      ),
    ).toThrow("missing base_fee");
  });

  it("converts integer nano-XOR input to the canonical Quantity literal", () => {
    expect(soraCloudXorQuantityFromNanos("1")).toBe("0.000000001");
    expect(soraCloudXorQuantityFromNanos("10000")).toBe("0.00001");
    expect(soraCloudXorQuantityFromNanos("1000000000")).toBe("1");
    expect(() => soraCloudXorQuantityFromNanos("0001")).toThrow(
      "canonical positive integer",
    );
    expect(() =>
      soraCloudXorQuantityFromNanos((1n << 128n).toString()),
    ).toThrow("unsigned 128-bit limit");
  });

  it("reports stale native bindings that lack SoraCloud signing support", () => {
    expect(() =>
      resolveSoraCloudHfDeployRequestBuilder(
        import.meta.url,
        { IROHA_JS_NATIVE_DIR: "/tmp/iroha-native" },
        () => ({}),
      ),
    ).toThrow(/missing soracloudBuildHfDeployRequestJson/);
  });
});
