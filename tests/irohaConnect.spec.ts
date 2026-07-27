import { describe, expect, it } from "vitest";
import type { EndpointInspection } from "@/types/endpointInspection";
import {
  assertIrohaConnectEndpointCanPair,
  buildIrohaConnectApprovalRequest,
  buildIrohaConnectTokenProtocol,
  buildIrohaConnectWebSocketUrl,
  isIrohaConnectUri,
  parseIrohaConnectUri,
  validateIrohaConnectNetworkClaim,
} from "@/utils/irohaConnect";

const VALID_SID = Buffer.from(new Uint8Array(32).fill(0xce)).toString(
  "base64url",
);

describe("irohaConnect URI parsing", () => {
  it("parses canonical wallet session URIs", () => {
    const parsed = parseIrohaConnectUri(
      `iroha://connect?sid=${VALID_SID}&chain_id=chain-a&node=https%3A%2F%2Ftaira.sora.org&network_prefix=369&v=1&role=wallet&token=wallet-token&relay=relay-token`,
    );

    expect(parsed.sid).toBe(VALID_SID);
    expect(parsed.chainId).toBe("chain-a");
    expect(parsed.node).toBe("https://taira.sora.org");
    expect(parsed.networkPrefix).toBe(369);
    expect(parsed.role).toBe("wallet");
    expect(parsed.token).toBe("wallet-token");
    expect(parsed.relayToken).toBe("relay-token");
    expect(parsed.version).toBe("1");
    expect(parsed.canonicalUri.startsWith("iroha://connect?")).toBe(true);
    expect(parsed.launchUri.startsWith("irohaconnect://connect?")).toBe(true);
  });

  it("accepts launch protocol URIs and normalizes them", () => {
    const parsed = parseIrohaConnectUri(
      `irohaconnect://connect?sid=${VALID_SID}&v=1&role=app`,
    );

    expect(parsed.sid).toBe(VALID_SID);
    expect(parsed.role).toBe("app");
    expect(parsed.canonicalUri).toBe(
      `iroha://connect?sid=${VALID_SID}&v=1&role=app`,
    );
  });

  it("rejects unrelated QR payloads", () => {
    expect(isIrohaConnectUri("iroha://kaigi/join?call=abc")).toBe(false);
    expect(() => parseIrohaConnectUri("https://example.com")).toThrow(
      "QR is not an IrohaConnect session.",
    );
    expect(() => parseIrohaConnectUri("iroha://connect?role=wallet")).toThrow(
      "IrohaConnect URI is missing sid.",
    );
  });

  it.each(["0369", "-1", "16384", "not-a-number"])(
    "rejects invalid network_prefix value %s",
    (networkPrefix) => {
      expect(() =>
        parseIrohaConnectUri(
          `iroha://connect?sid=${VALID_SID}&v=1&role=wallet&network_prefix=${networkPrefix}`,
        ),
      ).toThrow("network_prefix must be an integer between 0 and 16383");
    },
  );

  it("builds wallet WebSocket URLs and token subprotocols", () => {
    const parsed = parseIrohaConnectUri(
      `iroha://connect?sid=${VALID_SID}&node=https%3A%2F%2Ftaira.sora.org&v=1&role=wallet&token=wallet-token&relay=relay-token`,
    );

    expect(buildIrohaConnectWebSocketUrl(parsed, "https://fallback.test")).toBe(
      `wss://taira.sora.org/v1/connect/ws?sid=${VALID_SID}&role=wallet`,
    );
    expect(buildIrohaConnectTokenProtocol("wallet-token")).toMatch(
      /^iroha-connect\.token\.v1\.[A-Za-z0-9_-]+$/u,
    );
  });

  it("builds wallet approval socket requests from scanned sessions", () => {
    const sid = Buffer.from(new Uint8Array(32).fill(0xce)).toString(
      "base64url",
    );
    const parsed = parseIrohaConnectUri(
      `iroha://connect?sid=${sid}&node=https%3A%2F%2Ftaira.sora.org&v=1&role=wallet&token=wallet-token&relay=relay-token`,
    );
    const request = buildIrohaConnectApprovalRequest({
      session: parsed,
      accountId: " testu1connected ",
      fallbackToriiUrl: "https://fallback.test",
    });

    expect(request.url).toBe(
      `wss://taira.sora.org/v1/connect/ws?sid=${sid}&role=wallet`,
    );
    expect(request.protocols[0]).toMatch(
      /^iroha-connect\.token\.v1\.[A-Za-z0-9_-]+$/u,
    );
  });
});

describe("IrohaConnect network authorization", () => {
  const activeNetwork = {
    toriiUrl: "https://taira.sora.org",
    chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
    networkPrefix: 369,
  };

  it("binds an equivalent endpoint-origin claim to the normalized active context", () => {
    expect(
      validateIrohaConnectNetworkClaim(
        {
          node: "https://TAIRA.SORA.ORG/untrusted/path?ignored=yes",
          chainId: activeNetwork.chainId,
          networkPrefix: "369",
        },
        activeNetwork,
        {
          requireChainId: true,
          requireNode: true,
        },
      ),
    ).toEqual(activeNetwork);
  });

  it.each([
    {
      label: "chain",
      claim: {
        node: activeNetwork.toriiUrl,
        chainId: "different-chain",
        networkPrefix: activeNetwork.networkPrefix,
      },
    },
    {
      label: "endpoint",
      claim: {
        node: "https://other.example",
        chainId: activeNetwork.chainId,
        networkPrefix: activeNetwork.networkPrefix,
      },
    },
    {
      label: "network prefix",
      claim: {
        node: activeNetwork.toriiUrl,
        chainId: activeNetwork.chainId,
        networkPrefix: 753,
      },
    },
  ])("rejects a different $label", ({ claim, label }) => {
    expect(() =>
      validateIrohaConnectNetworkClaim(claim, activeNetwork, {
        requireChainId: true,
        requireNode: true,
      }),
    ).toThrow(`different ${label}`);
  });

  it.each([
    {
      claim: { node: activeNetwork.toriiUrl },
      expected: "missing its chain ID",
    },
    {
      claim: { chainId: activeNetwork.chainId },
      expected: "missing its endpoint",
    },
  ])("rejects a missing required network claim", ({ claim, expected }) => {
    expect(() =>
      validateIrohaConnectNetworkClaim(claim, activeNetwork, {
        requireChainId: true,
        requireNode: true,
      }),
    ).toThrow(expected);
  });

  it("allows pairing only when the inspected endpoint is write-authorized and advertises Connect", () => {
    const inspection = {
      accessMode: "read-write",
      features: {
        irohaConnectSessions: {
          supported: true,
        },
      },
      diagnostic: {
        message: "Endpoint identity mismatch.",
      },
    } as unknown as EndpointInspection;

    expect(() => assertIrohaConnectEndpointCanPair(inspection)).not.toThrow();
    expect(() =>
      assertIrohaConnectEndpointCanPair({
        ...inspection,
        accessMode: "read-only",
      }),
    ).toThrow("Endpoint identity mismatch.");
    expect(() =>
      assertIrohaConnectEndpointCanPair({
        ...inspection,
        features: {
          ...inspection.features,
          irohaConnectSessions: {
            ...inspection.features.irohaConnectSessions,
            supported: false,
          },
        },
      }),
    ).toThrow("does not advertise IrohaConnect session writes");
  });
});
