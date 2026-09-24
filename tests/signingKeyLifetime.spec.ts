import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const between = (
  source: string,
  startMarker: string,
  endMarker: string,
): string => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("first-release private-key lifetime", () => {
  const preload = readSource("electron/preload.ts");

  it("owns and wipes every transient preload key-buffer helper", () => {
    const syncHelper = between(
      preload,
      "const withPrivateKeyBuffer =",
      "const withPrivateKeyBufferAsync =",
    );
    const asyncHelper = between(
      preload,
      "const withPrivateKeyBufferAsync =",
      "const normalizePrivateKeyHex =",
    );
    expect(syncHelper).toContain("finally");
    expect(syncHelper).toContain("privateKey.fill(0)");
    expect(asyncHelper).toContain("return await operation(privateKey)");
    expect(asyncHelper).toContain("finally");
    expect(asyncHelper).toContain("privateKey.fill(0)");

    const base64Validator = between(
      preload,
      "const isCanonicalBase64UrlBytes =",
      "const parseConfidentialReceiveKeyRecord =",
    );
    expect(base64Validator).toContain("finally {");
    expect(base64Validator).toContain("decoded.fill(0)");
    expect(preload).not.toContain(
      'Buffer.from(privateKeyBase64Url, "base64url")',
    );
  });

  it("wipes the caller-owned key after every quote/sign outcome", () => {
    const quoteAndSign = between(
      preload,
      "const quoteAndSignInstructionTransaction = async",
      "const submitInstructionTransaction = async",
    );
    expect(quoteAndSign).toContain("try {");
    expect(quoteAndSign).toContain(
      "await fetchFirstReleaseAuthorityFeeQuote({",
    );
    expect(quoteAndSign).toContain("signFirstReleaseAuthorityTransaction({");
    expect(quoteAndSign).toContain("finally {");
    expect(quoteAndSign).toContain("input.privateKey.fill(0)");
  });

  it.each([
    [
      "const createSubscriptionOnTorii = async",
      "const postSubscriptionActionToTorii",
    ],
    [
      "const postSubscriptionActionToTorii = async",
      "const reconcileSubscriptionMutationOnTorii",
    ],
    ["async registerAccount(input)", "async transferAsset(rendererInput)"],
    ["async transferAsset(rendererInput)", "setIrohaConnectContext(input)"],
    ["async createKaigiMeeting(input)", "async getKaigiCall(input)"],
    ["async joinKaigiMeeting(input)", "async watchKaigiCallEvents(input"],
    ["async endKaigiMeeting(input)", "getSumeragiStatus(config)"],
  ])("routes %s through the wiping quote/sign boundary", (start, end) => {
    expect(between(preload, start, end)).toContain(
      "quoteAndSignInstructionTransaction({",
    );
  });

  it("routes every staking mutation through the same owned-key boundary", () => {
    const submit = between(
      preload,
      "const submitInstructionTransaction = async",
      "const GOVERNANCE_REVIEW_TTL_MS",
    );
    expect(submit).toContain("const privateKey = hexToBuffer(");
    expect(submit).toContain("await quoteAndSignInstructionTransaction({");

    const staking = between(
      preload,
      "bondPublicLaneStake(input)",
      "};\n\nconst SETUP_SECRET_INPUT_METHODS",
    );
    expect(staking.match(/submitInstructionTransaction\(\{/gu)).toHaveLength(5);
    expect(staking).not.toContain("hexToBuffer(");
  });

  it("wipes governance quote authentication and confirmation keys", () => {
    const prepareDecoded = between(
      preload,
      "const prepareGovernanceDecodedAction = async",
      "const assertGovernanceExactKeys",
    );
    expect(prepareDecoded.indexOf("try {")).toBeLessThan(
      prepareDecoded.indexOf("buildFirstReleaseAuthorityTransactionDraft({"),
    );
    expect(prepareDecoded).toContain("if (!authentication) privateKey.fill(0)");

    const prepareProposal = between(
      preload,
      "const prepareGovernanceProposalAction = async",
      "const confirmPreparedGovernanceAction = async",
    );
    expect(prepareProposal).toContain("finally {");
    expect(prepareProposal).toContain("privateKey.fill(0)");

    const confirm = between(
      preload,
      "const confirmPreparedGovernanceAction = async",
      "const assertIrohaConnectWalletContext = async",
    );
    expect(confirm).toContain("withPrivateKeyBuffer(");
    expect(confirm).toContain("signFirstReleaseAuthorityTransaction({");
    expect(confirm).not.toContain("privateKey: hexToBuffer(");
  });

  it("wipes direct authenticated-read and IrohaConnect signing keys", () => {
    const unlock = between(
      preload,
      "async getGovernanceUnlockStats(input)",
      "getGovernanceCouncilCurrent(input)",
    );
    expect(unlock).toContain("withPrivateKeyBufferAsync(");

    const poll = between(
      preload,
      "async pollKaigiMeetingSignals(input)",
      "async endKaigiMeeting(input)",
    );
    expect(poll).toContain("withPrivateKeyBufferAsync(");

    const connectSigner = between(
      preload,
      "const signExactIrohaConnectMessage = async",
      "const irohaConnectBoundary =",
    );
    expect(connectSigner).toContain("withPrivateKeyBuffer(");
    expect(
      connectSigner.indexOf("getConnectSigningAlgorithmCode("),
    ).toBeLessThan(connectSigner.indexOf("withPrivateKeyBuffer("));

    const connectBoundary = readSource("electron/irohaConnectBoundary.ts");
    const prepareSession = between(
      connectBoundary,
      "async prepareSession(input",
      "async approveSession(input",
    );
    expect(prepareSession).toContain("let transferred = false");
    expect(prepareSession).toContain("finally {");
    expect(prepareSession).toContain("directionKeys.appKey.fill(0)");
    expect(prepareSession).toContain("directionKeys.walletKey.fill(0)");
    expect(prepareSession).toContain("approvalPreimage?.fill(0)");
  });

  it("wipes generated wallet keys and optional deterministic seeds", () => {
    const generate = between(
      preload,
      "generateKeyPair(input)",
      "generateKaigiSignalKeyPair()",
    );
    expect(generate).toContain("privateKey.fill(0)");
    expect(generate).toContain("seed?.fill(0)");
  });

  it("keeps the faucet challenge path free of wallet signing material", () => {
    const faucet = between(
      preload,
      "async requestFaucetFunds(input, onStatus)",
      "async cancelFaucetRequest(input)",
    );
    expect(faucet).not.toContain("resolveSigningMaterial");
    expect(faucet).not.toContain("privateKey");
    expect(faucet).not.toContain("signFirstReleaseAuthorityTransaction");
  });

  it("wipes VPN canonical-auth buffers after success and failure", () => {
    const source = readSource("electron/vpnRuntime.ts");
    const authRunner = between(
      source,
      "const runWithVpnCanonicalAuth = async",
      "const normalizeChainId =",
    );
    expect(authRunner).toContain("return await operation(canonicalAuth)");
    expect(authRunner).toContain("finally {");
    expect(authRunner).toContain("canonicalAuth.privateKey.fill(0)");

    const connect = between(
      source,
      "async connect(input",
      "async disconnect(input",
    );
    expect(connect).toContain("finally {");
    expect(connect).toContain("canonicalAuth?.privateKey.fill(0)");
    expect(source.match(/runWithVpnCanonicalAuth\(/gu)).toHaveLength(2);
  });

  it("wipes Kaigi agreement, AES, invite, and plaintext buffers", () => {
    const source = readSource("electron/kaigiCrypto.ts");
    expect(source).toContain("sharedSecret.fill(0)");
    expect(source).toContain("secret.fill(0)");
    expect(source.match(/key\.fill\(0\)/gu)).toHaveLength(4);
    expect(source.match(/plaintext\?\.fill\(0\)/gu)).toHaveLength(4);
  });

  it("wipes confidential spend-key buffers after every derivation", () => {
    const source = readSource("electron/confidentialWallet.ts");
    expect(source.match(/spendKey\.fill\(0\)/gu)).toHaveLength(3);
    expect(source).not.toContain(
      "deriveConfidentialOwnerTagV2(Buffer.from(privateKeyHex",
    );
    expect(source).not.toContain("spendKey: Buffer.from(privateKeyHex");
  });

  it("wipes receive private-key bytes decoded by the secure vault", () => {
    const source = readSource("electron/secureVault.ts");
    const validator = between(
      source,
      "const normalizeBase64Url =",
      "const normalizeHex32 =",
    );
    expect(validator).toContain("finally {");
    expect(validator).toContain("decoded.fill(0)");
  });
});
