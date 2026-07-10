import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
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

const E2E_ACCOUNT_ID = "testu2Ze2e111111111111111111111111111111111111111111";
const E2E_PUBLIC_KEY_HEX =
  "abababababababababababababababababababababababababababababababab";
const E2E_PRIVATE_KEY_HEX =
  "1111111111111111111111111111111111111111111111111111111111111111";
const TAIRA_TORII_URL = "https://taira.sora.org";
const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const XOR_ASSET_ID = `xor#universal#${E2E_ACCOUNT_ID}`;

const routeChecks = [
  ["/wallet", "Wallet"],
  ["/stats", "Network health"],
  ["/send", "Send"],
  ["/receive", "Receive"],
  ["/subscriptions", "Subscriptions"],
  ["/soracloud", "SoraCloud"],
  ["/sccp", "SCCP Bridge"],
  ["/staking", "Stake XOR"],
  ["/governance", "Governance"],
  ["/explore", "Explore"],
  ["/offline", "Offline"],
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
  ["/sccp", "SCCP Bridge"],
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
      ["/sccp", "SCCP Bridge"],
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
    hydrated: false,
    connection: {
      toriiUrl: TAIRA_TORII_URL,
      chainId: TAIRA_CHAIN_ID,
      assetDefinitionId: "xor#universal",
      networkPrefix: 369,
    },
    authority: {
      accountId: "",
      privateKeyHex: "",
      hasStoredSecret: false,
    },
    accounts: [
      {
        displayName: "E2E Wallet",
        domain: "default",
        accountId: E2E_ACCOUNT_ID,
        i105AccountId: E2E_ACCOUNT_ID,
        i105DefaultAccountId: E2E_ACCOUNT_ID,
        publicKeyHex: E2E_PUBLIC_KEY_HEX,
        privateKeyHex: "",
        hasStoredSecret: true,
        localOnly: false,
      },
    ],
    activeAccountId: E2E_ACCOUNT_ID,
    customChains: [],
  };

  return `(() => {
    const accountId = ${JSON.stringify(E2E_ACCOUNT_ID)};
    const publicKeyHex = ${JSON.stringify(E2E_PUBLIC_KEY_HEX)};
    const privateKeyHex = ${JSON.stringify(E2E_PRIVATE_KEY_HEX)};
    const toriiUrl = ${JSON.stringify(TAIRA_TORII_URL)};
    const chainId = ${JSON.stringify(TAIRA_CHAIN_ID)};
    const xorAssetId = ${JSON.stringify(XOR_ASSET_ID)};
    const sessionPayload = ${JSON.stringify(sessionPayload)};
    const useSyntheticMedia = ${JSON.stringify(useSyntheticMedia)};
    const fixture = {
      walletFunded: true,
      confidentialMode: "convertible",
      vpnMode: "ready",
      sccpMode: "blocked",
    };
    const now = () => Date.now();
    const txHash = (label) => "0x" + Array.from(label).map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("").padEnd(64, "0").slice(0, 64);
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
    const confidentialPolicy = () => {
      const transparentOnly = fixture.confidentialMode === "transparent-only";
      return ({
      asset_id: "xor#universal",
      block_height: 98765,
      current_mode: transparentOnly ? "TransparentOnly" : "Convertible",
      effective_mode: transparentOnly ? "TransparentOnly" : "Convertible",
      allow_shield: !transparentOnly,
      allow_unshield: !transparentOnly,
      vk_transfer: transparentOnly ? null : "zk::transfer",
      vk_unshield: "zk::unshield",
      vk_shield: "zk::shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
      });
    };
    const confidentialBalance = () => ({
      resolvedAssetId: "xor#universal",
      quantity: fixture.walletFunded ? "8" : "0",
      onChainQuantity: fixture.walletFunded ? "8" : "0",
      spendableQuantity: fixture.walletFunded ? "8" : "0",
      exact: true,
      scanSource: "account-transactions",
      scanStatus: "complete",
      scanWatermarkBlock: 98760,
      recoveredNoteCount: 2,
      trackedAssetIds: ["xor#universal"],
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
      xorAssetDefinitionId: "xor#universal",
      explorer: baseMetrics,
      supply: {
        definitionId: "xor#universal",
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
        definitionId: "xor#universal",
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
    localStorage.setItem("iroha-demo:kaigi", JSON.stringify({ hydrated: true, hostSessions: [] }));
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
      generateKeyPair: () => ({ publicKeyHex, privateKeyHex }),
      generateKaigiSignalKeyPair: () => ({
        publicKeyBase64Url: "kaigi-e2e-public-key",
        privateKeyBase64Url: "kaigi-e2e-private-key",
      }),
      isSecureVaultAvailable: async () => true,
      storeAccountSecret: async () => {},
      listAccountSecretFlags: async ({ accountIds }) => Object.fromEntries((accountIds || []).map((id) => [id, true])),
      deriveAccountAddress: () => ({
        accountId,
        i105AccountId: accountId,
        i105DefaultAccountId: accountId,
        publicKeyHex,
        accountIdWarning: "",
      }),
      derivePublicKey: () => ({ publicKeyHex }),
      deriveConfidentialOwnerTag: () => ({ ownerTagHex: "1".repeat(64) }),
      deriveConfidentialReceiveAddress: () => ({
        ownerTagHex: "1".repeat(64),
        diversifierHex: "2".repeat(64),
      }),
      createConfidentialPaymentAddress: async () => ({
        schema: "iroha-confidential-payment-address/v3",
        receiveKeyId: "receive-e2e-key",
        receivePublicKeyBase64Url: "receiveE2ePublicKey",
        shieldedOwnerTagHex: "1".repeat(64),
        shieldedDiversifierHex: "2".repeat(64),
        recoveryHint: "one-time-receive-key",
      }),
      exportConfidentialWalletBackup: async () => ({}),
      importConfidentialWalletBackup: async () => {},
      registerAccount: async () => ({ hash: txHash("register") }),
      resolveAccountAlias: async ({ alias }) => ({
        alias: "",
        accountId: String(alias || "").trim(),
        resolved: false,
      }),
      transferAsset: async (input) => {
        window.__e2e.calls.push({ method: "transferAsset", input });
        return { hash: txHash("transfer") };
      },
      getConfidentialAssetPolicy: async () => confidentialPolicy(),
      getConfidentialAssetBalance: async () => confidentialBalance(),
      scanConfidentialWallet: async () => confidentialBalance(),
      getConfidentialWalletState: async () => confidentialBalance(),
      getPrivateKaigiConfidentialXorState: async () => ({
        assetDefinitionId: "xor#universal",
        resolvedAssetId: "xor#universal",
        policyMode: "hybrid",
        shieldedBalance: "5",
        shieldedBalanceExact: true,
        transparentBalance: "12500",
        canSelfShield: true,
      }),
      selfShieldPrivateKaigiXor: async () => ({ hash: txHash("kaigi-shield") }),
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
      getGovernanceCitizenStatus: async () => ({
        accountId,
        isCitizen: false,
        amount: null,
        bondedHeight: null,
        seatsInEpoch: null,
        lastEpochSeen: null,
        cooldownUntil: null,
        endpointAvailable: true,
      }),
      registerCitizen: async () => ({ hash: txHash("citizen") }),
      getGovernanceProposal: async ({ proposalId }) => ({
        found: true,
        proposal: { id: proposalId, title: "E2E proposal", status: "Open" },
      }),
      getGovernanceReferendum: async ({ referendumId }) => ({
        found: true,
        referendum: { id: referendumId, proposal_id: "0x" + "a".repeat(64) },
      }),
      getGovernanceTally: async ({ referendumId }) => ({
        found: true,
        referendum_id: referendumId,
        tally: { referendum_id: referendumId, approve: 10, reject: 2, abstain: 1 },
      }),
      getGovernanceLocks: async ({ referendumId }) => ({
        found: true,
        referendum_id: referendumId,
        locks: { [accountId]: { owner: accountId, amount: 100, expiry_height: 1000, direction: 1, duration_blocks: 20 } },
      }),
      getGovernanceCouncilCurrent: async () => ({
        epoch: 2,
        members: [{ account_id: accountId }],
        alternates: [],
        candidate_count: 1,
        verified: 1,
        derived_by: "e2e",
      }),
      submitGovernancePlainBallot: async () => ({ hash: txHash("ballot") }),
      finalizeGovernanceReferendum: async () => ({ ok: true, proposal_id: "0x" + "a".repeat(64), tx_instructions: [] }),
      enactGovernanceProposal: async () => ({ ok: true, proposal_id: "0x" + "a".repeat(64), tx_instructions: [] }),
      getExplorerMetrics: async () => baseMetrics,
      getNetworkStats: async () => networkStats(),
      getExplorerAccountQr: async () => accountQr(),
      listSubscriptionPlans: async () => ({ items: [], total: 0 }),
      listSubscriptions: async () => ({ items: [], total: 0 }),
      getSubscription: async () => ({ subscription_id: "sub-e2e" }),
      createSubscription: async () => ({ tx_hash_hex: txHash("sub-create") }),
      pauseSubscription: async () => ({ tx_hash_hex: txHash("sub-pause") }),
      resumeSubscription: async () => ({ tx_hash_hex: txHash("sub-resume") }),
      cancelSubscription: async () => ({ tx_hash_hex: txHash("sub-cancel") }),
      keepSubscription: async () => ({ tx_hash_hex: txHash("sub-keep") }),
      chargeSubscriptionNow: async () => ({
        tx_hash_hex: txHash("sub-charge"),
      }),
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
      deploySoraCloudHf: async (input) => {
        window.__e2e.calls.push({ method: "deploySoraCloudHf", input });
        launchedSoraCloudServices.splice(0, launchedSoraCloudServices.length, {
          id: input.serviceName,
          name: input.serviceName,
          status: "deploying",
          currentVersion: "hf-generated-v1",
          revisionCount: 1,
          configEntryCount: 0,
          secretEntryCount: 0,
          routeHost: "taira.sora.org",
          publicUrls: ["https://taira.sora.org/api/v1/"],
          rolloutStage: "Canary",
          rolloutPercent: 20,
          leaseStatus: "Active",
          leaseExpiresSequence: 1,
          remainingRuntimeBalanceNanos: "9999",
          latestSequence: 1,
          signedBy: "ed25519:e2e",
          raw: {},
        });
        return {
          ok: true,
          action: "join",
          service_name: input.serviceName,
          sequence: 1,
          tx_hash_hex: txHash("soracloud"),
          raw: {},
        };
      },
      getSoraCloudHfStatus: async () => ({}),
      getParameters: async () => ({}),
      getSccpCapabilities: async () => {
        throw new Error(
          fixture.sccpMode === "blocked"
            ? "TAIRA Torii is unavailable for the deterministic blocked SCCP fixture."
            : "The deterministic SCCP ready fixture is not configured.",
        );
      },
      getSccpProofManifests: async () => {
        throw new Error("SCCP manifest unavailable in the blocked fixture.");
      },
      listSccpRecentMessages: async () => ({ items: [], total: 0 }),
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
      listVpnReceipts: async () => vpnStatus.state === "connected" ? [] : [
        {
          sessionId: "vpn-e2e-old",
          accountId,
          exitClass: "standard",
          relayEndpoint: "vpn.taira.e2e:443",
          meterFamily: "xor",
          connectedAtMs: now() - 60000,
          disconnectedAtMs: now() - 30000,
          durationMs: 30000,
          bytesIn: 1024,
          bytesOut: 2048,
          status: "closed",
          receiptSource: "local-fallback",
        },
      ],
      listOfflineAllowances: async () => ({
        total: 1,
        items: [
          {
            certificate_id_hex: "a".repeat(64),
            controller_id: "offline-e2e",
            controller_display: "Offline E2E device",
            asset_id: xorAssetId,
            registered_at_ms: now() - 100000,
            expires_at_ms: now() + 86400000,
            policy_expires_at_ms: now() + 86400000,
            refresh_at_ms: now() + 43200000,
            verdict_id_hex: null,
            attestation_nonce_hex: null,
            remaining_amount: "50",
            record: {},
            integrity_metadata: { policy: "e2e" },
          },
        ],
      }),
      onboardAccount: async () => ({ account_id: accountId, tx_hash_hex: txHash("onboard"), status: "ok" }),
      requestFaucetFunds: async (_input, onProgress) => {
        await onProgress?.({ phase: "requestingPuzzle", attempt: 1, attempts: 1 });
        await onProgress?.({ phase: "claimCommitted", txHashHex: txHash("faucet") });
        return {
          account_id: accountId,
          asset_definition_id: "xor#universal",
          asset_id: xorAssetId,
          amount: "1000",
          tx_hash_hex: txHash("faucet"),
          status: "committed",
        };
      },
      createKaigiMeeting: async (input) => {
        window.__e2e.calls.push({ method: "createKaigiMeeting", input });
        return { hash: txHash("kaigi-create") };
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
        privacyMode: "private",
        peerIdentityReveal: "Hidden",
        rosterRootHex: "0".repeat(64),
        offerDescription: { type: "offer", sdp: "v=0\\r\\na=ice-ufrag:e2eoffer\\r\\n" },
      }),
      joinKaigiMeeting: async () => ({ hash: txHash("kaigi-join") }),
      watchKaigiCallEvents: async () => "watch-e2e",
      stopWatchingKaigiCallEvents: () => {},
      pollKaigiMeetingSignals: async () => [],
      endKaigiMeeting: async () => ({ hash: txHash("kaigi-end") }),
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
      bondPublicLaneStake: async () => ({ hash: txHash("bond") }),
      schedulePublicLaneUnbond: async () => ({ hash: txHash("unbond") }),
      finalizePublicLaneUnbond: async () => ({ hash: txHash("finalize") }),
      claimPublicLaneRewards: async () => ({ hash: txHash("claim") }),
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

const canonicalRoute = (route) =>
  route === "/parliament" ? "/governance" : route;

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
  const nextRoute = canonicalRoute(route);
  const href = `#${nextRoute}`;
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
  const nextRoute = canonicalRoute(route);
  const currentRoute = await page.evaluate(
    () => window.location.hash.replace(/^#/, "") || "/",
  );
  if (currentRoute === nextRoute) {
    const alternate = nextRoute === "/wallet" ? "/settings" : "/wallet";
    await clickNavDestination(page, alternate);
    await page.waitForFunction(
      (expected) => window.location.hash === `#${expected}`,
      alternate,
    );
  }
  await clickNavDestination(page, nextRoute);
  const heading = await waitForRouteTitle(page, title);
  await page.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector(".workspace-heading h1"),
    undefined,
    { timeout: 5000 },
  );
  assert(
    (await page.evaluate(() => window.location.hash)) === `#${nextRoute}`,
    `${route} did not resolve to its canonical URL ${nextRoute}.`,
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
    "/sccp": "[data-ui-primary-action]",
  };
  const selector = selectors[canonicalRoute(route)];
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
  await page.locator(".receive-shell .qr svg").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Share QR/i }).click();
  await page
    .getByText(/QR shared\.|QR payload copied to clipboard\./)
    .waitFor({ state: "visible" });
  const sharedPayloads = await page.evaluate(() => window.__e2e.shared.length);
  assert(sharedPayloads > 0, "Receive QR share did not invoke the share path.");
  console.log("✓ receive QR renders automatically and shares");
}

async function checkSendFormAndCamera(page) {
  await navigate(page, "/send", "Send");
  const scanButton = page.getByRole("button", { name: /Scan payment QR/i });
  await scanButton.focus();
  await scanButton.click();
  const scannerDialog = await assertNativeModal(
    page,
    "dialog.ui-dialog[open]",
    "QR scanner",
  );
  await page.locator(".scanner video").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await scannerDialog.getByRole("button", { name: "Cancel" }).click();
  await scannerDialog.waitFor({ state: "hidden" });
  assert(
    await scanButton.evaluate((element) => document.activeElement === element),
    "QR scanner did not restore focus to its opener.",
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
    .getByText(/Transaction submitted:|Sent:/)
    .waitFor({ state: "visible", timeout: 5000 });
  console.log("✓ send form submits and camera scanner opens/stops");
}

async function checkSoraCloudLaunchFlow(page) {
  await navigate(page, "/soracloud", "SoraCloud");
  await page.getByText("Live API ready").first().waitFor({ state: "visible" });
  await page
    .getByText("No SoraCloud services found on this endpoint.")
    .waitFor({
      state: "visible",
    });
  await page
    .locator(".ui-segmented")
    .getByRole("button", { name: "Launch instance", exact: true })
    .click();
  await page.getByLabel("Hugging Face repo").waitFor({ state: "visible" });

  await page
    .getByLabel("Hugging Face repo")
    .fill("sentence-transformers/all-MiniLM-L6-v2");
  await page.getByLabel("Model name").waitFor({ state: "visible" });
  const modelName = await page.getByLabel("Model name").inputValue();
  assert(
    modelName === "all-minilm-l6-v2",
    `SoraCloud model name was not auto-derived: ${modelName}`,
  );

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("If this is empty, claim XOR in Wallet first.").waitFor({
    state: "visible",
  });
  const settlementAsset = page.getByLabel("Settlement asset");
  const initialAsset = await settlementAsset.inputValue();
  assert(
    initialAsset === "",
    `SoraCloud should not prefill stale lease asset aliases, got ${initialAsset}`,
  );
  await settlementAsset.fill("61CtjvNd9T3THAR65GsMVHr82Bjc");
  await page.getByLabel("Base fee nanos").fill("10000");

  await page.getByRole("button", { name: "Next" }).click();
  const launchButton = page.getByRole("button", {
    name: "Launch live instance",
  });
  await launchButton.waitFor({ state: "visible" });
  assert(
    await launchButton.isEnabled(),
    "SoraCloud launch button did not enable for valid input.",
  );
  await launchButton.click();

  await page.getByText("Launch submitted").waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByText("all-minilm-l6-v2").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page
    .locator(".ui-segmented")
    .getByRole("button", { name: "Live services", exact: true })
    .click();
  await page
    .locator(".soracloud-deployment-row")
    .getByText("hf-generated-v1", { exact: false })
    .waitFor({
      state: "visible",
      timeout: 10000,
    });

  const deployCall = await page.evaluate(() =>
    window.__e2e.calls.find((call) => call.method === "deploySoraCloudHf"),
  );
  assert(deployCall, "SoraCloud launch did not call deploySoraCloudHf.");
  assert(
    deployCall.input.leaseAssetDefinitionId === "61CtjvNd9T3THAR65GsMVHr82Bjc",
    `SoraCloud deploy used wrong lease asset: ${deployCall.input.leaseAssetDefinitionId}`,
  );
  assert(
    deployCall.input.repoId === "sentence-transformers/all-MiniLM-L6-v2",
    `SoraCloud deploy used wrong repo: ${deployCall.input.repoId}`,
  );
  console.log("✓ soracloud guided launch flow submits real bridge payload");
}

async function checkSubscriptionModes(page) {
  await navigate(page, "/subscriptions", "Subscriptions");
  await page.getByText("No subscriptions yet").waitFor({ state: "visible" });
  await page
    .locator(".ui-segmented")
    .getByRole("button", { name: "Subscribe to plan", exact: true })
    .click();
  await page.getByPlaceholder("Manual plan ID").waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Create subscription" })
    .waitFor({ state: "visible" });
  console.log("✓ subscriptions switches from records to subscribe mode");
}

async function checkOfflineModes(page) {
  await navigate(page, "/offline", "Offline");
  const control = page.getByTestId("offline-mode-control");
  const modes = [
    ["Wallet", "offline-mode-setup"],
    ["Request payment", "offline-mode-request"],
    ["Create payment", "offline-mode-pay"],
    ["Accept payment", "offline-mode-accept"],
    ["Move to online wallet", "offline-mode-online"],
  ];
  const modeButtons = control.getByRole("button");
  assert(
    (await modeButtons.count()) === modes.length,
    `Offline mode control exposed ${await modeButtons.count()} options instead of ${modes.length}.`,
  );
  for (const [index, [label, testId]] of modes.entries()) {
    const button = modeButtons.nth(index);
    assert(
      (await button.innerText()).replace(/\s+/g, " ").trim() === label,
      `Offline mode ${index + 1} was not labelled ${label}.`,
    );
    await button.click();
    await page.getByTestId(testId).waitFor({ state: "visible" });
  }
  await modeButtons.first().click();
  await page.getByTestId("offline-mode-setup").waitFor({ state: "visible" });
  await assertUsableViewport(page, "offline workspace at 1440px");
  await saveUiScreenshot(page, "quiet-sakura-offline-1440-final");
  console.log("✓ offline workspace exposes each explicit mode");
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
      .waitFor({ state: "visible", timeout: 10000 });
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
  assert(
    invite.includes("call=kaigi.universal%3A") ||
      invite.includes("call=kaigi.universal:"),
    `Kaigi invite did not use qualified kaigi.universal call id: ${invite}`,
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
    .getByText(/Bond submitted:|Stake submitted:/)
    .waitFor({ state: "visible", timeout: 10000 });
  console.log("✓ staking bootstrap and bond action work");
}

async function checkParliament(page) {
  await navigate(page, "/governance", "Governance");
  await page.getByTestId("referendum-id-input").fill("referendum-e2e");
  await page.getByTestId("proposal-id-input").fill("0x" + "a".repeat(64));
  await page.getByRole("button", { name: "Load" }).click();
  await page
    .getByText(/Referendum found: yes\.?/)
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByText(/Proposal found: yes\.?/).waitFor({ state: "visible" });
  console.log("✓ parliament lookup works");
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
  const persisted = await page.evaluate(() => ({
    theme: localStorage.getItem("iroha-demo:theme"),
    locale: localStorage.getItem("iroha-demo:locale"),
    documentTheme: document.documentElement.getAttribute("data-theme"),
    documentLocale: document.documentElement.lang,
    direction: document.documentElement.dir,
  }));
  assert(
    persisted.theme === "light" &&
      persisted.locale === "fr-FR" &&
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

  await setFixture(page, {
    walletFunded: true,
    confidentialMode: "convertible",
  });
  await navigate(page, "/send", "Send");
  const privateMode = page.getByRole("button", {
    name: "Private",
    exact: true,
  });
  await privateMode.click();
  assert(
    (await privateMode.getAttribute("aria-pressed")) === "true",
    "Private send fixture did not activate private mode.",
  );
  assert(
    await page.getByTestId("send-review-button").isVisible(),
    "Private send did not retain the review action.",
  );

  await setFixture(page, { confidentialMode: "transparent-only" });
  await navigate(page, "/send", "Send");
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === "Private",
    );
    return button instanceof HTMLButtonElement && button.disabled;
  });

  await setFixture(page, { vpnMode: "repair" });
  await navigate(page, "/vpn", "Sora VPN");
  await page.getByRole("button", { name: "Repair VPN" }).waitFor({
    state: "visible",
  });
  await setFixture(page, { vpnMode: "unavailable" });
  await navigate(page, "/vpn", "Sora VPN");
  await page.getByText("VPN unavailable").first().waitFor({ state: "visible" });

  await setFixture(page, { sccpMode: "blocked" });
  await navigate(page, "/sccp", "SCCP Bridge");
  await page.locator(".sccp-readiness-alert").waitFor({
    state: "visible",
    timeout: 10000,
  });
  assert(
    await page.locator("[data-ui-primary-action]").first().isDisabled(),
    "Blocked SCCP fixture exposed an enabled primary action.",
  );

  await setFixture(page, {
    walletFunded: true,
    confidentialMode: "convertible",
    vpnMode: "ready",
    sccpMode: "blocked",
  });
  console.log(
    "✓ unfunded, private-send, VPN, and blocked SCCP fixtures render",
  );
}

function attachPageDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
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
    await checkSendFormAndCamera(page);
    await checkSubscriptionModes(page);
    await checkSoraCloudLaunchFlow(page);
    await checkKaigi(page);
    await checkExplorer(page);
    await checkStaking(page);
    await checkParliament(page);
    await checkVpn(page);
    await checkOfflineModes(page);
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
