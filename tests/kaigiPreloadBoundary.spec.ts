import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preloadSource = readFileSync(resolve("electron/preload.ts"), "utf8");

const between = (start: string, end: string) => {
  const startIndex = preloadSource.indexOf(start);
  const endIndex = preloadSource.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return preloadSource.slice(startIndex, endIndex);
};

describe("Kaigi preload mutation boundary", () => {
  it("requires the exact configured asset before private Kaigi vault or proof work", () => {
    expect(preloadSource).not.toContain(
      'PRIVATE_KAIGI_XOR_ASSET_DEFINITION_ID = "xor#universal"',
    );

    const create = between("async createKaigiMeeting({", "async getKaigiCall(");
    const join = between(
      "async joinKaigiMeeting({",
      "async watchKaigiCallEvents(",
    );
    const end = between("async endKaigiMeeting({", "getSumeragiStatus(config)");

    for (const source of [create, join, end]) {
      const assetValidation = source.indexOf(
        "normalizeFirstReleaseAssetDefinitionId(assetDefinitionId)",
      );
      expect(assetValidation).toBeGreaterThanOrEqual(0);
      expect(source.indexOf("resolveSigningMaterial(")).toBeGreaterThan(
        assetValidation,
      );
      expect(source).toContain(
        "assetDefinitionId: privateKaigiAssetDefinitionId",
      );
    }
  });

  it("discovers a usable relay before vault access, proof generation, or signing", () => {
    const source = between("async createKaigiMeeting({", "async getKaigiCall(");
    const relayIndex = source.indexOf("discoverKaigiRelayManifest(");
    const vaultIndex = source.indexOf("resolveSigningMaterial(");
    const proofIndex = source.indexOf("buildKaigiRosterJoinProof(");
    const signIndex = source.indexOf("quoteAndSignInstructionTransaction(");

    expect(relayIndex).toBeGreaterThanOrEqual(0);
    expect(vaultIndex).toBeGreaterThan(relayIndex);
    expect(proofIndex).toBeGreaterThan(relayIndex);
    expect(signIndex).toBeGreaterThan(relayIndex);
    expect(source).not.toContain("relay_manifest: null");
    expect(source).not.toContain("relayManifest: null");
  });

  it("rejects non-exact call ids and malformed live fee/verifier data before vault or proof work", () => {
    const create = between("async createKaigiMeeting({", "async getKaigiCall(");
    const join = between(
      "async joinKaigiMeeting({",
      "async watchKaigiCallEvents(",
    );
    const end = between("async endKaigiMeeting({", "getSumeragiStatus(config)");

    for (const source of [create, join, end]) {
      const callIdValidation = source.indexOf(
        'normalizeKaigiCallId(callId, "callId")',
      );
      const liveContextValidation = source.indexOf(
        "resolvePrivateKaigiConfidentialXorContext(",
      );
      const vaultAccess = source.indexOf("resolveSigningMaterial(");
      const rosterProof = source.indexOf("buildKaigiRosterJoinProof(");

      expect(callIdValidation).toBeGreaterThanOrEqual(0);
      expect(liveContextValidation).toBeGreaterThan(callIdValidation);
      expect(vaultAccess).toBeGreaterThan(liveContextValidation);
      expect(rosterProof).toBeGreaterThan(liveContextValidation);
    }

    const resolver = between(
      "async function resolvePrivateKaigiConfidentialXorContext(",
      "const quoteAndSignInstructionTransaction",
    );
    expect(resolver).toContain('"/v1/pipeline/preflight"');
    expect(resolver).toContain("fetchNexusLifecycle(input.toriiUrl)");
    expect(resolver).toContain("readPrivateKaigiFeeSchedule(");
    expect(resolver).toContain("readPrivateKaigiTransferVerifyingKey(");
    expect(resolver).not.toContain("getConfiguration()");
    expect(resolver).not.toContain("fees.baseFee");
    expect(resolver).not.toContain('?? "0"');
  });

  it("reloads join privacy, host key, and roster root from the live call before vault access", () => {
    const join = between(
      "async joinKaigiMeeting({",
      "async watchKaigiCallEvents(",
    );
    const liveCallRead = join.indexOf("await fetchKaigiMeetingView({");
    const livePrivacy = join.indexOf(
      "const resolvedPrivacyMode = liveMeeting.privacyMode",
    );
    const privateContext = join.indexOf(
      "resolvePrivateKaigiConfidentialXorContext(",
    );
    const vaultAccess = join.indexOf("resolveSigningMaterial(");
    const signature = join.slice(0, join.indexOf("}) {"));

    expect(liveCallRead).toBeGreaterThanOrEqual(0);
    expect(livePrivacy).toBeGreaterThan(liveCallRead);
    expect(privateContext).toBeGreaterThan(livePrivacy);
    expect(vaultAccess).toBeGreaterThan(privateContext);
    expect(join).toContain(
      "encryptedSignal: encryptKaigiPayload(\n          answerPayload,\n          liveMeeting.hostKaigiPublicKeyBase64Url",
    );
    expect(join).toContain(
      'liveMeeting.rosterRootHex,\n          "liveMeeting.rosterRootHex"',
    );
    expect(join).not.toContain("normalizeKaigiMeetingPrivacy(privacyMode)");
    expect(signature).not.toContain("hostKaigiPublicKeyBase64Url");
    expect(signature).not.toContain("privacyMode");
    expect(signature).not.toContain("rosterRootHex");
    expect(join).not.toContain(
      "normalizeKaigiRosterRootHex(\n          rosterRootHex",
    );
  });
});
