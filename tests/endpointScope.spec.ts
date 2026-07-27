import { describe, expect, it } from "vitest";
import {
  buildEndpointDerivedStorageKey,
  buildEndpointIdentityScope,
  buildTrustedEndpointIdentityScope,
} from "@/utils/endpointScope";
import type { EndpointInspection } from "@/types/endpointInspection";

const endpoint = {
  toriiUrl: "https://TAIRA.sora.org/v1/status?ignored=true",
  observedChainId: "FC56984B-2BE7-431D-840E-21514D1883F0",
  observedNetworkPrefix: 369,
};

describe("endpoint-derived storage scope", () => {
  const inspection = (
    evidenceSources: EndpointInspection["evidence"][number]["source"][],
    identityStatus: EndpointInspection["identityStatus"] = "matched",
  ): EndpointInspection => ({
    schema: "iroha.wallet.endpoint-inspection.v1",
    toriiUrl: endpoint.toriiUrl,
    expected: {
      chainId: endpoint.observedChainId,
      networkPrefix: endpoint.observedNetworkPrefix,
    },
    observed: {
      chainId: endpoint.observedChainId,
      networkPrefix: endpoint.observedNetworkPrefix,
    },
    identityStatus,
    accessMode: identityStatus === "matched" ? "read-write" : "read-only",
    checkedAtMs: 1,
    evidence: evidenceSources.map((source, index) => ({
      source,
      identity: {
        chainId: endpoint.observedChainId,
        networkPrefix: endpoint.observedNetworkPrefix,
      },
      observedAtMs: index + 1,
    })),
    features: {} as EndpointInspection["features"],
    diagnostic: {
      code:
        identityStatus === "matched"
          ? "endpoint_identity_matched"
          : identityStatus === "conflicting"
            ? "endpoint_identity_conflict"
            : "endpoint_identity_unverified",
      message: "fixture",
    },
  });

  it("canonicalizes to endpoint origin plus observed chain and prefix", () => {
    const scope = buildEndpointIdentityScope(endpoint);

    expect(scope).toEqual({
      origin: "https://taira.sora.org",
      chainId: endpoint.observedChainId,
      networkPrefix: 369,
      storageSegment:
        "v2:https%3A%2F%2Ftaira.sora.org:FC56984B-2BE7-431D-840E-21514D1883F0:369",
    });
  });

  it("isolates identical origins across observed identities", () => {
    const official = buildEndpointDerivedStorageKey(
      "iroha-demo:confidential-wallet",
      endpoint,
      ["Alice"],
    );
    const archived = buildEndpointDerivedStorageKey(
      "iroha-demo:confidential-wallet",
      {
        ...endpoint,
        observedChainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      },
      ["Alice"],
    );
    const otherPrefix = buildEndpointDerivedStorageKey(
      "iroha-demo:confidential-wallet",
      {
        ...endpoint,
        observedNetworkPrefix: 753,
      },
      ["Alice"],
    );

    expect(new Set([official, archived, otherPrefix]).size).toBe(3);
    expect(official).toContain(":Alice");
  });

  it("rejects incomplete observed identity and empty dimensions", () => {
    expect(() =>
      buildEndpointIdentityScope({
        ...endpoint,
        observedChainId: "",
      }),
    ).toThrow("Observed chain ID is required");
    expect(() =>
      buildEndpointDerivedStorageKey(
        "iroha-demo:confidential-wallet",
        endpoint,
        [""],
      ),
    ).toThrow("Storage dimension 1 is required");
    expect(() =>
      buildEndpointIdentityScope({
        ...endpoint,
        toriiUrl: "https://user:secret@taira.sora.org",
      }),
    ).toThrow("Endpoint URL must not include credentials");
  });

  it("trusts only authoritative identity evidence", () => {
    expect(
      buildTrustedEndpointIdentityScope(inspection(["chain-metadata"])),
    ).toMatchObject({
      chainId: endpoint.observedChainId,
      networkPrefix: 369,
    });
    expect(
      buildTrustedEndpointIdentityScope(
        inspection(["response-headers", "response-headers"]),
      ),
    ).toBeNull();
  });

  it("refuses a single header observation and conflicting identity evidence", () => {
    expect(
      buildTrustedEndpointIdentityScope(inspection(["response-headers"])),
    ).toBeNull();
    expect(
      buildTrustedEndpointIdentityScope(
        inspection(["chain-metadata"], "conflicting"),
      ),
    ).toBeNull();
  });

  it("preserves opaque chain and dimension casing to avoid collisions", () => {
    const upper = buildEndpointDerivedStorageKey(
      "iroha-demo:confidential-wallet",
      endpoint,
      ["CaseSensitiveAccount"],
    );
    const lower = buildEndpointDerivedStorageKey(
      "iroha-demo:confidential-wallet",
      {
        ...endpoint,
        observedChainId: endpoint.observedChainId.toLowerCase(),
      },
      ["casesensitiveaccount"],
    );

    expect(upper).not.toBe(lower);
  });
});
