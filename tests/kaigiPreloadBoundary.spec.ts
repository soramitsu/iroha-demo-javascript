import { existsSync, readFileSync } from "node:fs";
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
  it("does not restore removed private Kaigi SDK APIs through local declarations", () => {
    expect(existsSync(resolve("src/types/iroha-js-private-kaigi.d.ts"))).toBe(
      false,
    );
    for (const removedApi of [
      "buildKaigiRosterJoinProof",
      "buildPrivateCreateKaigiTransaction",
      "buildPrivateJoinKaigiTransaction",
      "buildPrivateEndKaigiTransaction",
      "buildPrivateKaigiFeeSpend",
      "submitTransactionEntrypoint",
    ]) {
      expect(preloadSource).not.toMatch(new RegExp(`\\b${removedApi}\\b`, "u"));
    }
    expect(preloadSource).not.toContain("peerIdentityReveal");
    expect(preloadSource).not.toContain("rosterRootHex");
  });

  it("exposes an exact transparent-only meeting creation contract", () => {
    const source = between(
      "async createKaigiMeeting(input)",
      "async getKaigiCall(input)",
    );
    const privacyRead = source.indexOf(
      "requireFirstReleaseKaigiMeetingPrivacy(",
    );
    const writeBoundary = source.indexOf(
      "assertWriteConnectionMatchesEndpoint(",
    );

    expect(privacyRead).toBeGreaterThanOrEqual(0);
    expect(writeBoundary).toBeGreaterThan(privacyRead);
    for (const removedPrivateWork of [
      "resolvePrivateKaigiConfidentialXorContext(",
      "unavailablePrivateKaigiProof(",
      "buildFundedPrivateKaigiEntrypoint(",
      "assetDefinitionId",
    ]) {
      expect(source).not.toContain(removedPrivateWork);
    }
    expect(source).not.toContain("discoverKaigiRelayManifest(");
    expect(source).toContain(
      'requireFirstReleaseIpcInput(input, "kaigiCreate")',
    );
  });

  it("normalizes exact transparent live records without private mutation branches", () => {
    const meetingView = between(
      "const resolveKaigiMeetingView = (",
      "const ensureObjectResponse = (",
    );
    const privacyRead = meetingView.indexOf(
      "requireFirstReleaseKaigiMeetingPrivacy(",
    );
    expect(privacyRead).toBeGreaterThanOrEqual(0);
    expect(privacyRead).toBeLessThan(
      meetingView.indexOf("normalizeFirstReleaseKaigiCallMetadata("),
    );

    const join = between(
      "async joinKaigiMeeting(input)",
      "async watchKaigiCallEvents(input, onEvent)",
    );
    const joinLiveRead = join.indexOf("await fetchKaigiMeetingView({");
    expect(joinLiveRead).toBeGreaterThanOrEqual(0);
    expect(join.indexOf("resolveSigningMaterial(")).toBeGreaterThan(
      joinLiveRead,
    );

    const end = between(
      "async endKaigiMeeting(input)",
      "getSumeragiStatus(config)",
    );
    const endLiveRead = end.indexOf("await fetchFirstReleaseKaigiCall(");
    expect(endLiveRead).toBeGreaterThanOrEqual(0);
    const endPrivacyRead = end.indexOf(
      "requireFirstReleaseKaigiMeetingPrivacy(",
    );
    expect(endPrivacyRead).toBeGreaterThan(endLiveRead);
    expect(end.indexOf("resolveSigningMaterial(")).toBeGreaterThan(
      endPrivacyRead,
    );

    for (const source of [meetingView, join, end]) {
      for (const removedPrivateWork of [
        "rejectUnavailablePrivateKaigi(",
        "resolvePrivateKaigiConfidentialXorContext(",
        "unavailablePrivateKaigiProof(",
        "buildFundedPrivateKaigiEntrypoint(",
        "assetDefinitionId",
      ]) {
        expect(source).not.toContain(removedPrivateWork);
      }
    }
  });

  it("signs the exact current timestamp-and-limit Kaigi signal request", () => {
    const source = between(
      "async pollKaigiMeetingSignals(input)",
      "async endKaigiMeeting(input)",
    );
    expect(source).toContain("fetchFirstReleaseKaigiSignals({");
    expect(source).toContain("resolveSigningMaterial({");
    expect(source).toContain("resolveTrustedEndpointNetworkId({");
    expect(source).toContain("chainId,");
    expect(source).toContain("afterTimestampMs:");
    expect(source).toContain(
      "const pageLimit = requireFirstReleasePagination(",
    );
    expect(source).toContain("maximumLimit: 500");
    expect(source).toContain("limit: pageLimit");
    expect(source).toContain(
      "Kaigi call signals returned more items than requested.",
    );
    expect(source).toContain('requireFirstReleaseIpcInput(input, "kaigiPoll")');
    expect(source).not.toContain("catch (_error)");
    expect(source).not.toContain("offset");
  });
});
