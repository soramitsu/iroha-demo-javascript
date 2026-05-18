import { describe, expect, it, vi } from "vitest";

import {
  buildSoraCloudHfDeployRequest,
  resolveSoraCloudHfDeployRequestBuilder,
} from "../electron/soraCloudDeployRequest";

describe("soraCloudDeployRequest", () => {
  it("builds a deploy request through the native JSON helper", () => {
    const buildRequestJson = vi.fn(() =>
      JSON.stringify({
        payload: { repo_id: "openai/demo-model" },
        provenance: { signer: "ed0120", signature: "AA" },
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
      payload: { repo_id: "openai/demo-model" },
      provenance: { signer: "ed0120", signature: "AA" },
    });
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
