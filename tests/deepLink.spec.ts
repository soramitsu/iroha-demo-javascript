import { describe, expect, it } from "vitest";
import { x25519 } from "@noble/curves/ed25519";
import {
  NetworkId,
  createConnectSessionPreview,
} from "@iroha/iroha-js/connect-browser";
import {
  KAIGI_DEEP_LINK_ARGV_MAX_CHARACTERS,
  KAIGI_DEEP_LINK_ARGV_MAX_ENTRIES,
  extractIrohaConnectDeepLinkFromArgv,
  extractKaigiDeepLinkFromArgv,
  parseIrohaConnectDeepLink,
  parseKaigiDeepLinkToHashRoute,
  parseWalletDeepLink,
} from "../electron/deepLink";
import { IROHA_CONNECT_DEEP_LINK_DOM_EVENT } from "../electron/irohaConnectDeepLinkChannels";
import { IROHA_CONNECT_DEEP_LINK_EVENT } from "@/services/iroha";
import { parseIrohaConnectUri } from "@/utils/irohaConnect";
import { TEST_TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";
import {
  buildKaigiInvite,
  buildKaigiInviteDeepLink,
  buildKaigiInviteHashRoute,
} from "@/utils/kaigiInvite";

const INVITE = buildKaigiInvite(
  "kaigi.universal:kaigi-room",
  "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u",
);
const DEEP_LINK = buildKaigiInviteDeepLink(INVITE);
const HASH_ROUTE = buildKaigiInviteHashRoute(INVITE);

describe("Kaigi deep-link helpers", () => {
  it("delegates the exact app-protocol link to the shared invite codec", () => {
    expect(parseKaigiDeepLinkToHashRoute(DEEP_LINK)).toBe(HASH_ROUTE);
  });

  it.each([
    "iroha://kaigi/join?invite=legacy-token",
    "iroha://kaigi/join?call=kaigi.universal%3Akaigi-room",
    `${DEEP_LINK}&extra=true`,
    `${DEEP_LINK}&secret=${INVITE.inviteSecretBase64Url}`,
    DEEP_LINK.replace("kaigi.universal", "kaigi"),
    DEEP_LINK.replace(INVITE.inviteSecretBase64Url, "short"),
    DEEP_LINK.replace("/join", "/other"),
    DEEP_LINK.replace("://kaigi/", "://other/"),
  ])("rejects a non-canonical deep link %s", (input) => {
    expect(parseKaigiDeepLinkToHashRoute(input)).toBeNull();
  });

  it("extracts the only matching deep link from argv", () => {
    expect(
      extractKaigiDeepLinkFromArgv([
        "--flag",
        "iroha://kaigi/join?invite=legacy-token",
        DEEP_LINK,
      ]),
    ).toBe(HASH_ROUTE);
  });

  it("rejects unrelated values", () => {
    expect(parseKaigiDeepLinkToHashRoute("https://example.com")).toBeNull();
    expect(extractKaigiDeepLinkFromArgv(["--flag", "hello"])).toBeNull();
  });

  it("rejects ambiguous and oversized argv input", () => {
    expect(extractKaigiDeepLinkFromArgv([DEEP_LINK, DEEP_LINK])).toBeNull();
    expect(
      extractKaigiDeepLinkFromArgv(
        Array.from(
          { length: KAIGI_DEEP_LINK_ARGV_MAX_ENTRIES + 1 },
          () => "--flag",
        ),
      ),
    ).toBeNull();
    expect(
      extractKaigiDeepLinkFromArgv([
        "x".repeat(KAIGI_DEEP_LINK_ARGV_MAX_CHARACTERS + 1),
        DEEP_LINK,
      ]),
    ).toBeNull();
  });
});

const appPrivateKey = new Uint8Array(32).fill(0x31);
const CONNECT_PREVIEW = createConnectSessionPreview({
  networkId: NetworkId.parse(TEST_TAIRA_NETWORK_ID),
  node: "https://taira.sora.org",
  nonce: new Uint8Array(16).fill(0x42),
  appKeyPair: {
    privateKey: appPrivateKey,
    publicKey: x25519.getPublicKey(appPrivateKey),
  },
});
const WALLET_TOKEN = Buffer.alloc(32, 0xa1).toString("base64url");
const RELAY_TOKEN = Buffer.alloc(32, 0xa2).toString("base64url");
// Exactly what the dApp's "Open in wallet" button opens.
const CONNECT_LINK = `${CONNECT_PREVIEW.walletUri}&token=${WALLET_TOKEN}&relay=${RELAY_TOKEN}`;

describe("IrohaConnect deep-link helpers", () => {
  it("accepts the dApp wallet-role pairing link in its canonical form", () => {
    expect(CONNECT_LINK.startsWith("iroha://connect?sid=")).toBe(true);
    const canonical = parseIrohaConnectUri(CONNECT_LINK).canonicalUri;
    expect(parseIrohaConnectDeepLink(CONNECT_LINK)).toBe(canonical);
    // Preload re-validates the forwarded link, so canonicalization must be
    // idempotent.
    expect(parseIrohaConnectDeepLink(canonical)).toBe(canonical);
    expect(parseIrohaConnectUri(canonical)).toMatchObject({
      sid: CONNECT_PREVIEW.sidBase64Url,
      networkId: TEST_TAIRA_NETWORK_ID,
      node: "https://taira.sora.org",
      token: WALLET_TOKEN,
      relayToken: RELAY_TOKEN,
    });
    expect(parseWalletDeepLink(CONNECT_LINK)).toEqual({
      kind: "connect",
      uri: canonical,
    });
  });

  it("routes Kaigi links to Kaigi and ignores unrelated URLs", () => {
    expect(parseWalletDeepLink(DEEP_LINK)).toEqual({
      kind: "kaigi",
      hashRoute: HASH_ROUTE,
    });
    expect(parseWalletDeepLink("iroha://other?x=1")).toBeNull();
    expect(parseWalletDeepLink("https://palmatrix.soramitsu.io")).toBeNull();
  });

  it.each([
    CONNECT_LINK.replace("role=wallet", "role=app"),
    CONNECT_LINK.replace("v=1", "v=2"),
    `${CONNECT_LINK}&extra=1`,
    `${CONNECT_LINK}&token=${WALLET_TOKEN}`,
    CONNECT_LINK.replace(/&relay=[^&]+/u, ""),
    CONNECT_LINK.replace("iroha://", "irohaconnect://"),
    CONNECT_LINK.replace("iroha://connect", "iroha://connect/extra"),
    `${CONNECT_LINK}#fragment`,
    CONNECT_LINK.replace(/sid=[^&]+/u, "sid=short"),
  ])("rejects a non-canonical pairing link %s", (input) => {
    expect(parseIrohaConnectDeepLink(input)).toBeNull();
  });

  it("extracts exactly one pairing link from argv", () => {
    expect(
      extractIrohaConnectDeepLinkFromArgv([
        "/Applications/Iroha Wallet.app",
        "--flag",
        CONNECT_LINK,
      ]),
    ).toBe(parseIrohaConnectUri(CONNECT_LINK).canonicalUri);
    expect(
      extractIrohaConnectDeepLinkFromArgv([CONNECT_LINK, CONNECT_LINK]),
    ).toBeNull();
    expect(extractIrohaConnectDeepLinkFromArgv(["--flag"])).toBeNull();
    expect(
      extractIrohaConnectDeepLinkFromArgv(
        Array.from(
          { length: KAIGI_DEEP_LINK_ARGV_MAX_ENTRIES + 1 },
          () => CONNECT_LINK,
        ),
      ),
    ).toBeNull();
  });

  it("uses one DOM event name across preload and renderer", () => {
    expect(IROHA_CONNECT_DEEP_LINK_EVENT).toBe(
      IROHA_CONNECT_DEEP_LINK_DOM_EVENT,
    );
  });
});
