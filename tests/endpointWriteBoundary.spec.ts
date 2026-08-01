import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preload = readFileSync(
  resolve(process.cwd(), "electron/preload.ts"),
  "utf8",
);

const between = (startMarker: string, endMarker: string) => {
  const start = preload.indexOf(startMarker);
  const end = preload.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker ${startMarker}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(end, `missing source marker ${endMarker}`).toBeGreaterThan(start);
  return preload.slice(start, end);
};

const expectGuardBefore = (
  source: string,
  feature: string,
  sensitiveMarker: string,
) => {
  const guard = source.indexOf("assertWriteConnectionMatchesEndpoint({");
  const featureMarker = source.indexOf(`"${feature}"`, guard);
  const sensitive = source.indexOf(sensitiveMarker);
  expect(guard, `missing endpoint guard for ${feature}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(featureMarker, `missing ${feature} capability guard`).toBeGreaterThan(
    guard,
  );
  expect(
    sensitive,
    `missing protected operation ${sensitiveMarker}`,
  ).toBeGreaterThan(featureMarker);
};

describe("endpoint write boundary", () => {
  it("contains no hostname-based chain identity fallback", () => {
    expect(preload).not.toContain("KNOWN_CHAIN_METADATA_FALLBACKS");
    expect(preload).not.toContain("resolveKnownChainMetadataFallback");
  });

  it("checks endpoint identity and capability before secrets or writes", () => {
    const cases = [
      {
        source: between(
          "const createSubscriptionOnTorii",
          "const postSubscriptionActionToTorii",
        ),
        feature: "subscriptionWrites",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "const deploySoraCloudHfOnTorii",
          "const getSoraCloudHfStatusFromTorii",
        ),
        feature: "soraCloudDeploy",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "const deriveZkIvmPayloadOnTorii",
          "const startZkIvmProveJobOnTorii",
        ),
        feature: "zkProofJobs",
        sensitive: "postJson(",
      },
      {
        source: between(
          "const buildUranaiPrivateTradeProofEnvelope",
          "const submitConfidentialSelfConsolidation",
        ),
        feature: "confidentialTransfers",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "const submitInstructionTransaction",
          "const GOVERNANCE_REVIEW_TTL_MS",
        ),
        feature: "stakingWrites",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "const assertGovernanceWriteCapabilities",
          "const governanceListLimit",
        ),
        feature: "governanceWrites",
        sensitive: "fetchGovernanceCapabilities(",
      },
      {
        source: between(
          "async registerAccount(input)",
          "async transferAsset(input)",
        ),
        feature: "accountRegistration",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "async transferAsset(input)",
          "setIrohaConnectContext(input)",
        ),
        feature: "assetTransfers",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "const assertIrohaConnectWalletContext",
          "const irohaConnectBoundary",
        ),
        feature: "irohaConnectSessions",
        sensitive: "resolveSigningMaterial({",
      },
      {
        source: between(
          "async connectVpn(input)",
          "async disconnectVpn(input)",
        ),
        feature: "vpnSessions",
        sensitive: "runVpnConnectAfterProfileCheck({",
      },
      {
        source: between("async onboardAccount({", "async requestFaucetFunds("),
        feature: "accountOnboarding",
        sensitive: "nodeFetch(",
      },
      {
        source: between("async createKaigiMeeting({", "async getKaigiCall("),
        feature: "kaigiMeetings",
        sensitive: "resolveSigningMaterial({",
      },
    ];

    for (const entry of cases) {
      expectGuardBefore(entry.source, entry.feature, entry.sensitive);
    }
  });

  it("keeps the unverified-identity exception scoped to the faucet challenge and requires finality before the puzzle flow can submit", () => {
    const challengeConnection = between(
      "const assertFaucetChallengeConnectionAvailable",
      "const inspectEndpointDerivedScope",
    );
    expect(challengeConnection).toContain(
      "assertEndpointFaucetChallengeAvailable({",
    );
    expect(challengeConnection).not.toContain(
      "assertEndpointWriteAuthorized({",
    );
    expect(challengeConnection).not.toContain(
      "getTrustedEndpointIdentityScope(",
    );

    const faucet = between(
      "async requestFaucetFunds(",
      "async cancelFaucetRequest(",
    );
    const challenge = faucet.indexOf(
      "assertFaucetChallengeConnectionAvailable({",
    );
    const finality = faucet.indexOf(
      "assertFaucetEndpointFinalizing(",
      challenge,
    );
    const puzzleFlow = faucet.indexOf(
      "requestFaucetFundsWithPuzzle({",
      finality,
    );
    expect(challenge).toBeGreaterThanOrEqual(0);
    expect(finality).toBeGreaterThan(challenge);
    expect(puzzleFlow).toBeGreaterThan(finality);
    expect(faucet).not.toContain("assertWriteConnectionMatchesEndpoint({");
    expect(faucet).not.toContain("resolveSigningMaterial({");
  });

  it("does not return account onboarding success before finalized-block proof", () => {
    const onboarding = between(
      "async onboardAccount({",
      "async requestFaucetFunds(",
    );
    const submit = onboarding.indexOf("nodeFetch(");
    const finality = onboarding.indexOf(
      "waitForTransactionFinalizedInBlock(",
      submit,
    );
    const finalizedStatus = onboarding.indexOf('status: "FINALIZED"', finality);
    expect(submit).toBeGreaterThanOrEqual(0);
    expect(finality).toBeGreaterThan(submit);
    expect(finalizedStatus).toBeGreaterThan(finality);
  });

  it("preflights SoraCloud public inputs, write identity, and live baseline before vault access", () => {
    const launch = between(
      "const deploySoraCloudHfOnTorii",
      "const getSoraCloudHfStatusFromTorii",
    );
    const orderedMarkers = [
      "assertNoRendererSoraCloudSecrets(input)",
      'normalizeSoraCloudHfToken(input.repoId, "repoId", 256)',
      "normalizeAssetDefinitionId(",
      "soraCloudXorQuantityFromNanos(baseFeeNanos)",
      "assertWriteConnectionMatchesEndpoint({",
      "normalizeCanonicalAccountIdLiteral(",
      "fetchOptionalSoraCloudHfStatusPayload(statusInput)",
      "resolveSigningMaterial({",
      "buildSoraCloudHfDeployRequest({",
      "executeSoraCloudHfDraftToCommit({",
    ];
    let previous = -1;
    for (const marker of orderedMarkers) {
      const index = launch.indexOf(marker);
      expect(
        index,
        `missing SoraCloud boundary marker ${marker}`,
      ).toBeGreaterThan(previous);
      previous = index;
    }
    expect(launch).toContain("revision: resolvedRevision");

    const bridgeTypes = readFileSync(
      resolve(process.cwd(), "src/types/iroha.d.ts"),
      "utf8",
    );
    const soraCloudBridge = bridgeTypes.slice(
      bridgeTypes.indexOf("getSoraCloudStatus(input:"),
      bridgeTypes.indexOf("getParameters(input:"),
    );
    expect(soraCloudBridge).not.toContain("privateKeyHex");
    expect(soraCloudBridge).not.toContain("apiToken");
  });

  it("does not expose renderer-callable signing, proof, or app-private-key oracles", () => {
    const services = readFileSync(
      resolve(process.cwd(), "src/services/iroha.ts"),
      "utf8",
    );
    const bridgeTypes = readFileSync(
      resolve(process.cwd(), "src/types/iroha.d.ts"),
      "utf8",
    );
    for (const source of [preload, services, bridgeTypes]) {
      expect(source).not.toContain("signIrohaConnectMessage(");
      expect(source).not.toContain("buildUranaiPrivateTradeProof(");
      expect(source).not.toContain("createConnectPreview(");
      expect(source).not.toContain("appPrivateKeyHex");
    }
    expect(preload).toContain("new IrohaConnectBoundary({");
    expect(preload).toContain("approveIrohaConnectRequest(input)");
    expect(preload).toContain("rejectIrohaConnectRequest(input)");
  });

  it("requires a main-owned native confirmation for every boundary authorization", () => {
    const main = readFileSync(
      resolve(process.cwd(), "electron/main.ts"),
      "utf8",
    );
    const handler = main.indexOf(
      "const registerIrohaConnectConfirmationHandler",
    );
    const senderBinding = main.indexOf("owner !== mainWindow", handler);
    const nativeDialog = main.indexOf(
      "dialog.showMessageBox(owner",
      senderBinding,
    );
    expect(handler).toBeGreaterThanOrEqual(0);
    expect(senderBinding).toBeGreaterThan(handler);
    expect(nativeDialog).toBeGreaterThan(senderBinding);
    expect(main.slice(handler, nativeDialog + 500)).toContain(
      'buttons: ["Reject", "Approve"]',
    );
    expect(main.slice(handler, nativeDialog + 500)).toContain("defaultId: 0");
    expect(preload).toContain("IROHA_CONNECT_CONFIRMATION_CHANNEL");
    expect(preload).toContain("new IrohaConnectBoundary({");
  });

  it("guards each subscription mutation by its exact advertised route", () => {
    const create = between(
      "const createSubscriptionOnTorii",
      "const postSubscriptionActionToTorii",
    );
    const action = between(
      "const postSubscriptionActionToTorii",
      "const normalizeSoraCloudStorageClass",
    );

    expect(create.indexOf('operation: "POST /v1/subscriptions"')).toBeLessThan(
      create.indexOf("resolveSigningMaterial({"),
    );
    expect(
      action.indexOf(
        "operation: `POST /v1/subscriptions/{subscription_id}/${routeAction}`",
      ),
    ).toBeLessThan(action.indexOf("buildSubscriptionActionDraftBody("));
  });

  it("keeps subscription drafts and signing material on the correct side of the vault boundary", () => {
    const create = between(
      "const createSubscriptionOnTorii",
      "const postSubscriptionActionToTorii",
    );
    const action = between(
      "const postSubscriptionActionToTorii",
      "const normalizeSoraCloudStorageClass",
    );
    for (const source of [create, action]) {
      expect(source.indexOf("postJson(")).toBeLessThan(
        source.indexOf("decodeSubscription"),
      );
      expect(source.indexOf("decodeSubscription")).toBeLessThan(
        source.indexOf("resolveSigningMaterial({"),
      );
      expect(source).not.toContain("private_key");
      expect(
        source
          .slice(0, source.indexOf("resolveSigningMaterial({"))
          .includes("privateKeyHex"),
      ).toBe(false);
    }

    const bridgeTypes = readFileSync(
      resolve(process.cwd(), "src/types/iroha.d.ts"),
      "utf8",
    );
    const subscriptionBridge = bridgeTypes.slice(
      bridgeTypes.indexOf("createSubscription(input:"),
      bridgeTypes.indexOf("getSoraCloudStatus(input:"),
    );
    expect(subscriptionBridge).not.toContain("privateKeyHex");
    expect(subscriptionBridge).toContain(
      'cancelMode: "immediate" | "period_end"',
    );
    expect(preload).not.toContain(
      'cancelMode: input.cancelMode ?? "period_end"',
    );
  });

  it("keeps VPN controller repair local and available without endpoint or vault access", () => {
    const repair = between("async repairVpn(", "async listVpnReceipts(");
    expect(repair).toContain("runLocalVpnRepair({");
    expect(repair).toContain('ipcRenderer.invoke("vpn:repair")');
    expect(repair).not.toContain("assertWriteConnectionMatchesEndpoint");
    expect(repair).not.toContain("resolveSigningMaterial");
    expect(repair).not.toContain("resolveOptionalSigningMaterial");
    expect(repair).not.toContain("getVpnProfile");
  });
});
