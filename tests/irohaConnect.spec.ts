import { describe, expect, it } from "vitest";
import { NetworkId } from "@iroha/iroha-js/browser";
import { createConnectSessionPreview } from "@iroha/iroha-js/connect-browser";
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
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID,
  matchedNetworkIdentity,
} from "./helpers/networkIdentityFixture";

const NETWORK_ID = NetworkId.parse(TAIRA_NETWORK_ID);
const APP_PUBLIC_KEY = new Uint8Array(32).fill(0x31);
const APP_PRIVATE_KEY = new Uint8Array(32).fill(0x32);
const NONCE = new Uint8Array(16).fill(0x42);
const PREVIEW = createConnectSessionPreview({
  networkId: NETWORK_ID,
  node: "https://taira.sora.org",
  nonce: NONCE,
  appKeyPair: {
    publicKey: APP_PUBLIC_KEY,
    privateKey: APP_PRIVATE_KEY,
  },
});
const VALID_SID = PREVIEW.sidBase64Url;
const VALID_WALLET_TOKEN = Buffer.alloc(32, 0xa1).toString("base64url");
const VALID_RELAY_TOKEN = Buffer.alloc(32, 0xa2).toString("base64url");
const WALLET_URI = `${PREVIEW.walletUri}&token=${VALID_WALLET_TOKEN}&relay=${VALID_RELAY_TOKEN}`;

describe("irohaConnect URI parsing", () => {
  it("parses the exact current wallet session URI", () => {
    const parsed = parseIrohaConnectUri(WALLET_URI);

    expect(parsed.sid).toBe(VALID_SID);
    expect(parsed.networkId).toBe(TAIRA_NETWORK_ID);
    expect(parsed.appPublicKeyBase64Url).toBe(
      Buffer.from(APP_PUBLIC_KEY).toString("base64url"),
    );
    expect(parsed.nonceBase64Url).toBe(
      Buffer.from(NONCE).toString("base64url"),
    );
    expect(parsed.node).toBe("https://taira.sora.org");
    expect(parsed.role).toBe("wallet");
    expect(parsed.token).toBe(VALID_WALLET_TOKEN);
    expect(parsed.relayToken).toBe(VALID_RELAY_TOKEN);
    expect(parsed.version).toBe("1");
    expect(parsed.canonicalUri.startsWith("iroha://connect?")).toBe(true);
    expect(parsed.launchUri.startsWith("irohaconnect://connect?")).toBe(true);
  });

  it("accepts the launch protocol only for an exact wallet session", () => {
    const parsed = parseIrohaConnectUri(
      WALLET_URI.replace("iroha://", "irohaconnect://"),
    );

    expect(parsed.sid).toBe(VALID_SID);
    expect(parsed.role).toBe("wallet");
    expect(parsed.canonicalUri).toBe(
      parseIrohaConnectUri(WALLET_URI).canonicalUri,
    );
  });

  it("rejects unrelated and app-role QR payloads", () => {
    expect(isIrohaConnectUri("iroha://kaigi/join?call=abc")).toBe(false);
    expect(() => parseIrohaConnectUri("https://example.com")).toThrow(
      "QR is not an IrohaConnect session.",
    );
    expect(() => parseIrohaConnectUri("iroha://connect?role=wallet")).toThrow(
      "IrohaConnect URI is missing sid.",
    );
    expect(() =>
      parseIrohaConnectUri(WALLET_URI.replace("role=wallet", "role=app")),
    ).toThrow("must use role=wallet");
  });

  it("builds wallet WebSocket URLs and token subprotocols", () => {
    const parsed = parseIrohaConnectUri(WALLET_URI);

    expect(buildIrohaConnectWebSocketUrl(parsed)).toBe(
      `wss://taira.sora.org/v1/connect/ws?sid=${VALID_SID}&role=wallet`,
    );
    expect(buildIrohaConnectTokenProtocol(VALID_WALLET_TOKEN)).toMatch(
      /^iroha-connect\.token\.v1\.[A-Za-z0-9_-]+$/u,
    );
    expect(() =>
      buildIrohaConnectWebSocketUrl({
        ...parsed,
        node: "https://taira.sora.org/relay",
      }),
    ).toThrow("exact canonical Torii origin");
  });

  it("builds wallet approval socket requests from scanned sessions", () => {
    const parsed = parseIrohaConnectUri(WALLET_URI);
    const request = buildIrohaConnectApprovalRequest({
      session: parsed,
      accountId: "testu1connected",
    });

    expect(request.url).toBe(
      `wss://taira.sora.org/v1/connect/ws?sid=${VALID_SID}&role=wallet`,
    );
    expect(request.protocols[0]).toMatch(
      /^iroha-connect\.token\.v1\.[A-Za-z0-9_-]+$/u,
    );
    expect(() =>
      buildIrohaConnectApprovalRequest({
        session: parsed,
        accountId: " testu1connected ",
      }),
    ).toThrow("Choose an active wallet");
  });

  it("rejects duplicate, unknown, incomplete, and noncanonical parameters", () => {
    expect(() =>
      parseIrohaConnectUri(`${WALLET_URI}&sid=${VALID_SID}`),
    ).toThrow("duplicate parameter sid");
    expect(() => parseIrohaConnectUri(`${WALLET_URI}&compat=true`)).toThrow(
      "unsupported parameter compat",
    );
    expect(() =>
      parseIrohaConnectUri(
        WALLET_URI.replace(
          `network_id=${encodeURIComponent(TAIRA_NETWORK_ID)}&`,
          "",
        ),
      ),
    ).toThrow("missing network_id");
    expect(() =>
      parseIrohaConnectUri(WALLET_URI.replace(VALID_SID, `${VALID_SID}=`)),
    ).toThrow("canonical 32-byte base64url");
    expect(() =>
      parseIrohaConnectUri(WALLET_URI.replace(VALID_WALLET_TOKEN, "short")),
    ).toThrow("wallet token must be canonical 32-byte base64url");

    const pathNode = new URL(WALLET_URI);
    pathNode.searchParams.set("node", "https://taira.sora.org/relay");
    expect(() => parseIrohaConnectUri(pathNode.toString())).toThrow(
      "exact canonical Torii origin",
    );
  });

  it("rejects a URI whose SID does not bind its app key and nonce", () => {
    const foreignKey = Buffer.alloc(32, 0x77).toString("base64url");
    expect(() =>
      parseIrohaConnectUri(
        WALLET_URI.replace(
          Buffer.from(APP_PUBLIC_KEY).toString("base64url"),
          foreignKey,
        ),
      ),
    ).toThrow("does not bind the exact NetworkId");
  });
});

describe("IrohaConnect network authorization", () => {
  const activeNetwork = {
    toriiUrl: "https://taira.sora.org",
    chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
    networkPrefix: 369,
    networkId: TAIRA_NETWORK_ID,
  };

  it("binds the exact NetworkId and canonical endpoint origin to the active context", () => {
    expect(
      validateIrohaConnectNetworkClaim(
        {
          node: "https://taira.sora.org",
          networkId: TAIRA_NETWORK_ID,
        },
        activeNetwork,
        {
          requireNetworkId: true,
          requireNode: true,
        },
      ),
    ).toEqual(activeNetwork);
  });

  it.each([
    "https://TAIRA.SORA.ORG",
    "https://taira.sora.org/",
    "https://taira.sora.org/untrusted",
  ])("rejects noncanonical endpoint claim %s", (node) => {
    expect(() =>
      validateIrohaConnectNetworkClaim(
        { node, networkId: TAIRA_NETWORK_ID },
        activeNetwork,
        { requireNetworkId: true, requireNode: true },
      ),
    ).toThrow("exact canonical Torii origin");
  });

  it("rejects noncanonical NetworkId and active-profile coercion", () => {
    expect(() =>
      validateIrohaConnectNetworkClaim(
        {
          node: activeNetwork.toriiUrl,
          networkId: TAIRA_NETWORK_ID.toLowerCase(),
        },
        activeNetwork,
        { requireNetworkId: true, requireNode: true },
      ),
    ).toThrow("invalid NetworkId");

    expect(() =>
      validateIrohaConnectNetworkClaim(
        {
          node: activeNetwork.toriiUrl,
          networkId: TAIRA_NETWORK_ID,
        },
        { ...activeNetwork, networkPrefix: "369" as unknown as number },
        { requireNetworkId: true, requireNode: true },
      ),
    ).toThrow("integer between 0 and 16383");
  });

  it.each([
    {
      label: "NetworkId",
      claim: {
        node: activeNetwork.toriiUrl,
        networkId: NetworkId.fromBytes(
          Uint8Array.from({ length: 32 }, (_, index) =>
            index === 31 ? 0x13 : 0x11,
          ),
        ).toString(),
      },
    },
    {
      label: "endpoint",
      claim: {
        node: "https://other.example",
        networkId: TAIRA_NETWORK_ID,
      },
    },
  ])("rejects a different $label", ({ claim, label }) => {
    expect(() =>
      validateIrohaConnectNetworkClaim(claim, activeNetwork, {
        requireNetworkId: true,
        requireNode: true,
      }),
    ).toThrow(`different ${label}`);
  });

  it.each([
    {
      claim: { node: activeNetwork.toriiUrl },
      expected: "missing its NetworkId",
    },
    {
      claim: { networkId: TAIRA_NETWORK_ID },
      expected: "missing its endpoint",
    },
  ])("rejects a missing required network claim", ({ claim, expected }) => {
    expect(() =>
      validateIrohaConnectNetworkClaim(claim, activeNetwork, {
        requireNetworkId: true,
        requireNode: true,
      }),
    ).toThrow(expected);
  });

  it("fails closed when the active connection has no verified NetworkId", () => {
    expect(() =>
      validateIrohaConnectNetworkClaim(
        {
          node: "https://minamoto.sora.org",
          networkId: TAIRA_NETWORK_ID,
        },
        {
          toriiUrl: "https://minamoto.sora.org",
          chainId: "00000000-0000-0000-0000-000000000000",
          networkPrefix: 753,
          networkId: "",
        },
        { requireNetworkId: true, requireNode: true },
      ),
    ).toThrow("no verified endpoint NetworkId");
  });

  it("rejects a claim for the identity the endpoint had before a reset", () => {
    expect(() =>
      validateIrohaConnectNetworkClaim(
        {
          node: activeNetwork.toriiUrl,
          networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
        },
        activeNetwork,
        { requireNetworkId: true, requireNode: true },
      ),
    ).toThrow("different NetworkId");
  });

  it("allows pairing only when the inspected endpoint is write-authorized and advertises Connect", () => {
    const inspection = {
      accessMode: "read-write",
      identityStatus: "matched",
      observed: { networkId: TAIRA_NETWORK_ID },
      networkIdentity: matchedNetworkIdentity(),
      features: {
        irohaConnectSessions: {
          supported: true,
        },
      },
      diagnostic: {
        message: "Endpoint identity mismatch.",
      },
    } as unknown as EndpointInspection;

    expect(assertIrohaConnectEndpointCanPair(inspection)).toBe(
      TAIRA_NETWORK_ID,
    );
    expect(() =>
      assertIrohaConnectEndpointCanPair({
        ...inspection,
        networkIdentity: matchedNetworkIdentity(TEST_PREVIOUS_TAIRA_NETWORK_ID),
      }),
    ).toThrow("no pinned network identity");
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
