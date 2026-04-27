import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const rendererRoot = path.join(repoRoot, "src");
const outputDir = path.join(repoRoot, "output/playwright");

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
  ["/staking", "Stake XOR"],
  ["/parliament", "Governance"],
  ["/explore", "Explore"],
  ["/offline", "Offline"],
  ["/kaigi", "Kaigi"],
  ["/vpn", "Sora VPN"],
  ["/setup", "Advanced settings"],
  ["/account", "Wallets"],
];

const mobileRouteChecks = [
  ["/receive", "Receive"],
  ["/send", "Send"],
  ["/kaigi", "Kaigi"],
  ["/soracloud", "SoraCloud"],
  ["/vpn", "Sora VPN"],
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildInitScript() {
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
    const assets = () => ({
      total: 1,
      items: [{ asset_id: xorAssetId, quantity: "12500" }],
    });
    const confidentialPolicy = () => ({
      asset_id: "xor#universal",
      block_height: 98765,
      current_mode: "hybrid",
      effective_mode: "hybrid",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "zk::transfer",
      vk_unshield: "zk::unshield",
      vk_shield: "zk::shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    const confidentialBalance = () => ({
      resolvedAssetId: "xor#universal",
      quantity: "8",
      onChainQuantity: "8",
      spendableQuantity: "8",
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

    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("iroha-demo:")) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem("iroha-demo:session", JSON.stringify(sessionPayload));
    localStorage.setItem("iroha-demo:theme", JSON.stringify({ current: "dark" }));
    localStorage.setItem("iroha-demo:kaigi", JSON.stringify({ hydrated: true, hostSessions: [] }));
    window.__e2e = {
      clipboard: "",
      shared: [],
      calls: [],
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
    const syntheticMedia = {
      streams: new Set(),
      createStream: async (constraints = {}) => {
        const tracks = [];
        const wantsVideo = constraints.video !== false;
        const wantsAudio = constraints.audio !== false;
        if (wantsVideo && HTMLCanvasElement.prototype.captureStream) {
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
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints) => syntheticMedia.createStream(constraints),
      },
    });
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
      getVpnAvailability: async () => ({
        platformSupported: true,
        helperManaged: true,
        helperReady: true,
        serverReachable: true,
        profileAvailable: true,
        actionsEnabled: true,
        status: "ready",
        message: "VPN helper is ready.",
        helperVersion: "e2e",
        platform: "mock",
        controllerInstalled: true,
        controllerVersion: "e2e",
        controllerKind: "mock",
        controllerPath: "/tmp/e2e-vpn",
        repairRequired: false,
        systemTunnelConfigured: true,
        systemTunnelActive: vpnStatus.state === "connected",
        systemTunnelKind: "mock",
        systemTunnelInterface: "utun-e2e",
        systemTunnelService: "E2E VPN",
      }),
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
      getVpnStatus: async () => vpnStatus,
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
  await page
    .locator(".workspace-heading h1")
    .filter({ hasText: title })
    .waitFor({ state: "visible", timeout: 10000 });
}

async function navigate(page, route, title) {
  await page.evaluate((nextRoute) => {
    window.location.hash = nextRoute;
  }, route);
  await waitForRouteTitle(page, title);
  await page.waitForTimeout(150);
  await assertUsableViewport(page, route);
}

async function assertUsableViewport(page, route) {
  const result = await page.evaluate(() => {
    const html = document.documentElement;
    const widthOverflow = Math.ceil(html.scrollWidth - window.innerWidth);
    const visibleButtons = Array.from(document.querySelectorAll("button"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text:
            element.textContent?.replace(/\s+/g, " ").trim() ||
            element.getAttribute("aria-label") ||
            "button",
          horizontalOverflow: element.scrollWidth - element.clientWidth,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter((entry) => entry.horizontalOverflow > 3);
    return {
      widthOverflow,
      buttonOverflow: visibleButtons.slice(0, 5),
    };
  });
  assert(
    result.widthOverflow <= 4,
    `${route} overflows horizontally by ${result.widthOverflow}px`,
  );
  assert(
    result.buttonOverflow.length === 0,
    `${route} has overflowing button text: ${JSON.stringify(result.buttonOverflow)}`,
  );
}

async function checkRouteSmoke(page) {
  for (const [route, title] of routeChecks) {
    await navigate(page, route, title);
    console.log(`✓ route renders ${route}`);
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
  const stopScannerButton = page.getByRole("button", { name: /Stop scanner/i });
  if (!(await stopScannerButton.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Scan payment QR/i }).click();
  }
  await page.locator(".scanner video").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await stopScannerButton.click();
  await Promise.race([
    page.locator(".scanner-frame.idle").waitFor({
      state: "visible",
      timeout: 5000,
    }),
    page.getByText("Camera is not ready.").waitFor({
      state: "visible",
      timeout: 5000,
    }),
  ]);
  await page
    .getByTestId("destination-account-input")
    .fill("testu2Recipient3333333333333333333333333333333333");
  await page
    .locator(".send-form label", { hasText: "Amount" })
    .locator("input")
    .fill("3.5");
  await page.locator(".send-form-pane .actions button").click();
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

async function checkKaigi(page) {
  await navigate(page, "/kaigi", "Kaigi");
  await page.getByRole("button", { name: /Turn on camera and mic/i }).click();
  await page
    .getByText("Local media is ready.")
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: /Create meeting link/i }).click();
  await page
    .getByRole("heading", { name: "Meeting link ready" })
    .waitFor({ state: "visible", timeout: 10000 });
  const invite = await page
    .locator(".kaigi-link-field textarea")
    .first()
    .inputValue();
  assert(
    invite.includes("call=kaigi.universal%3A") ||
      invite.includes("call=kaigi.universal:"),
    `Kaigi invite did not use qualified kaigi.universal call id: ${invite}`,
  );
  console.log("✓ kaigi media and meeting-link flow work");
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
  await navigate(page, "/parliament", "Governance");
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

async function checkMobileUsability(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, title] of mobileRouteChecks) {
    await navigate(page, route, title);
    console.log(`✓ mobile layout usable ${route}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
    headless: process.env.HEADED !== "1",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      baseURL: baseUrl,
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
    await checkReceiveQr(page);
    await checkSendFormAndCamera(page);
    await checkSoraCloudLaunchFlow(page);
    await checkKaigi(page);
    await checkExplorer(page);
    await checkStaking(page);
    await checkParliament(page);
    await checkVpn(page);
    await checkMobileUsability(page);
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
