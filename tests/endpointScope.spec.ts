import { describe, expect, it } from "vitest";
import {
  buildEndpointDerivedStorageKey,
  buildEndpointIdentityScope,
  buildTrustedEndpointIdentityScope,
} from "@/utils/endpointScope";
import type { EndpointInspection } from "@/types/endpointInspection";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_GENESIS_HASH,
  TEST_TAIRA_NETWORK_ID,
  matchedNetworkIdentity,
} from "./helpers/networkIdentityFixture";

const TAIRA_GENESIS = TEST_TAIRA_GENESIS_HASH;
const endpoint = {
  toriiUrl: "https://TAIRA.sora.org/v1/status",
  observedChainId: "FC56984B-2BE7-431D-840E-21514D1883F0",
  observedNetworkPrefix: 369,
  observedGenesisHash: TAIRA_GENESIS,
};

describe("endpoint-derived storage scope", () => {
  const inspection = (
    evidenceSources: EndpointInspection["evidence"][number]["source"][],
    identityStatus: EndpointInspection["identityStatus"] = "matched",
    evidenceNetworkIds: string[] = [],
  ): EndpointInspection => ({
    schema: "iroha.wallet.endpoint-inspection.v1",
    toriiUrl: endpoint.toriiUrl,
    expected: {
      chainId: endpoint.observedChainId,
      networkPrefix: endpoint.observedNetworkPrefix,
      networkId: TEST_TAIRA_NETWORK_ID,
    },
    observed: {
      chainId: endpoint.observedChainId,
      networkPrefix: endpoint.observedNetworkPrefix,
      networkId: TEST_TAIRA_NETWORK_ID,
      genesisHash: endpoint.observedGenesisHash,
    },
    identityStatus,
    accessMode: identityStatus === "matched" ? "read-write" : "read-only",
    checkedAtMs: 1,
    evidence: evidenceSources.map((source, index) => ({
      source,
      identity: {
        chainId: endpoint.observedChainId,
        networkPrefix: endpoint.observedNetworkPrefix,
        networkId: evidenceNetworkIds[index] ?? TEST_TAIRA_NETWORK_ID,
      },
      observedAtMs: index + 1,
    })),
    networkIdentity: matchedNetworkIdentity(),
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

  it("canonicalizes to endpoint origin plus the exact observed network", () => {
    const scope = buildEndpointIdentityScope(endpoint);

    expect(scope).toEqual({
      origin: "https://taira.sora.org",
      chainId: endpoint.observedChainId,
      networkPrefix: 369,
      genesisHash: TAIRA_GENESIS,
      storageSegment: `v3:https%3A%2F%2Ftaira.sora.org:FC56984B-2BE7-431D-840E-21514D1883F0:369:${TAIRA_GENESIS}`,
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
    const otherGenesis = buildEndpointDerivedStorageKey(
      "iroha-demo:confidential-wallet",
      {
        ...endpoint,
        observedGenesisHash: "11".repeat(32),
      },
      ["Alice"],
    );

    expect(new Set([official, archived, otherPrefix, otherGenesis]).size).toBe(
      4,
    );
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
    expect(() =>
      buildEndpointIdentityScope({
        ...endpoint,
        toriiUrl: "https://taira.sora.org?identity=ambiguous",
      }),
    ).toThrow("Endpoint URL must not include a query or fragment");
    expect(() =>
      buildEndpointIdentityScope({
        ...endpoint,
        observedGenesisHash: TAIRA_GENESIS.toUpperCase(),
      }),
    ).toThrow("64 lowercase hexadecimal characters");
  });

  it("trusts only agreeing capabilities plus genesis-block evidence", () => {
    expect(
      buildTrustedEndpointIdentityScope(
        inspection(["account-capabilities", "genesis-block"]),
      ),
    ).toMatchObject({
      chainId: endpoint.observedChainId,
      networkPrefix: 369,
      genesisHash: TAIRA_GENESIS,
    });
    expect(
      buildTrustedEndpointIdentityScope(inspection(["account-capabilities"])),
    ).toBeNull();
    expect(
      buildTrustedEndpointIdentityScope(
        inspection(["account-capabilities", "account-capabilities"]),
      ),
    ).toBeNull();
  });

  it("refuses a single source, disagreeing sources, and conflicting evidence", () => {
    expect(
      buildTrustedEndpointIdentityScope(inspection(["genesis-block"])),
    ).toBeNull();
    expect(
      buildTrustedEndpointIdentityScope(
        inspection(["account-capabilities", "genesis-block"], "matched", [
          TEST_TAIRA_NETWORK_ID,
          TEST_PREVIOUS_TAIRA_NETWORK_ID,
        ]),
      ),
    ).toBeNull();
    expect(
      buildTrustedEndpointIdentityScope(
        inspection(["account-capabilities", "genesis-block"], "conflicting"),
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
