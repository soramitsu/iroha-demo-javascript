import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { ed25519 } from "@noble/curves/ed25519";
import { AccountAddress } from "@iroha/iroha-js/address";
import { chromium } from "playwright";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const rendererRoot = path.join(repoRoot, "src");
const outputDir = path.join(repoRoot, "output/playwright");
const useRealMedia = process.env.E2E_REAL_MEDIA === "1";
const browserChannel = process.env.E2E_BROWSER_CHANNEL?.trim() || undefined;
const axeFailures = [];
const targetSizeFailures = [];
const primaryActionFailures = [];
const layoutFailures = [];

const E2E_PUBLIC_KEY_HEX =
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const E2E_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from(Buffer.from(E2E_PUBLIC_KEY_HEX, "hex")),
}).toI105(369);
const E2E_PRIVATE_KEY_HEX =
  "1111111111111111111111111111111111111111111111111111111111111111";
const TAIRA_TORII_URL = "https://taira.sora.org";
const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
// Deterministic fixture identity; the wallet derives the real NetworkId from
// the endpoint and pins it on first use.
const TAIRA_NETWORK_ID =
  "hash:5C3E66C94E079079FF4FC46F59810B9C4EC7B2646DD45CE937831C0FDCE20C9B#44D9";
const TAIRA_GENESIS_HASH =
  "5c3e66c94e079079ff4fc46f59810b9c4ec7b2646dd45ce937831c0fdce20c9b";
const TAIRA_GOVERNANCE_ESCROW_ACCOUNT =
  "testuﾛ1NfｷgﾉﾓﾉBｦKﾌﾘﾒoﾇﾂﾛrG81ﾋjWﾎﾕVncwﾌSｱ3pﾘﾋﾉhUS9Q76";
const XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const XOR_ASSET_ID = `${XOR_ASSET_DEFINITION_ID}#${E2E_ACCOUNT_ID}`;

const governanceFixtureAccount = (seedByte) =>
  AccountAddress.fromAccount({
    publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(seedByte)),
  }).toI105(369);

// The native binding requires the treasury and pool vault to be the subject
// accounts of the conversion and pool contracts below. These are the TAIRA
// (prefix 369) renderings of the reviewed SDK `retail_fee_native_conversion_v1`
// fixture subjects, so the mocked binding is one the native would accept.
const GOVERNANCE_FIXTURE_ACCOUNTS = Object.freeze({
  treasury: "testuﾛ1PZﾗidｱJJHofｸXNｵｿcﾐﾃgﾀﾔzBYﾜcﾈｦfｶxKfﾁｼ1pG871VMK",
  poolVault: "testuﾛ1NﾔBnヱ5ﾈﾘｦﾇｦTｻﾂVUﾓヱｺYﾏ3bｲ1ｻaﾌTtﾎﾉtｹZｱﾜo4VHCA4Q",
  rewardPool: governanceFixtureAccount(0x23),
  referenceProviders: Object.freeze(
    [0x24, 0x25, 0x26, 0x27, 0x28].map(governanceFixtureAccount),
  ),
});

// Keep this normalized fixture aligned with GovernanceCapabilitiesV1. Retired
// proposal-backed PLAIN ballot, manual finalization, and enactment routes are
// intentionally absent.
const GOVERNANCE_CAPABILITIES_FIXTURE = Object.freeze({
  schema: "iroha.governance.capabilities.v1",
  version: 1,
  networkId: TAIRA_NETWORK_ID,
  currentHeight: "98765",
  networkPrefix: 369,
  abiVersion: 1,
  dataModelVersion: 4,
  approvalMode: "PARLIAMENT_ATTEMPT_TIMED_OVN_V1",
  privateBallotProtocol: "TIMED_OVN_TLE_THRESHOLD_BLS_V1",
  mandatoryPrivateBallots: true,
  proposalBackedReferendumBallotsSupported: false,
  standalonePlainBallotsSupported: true,
  standaloneZkBallotsSupported: true,
  citizenshipAssetId: XOR_ASSET_DEFINITION_ID,
  citizenshipBondAmount: "10000",
  citizenshipEscrowAccount: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  votingAssetId: XOR_ASSET_DEFINITION_ID,
  minBondAmount: "150",
  bondEscrowAccount: TAIRA_GOVERNANCE_ESCROW_ACCOUNT,
  minEnactmentDelay: 600,
  invitationPhaseBlocks: 3_600,
  registrationPhaseBlocks: 3_600,
  survivorFreezePhaseBlocks: 1_000,
  commitmentPhaseBlocks: 3_600,
  releaseDelayBlocks: 600,
  openingPhaseBlocks: 600,
  maxBallotRetries: 3,
  maxCorpusEntries: 1_000,
  targetBodySizes: {
    rules_committee: 7,
    agenda_council: 9,
    interest_panel: 11,
    review_panel: 13,
    coordination_council: 150,
    mpc_committee: 50,
    fma_committee: 5,
    oversight_committee: 7,
    policy_jury: 25,
    confirmation_jury: 1_000,
  },
  supportedProposalKinds: [
    "DEPLOY_CONTRACT",
    "RUNTIME_UPGRADE",
    "SCCP_ROUTE_GOVERNANCE",
    "VALIDATION_FEE_POLICY",
    "VALIDATION_FEE_PAYOUT_LIFECYCLE",
    "MUSUBI_REGISTRY_GOVERNANCE",
    "SORAFS_PROVIDER_GOVERNANCE",
    "CONTRACT_LIFECYCLE_GOVERNANCE",
    "CONTRACT_EMERGENCY_HOLD",
    "GLOBAL_DATA_TRIGGER_PERMISSION_GOVERNANCE",
  ],
  supportedRoutes: [
    "/v1/gov/capabilities",
    "/v1/gov/citizens/draft",
    "/v1/gov/parliament/attempts/draft",
    "/v1/gov/parliament/attempts/{governance_attempt_id}",
    "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-context",
    "/v1/gov/parliament/ballots/{ballot_attempt_id}/casting-proof",
    "/v1/gov/parliament/ballots/{ballot_attempt_id}/release-context",
    "/v1/gov/parliament/ballots/{ballot_attempt_id}/partial-release",
    "/v1/gov/parliament/transitions/draft",
    "/v1/gov/ballots/plain",
    "/v1/gov/ballots/zk-v1",
    "/v1/gov/ballots/zk-v1/ballot-proof",
    "/v1/validation-fee/proposals",
    "/v1/validation-fee/proposals/{proposal_id}",
    "/v1/validation-fee/proposals/draft",
  ],
});

const routeChecks = [
  ["/wallet", "Wallet"],
  ["/stats", "Network health"],
  ["/send", "Send"],
  ["/receive", "Receive"],
  ["/subscriptions", "Subscriptions"],
  ["/soracloud", "SoraCloud"],
  ["/staking", "Stake XOR"],
  ["/governance", "Governance"],
  ["/explore", "Explore"],
  ["/kaigi", "Kaigi"],
  ["/vpn", "Sora VPN"],
  ["/setup", "Advanced settings"],
  ["/settings", "Settings"],
  ["/account", "Wallets"],
];

const mobileRouteChecks = [
  ["/receive", "Receive"],
  ["/send", "Send"],
  ["/kaigi", "Kaigi"],
  ["/soracloud", "SoraCloud"],
  ["/vpn", "Sora VPN"],
];

const responsiveViewportChecks = [
  {
    label: "electron-minimum",
    viewport: { width: 1024, height: 720 },
    routes: [
      ["/wallet", "Wallet"],
      ["/send", "Send"],
      ["/staking", "Stake XOR"],
      ["/governance", "Governance"],
    ],
  },
  {
    label: "electron-default",
    viewport: { width: 1280, height: 900 },
    routes: [
      ["/wallet", "Wallet"],
      ["/receive", "Receive"],
      ["/kaigi", "Kaigi"],
      ["/governance", "Governance"],
    ],
  },
  {
    label: "tablet",
    viewport: { width: 768, height: 1024 },
    routes: [
      ["/wallet", "Wallet"],
      ["/send", "Send"],
      ["/receive", "Receive"],
    ],
  },
  {
    label: "mobile",
    viewport: { width: 390, height: 844 },
    routes: mobileRouteChecks,
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildInitScript() {
  const useSyntheticMedia = !useRealMedia;
  const sessionPayload = {
    schema: "iroha-demo-public-session",
    version: 1,
    connection: {
      toriiUrl: TAIRA_TORII_URL,
      chainId: TAIRA_CHAIN_ID,
      assetDefinitionId: XOR_ASSET_DEFINITION_ID,
      networkPrefix: 369,
    },
    authority: {
      accountId: "",
      signingAlgorithm: "ed25519",
      hasStoredSecret: false,
    },
    accounts: [
      {
        displayName: "E2E Wallet",
        domain: "default",
        accountId: E2E_ACCOUNT_ID,
        publicKeyHex: E2E_PUBLIC_KEY_HEX,
        signingAlgorithm: "ed25519",
        hasStoredSecret: true,
        localOnly: false,
      },
    ],
    activeAccountId: E2E_ACCOUNT_ID,
  };

  return `(() => {
    const accountId = ${JSON.stringify(E2E_ACCOUNT_ID)};
    const publicKeyHex = ${JSON.stringify(E2E_PUBLIC_KEY_HEX)};
    const privateKeyHex = ${JSON.stringify(E2E_PRIVATE_KEY_HEX)};
    const toriiUrl = ${JSON.stringify(TAIRA_TORII_URL)};
    const chainId = ${JSON.stringify(TAIRA_CHAIN_ID)};
    const tairaNetworkId = ${JSON.stringify(TAIRA_NETWORK_ID)};
    const tairaGenesisHash = ${JSON.stringify(TAIRA_GENESIS_HASH)};
    const xorAssetDefinitionId = ${JSON.stringify(XOR_ASSET_DEFINITION_ID)};
    const xorAssetId = ${JSON.stringify(XOR_ASSET_ID)};
    const governanceFixtureAccounts = ${JSON.stringify(GOVERNANCE_FIXTURE_ACCOUNTS)};
    const governanceCapabilitiesFixture = ${JSON.stringify(GOVERNANCE_CAPABILITIES_FIXTURE)};
    const sessionPayload = ${JSON.stringify(sessionPayload)};
    const useSyntheticMedia = ${JSON.stringify(useSyntheticMedia)};
    const fixture = {
      walletFunded: true,
      vpnMode: "ready",
    };
    const now = () => Date.now();
    const txHash = (label) => Array.from(label).map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("").padEnd(64, "0").slice(0, 64);
    const finalityFor = (hash) => ({
      status: "finalized",
      transactionHash: hash,
      blockHeight: 98763,
      blockHash: "f".repeat(64),
      finalizedBlockHeight: 98763,
    });
    const finalizedTransaction = (label) => {
      const hash = txHash(label);
      return { hash, finality: finalityFor(hash) };
    };
    const finalizedSubscription = (label, subscriptionId) => {
      const tx_hash_hex = txHash(label);
      return {
        ok: true,
        subscription_id: subscriptionId,
        tx_hash_hex,
        finality: finalityFor(tx_hash_hex),
        state_status: "confirmed",
      };
    };
    const svgQr = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#fff"/><rect x="8" y="8" width="24" height="24" fill="#111"/><rect x="64" y="8" width="24" height="24" fill="#111"/><rect x="8" y="64" width="24" height="24" fill="#111"/><rect x="44" y="44" width="12" height="12" fill="#111"/><rect x="64" y="64" width="8" height="8" fill="#111"/><rect x="76" y="76" width="12" height="12" fill="#111"/></svg>';
    const baseMetrics = {
      peers: 4,
      domains: 8,
      accounts: 42,
      assets: 9,
      transactionsAccepted: 1234,
      transactionsRejected: 7,
      blockHeight: 98765,
      blockCreatedAt: new Date(now() - 25000).toISOString(),
      finalizedBlockHeight: 98763,
      averageCommitTimeMs: 850,
      averageBlockTimeMs: 2200,
    };
    const emptyVpnStatus = {
      state: "idle",
      sessionId: null,
      exitClass: null,
      relayEndpoint: null,
      connectedAtMs: null,
      expiresAtMs: null,
      durationMs: 0,
      bytesIn: 0,
      bytesOut: 0,
      routePushes: [],
      excludedRoutes: [],
      dnsServers: [],
      tunnelAddresses: [],
      mtuBytes: 0,
      helperStatus: "ready",
      controllerInstalled: true,
      controllerVersion: "e2e",
      controllerKind: "mock",
      reconcileState: null,
      repairRequired: false,
      remoteSessionActive: false,
      systemTunnelActive: false,
      systemTunnelKind: "mock",
      systemTunnelInterface: "utun-e2e",
      systemTunnelService: "E2E VPN",
      errorMessage: null,
      lastReceipt: null,
    };
    let vpnStatus = { ...emptyVpnStatus };
    const connectedVpnStatus = () => ({
      ...emptyVpnStatus,
      state: "connected",
      sessionId: "vpn-e2e-session",
      exitClass: "standard",
      relayEndpoint: "vpn.taira.e2e:443",
      connectedAtMs: now(),
      expiresAtMs: now() + 60 * 60 * 1000,
      durationMs: 1000,
      bytesIn: 2048,
      bytesOut: 1024,
      routePushes: ["10.42.0.0/16"],
      excludedRoutes: ["127.0.0.0/8"],
      dnsServers: ["10.42.0.53"],
      tunnelAddresses: ["10.42.0.2/32"],
      mtuBytes: 1280,
      remoteSessionActive: true,
      systemTunnelActive: true,
    });
    const assets = () => fixture.walletFunded
      ? {
          total: 1,
          items: [{ asset_id: xorAssetId, quantity: "12500" }],
        }
      : { total: 0, items: [] };
    const confidentialPolicy = () => ({
      asset_id: xorAssetDefinitionId,
      block_height: 98765,
      current_mode: "TransparentOnly",
      effective_mode: "TransparentOnly",
      allow_shield: false,
      allow_unshield: false,
      vk_transfer: null,
      vk_unshield: null,
      vk_shield: null,
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    const confidentialBalance = () => ({
      resolvedAssetId: xorAssetDefinitionId,
      quantity: fixture.walletFunded ? "8" : "0",
      onChainQuantity: fixture.walletFunded ? "8" : "0",
      spendableQuantity: fixture.walletFunded ? "8" : "0",
      exact: true,
      scanSource: "account-transactions",
      scanStatus: "complete",
      scanWatermarkBlock: 98760,
      recoveredNoteCount: 2,
      trackedAssetIds: [xorAssetDefinitionId],
    });
    const governanceProposalId = "0x" + "a".repeat(64);
    const governanceProposalSummary = () => ({
      proposalId: governanceProposalId,
      proposer: accountId,
      createdHeight: 98700,
      status: "Proposed",
      kindType: "ValidationFeePayoutLifecycle",
      kindLabelKey: "Validation fee payout lifecycle",
    });
    const governanceProposalDetail = () => ({
      summary: governanceProposalSummary(),
      kind: {
        type: "ValidationFeePayoutLifecycle",
        proposalOperator: accountId,
        raw: {},
        payoutBinding: {
          contract_address:
            "irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw",
          code_hash: "B".repeat(64),
          entrypoint: "autonomous_validation_fee_tick",
          treasury_account_id: governanceFixtureAccounts.treasury,
          ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv",
          xor_asset_id: xorAssetDefinitionId,
          pool_contract_address:
            "irohac1qyqqqqqqqqqqqqqlzk3skqs8v0haerev9p09yp3ml26zrnctdwz5u",
          pool_code_hash: "C".repeat(64),
          pool_vault_account_id: governanceFixtureAccounts.poolVault,
          reward_pool_account_id: governanceFixtureAccounts.rewardPool,
          reference_feed_id: ["xor_per_sbd"],
          reference_feed_config_version: 1,
          reference_provider_accounts:
            governanceFixtureAccounts.referenceProviders,
          max_sbd_per_attempt_minor: 1000,
          max_sbd_per_day_minor: 100000,
          min_interval_ms: 60000,
          max_source_age_ms: 300000,
          max_slippage_bps: 100,
          validator_lane_id: 0,
          min_reward_claim_xor_minor: 1,
        },
      },
      currentHeight: "98765",
      governanceCertificate: null,
      raw: {},
    });
    const sumeragiStatus = () => ({
      lane_governance: [
        {
          lane_id: 1,
          alias: "public-xor",
          dataspace_id: 10,
          validator_ids: ["validator-a@test"],
        },
      ],
      dataspace_commitments: [{ lane_id: 1, dataspace_id: 10 }],
    });
    const validatorRecord = () => ({
      lane_id: 1,
      validator: "validator-a@test",
      stake_account: "validator-a@test",
      total_stake: "25000",
      self_stake: "5000",
      status: {
        type: "active",
        activates_at_epoch: null,
        reason: null,
        releases_at_ms: null,
        slash_id: null,
      },
      activation_epoch: 1,
      activation_height: 1000,
      last_reward_epoch: 12,
      metadata: { displayName: "Validator A" },
    });
    const accountQr = () => ({
      canonicalId: accountId,
      literal: accountId,
      networkPrefix: 369,
      errorCorrection: "M",
      modules: 29,
      qrVersion: 3,
      svg: svgQr,
    });
    const networkStats = () => ({
      collectedAtMs: now(),
      xorAssetDefinitionId,
      explorer: baseMetrics,
      supply: {
        definitionId: xorAssetDefinitionId,
        computedAtMs: now(),
        holdersTotal: 12,
        totalSupply: "1000000",
        topHolders: [
          { accountId: accountId, balance: "12500" },
          { accountId: "testu2Holder22222222222222222222222222222222222222", balance: "9000" },
        ],
        distribution: {
          gini: 0.31,
          hhi: 0.09,
          theil: 0.2,
          entropy: 1.1,
          entropyNormalized: 0.8,
          nakamoto33: 3,
          nakamoto51: 5,
          nakamoto67: 7,
          top1: 0.125,
          top5: 0.42,
          top10: 0.68,
          median: "1000",
          p90: "7500",
          p99: "15000",
          lorenz: [
            { population: 0, share: 0 },
            { population: 0.5, share: 0.25 },
            { population: 1, share: 1 },
          ],
        },
      },
      econometrics: {
        definitionId: xorAssetDefinitionId,
        computedAtMs: now(),
        velocityWindows: [
          { key: "24h", startMs: now() - 86400000, endMs: now(), transfers: 12, uniqueSenders: 5, uniqueReceivers: 6, amount: "3200" },
          { key: "7d", startMs: now() - 604800000, endMs: now(), transfers: 84, uniqueSenders: 11, uniqueReceivers: 12, amount: "18000" },
        ],
        issuanceWindows: [
          { key: "24h", startMs: now() - 86400000, endMs: now(), mintCount: 1, burnCount: 0, minted: "1000", burned: "0", net: "1000" },
        ],
        issuanceSeries: Array.from({ length: 12 }, (_, index) => ({
          bucketStartMs: now() - (12 - index) * 3600000,
          minted: String(50 + index),
          burned: "0",
          net: String(50 + index),
        })),
      },
      runtime: {
        queueSize: 4,
        queueCapacity: 100,
        commitTimeMs: 850,
        effectiveBlockTimeMs: 2200,
        txQueueSaturated: false,
        highestQcHeight: 98765,
        lockedQcHeight: 98764,
        currentBlockHeight: 98765,
        finalizedBlockHeight: 98763,
        finalizationLag: 2,
      },
      governance: {
        laneCount: 1,
        dataspaceCount: 1,
        validatorCount: 1,
      },
      warnings: [],
      partial: false,
    });

    const persistedTheme = localStorage.getItem("iroha-demo:theme");
    const persistedLocale = localStorage.getItem("iroha-demo:locale");
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("iroha-demo:")) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem("iroha-demo:session", JSON.stringify(sessionPayload));
    localStorage.setItem("iroha-demo:theme", persistedTheme || "dark");
    if (persistedLocale) {
      localStorage.setItem("iroha-demo:locale", persistedLocale);
    }
    localStorage.setItem(
      "iroha-demo:kaigi:host-sessions:v1",
      JSON.stringify({ hydrated: true, hostSessions: [] }),
    );
    window.__e2e = {
      clipboard: "",
      shared: [],
      calls: [],
      mediaRequests: [],
      failDefaultKaigiCameraOnce: false,
      fixture,
      setFixture: (patch) => Object.assign(fixture, patch || {}),
    };
    const launchedSoraCloudServices = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__e2e.clipboard = String(text);
        },
        readText: async () => window.__e2e.clipboard,
      },
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => {
        window.__e2e.shared.push(payload);
      },
    });
    const mediaDevices = [
      {
        kind: "videoinput",
        deviceId: "camera-eos",
        label: "EOS Webcam Utility",
        groupId: "camera-group-eos",
      },
      {
        kind: "videoinput",
        deviceId: "camera-facetime",
        label: "FaceTime HD Camera",
        groupId: "camera-group-built-in",
      },
      {
        kind: "audioinput",
        deviceId: "mic-built-in",
        label: "Built-in Microphone",
        groupId: "audio-group-built-in",
      },
    ];
    const cloneMediaConstraints = (constraints) => {
      try {
        return JSON.parse(JSON.stringify(constraints ?? {}));
      } catch {
        return {};
      }
    };
    const exactVideoDeviceId = (constraints = {}) => {
      const video = constraints.video;
      if (!video || typeof video !== "object") {
        return "";
      }
      const deviceId = video.deviceId;
      if (typeof deviceId === "string") {
        return deviceId;
      }
      return typeof deviceId?.exact === "string" ? deviceId.exact : "";
    };
    const syntheticMedia = {
      streams: new Set(),
      createStream: async (constraints = {}) => {
        const request = cloneMediaConstraints(constraints);
        window.__e2e.mediaRequests.push(request);
        const tracks = [];
        const wantsVideo = constraints.video !== false;
        const wantsAudio = constraints.audio !== false;
        const videoDeviceId = exactVideoDeviceId(constraints);
        const forceDefaultCameraWithoutFrames =
          wantsVideo &&
          !videoDeviceId &&
          window.__e2e.failDefaultKaigiCameraOnce;
        if (forceDefaultCameraWithoutFrames) {
          window.__e2e.failDefaultKaigiCameraOnce = false;
        }
        if (
          wantsVideo &&
          !forceDefaultCameraWithoutFrames &&
          HTMLCanvasElement.prototype.captureStream
        ) {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const context = canvas.getContext("2d");
          let frame = 0;
          const drawFrame = () => {
            if (!context) return;
            context.fillStyle = "#101827";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "#ff5f8d";
            context.fillRect((frame * 12) % canvas.width, 120, 90, 90);
            context.fillStyle = "#ffffff";
            context.font = "24px sans-serif";
            context.fillText("E2E media", 24, 48);
            frame += 1;
          };
          drawFrame();
          const timer = window.setInterval(drawFrame, 120);
          const videoStream = canvas.captureStream(8);
          videoStream.getTracks().forEach((track) => {
            const stop = track.stop.bind(track);
            track.stop = () => {
              window.clearInterval(timer);
              stop();
            };
            tracks.push(track);
          });
        }
        if (wantsAudio) {
          try {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (AudioContextCtor) {
              const audioContext = new AudioContextCtor();
              const oscillator = audioContext.createOscillator();
              const gain = audioContext.createGain();
              const destination = audioContext.createMediaStreamDestination();
              gain.gain.value = 0.001;
              oscillator.connect(gain);
              gain.connect(destination);
              oscillator.start();
              destination.stream.getAudioTracks().forEach((track) => {
                const stop = track.stop.bind(track);
                track.stop = () => {
                  stop();
                  oscillator.stop();
                  audioContext.close().catch(() => {});
                };
                tracks.push(track);
              });
            }
          } catch {
            // Video-only synthetic media is enough for the smoke checks.
          }
        }
        const stream = new MediaStream(tracks);
        syntheticMedia.streams.add(stream);
        return stream;
      },
    };
    if (useSyntheticMedia) {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async (constraints) => syntheticMedia.createStream(constraints),
          enumerateDevices: async () => mediaDevices.map((device) => ({ ...device })),
        },
      });
    }
    class FakePeerConnection extends EventTarget {
      constructor() {
        super();
        this.localDescription = null;
        this.remoteDescription = null;
        this.signalingState = "stable";
        this.iceGatheringState = "complete";
        this.iceConnectionState = "new";
        this.connectionState = "new";
        this.onicecandidate = null;
        this.oniceconnectionstatechange = null;
        this.onicegatheringstatechange = null;
        this.onsignalingstatechange = null;
        this.onconnectionstatechange = null;
        this.ontrack = null;
        this._senders = [];
      }
      addTrack(track) {
        const sender = { track, replaceTrack: async (nextTrack) => { sender.track = nextTrack; } };
        this._senders.push(sender);
        return sender;
      }
      getSenders() {
        return this._senders;
      }
      async createOffer() {
        return { type: "offer", sdp: "v=0\\r\\na=ice-ufrag:e2eoffer\\r\\na=ice-pwd:e2epassword\\r\\n" };
      }
      async createAnswer() {
        return { type: "answer", sdp: "v=0\\r\\na=ice-ufrag:e2eanswer\\r\\na=ice-pwd:e2epassword\\r\\n" };
      }
      async setLocalDescription(description) {
        this.localDescription = description;
        this.signalingState = description?.type === "offer" ? "have-local-offer" : "stable";
        this.onsignalingstatechange?.();
      }
      async setRemoteDescription(description) {
        this.remoteDescription = description;
        this.signalingState = "stable";
        this.connectionState = "connected";
        this.iceConnectionState = "connected";
        this.onsignalingstatechange?.();
        this.onconnectionstatechange?.();
        this.oniceconnectionstatechange?.();
      }
      async addIceCandidate() {}
      close() {
        this.signalingState = "closed";
        this.connectionState = "closed";
      }
    }
    window.RTCPeerConnection = FakePeerConnection;
    window.iroha = {
      ping: async () => ({ status: "ok" }),
      inspectEndpoint: async (input) => {
        const subscriptionOperations = [
          "POST /v1/subscriptions",
          "POST /v1/subscriptions/{subscription_id}/pause",
          "POST /v1/subscriptions/{subscription_id}/resume",
          "POST /v1/subscriptions/{subscription_id}/cancel",
          "POST /v1/subscriptions/{subscription_id}/keep",
          "POST /v1/subscriptions/{subscription_id}/charge-now",
        ];
        return {
          schema: "iroha.wallet.endpoint-inspection.v1",
          toriiUrl: input.toriiUrl,
          expected: {
            chainId: input.chainId,
            networkPrefix: input.networkPrefix,
          },
          observed: {
            chainId: input.chainId,
            networkPrefix: input.networkPrefix,
            networkId: tairaNetworkId,
            genesisHash: tairaGenesisHash,
          },
          identityStatus: "matched",
          accessMode: "read-write",
          checkedAtMs: now(),
          evidence: ["account-capabilities", "genesis-block"].map(
            (source) => ({
              source,
              identity: {
                chainId: input.chainId,
                networkPrefix: input.networkPrefix,
                networkId: tairaNetworkId,
              },
              observedAtMs: now(),
            }),
          ),
          networkIdentity: {
            state: "matches-pin",
            pinned: {
              networkId: tairaNetworkId,
              networkPrefix: input.networkPrefix,
              confirmedAtMs: now(),
              confirmation: "first-use",
            },
            observedNetworkId: tairaNetworkId,
          },
          diagnostic: {
            code: "endpoint_identity_matched",
            message: "Endpoint identity matches the deterministic fixture.",
          },
          features: Object.fromEntries(
            [
              "accountRegistration",
              "accountOnboarding",
              "assetTransfers",
              "faucetClaim",
              "kaigiMeetings",
              "governanceWrites",
              "stakingWrites",
              "subscriptionWrites",
              "soraCloudHfSharedLease",
              "vpnSessions",
              "irohaConnectSessions",
              "zkProofJobs",
            ].map((feature) => [
              feature,
              {
                supported: true,
                source: "openapi",
                requiredOperations:
                  feature === "subscriptionWrites"
                    ? subscriptionOperations
                    : [],
                missingOperations: [],
              },
            ]),
          ),
        };
      },
      generateKeyPair: () => ({ publicKeyHex, privateKeyHex }),
      generateKaigiSignalKeyPair: () => ({
        publicKeyBase64Url: "kaigi-e2e-public-key",
        privateKeyBase64Url: "kaigi-e2e-private-key",
      }),
      isSecureVaultAvailable: async () => true,
      storeAccountSecret: async () => {},
      listAccountSecretFlags: async ({ accountIds }) => Object.fromEntries((accountIds || []).map((id) => [id, true])),
      getSigningAlgorithms: async () => [
        { id: "ed25519", label: "Ed25519", isDefault: true },
      ],
      deriveAccountAddress: () => ({
        accountId,
        i105AccountId: accountId,
        i105DefaultAccountId: accountId,
        publicKeyHex,
        accountIdWarning: "",
      }),
      validateCanonicalAccountId: ({ accountId: candidate, networkPrefix }) => {
        if (candidate !== accountId || (networkPrefix !== undefined && networkPrefix !== 369)) {
          throw new Error("Account ID is not canonical for the mock network.");
        }
        return candidate;
      },
      derivePublicKey: () => ({ publicKeyHex }),
      createConfidentialPaymentAddress: async () => ({
        schema: "iroha-confidential-payment-address/v3",
        receiveKeyId: "A".repeat(24),
        receivePublicKeyBase64Url: "A".repeat(43),
        shieldedOwnerTagHex: "1".repeat(64),
        shieldedDiversifierHex: "2".repeat(64),
        recoveryHint: "one-time-receive-key",
      }),
      exportConfidentialWalletBackup: async () => ({}),
      importConfidentialWalletBackup: async () => {},
      registerAccount: async () => finalizedTransaction("register"),
      resolveAccountAlias: async ({ alias }) => ({
        alias: "",
        accountId: String(alias || "").trim(),
        resolved: false,
      }),
      transferAsset: async (input) => {
        window.__e2e.calls.push({ method: "transferAsset", input });
        return finalizedTransaction("transfer");
      },
      getConfidentialAssetPolicy: async () => confidentialPolicy(),
      getConfidentialAssetBalance: async () => confidentialBalance(),
      scanConfidentialWallet: async () => confidentialBalance(),
      fetchAccountAssets: async () => assets(),
      fetchAccountTransactions: async () => ({
        total: 1,
        items: [
          {
            entrypoint_hash: txHash("tx1"),
            result_ok: true,
            authority: accountId,
            timestamp_ms: now() - 30000,
            amount: "25",
            asset_id: xorAssetId,
            source: accountId,
            destination: "testu2Recipient3333333333333333333333333333333333",
          },
        ],
      }),
      listAccountPermissions: async () => ({
        total: 3,
        items: [
          { name: "CanSubmitGovernanceBallot", payload: null },
          { name: "CanManageParliament", payload: null },
          { name: "CanEnactGovernance", payload: null },
        ],
      }),
      getGovernanceCapabilities: async () =>
        structuredClone(governanceCapabilitiesFixture),
      getGovernanceCitizenStatus: async () => ({
        state: "not-citizen",
        accountId,
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
      }),
      prepareGovernanceCitizenRegistration: async () => ({
        reviewId: "governance-citizen-review",
        operation: "register-citizen",
        title: "Register bonded citizen",
        proposalId: null,
        referendumId: null,
        decodedInstruction: {
          RegisterCitizen: {
            owner: accountId,
            amount: "10000",
          },
        },
        fee: {
          payer: "authority",
          components: [],
          nextBlockHeight: "98766",
        },
        expiresAtMs: now() + 60000,
      }),
      confirmGovernanceAction: async () => ({
        ...finalizedTransaction("governance"),
        operation: "register-citizen",
        proposalId: null,
        referendumId: null,
        status: "finalized",
      }),
      listGovernanceProposals: async () => ({
        items: [governanceProposalSummary()],
        nextCursor: null,
      }),
      getGovernanceProposalDetail: async () => governanceProposalDetail(),
      getGovernanceCurrentValidationFeePolicy: async () => {
        throw new Error(
          "Validation-fee policy state is unavailable in the deterministic UI fixture.",
        );
      },
      getExplorerMetrics: async () => baseMetrics,
      getNetworkStats: async () => networkStats(),
      getExplorerAccountQr: async () => accountQr(),
      listSubscriptionPlans: async () => ({
        items: [
          {
            plan_id: "plan-e2e",
            plan: {
              provider: "E2E provider",
              pricing: {
                kind: "fixed",
                detail: {
                  amount: "5",
                  asset_definition: "61CtjvNd9T3THAR65GsMVHr82Bjc",
                },
              },
              billing: {
                cadence: {
                  kind: "fixed_period",
                  detail: { period_ms: 2_592_000_000 },
                },
              },
            },
          },
        ],
        total: 1,
      }),
      listSubscriptions: async () => ({ items: [], total: 0 }),
      getSubscription: async () => ({ subscription_id: "sub-e2e" }),
      createSubscription: async (input) =>
        finalizedSubscription("sub-create", input.subscriptionId),
      pauseSubscription: async (input) =>
        finalizedSubscription("sub-pause", input.subscriptionId),
      resumeSubscription: async (input) =>
        finalizedSubscription("sub-resume", input.subscriptionId),
      cancelSubscription: async (input) =>
        finalizedSubscription("sub-cancel", input.subscriptionId),
      keepSubscription: async (input) =>
        finalizedSubscription("sub-keep", input.subscriptionId),
      chargeSubscriptionNow: async (input) =>
        finalizedSubscription("sub-charge", input.subscriptionId),
      getSoraCloudStatus: async () => ({
        available: true,
        schemaVersion: 1,
        serviceCount: launchedSoraCloudServices.length,
        auditEventCount: launchedSoraCloudServices.length,
        services: launchedSoraCloudServices.map((service) => ({ ...service })),
        recentAuditEvents: [],
        raw: {
          control_plane: {
            services: launchedSoraCloudServices.map((service) => ({
              ...service,
            })),
          },
        },
      }),
      getSoraCloudHfSharedLeaseStatus: async (input) => {
        window.__e2e.calls.push({
          method: "getSoraCloudHfSharedLeaseStatus",
          input,
        });
        return {
          found: true,
          source: {
            schemaVersion: 1,
            sourceId:
              "hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1",
            repoId: input.repoId,
            resolvedRevision: input.revision,
            createdAtMs: now(),
            updatedAtMs: now(),
          },
          pool: null,
          member: null,
          latestAuditEvent: null,
          auditEventCount: 0,
          storageBaseFee: "0",
          raw: {
            schema_version: 1,
            source: {
              repo_id: input.repoId,
              resolved_revision: input.revision,
            },
            pool: null,
            member: null,
            latest_audit_event: null,
            audit_event_count: 0,
            storage_base_fee: "0",
          },
        };
      },
      getParameters: async () => ({}),
      getVpnAvailability: async () => {
        const unavailable = fixture.vpnMode === "unavailable";
        const repairRequired = fixture.vpnMode === "repair";
        return {
          platformSupported: true,
          helperManaged: true,
          helperReady: !unavailable && !repairRequired,
          serverReachable: !unavailable,
          profileAvailable: !unavailable,
          actionsEnabled: !unavailable && !repairRequired,
          status: unavailable
            ? "unavailable"
            : repairRequired
              ? "repair-required"
              : "ready",
          message: unavailable
            ? "VPN service is unavailable in this fixture."
            : repairRequired
              ? "VPN repair is required."
              : "VPN helper is ready.",
          helperVersion: "e2e",
          platform: "mock",
          controllerInstalled: true,
          controllerVersion: "e2e",
          controllerKind: "mock",
          controllerPath: "/tmp/e2e-vpn",
          repairRequired,
          systemTunnelConfigured: !repairRequired,
          systemTunnelActive: vpnStatus.state === "connected",
          systemTunnelKind: "mock",
          systemTunnelInterface: "utun-e2e",
          systemTunnelService: "E2E VPN",
        };
      },
      getVpnProfile: async () => ({
        available: true,
        relayEndpoint: "vpn.taira.e2e:443",
        supportedExitClasses: ["standard", "low-latency", "high-security"],
        defaultExitClass: "standard",
        leaseSecs: 3600,
        dnsPushIntervalSecs: 60,
        meterFamily: "xor",
        routePushes: ["10.42.0.0/16"],
        excludedRoutes: ["127.0.0.0/8"],
        dnsServers: ["10.42.0.53"],
        tunnelAddresses: ["10.42.0.2/32"],
        mtuBytes: 1280,
        displayBillingLabel: "E2E test credits",
      }),
      getVpnStatus: async () => fixture.vpnMode === "repair"
        ? { ...vpnStatus, repairRequired: true, reconcileState: "repair-required" }
        : vpnStatus,
      connectVpn: async () => {
        vpnStatus = connectedVpnStatus();
        return vpnStatus;
      },
      disconnectVpn: async () => {
        vpnStatus = { ...emptyVpnStatus };
        return vpnStatus;
      },
      repairVpn: async () => ({ ...emptyVpnStatus }),
      listVpnReceipts: async () => [],
      onboardAccount: async () => {
        const hash = txHash("onboard");
        return {
          account_id: accountId,
          tx_hash_hex: hash,
          status: "FINALIZED",
          finality: finalityFor(hash),
        };
      },
      requestFaucetFunds: async (_input, onProgress) => {
        await onProgress?.({ phase: "requestingPuzzle", attempt: 1, attempts: 1 });
        await onProgress?.({ phase: "claimFinalized", txHashHex: txHash("faucet") });
        return {
          account_id: accountId,
          asset_definition_id: xorAssetDefinitionId,
          asset_id: xorAssetId,
          amount: "1000",
          tx_hash_hex: txHash("faucet"),
          status: "FINALIZED",
          finality: finalityFor(txHash("faucet")),
        };
      },
      createKaigiMeeting: async (input) => {
        window.__e2e.calls.push({ method: "createKaigiMeeting", input });
        return finalizedTransaction("kaigi-create");
      },
      getKaigiCall: async ({ callId }) => ({
        callId,
        meetingCode: callId.split(":").pop() || "e2e",
        title: "E2E Kaigi",
        hostKaigiPublicKeyBase64Url: "kaigi-e2e-public-key",
        scheduledStartMs: now(),
        expiresAtMs: now() + 3600000,
        createdAtMs: now(),
        live: true,
        ended: false,
        hostAccountId: accountId,
        hostDisplayName: "E2E Wallet",
        hostParticipantId: "e2e-wallet",
        participantCount: 1,
        privacyMode: "transparent",
        offerDescription: { type: "offer", sdp: "v=0\\r\\na=ice-ufrag:e2eoffer\\r\\n" },
      }),
      joinKaigiMeeting: async () => finalizedTransaction("kaigi-join"),
      watchKaigiCallEvents: async () => "watch-e2e",
      stopWatchingKaigiCallEvents: () => {},
      pollKaigiMeetingSignals: async () => [],
      endKaigiMeeting: async () => finalizedTransaction("kaigi-end"),
      createConnectPreview: async () => ({
        sidHex: "00",
        sidBase64Url: "AA",
        walletUri: null,
        appUri: null,
        walletCanonicalUri: null,
        appCanonicalUri: null,
        launchProtocol: null,
        tokenApp: null,
        tokenWallet: null,
        appPublicKeyHex: publicKeyHex,
        appPrivateKeyHex: privateKeyHex,
      }),
      getSumeragiStatus: async () => sumeragiStatus(),
      getNexusLifecycle: async () => ({
        version: 1,
        nexus_enabled: true,
        lane_count: 1,
        lanes: [
          {
            id: 1,
            dataspace_id: 1,
            alias: "public",
            description: "Deterministic public lane",
            visibility: "public",
            governance: null,
            storage: "full_replica",
            proof_scheme: "merkle_sha256",
            metadata: {},
          },
        ],
      }),
      getNexusPublicLaneValidators: async () => ({
        lane_id: 1,
        total: 1,
        items: [validatorRecord()],
      }),
      getNexusPublicLaneStake: async () => ({
        lane_id: 1,
        total: 1,
        items: [
          {
            lane_id: 1,
            validator: "validator-a@test",
            staker: accountId,
            bonded: "100",
            metadata: {},
            pending_unbonds: [
              { request_id: "unbond-e2e", amount: "10", release_at_ms: now() - 1000 },
            ],
          },
        ],
      }),
      getNexusPublicLaneRewards: async () => ({
        lane_id: 1,
        total: 1,
        items: [
          {
            lane_id: 1,
            account: accountId,
            asset: xorAssetId,
            last_claimed_epoch: 1,
            pending_through_epoch: 2,
            amount: "4",
          },
        ],
      }),
      getNexusStakingPolicy: async () => ({ unbondingDelayMs: 60000 }),
      bondPublicLaneStake: async () => finalizedTransaction("bond"),
      schedulePublicLaneUnbond: async () => finalizedTransaction("unbond"),
      finalizePublicLaneUnbond: async () => finalizedTransaction("finalize"),
      claimPublicLaneRewards: async () => finalizedTransaction("claim"),
    };
  })();`;
}

async function startRendererServer() {
  const server = await createServer({
    root: rendererRoot,
    configFile: false,
    plugins: [vue()],
    resolve: {
      alias: {
        "@": rendererRoot,
      },
    },
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      hmr: false,
      watch: {
        ignored: ["**/*"],
      },
    },
    logLevel: "warn",
    clearScreen: false,
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert(
    address && typeof address === "object",
    "Vite server did not expose a TCP address.",
  );
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/`,
  };
}

async function waitForRouteTitle(page, title) {
  const heading = page
    .locator(".workspace-heading h1")
    .filter({ hasText: title });
  await heading.waitFor({ state: "visible", timeout: 10000 });
  return heading;
}

async function assertNativeModal(page, selector, label) {
  const dialog = page.locator(selector);
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const state = await dialog.evaluate((element) => ({
    modal: element.matches(":modal"),
    containsFocus: element.contains(document.activeElement),
    labelledBy: element.getAttribute("aria-labelledby"),
    describedBy: element.getAttribute("aria-describedby"),
  }));
  assert(state.modal, `${label} must be opened with showModal().`);
  assert(state.containsFocus, `${label} must own initial focus.`);
  assert(state.labelledBy, `${label} must have an accessible title.`);
  const backgroundStayedInert = await page.evaluate((dialogSelector) => {
    const activeDialog = document.querySelector(dialogSelector);
    const workspace = document.querySelector("#workspace-main");
    if (
      !(activeDialog instanceof HTMLDialogElement) ||
      !(workspace instanceof HTMLElement)
    ) {
      return false;
    }
    workspace.focus();
    return activeDialog.contains(document.activeElement);
  }, selector);
  assert(
    backgroundStayedInert,
    `${label} did not keep background focus inert.`,
  );
  return dialog;
}

async function clickNavDestination(page, route) {
  const href = `#${route}`;
  const viewport = page.viewportSize();
  if ((viewport?.width ?? 1440) <= 760) {
    const trigger = page.locator(".mobile-nav-trigger");
    await trigger.click();
    const drawer = await assertNativeModal(
      page,
      "dialog.ui-dialog-drawer[open]",
      "Navigation drawer",
    );
    const link = drawer.locator(`.nav-link[href="${href}"]`);
    await link.waitFor({ state: "visible" });
    await link.click();
    await drawer.waitFor({ state: "hidden" });
    return;
  }

  const link = page.locator(`.desktop-sidebar .nav-link[href="${href}"]`);
  await link.waitFor({ state: "visible", timeout: 10000 });
  await link.click();
}

async function navigate(page, route, title) {
  const currentRoute = await page.evaluate(
    () => window.location.hash.replace(/^#/, "") || "/",
  );
  if (currentRoute === route) {
    const alternate = route === "/wallet" ? "/settings" : "/wallet";
    await clickNavDestination(page, alternate);
    await page.waitForFunction(
      (expected) => window.location.hash === `#${expected}`,
      alternate,
    );
  }
  await clickNavDestination(page, route);
  const heading = await waitForRouteTitle(page, title);
  await page.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector(".workspace-heading h1"),
    undefined,
    { timeout: 5000 },
  );
  assert(
    (await page.evaluate(
      () => window.location.hash.replace(/^#/, "").split("?")[0],
    )) === route,
    `${route} did not resolve to its exact URL ${route}.`,
  );
  assert(
    await heading.evaluate((element) => document.activeElement === element),
    `${route} did not focus its route heading after navigation.`,
  );
  await page.waitForTimeout(150);
  await assertUsableViewport(
    page,
    `${route} at ${page.viewportSize()?.width}px`,
  );
}

async function assertUsableViewport(page, route) {
  const result = await page.evaluate(() => {
    const html = document.documentElement;
    const widthOverflow = Math.ceil(html.scrollWidth - window.innerWidth);
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || "1") > 0 &&
        !element.closest("[hidden], [inert], dialog:not([open])")
      );
    };
    const labelFor = (element) =>
      element.getAttribute("aria-label") ||
      element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ||
      element.tagName.toLowerCase();
    const hasLocalHorizontalClip = (element) => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body && ancestor !== html) {
        const style = window.getComputedStyle(ancestor);
        if (["auto", "scroll"].includes(style.overflowX)) {
          return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    };
    const visible = Array.from(document.body.querySelectorAll("*")).filter(
      isVisible,
    );
    const rectOverflow = visible
      .filter((element) => {
        if (
          element.matches(
            ".sr-only, .sakura-layer, .skip-link:not(:focus), [data-overflow-allowed]",
          )
        ) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return (
          !hasLocalHorizontalClip(element) &&
          (rect.left < -3 || rect.right > window.innerWidth + 3)
        );
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: labelFor(element),
          tag: element.tagName.toLowerCase(),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      });
    const textOverflow = visible
      .filter((element) =>
        element.matches("button, summary, a.nav-link, [role='tab']"),
      )
      .filter(
        (element) =>
          !(
            element.matches("a.nav-link") &&
            element.closest(".desktop-sidebar") &&
            window.matchMedia("(min-width: 761px) and (max-width: 1179px)")
              .matches
          ) &&
          element.scrollWidth - element.clientWidth > 3 &&
          window.getComputedStyle(element).overflowX === "visible",
      )
      .slice(0, 12)
      .map((element) => ({
        element: labelFor(element),
        tag: element.tagName.toLowerCase(),
        overflow: element.scrollWidth - element.clientWidth,
      }));
    return {
      widthOverflow,
      rectOverflow,
      textOverflow,
    };
  });
  if (
    result.widthOverflow > 4 ||
    result.rectOverflow.length ||
    result.textOverflow.length
  ) {
    const failure = { route, ...result };
    layoutFailures.push(failure);
    console.error(`✗ Layout overflow: ${JSON.stringify(failure)}`);
    return false;
  }
  return true;
}

async function assertTouchTargets(page, label) {
  const undersized = await page.evaluate(() => {
    const selector = [
      "button",
      "select",
      "summary",
      "a.nav-link",
      "a.brand-link",
      "a.ui-button",
      "a.button",
      "a.wallet-action-link",
      "textarea",
      "input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file'])",
    ].join(",");
    return Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest("[hidden], [inert], dialog:not([open])") &&
          !element.matches(".sr-only, [data-target-size-exempt]")
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label") ||
            element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
            element.tagName.toLowerCase(),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        };
      })
      .filter((entry) => entry.width < 44 || entry.height < 44)
      .slice(0, 15);
  });
  if (undersized.length) {
    targetSizeFailures.push({ label, undersized });
    console.error(
      `✗ ${label} has interactive targets smaller than 44px: ${JSON.stringify(undersized)}`,
    );
    return false;
  }
  return true;
}

async function assertPrimaryActionVisibility(page, route) {
  const selectors = {
    "/wallet": ".wallet-quick-actions a, .wallet-quick-actions button",
    "/send": "[data-ui-primary-action]",
    "/staking": "[data-ui-primary-action]",
    "/governance":
      "[data-ui-primary-action], .parliament-proposal-workspace .card-header button",
    "/vpn": "[data-ui-primary-action]",
  };
  const selector = selectors[route];
  if (!selector) return;
  const action = page.locator(selector).filter({ visible: true }).first();
  if ((await action.count()) === 0) return;
  const rect = await action.boundingBox();
  const viewport = page.viewportSize();
  if (
    !rect ||
    rect.y < 0 ||
    rect.y + rect.height > (viewport?.height ?? 1000)
  ) {
    const failure = { route, rect, viewport };
    primaryActionFailures.push(failure);
    console.error(
      `✗ ${route} primary action is outside the visible Electron viewport: ${JSON.stringify(failure)}`,
    );
    return false;
  }
  return true;
}

async function assertAxeClean(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 4).map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
      checks: [...node.any, ...node.all, ...node.none].map((check) => ({
        id: check.id,
        data: check.data,
      })),
    })),
  }));
  if (violations.length) {
    axeFailures.push({ label, violations });
    console.error(
      `✗ ${label} has axe violations:\n${JSON.stringify(violations, null, 2)}`,
    );
    return false;
  }
  return true;
}

function assertDeferredAudits() {
  const failures = {
    accessibility: axeFailures,
    targetSize: targetSizeFailures,
    primaryAction: primaryActionFailures,
    layout: layoutFailures,
  };
  const failureCount = Object.values(failures).reduce(
    (total, entries) => total + entries.length,
    0,
  );
  assert(
    failureCount === 0,
    `Deferred UI audits failed on ${failureCount} route/state checks:\n${JSON.stringify(failures, null, 2)}`,
  );
}

async function saveUiScreenshot(page, name) {
  const fileName = `${name}.png`;
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: true,
  });
  console.log(`✓ saved screenshot output/playwright/${fileName}`);
}

async function locatorIsVisible(locator) {
  return (await locator.count()) > 0 && (await locator.isVisible());
}

async function setTheme(page, desiredTheme) {
  const current = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  if (current === desiredTheme) return;

  const directButton = page.getByTestId(`theme-${desiredTheme}-button`);
  const compactToggle = page.getByTestId("theme-toggle");
  if (await locatorIsVisible(directButton)) {
    await directButton.click();
  } else {
    assert(
      await locatorIsVisible(compactToggle),
      `No visible direct theme control was available to select ${desiredTheme}.`,
    );
    await compactToggle.click();
  }
  await page.waitForFunction(
    (theme) => document.documentElement.getAttribute("data-theme") === theme,
    desiredTheme,
  );

  if (await locatorIsVisible(directButton)) {
    assert(
      (await directButton.getAttribute("aria-pressed")) === "true",
      `${desiredTheme} theme button did not expose its selected state.`,
    );
  }
}

async function setLocale(page, locale) {
  const localeSelect = page.getByTestId("locale-select");
  assert(
    await locatorIsVisible(localeSelect),
    "The direct header locale selector is not visible.",
  );
  await localeSelect.selectOption(locale);
  await page.waitForFunction(
    (value) =>
      document.documentElement.lang === value ||
      document.documentElement.lang.startsWith(value.split("-")[0]),
    locale,
  );
  assert(
    (await localeSelect.inputValue()) === locale,
    `The direct header locale selector did not retain ${locale}.`,
  );
}

async function checkRouteSmoke(page) {
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    for (const [route, title] of routeChecks) {
      await navigate(page, route, title);
      const axeClean = await assertAxeClean(page, `${route} (${theme})`);
      console.log(
        `✓ ${theme} route renders${axeClean ? " and passes axe" : ""} ${route}`,
      );
    }
  }
}

async function checkReceiveQr(page) {
  await navigate(page, "/receive", "Receive");
  await page.locator(".receive-shell .qr img").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Share QR/i }).click();
  await page
    .getByText(/QR shared\.|QR payload copied to clipboard\./)
    .waitFor({ state: "visible" });
  const sharedPayloads = await page.evaluate(() => window.__e2e.shared.length);
  assert(sharedPayloads > 0, "Receive QR share did not invoke the share path.");
  console.log("✓ receive QR renders automatically and shares");
}

async function checkSendForm(page) {
  await navigate(page, "/send", "Send");
  assert(
    (await page.getByRole("button", { name: /Scan payment QR/i }).count()) ===
      0,
    "Transparent-only Send unexpectedly exposed the retired QR/private-send scanner.",
  );
  await page
    .getByTestId("destination-account-input")
    .fill("testu2Recipient3333333333333333333333333333333333");
  await page
    .locator(".send-form label", { hasText: "Amount" })
    .locator("input")
    .fill("3.5");
  await page.getByTestId("send-review-button").click();
  await page.getByTestId("send-confirm-button").click();
  await page
    .getByText(/Transaction finalized on-chain:/)
    .waitFor({ state: "visible", timeout: 5000 });
  console.log(
    "✓ transparent send form finalizes without retired private controls",
  );
}

async function checkSoraCloudSharedLeaseFlow(page) {
  await navigate(page, "/soracloud", "SoraCloud");
  await page.getByText("Live API ready").first().waitFor({ state: "visible" });
  await page
    .getByText("No SoraCloud services found on this endpoint.")
    .waitFor({
      state: "visible",
    });
  await page
    .locator(".ui-segmented")
    .getByRole("button", { name: "HF shared lease", exact: true })
    .click();
  await page.getByText("Lease joining is read-only").waitFor({
    state: "visible",
  });
  const joinButton = page.getByRole("button", {
    name: "Join shared lease unavailable",
  });
  assert(
    await joinButton.isDisabled(),
    "SoraCloud shared-lease join must remain disabled without the exact SDK encoder.",
  );
  await page.getByLabel("Hugging Face repo").waitFor({ state: "visible" });

  await page
    .getByLabel("Hugging Face repo")
    .fill("sentence-transformers/all-MiniLM-L6-v2");
  const revision = "0123456789abcdef0123456789abcdef01234567";
  await page.getByLabel("Full commit revision").fill(revision);
  const statusButton = page.getByRole("button", {
    name: "Check shared lease",
  });
  await statusButton.waitFor({ state: "visible" });
  assert(
    await statusButton.isEnabled(),
    "SoraCloud shared-lease status did not enable for an exact query.",
  );
  await statusButton.click();
  await page.getByTestId("hf-shared-lease-status").waitFor({
    state: "visible",
    timeout: 10000,
  });

  const statusCall = await page.evaluate(() =>
    window.__e2e.calls.find(
      (call) => call.method === "getSoraCloudHfSharedLeaseStatus",
    ),
  );
  assert(statusCall, "SoraCloud shared-lease status did not call the bridge.");
  assert(
    statusCall.input.revision === revision,
    `SoraCloud shared-lease query used wrong revision: ${statusCall.input.revision}`,
  );
  assert(
    statusCall.input.repoId === "sentence-transformers/all-MiniLM-L6-v2",
    `SoraCloud shared-lease query used wrong repo: ${statusCall.input.repoId}`,
  );
  const bridgeSurface = await page.evaluate(() => Object.keys(window.iroha));
  assert(
    !bridgeSurface.includes("deploySoraCloudHf") &&
      !bridgeSurface.includes("joinSoraCloudHf"),
    "SoraCloud exposed a write bridge without an exact provenance encoder.",
  );
  console.log(
    "✓ soracloud shared-lease status is exact and join is fail-closed",
  );
}

async function checkSubscriptionModes(page) {
  await navigate(page, "/subscriptions", "Subscriptions");
  await page.getByText("No subscriptions yet").waitFor({ state: "visible" });
  await page
    .locator(".ui-segmented")
    .getByRole("button", { name: "Subscribe to plan", exact: true })
    .click();
  const planSelect = page.getByLabel("Plan ID");
  await planSelect.waitFor({ state: "visible" });
  await planSelect.selectOption("plan-e2e");
  assert(
    (await planSelect.inputValue()) === "plan-e2e",
    "The live plan catalog could not select its plan.",
  );
  await page
    .getByRole("button", { name: "Create subscription" })
    .waitFor({ state: "visible" });
  console.log("✓ subscriptions switches from records to subscribe mode");
}

async function checkKaigi(page) {
  await navigate(page, "/kaigi", "Kaigi");
  await page
    .locator(".kaigi-media-setup")
    .getByText("Camera and mic")
    .waitFor({ state: "visible", timeout: 10000 });
  const mediaDeviceOptions = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".kaigi-device-grid select")).map(
      (select) =>
        Array.from(select.options).map((option) => option.textContent?.trim()),
    ),
  );
  if (useRealMedia) {
    assert(
      mediaDeviceOptions[0]?.includes("Auto-select camera"),
      `Kaigi camera selector did not expose auto camera selection: ${JSON.stringify(mediaDeviceOptions[0])}`,
    );
  } else {
    assert(
      mediaDeviceOptions[0]?.includes("Auto-select camera") &&
        mediaDeviceOptions[0]?.includes("FaceTime HD Camera") &&
        mediaDeviceOptions[0]?.includes("EOS Webcam Utility"),
      `Kaigi camera selector did not list expected devices: ${JSON.stringify(mediaDeviceOptions[0])}`,
    );
    assert(
      mediaDeviceOptions[1]?.includes("Built-in Microphone"),
      `Kaigi microphone selector did not list expected devices: ${JSON.stringify(mediaDeviceOptions[1])}`,
    );
  }
  await page.getByRole("button", { name: "Refresh devices" }).click();
  await page
    .getByText("Media devices refreshed.")
    .waitFor({ state: "visible", timeout: 10000 });

  if (useRealMedia) {
    await page.getByRole("button", { name: "Find working camera" }).click();
    await page
      .getByText("Local media is ready.")
      .waitFor({ state: "visible", timeout: 15000 });
    await page.getByText("Preview live").waitFor({ state: "visible" });
    const videoStateHandle = await page.waitForFunction(
      () => {
        const video = document.querySelector(".kaigi-local-video video");
        if (
          !video ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.videoWidth <= 0 ||
          video.videoHeight <= 0
        ) {
          return false;
        }
        const track = video.srcObject?.getVideoTracks?.()[0];
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          label: track?.label || "",
          readyState: video.readyState,
        };
      },
      undefined,
      { timeout: 15000 },
    );
    const videoState = await videoStateHandle.jsonValue();
    assert(
      videoState.width > 0 && videoState.height > 0,
      `Real camera did not render video frames: ${JSON.stringify(videoState)}`,
    );
    console.log(
      `✓ real camera preview rendered ${videoState.width}x${videoState.height}${
        videoState.label ? ` from ${videoState.label}` : ""
      }`,
    );
    await saveUiScreenshot(page, "kaigi-real-camera-e2e");
  } else {
    await page.evaluate(() => {
      window.__e2e.mediaRequests = [];
      window.__e2e.failDefaultKaigiCameraOnce = true;
    });
    await page.getByRole("button", { name: "Find working camera" }).click();
    await page
      .getByText("Local media is ready.")
      .waitFor({ state: "visible", timeout: 20000 });
    await page.getByText("Preview live").waitFor({ state: "visible" });
    await page.waitForFunction(
      () => window.__e2e.mediaRequests.length >= 2,
      undefined,
      { timeout: 10000 },
    );
    const cameraSelectValue = await page
      .locator(".kaigi-device-grid label", { hasText: "Camera" })
      .locator("select")
      .inputValue();
    assert(
      cameraSelectValue === "camera-facetime",
      `Kaigi did not fall back to FaceTime camera, selected ${cameraSelectValue}`,
    );
    const mediaRequests = await page.evaluate(() => window.__e2e.mediaRequests);
    assert(
      !mediaRequests[0]?.video?.deviceId,
      `Kaigi first media request should try the default camera: ${JSON.stringify(mediaRequests[0])}`,
    );
    assert(
      mediaRequests.some(
        (request) => request?.video?.deviceId?.exact === "camera-facetime",
      ),
      `Kaigi did not request the FaceTime fallback camera: ${JSON.stringify(mediaRequests)}`,
    );
    await page
      .locator(".kaigi-device-grid label", { hasText: "Microphone" })
      .locator("select")
      .selectOption("mic-built-in");
    await page
      .getByText("Local media is ready.")
      .waitFor({ state: "visible", timeout: 10000 });
    const latestMediaRequest = await page.evaluate(() =>
      window.__e2e.mediaRequests.at(-1),
    );
    assert(
      latestMediaRequest?.audio?.deviceId?.exact === "mic-built-in",
      `Kaigi microphone selector did not drive getUserMedia: ${JSON.stringify(latestMediaRequest)}`,
    );
    await saveUiScreenshot(page, "kaigi-media-setup-e2e");
  }

  await page.getByRole("button", { name: /Create meeting link/i }).click();
  await page
    .getByRole("heading", { name: "Meeting link ready" })
    .waitFor({ state: "visible", timeout: 10000 });
  await saveUiScreenshot(page, "kaigi-meeting-link-e2e");
  const invite = await page
    .locator(".kaigi-link-field textarea")
    .first()
    .inputValue();
  const inviteUrl = new URL(invite);
  const inviteEntries = Array.from(inviteUrl.searchParams.entries());
  assert(
    inviteUrl.protocol === "iroha:" &&
      inviteUrl.hostname === "kaigi" &&
      inviteUrl.pathname === "/join" &&
      inviteEntries.length === 2 &&
      inviteUrl.searchParams.getAll("call").length === 1 &&
      inviteUrl.searchParams.getAll("secret").length === 1 &&
      /^kaigi\.universal:kaigi-[a-z0-9-]+$/.test(
        inviteUrl.searchParams.get("call") || "",
      ) &&
      /^[A-Za-z0-9_-]{32}$/.test(inviteUrl.searchParams.get("secret") || ""),
    `Kaigi invite was not the exact canonical call-and-secret link: ${invite}`,
  );
  await page
    .getByRole("button", { name: "I will keep this window open" })
    .click();
  await page.getByRole("button", { name: "Join meeting" }).click();
  await page.locator("textarea").first().fill(invite);
  await page.getByRole("button", { name: "Load invite" }).click();
  await page
    .getByRole("heading", { name: "Meeting summary" })
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByText("E2E Kaigi").waitFor({ state: "visible" });
  await saveUiScreenshot(page, "kaigi-join-summary-e2e");
  console.log("✓ kaigi media device UX, fallback, and meeting-link flow work");
}

async function checkExplorer(page) {
  await navigate(page, "/explore", "Explore");
  await page
    .locator(".explore-qr-card .qr-image")
    .waitFor({ state: "visible" });
  await page.getByText("98765").first().waitFor({ state: "visible" });
  console.log("✓ explorer metrics and QR render");
}

async function checkStaking(page) {
  await navigate(page, "/staking", "Stake XOR");
  await page
    .getByText(/Loaded 1 dataspace option|Loaded 1 dataspaces/)
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Max" }).first().click();
  await page.getByRole("button", { name: /Bond XOR|Stake/ }).click();
  await page
    .getByText(/Bond finalized in block|Stake finalized in block/)
    .waitFor({ state: "visible", timeout: 10000 });
  console.log("✓ staking bootstrap and finalized bond action work");
}

async function checkParliament(page) {
  await navigate(page, "/governance", "Governance");
  const bondButton = page.getByTestId("governance-bond-citizen");
  await bondButton.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(
    () => {
      const button = document.querySelector(
        '[data-testid="governance-bond-citizen"]',
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 10000 },
  );
  assert(
    await bondButton.isEnabled(),
    "Non-citizen with sufficient XOR balance and a live bond policy cannot bond XOR.",
  );
  assert(
    /Bond.*XOR/i.test((await bondButton.textContent()) || ""),
    "Governance citizenship action is not labeled as an XOR bond.",
  );
  console.log(
    "✓ governance queue renders and non-citizen XOR bonding is available",
  );
}

async function checkVpn(page) {
  await navigate(page, "/vpn", "Sora VPN");
  await page
    .getByText("VPN ready")
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Connect VPN" }).click();
  await page
    .getByText(/VPN connected|Connected/, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Disconnect VPN" }).click();
  await page
    .getByText(/VPN idle|Idle/, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
  console.log("✓ vpn connect/disconnect controls work");
}

async function readHeaderState(page) {
  return page.evaluate(() => {
    const isRendered = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.closest("[hidden], [inert], dialog:not([open])")
      );
    };
    const describe = (element) => {
      if (!(element instanceof HTMLElement)) {
        return { exists: false, visible: false };
      }
      const rect = element.getBoundingClientRect();
      return {
        exists: true,
        visible: isRendered(element),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        ariaLabel: element.getAttribute("aria-label") || "",
        ariaPressed: element.getAttribute("aria-pressed"),
      };
    };
    const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
    const header = document.querySelector(".app-header");
    const rail = document.querySelector(".header-rail");
    const account = document.querySelector(".utility-menu > summary");
    const controls = {
      irohaConnect: byTestId("header-irohaconnect-button"),
      network: byTestId("network-profile-select"),
      locale: byTestId("locale-select"),
      themeLight: byTestId("theme-light-button"),
      themeDark: byTestId("theme-dark-button"),
      themeToggle: byTestId("theme-toggle"),
      account,
    };
    const renderedControls = Object.values(controls).filter(isRendered);
    const overflowingControls = renderedControls
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      })
      .map(
        (element) =>
          element.getAttribute("data-testid") ||
          element.getAttribute("aria-label") ||
          element.tagName.toLowerCase(),
      );
    const order = [
      controls.irohaConnect,
      controls.network,
      controls.locale,
      isRendered(controls.themeLight)
        ? controls.themeLight
        : controls.themeToggle,
      controls.account,
    ].filter(isRendered);
    const followsHeaderOrder = order.every(
      (element, index) =>
        index === 0 ||
        Boolean(
          order[index - 1].compareDocumentPosition(element) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    );
    const headerRect = header?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      header: {
        exists: Boolean(header),
        clientWidth: header?.clientWidth ?? 0,
        scrollWidth: header?.scrollWidth ?? 0,
        left: headerRect?.left ?? 0,
        right: headerRect?.right ?? 0,
      },
      rail: {
        exists: Boolean(rail),
        left: railRect?.left ?? 0,
        right: railRect?.right ?? 0,
      },
      controls: Object.fromEntries(
        Object.entries(controls).map(([key, element]) => [
          key,
          describe(element),
        ]),
      ),
      overflowingControls,
      followsHeaderOrder,
    };
  });
}

function assertHeaderFits(state, label) {
  assert(
    state.header.exists,
    `${label} did not render the application header.`,
  );
  assert(state.rail.exists, `${label} did not render the header action rail.`);
  assert(
    state.header.scrollWidth <= state.header.clientWidth + 2,
    `${label} header scrolls horizontally: ${JSON.stringify(state.header)}`,
  );
  assert(
    state.rail.left >= -1 && state.rail.right <= state.viewportWidth + 1,
    `${label} header rail extends outside the viewport: ${JSON.stringify(state.rail)}`,
  );
  assert(
    state.overflowingControls.length === 0,
    `${label} has header controls outside the viewport: ${state.overflowingControls.join(", ")}`,
  );
  assert(
    state.followsHeaderOrder,
    `${label} did not preserve IrohaConnect → Network → Language → Theme → Account DOM order.`,
  );
}

function assertControlTarget(control, label) {
  assert(control.visible, `${label} is not visible.`);
  assert(
    control.width >= 43.5 && control.height >= 43.5,
    `${label} must provide a 44px target, got ${control.width}×${control.height}px.`,
  );
}

async function assertHeaderPreferenceMode(page, label, mode) {
  const state = await readHeaderState(page);
  const { controls } = state;
  assertHeaderFits(state, label);
  assertControlTarget(controls.irohaConnect, `${label} IrohaConnect`);
  assertControlTarget(controls.network, `${label} network selector`);
  assertControlTarget(controls.locale, `${label} language selector`);
  assertControlTarget(controls.account, `${label} account menu`);
  assert(
    controls.locale.ariaLabel.length > 0,
    `${label} language selector needs an accessible label.`,
  );

  if (mode === "full") {
    assertControlTarget(controls.themeLight, `${label} light theme option`);
    assertControlTarget(controls.themeDark, `${label} dark theme option`);
    assert(
      !controls.themeToggle.visible,
      `${label} must not show the compact theme toggle in full mode.`,
    );
    assert(
      controls.locale.width >= 112,
      `${label} must show the full language selector, got ${controls.locale.width}px.`,
    );
    const selectedTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    const selected =
      selectedTheme === "light" ? controls.themeLight : controls.themeDark;
    const unselected =
      selectedTheme === "light" ? controls.themeDark : controls.themeLight;
    assert(
      selected.ariaPressed === "true" && unselected.ariaPressed === "false",
      `${label} theme selector did not expose one selected option.`,
    );
  } else {
    assertControlTarget(controls.themeToggle, `${label} theme toggle`);
    assert(
      !controls.themeLight.visible && !controls.themeDark.visible,
      `${label} must hide the two-option theme selector outside full mode.`,
    );
    assert(
      controls.themeToggle.ariaLabel.length > 0,
      `${label} compact theme toggle needs an accessible label.`,
    );
  }

  if (mode === "compact") {
    assert(
      controls.locale.width > 52 && controls.locale.width <= 112,
      `${label} must show the compact language code, got ${controls.locale.width}px.`,
    );
  }
  if (mode === "icon") {
    assert(
      controls.locale.width <= 52,
      `${label} language control must collapse to an icon target, got ${controls.locale.width}px.`,
    );
  }
  if (state.viewportWidth <= 900) {
    assert(
      controls.irohaConnect.width <= 64 && controls.network.width <= 64,
      `${label} must compact IrohaConnect and Network below 900px.`,
    );
  }
}

async function saveHeaderScreenshot(page, name) {
  const fileName = `${name}.png`;
  await page.locator(".app-header").screenshot({
    path: path.join(outputDir, fileName),
    animations: "disabled",
  });
  console.log(`✓ saved responsive header output/playwright/${fileName}`);
}

async function checkResponsiveHeaderPreferences(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, "/wallet", "Wallet");
  await setLocale(page, "en-US");
  await setTheme(page, "dark");
  const checks = [
    { width: 1440, height: 1000, mode: "full" },
    { width: 1280, height: 900, mode: "full" },
    { width: 1024, height: 720, mode: "compact" },
    { width: 768, height: 1024, mode: "compact" },
    { width: 390, height: 844, mode: "icon" },
    { width: 360, height: 720, mode: "icon" },
  ];
  let exercisedCompactToggle = false;
  let exercisedIconToggle = false;
  for (const check of checks) {
    await page.setViewportSize({ width: check.width, height: check.height });
    await page.waitForTimeout(100);
    const label = `${check.mode} header at ${check.width}px`;
    await assertHeaderPreferenceMode(page, label, check.mode);
    await assertUsableViewport(page, label);
    if (
      (check.mode === "compact" && !exercisedCompactToggle) ||
      (check.mode === "icon" && !exercisedIconToggle)
    ) {
      await setTheme(page, "light");
      await setTheme(page, "dark");
      exercisedCompactToggle ||= check.mode === "compact";
      exercisedIconToggle ||= check.mode === "icon";
    }
    await saveHeaderScreenshot(
      page,
      `quiet-sakura-header-${check.mode}-${check.width}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "✓ direct header preferences adapt at desktop, rail, tablet, and mobile widths",
  );
}

async function checkHeaderPreferencePersistence(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setLocale(page, "fr-FR");
  await setTheme(page, "light");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".workspace-heading h1").waitFor({ state: "visible" });
  await page.getByTestId("locale-select").waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-theme") === "light" &&
      document.documentElement.lang === "fr-FR",
  );
  const persisted = await page.evaluate(() => {
    const readEnvelope = (key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };
    return {
      theme: readEnvelope("iroha-demo:theme"),
      locale: readEnvelope("iroha-demo:locale"),
      documentTheme: document.documentElement.getAttribute("data-theme"),
      documentLocale: document.documentElement.lang,
      direction: document.documentElement.dir,
    };
  });
  assert(
    JSON.stringify(persisted.theme) ===
      JSON.stringify({
        schema: "iroha-demo-theme",
        version: 1,
        theme: "light",
      }) &&
      JSON.stringify(persisted.locale) ===
        JSON.stringify({
          schema: "iroha-demo-locale",
          version: 1,
          locale: "fr-FR",
        }) &&
      persisted.documentTheme === "light" &&
      persisted.documentLocale === "fr-FR" &&
      persisted.direction === "ltr",
    `Header preferences did not survive reload: ${JSON.stringify(persisted)}`,
  );
  assert(
    (await page.getByTestId("locale-select").inputValue()) === "fr-FR",
    "Reloaded language selector did not reflect the persisted locale.",
  );
  assert(
    (await page
      .getByTestId("theme-light-button")
      .getAttribute("aria-pressed")) === "true",
    "Reloaded theme selector did not reflect the persisted light theme.",
  );
  await assertHeaderPreferenceMode(
    page,
    "persisted French light header",
    "full",
  );
  await setLocale(page, "en-US");
  await setTheme(page, "dark");
  console.log("✓ direct language and theme preferences persist after reload");
}

async function assertResponsiveShell(page, label, viewport) {
  const dimensions = await page.evaluate(() => {
    const sidebar = document
      .querySelector(".desktop-sidebar")
      ?.getBoundingClientRect();
    const workspace = document
      .querySelector(".workspace")
      ?.getBoundingClientRect();
    return {
      sidebarWidth: sidebar?.width ?? 0,
      workspaceWidth: workspace?.width ?? 0,
      desktopAriaHidden: document
        .querySelector(".desktop-sidebar")
        ?.getAttribute("aria-hidden"),
      drawerOpen: Boolean(
        document.querySelector("dialog.ui-dialog-drawer[open]"),
      ),
    };
  });
  if (viewport.width <= 760) {
    assert(!dimensions.drawerOpen, `${label} navigation should start closed`);
    assert(
      dimensions.desktopAriaHidden === "true",
      `${label} desktop navigation must leave the accessibility tree`,
    );
    assert(
      dimensions.workspaceWidth >= viewport.width - 24,
      `${label} workspace is unexpectedly narrow: ${dimensions.workspaceWidth}px`,
    );
    const trigger = page.locator(".mobile-nav-trigger");
    await trigger.focus();
    await trigger.click();
    const drawer = await assertNativeModal(
      page,
      "dialog.ui-dialog-drawer[open]",
      `${label} navigation drawer`,
    );
    await page.keyboard.press("Shift+Tab");
    assert(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      `${label} reverse tab escaped the navigation drawer`,
    );
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert(
      await trigger.evaluate((element) => document.activeElement === element),
      `${label} navigation did not restore trigger focus after Escape`,
    );
    return;
  }
  if (viewport.width < 1180) {
    assert(
      dimensions.sidebarWidth >= 68 && dimensions.sidebarWidth <= 76,
      `${label} should use the 72px compact rail, got ${dimensions.sidebarWidth}px`,
    );
    return;
  }
  assert(
    dimensions.sidebarWidth >= 228 && dimensions.sidebarWidth <= 236,
    `${label} should use the 232px sidebar, got ${dimensions.sidebarWidth}px`,
  );
}

async function checkResponsiveUsability(page) {
  for (const check of responsiveViewportChecks) {
    await page.setViewportSize(check.viewport);
    for (const [route, title] of check.routes) {
      await navigate(page, route, title);
      await assertTouchTargets(page, `${check.label} ${route}`);
      if (check.label === "electron-minimum") {
        await assertPrimaryActionVisibility(page, route);
      }
      if (check.label === "electron-minimum" && route === "/staking") {
        const evidence = await page.evaluate(() => {
          const inspect = (selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return {
              selector,
              gridTemplateColumns: style.gridTemplateColumns,
              display: style.display,
              x: Math.round(rect.x * 10) / 10,
              y: Math.round(rect.y * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
            };
          };
          return [
            ".staking-command-card",
            ".staking-context-card",
            ".staking-workspace",
            ".validator-market-card",
            ".staking-actions-card",
          ].map(inspect);
        });
        console.log(
          `Staking 1024x720 layout evidence: ${JSON.stringify(evidence)}`,
        );
        await page.screenshot({
          path: path.join(outputDir, "quiet-sakura-staking-1024x720.png"),
        });
      }
      console.log(`✓ ${check.label} layout usable ${route}`);
    }
    await assertResponsiveShell(page, check.label, check.viewport);
    if (check.label === "mobile") {
      await navigate(page, "/wallet", "Wallet");
      await saveUiScreenshot(page, "quiet-sakura-wallet-mobile-final");
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function checkThemeLocaleAndKeyboard(page) {
  await navigate(page, "/wallet", "Wallet");
  await page.locator(".wallet-layout").waitFor({ state: "visible" });
  await page.locator(".skip-link").focus();
  const focusedClass = await page.evaluate(
    () => document.activeElement?.className,
  );
  assert(
    String(focusedClass).includes("skip-link"),
    `Skip link should accept keyboard focus, got ${focusedClass}`,
  );
  await page.keyboard.press("Enter");
  await page.locator("#workspace-main").waitFor({ state: "visible" });
  assert(
    await page
      .locator("#workspace-main")
      .evaluate((element) => document.activeElement === element),
    "Skip link did not transfer keyboard focus to the workspace.",
  );

  await setTheme(page, "dark");
  await page.waitForTimeout(250);
  await saveUiScreenshot(page, "quiet-sakura-wallet-dark-final");
  await setTheme(page, "light");
  await page.locator(".wallet-layout").waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  await saveUiScreenshot(page, "quiet-sakura-wallet-light-final");

  await page.setViewportSize({ width: 1280, height: 900 });
  for (const locale of ["de-DE", "fr-FR"]) {
    await setLocale(page, locale);
    await assertUsableViewport(page, `${locale} long-label wallet`);
    await assertHeaderPreferenceMode(
      page,
      `${locale} long-label header`,
      "full",
    );
    await assertAxeClean(page, `${locale} wallet`);
  }

  await setLocale(page, "ur-PK");
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  const urduFont = await page.evaluate(async () => {
    await document.fonts.load('400 24px "Noto Nastaliq Urdu"', "اردو");
    return {
      family: getComputedStyle(document.documentElement).fontFamily,
      loaded: [...document.fonts].some(
        (face) =>
          face.family === "Noto Nastaliq Urdu" && face.status === "loaded",
      ),
    };
  });
  assert(
    urduFont.family.includes("Noto Nastaliq Urdu"),
    `Urdu locale did not select the Nastaliq stack: ${urduFont.family}`,
  );
  assert(urduFont.loaded, "Bundled Noto Nastaliq Urdu did not load.");
  await assertUsableViewport(page, "Urdu Nastaliq wallet");
  await assertAxeClean(page, "Urdu Nastaliq wallet");
  await saveUiScreenshot(page, "quiet-sakura-urdu-nastaliq");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await assertUsableViewport(page, "Urdu Nastaliq wallet at 390px");
  await assertHeaderPreferenceMode(
    page,
    "Urdu Nastaliq header at 390px",
    "icon",
  );
  await assertAxeClean(page, "Urdu Nastaliq wallet at 390px");
  await saveUiScreenshot(page, "quiet-sakura-urdu-nastaliq-mobile");

  // A 1024px Electron window reflows through a 512px CSS layout viewport at
  // 200% browser zoom. Keep Urdu active so the tall Nastaliq metrics, RTL
  // mirroring, and compact header are exercised together.
  await page.setViewportSize({ width: 512, height: 360 });
  await page.waitForTimeout(150);
  await assertUsableViewport(page, "Urdu Nastaliq wallet at 200% zoom");
  await assertHeaderPreferenceMode(
    page,
    "Urdu Nastaliq header at 200% zoom",
    "icon",
  );
  await assertAxeClean(page, "Urdu Nastaliq wallet at 200% zoom");
  await saveHeaderScreenshot(page, "quiet-sakura-urdu-nastaliq-200-percent");
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const historicalLocale of [
    {
      family: "Noto Sans Egyptian Hieroglyphs",
      locale: "egy-Egyp",
      name: "Ancient Egyptian",
      sample: "𓉐𓌉",
      scriptPattern: "Egyptian_Hieroglyphs",
      screenshot: "quiet-sakura-ancient-egyptian",
    },
    {
      family: "Noto Sans Cuneiform",
      locale: "akk-Xsux",
      name: "Old Akkadian",
      sample: "𒆬𒌓",
      scriptPattern: "Cuneiform",
      screenshot: "quiet-sakura-old-akkadian",
    },
  ]) {
    await setLocale(page, historicalLocale.locale);
    await page.waitForFunction(
      (locale) =>
        document.documentElement.lang === locale &&
        document.documentElement.dir === "ltr",
      historicalLocale.locale,
    );
    const historicalFont = await page.evaluate(async ({ family, sample }) => {
      await document.fonts.load(`400 24px "${family}"`, sample);
      return {
        family: getComputedStyle(document.documentElement).fontFamily,
        heading:
          document.querySelector(".workspace-heading h1")?.textContent ?? "",
        loaded: [...document.fonts].some(
          (face) => face.family === family && face.status === "loaded",
        ),
      };
    }, historicalLocale);
    assert(
      historicalFont.family.includes(historicalLocale.family),
      `${historicalLocale.name} did not select ${historicalLocale.family}: ${historicalFont.family}`,
    );
    assert(
      historicalFont.loaded,
      `Bundled ${historicalLocale.family} did not load.`,
    );
    assert(
      new RegExp(`\\p{Script=${historicalLocale.scriptPattern}}`, "u").test(
        historicalFont.heading,
      ) && !/[A-Za-z]/u.test(historicalFont.heading),
      `${historicalLocale.name} wallet heading was not a semantic native-script label: ${historicalFont.heading}`,
    );
    await assertUsableViewport(page, `${historicalLocale.name} wallet`);
    await assertHeaderPreferenceMode(
      page,
      `${historicalLocale.name} header`,
      "full",
    );
    await assertAxeClean(page, `${historicalLocale.name} wallet`);
    await saveUiScreenshot(page, historicalLocale.screenshot);
  }

  await setLocale(page, "en-US");
  await page.waitForFunction(() => document.documentElement.dir === "ltr");

  await page.setViewportSize({ width: 390, height: 844 });
  await setLocale(page, "ar-SA");
  await page.waitForFunction(() => document.documentElement.dir === "rtl");
  await assertUsableViewport(page, "rtl-wallet");
  await assertHeaderPreferenceMode(page, "Arabic RTL header", "icon");
  await assertAxeClean(page, "Arabic RTL wallet");
  await assertResponsiveShell(page, "Arabic RTL mobile", {
    width: 390,
    height: 844,
  });
  await setLocale(page, "en-US");
  await page.waitForFunction(() => document.documentElement.dir === "ltr");

  // Browser zoom reflows a 1024×720 Electron window through a 512×360 CSS
  // layout viewport at 200%. CSS `zoom` does not update media queries, so use
  // the equivalent layout viewport to exercise the responsive result.
  await page.setViewportSize({ width: 512, height: 360 });
  await page.waitForTimeout(150);
  await assertUsableViewport(
    page,
    "wallet at simulated 200% browser-zoom reflow",
  );
  assertHeaderFits(
    await readHeaderState(page),
    "wallet header at simulated 200% browser-zoom reflow",
  );
  await assertHeaderPreferenceMode(
    page,
    "wallet header at simulated 200% browser-zoom reflow",
    "icon",
  );
  await assertAxeClean(page, "wallet at simulated 200% browser-zoom reflow");
  await saveHeaderScreenshot(page, "quiet-sakura-header-200-percent-zoom");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setTheme(page, "dark");
  console.log(
    "✓ keyboard entry, both themes, long labels, RTL, and 200% zoom remain usable",
  );
}

async function checkReducedMotionScene(page) {
  await navigate(page, "/wallet", "Wallet");
  const reduced = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  assert(reduced, "UI E2E context must use deterministic reduced motion.");
  const canvas = page.locator(".sakura-layer");
  await canvas.waitFor({ state: "visible" });
  const backingStore = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    cssWidth: element.clientWidth,
    cssHeight: element.clientHeight,
    dpr: window.devicePixelRatio,
  }));
  assert(
    backingStore.width ===
      Math.round(backingStore.cssWidth * Math.min(backingStore.dpr || 1, 2)),
    `Sakura canvas has the wrong DPR backing width: ${JSON.stringify(backingStore)}`,
  );
  const first = await canvas.screenshot();
  await page.waitForTimeout(300);
  const second = await canvas.screenshot();
  assert(
    first.equals(second),
    "Reduced-motion sakura changed between deterministic frames.",
  );
  console.log("✓ reduced-motion sakura is static and DPR-aware");
}

async function setFixture(page, patch) {
  await page.evaluate((next) => window.__e2e.setFixture(next), patch);
}

async function checkAdversarialFixtureStates(page) {
  await setFixture(page, { walletFunded: false });
  await navigate(page, "/wallet", "Wallet");
  await page.waitForFunction(() => {
    const value = document.querySelector(".wallet-balance-value")?.textContent;
    return value?.trim() === "0";
  });
  const sendAction = page.locator(".wallet-quick-actions a").filter({
    hasText: "Send",
  });
  assert(
    (await sendAction.getAttribute("aria-disabled")) === "true",
    "Unfunded wallet fixture did not disable Send.",
  );
  await assertAxeClean(page, "unfunded wallet fixture");

  await setFixture(page, { walletFunded: true, vpnMode: "repair" });
  await navigate(page, "/vpn", "Sora VPN");
  await page.getByRole("button", { name: "Repair VPN" }).waitFor({
    state: "visible",
  });
  await setFixture(page, { vpnMode: "unavailable" });
  await navigate(page, "/vpn", "Sora VPN");
  await page.getByText("VPN unavailable").first().waitFor({ state: "visible" });

  await setFixture(page, {
    walletFunded: true,
    vpnMode: "ready",
  });
  console.log("✓ unfunded wallet and VPN fixtures render");
}

function attachPageDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const source = location.url
        ? ` (${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1})`
        : "";
      consoleErrors.push(`${message.text()}${source}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack || error.message);
  });
  return {
    assertClean() {
      assert(
        pageErrors.length === 0,
        `Unhandled page errors:\\n${pageErrors.join("\\n\\n")}`,
      );
      assert(
        consoleErrors.length === 0,
        `Browser console errors:\\n${consoleErrors.join("\\n")}`,
      );
    },
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const { server, baseUrl } = await startRendererServer();
  const browser = await chromium.launch({
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: useRealMedia ? false : process.env.HEADED !== "1",
    args: useRealMedia
      ? ["--use-fake-ui-for-media-stream"]
      : [
          "--use-fake-device-for-media-stream",
          "--use-fake-ui-for-media-stream",
        ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      baseURL: baseUrl,
      locale: "en-US",
      reducedMotion: "reduce",
    });
    await context.grantPermissions(["camera", "microphone"], {
      origin: baseUrl.replace(/\/$/, ""),
    });
    await context.addInitScript({ content: buildInitScript() });
    const page = await context.newPage();
    const diagnostics = attachPageDiagnostics(page);
    await page.goto(`${baseUrl}#/wallet`, { waitUntil: "domcontentloaded" });
    await waitForRouteTitle(page, "Wallet");

    await checkRouteSmoke(page);
    await setTheme(page, "dark");
    await checkAdversarialFixtureStates(page);
    await checkReceiveQr(page);
    await checkSendForm(page);
    await checkSubscriptionModes(page);
    await checkSoraCloudSharedLeaseFlow(page);
    await checkKaigi(page);
    await checkExplorer(page);
    await checkStaking(page);
    await checkParliament(page);
    await checkVpn(page);
    await checkResponsiveUsability(page);
    await checkResponsiveHeaderPreferences(page);
    await checkHeaderPreferencePersistence(page);
    await checkThemeLocaleAndKeyboard(page);
    await checkReducedMotionScene(page);
    assertDeferredAudits();
    diagnostics.assertClean();
    await context.close();
    console.log("UI E2E smoke passed.");
  } catch (error) {
    const failureName = `ui-e2e-failure-${Date.now()}.png`;
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0]) {
      await pages[0].screenshot({
        path: path.join(outputDir, failureName),
        fullPage: true,
      });
      console.error(
        `Saved failure screenshot to output/playwright/${failureName}`,
      );
    }
    throw error;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
