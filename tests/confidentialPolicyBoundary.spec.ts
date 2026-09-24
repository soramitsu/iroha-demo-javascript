import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "electron/preload.ts"),
  "utf8",
);
const walletSource = readFileSync(
  resolve(process.cwd(), "electron/confidentialWallet.ts"),
  "utf8",
);

describe("confidential policy preload boundary", () => {
  it("requires both live projections and propagates every read or mismatch failure", () => {
    const start = source.indexOf("async getConfidentialAssetPolicy(");
    const end = source.indexOf("getConfidentialAssetBalance(", start);
    const implementation = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("fetchConfidentialAssetPolicyForAccount");
    expect(implementation).toContain("fetchConfidentialAssetDefinition");
    expect(implementation).toContain(
      "assertConfidentialPolicyProjectionAgreement",
    );
    expect(implementation).not.toContain("try {");
    expect(implementation).not.toContain("catch");
    expect(source).not.toContain("mergeConfidentialPolicyWithAssetDefinition");
  });

  it("has no dormant confidential proof or mutation surface", () => {
    expect(existsSync(resolve("src/types/iroha-js-private-kaigi.d.ts"))).toBe(
      false,
    );
    expect(
      existsSync(resolve("electron/firstReleaseConfidentialProof.ts")),
    ).toBe(false);
    expect(existsSync(resolve("electron/accountSealedBox.ts"))).toBe(false);
    for (const removedApi of [
      "buildShieldInstruction",
      "buildUnshieldInstruction",
      "buildZkTransferInstruction",
      "getVerifyingKeyTyped",
      "buildFirstReleaseConfidentialTransferProof",
      "buildFirstReleaseConfidentialUnshieldProofV2",
      "buildFirstReleaseConfidentialUnshieldProofV3",
      "submitConfidentialRelayTransfer",
      "submitConfidentialSelfConsolidation",
    ]) {
      expect(source).not.toContain(removedApi);
    }
    expect(source).not.toContain("/v1/zk/vk/");
    expect(source).not.toContain("/v1/confidential/relay/submit");
    for (const removedWalletHelper of [
      "buildWalletConfidentialMetadataV3",
      "createWalletConfidentialNote",
      "selectWalletConfidentialNotes",
      "WalletSpendableConfidentialNote",
    ]) {
      expect(walletSource).not.toContain(removedWalletHelper);
    }
  });

  it("exposes one exact transparent transfer contract with no confidential branch", () => {
    const start = source.indexOf("async transferAsset(rendererInput)");
    const end = source.indexOf("setIrohaConnectContext(input)", start);
    const implementation = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain(
      'requireFirstReleaseIpcInput(rendererInput, "transferAsset")',
    );
    expect(implementation).toContain(
      "buildFirstReleaseTransferAssetInstruction(",
    );
    for (const removedBranch of [
      "shieldedRecipient",
      "buildFirstReleaseConfidential",
      "unavailableConfidentialMutationInstruction",
      "Confidential asset mutations are unavailable",
    ]) {
      expect(implementation).not.toContain(removedBranch);
    }
    expect(source).not.toContain("getConfidentialTransferExecutionContext");
    expect(source).not.toContain("getPrivateKaigiConfidentialXorState");
    expect(source).not.toContain("getConfidentialWalletState");
  });
});
