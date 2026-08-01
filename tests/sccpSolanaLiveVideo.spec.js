// @vitest-environment node
/* global BigInt */
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  buildSolanaLiveTransferEvidenceTemplate,
  buildSolanaLiveCaptureInspection,
  buildSolanaGeneratedLiveVideoBinding,
  buildSolanaLiveVideoSuccessEvidencePolicy,
  buildSolanaLiveVideoMediaVerification,
  buildBlockedSolanaLiveVideoTranscript,
  buildSolanaLiveVideoBlockedDiagnostics,
  extractSolanaLiveRegistryPins,
  normalizeSolanaLiveTransferEvidence,
  parseArgs,
  productionGateOptionsFromPreLiveSnapshot,
  removeStaleSuccessfulArtifacts,
  runSccpSolanaLiveVideoGate,
  SOLANA_TESTNET_GENESIS_HASH,
  solanaLiveVideoMediaArtifactMaxBytes,
  solanaLiveVideoMediaArtifactSizeAllowed,
  solanaLiveEvidencePackageHashProblems,
  solanaLiveVideoSuccessPrerequisiteProblems,
  summarizeSolanaLiveVideoSubtitleCues,
  verifySolanaLiveTransferReadbacks,
} from "../scripts/e2e/sccp-solana-live-video.mjs";
import { summarizeExactSolanaRegistryRoute } from "../scripts/e2e/sccp-solana-exact-registry.mjs";
import { buildExactSolanaRegistryFixture } from "./helpers/sccpSolanaExactRegistryFixture.js";

const SOLANA_SIG_A =
  "6pc4LiB8KHAPvbUbkozrTcPL5zXspYBdATv5raNDyVbhiKjrKokLb9o111kxTD5KkPVd7UBSCcFcnWFkrJ82Hu6";
const SOLANA_SIG_B =
  "7z8GcFcMNwCGuiNX7AzpkXrzhnqenSpYoA6hdHqfmbKSezHczNJCuakboR7M9FVPVsC9XxpKe8W99CuWRMYdMH7";
const SOLANA_SIG_CANARY_A =
  "99eUso3aSbE9tqGSTXzo3TLfKb9RkMTURrHKQ1K7Zh3BbeqPevr5E1iCbpTjqHuTFLtfxTTD5ekfVuZFzQyEQf8";
const SOLANA_SIG_CANARY_B =
  "AKAh9LUoWFG2sxAMotzmLNpKwPTCiG6Q4YTwAinZMnkvYKPAKVPwYSfoQDp8XLKWzpbCNx66XB1BrcD1ZUPqU39";
const HASH_A = `0x${"aa".repeat(32)}`;
const HASH_B = `0x${"bb".repeat(32)}`;
const HASH_C = `0x${"cc".repeat(32)}`;
const HASH_D = `0x${"dd".repeat(32)}`;
const REQUIRED_PACKAGE_HASHES = {
  governancePlanSha256: `0x${"44".repeat(32)}`,
  governanceRegistrationSha256: `0x${"55".repeat(32)}`,
  governanceActivationSha256: `0x${"66".repeat(32)}`,
  publicRegistrySha256: `0x${"77".repeat(32)}`,
};
const SMOKE_PRODUCTION_BLOCKER_IDS = [
  "solana-public-route-report",
  "walletconnect-project-id",
  "solana-destination-production-prover-package",
  "solana-source-production-prover-package",
];

const TESTNET_CAIP_CHAIN_ID = "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();
const TAIRA_RECIPIENT = "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";
const SOURCE_BURN_EVENT_PREFIX = "sccp:solana:source-burn:v1";
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const base58Encode = (bytes) => {
  let number = 0n;
  for (const byte of bytes) {
    number = number * 256n + BigInt(byte);
  }
  let encoded = "";
  while (number > 0n) {
    encoded = `${BASE58_ALPHABET[Number(number % 58n)]}${encoded}`;
    number /= 58n;
  }
  const leadingZeroes = bytes.findIndex((byte) => byte !== 0);
  const count = leadingZeroes === -1 ? bytes.length : leadingZeroes;
  return `${"1".repeat(count)}${encoded}`;
};

const testPublicKey = (byte) => base58Encode(Buffer.alloc(32, byte));

const deriveProgramAddress = (seeds, programId) => {
  const programBytes = new PublicKey(programId).toBytes();
  const marker = Buffer.from("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump -= 1) {
    const digest = createHash("sha256")
      .update(
        Buffer.concat([
          ...seeds.map((seed) => Buffer.from(seed)),
          Buffer.from([bump]),
          Buffer.from(programBytes),
          marker,
        ]),
      )
      .digest();
    if (!PublicKey.isOnCurve(digest)) {
      return new PublicKey(digest).toBase58();
    }
  }
  throw new Error("Unable to derive fixture PDA.");
};

const pushVector = (parts, value) => {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  parts.push(length, bytes);
};

const encodeVectorsBase58 = (vectors) => {
  const parts = [];
  for (const vector of vectors) {
    pushVector(parts, vector);
  }
  return base58Encode(Buffer.concat(parts));
};

const u64Le = (value) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
};

const transparentPublicInputs = (messageId) => {
  const bytes = Buffer.alloc(141, 7);
  bytes[0] = 1;
  Buffer.from(messageId, "hex").copy(bytes, 1);
  bytes.writeUInt32LE(3, 65);
  return bytes;
};

const buildAuthoritativeReadbackFixture = () => {
  const registry = buildExactSolanaRegistryFixture();
  const registrySummary = summarizeExactSolanaRegistryRoute(registry, {
    requireBidirectional: true,
    requireCurrentTrustAnchor: true,
  });
  const addresses = {
    destinationProgramAddress: registrySummary.programs.destination,
    tokenMintAddress: registrySummary.accounts.tokenMint,
    sourceProgramAddress: registrySummary.programs.source,
    nativeVerifierProgramAddress: registrySummary.programs.nativeVerifier,
    destinationStateAddress: registrySummary.accounts.destinationState,
    sourceStateAddress: registrySummary.accounts.sourceState,
    nativeVerifierMaterialAddress:
      registrySummary.accounts.nativeVerifierMaterial,
    destinationProgramDataAddress:
      registrySummary.accounts.destinationProgramData,
    sourceProgramDataAddress: registrySummary.accounts.sourceProgramData,
    nativeVerifierProgramDataAddress:
      registrySummary.accounts.nativeVerifierProgramData,
    forwardPayer: testPublicKey(8),
    destinationTokenAccount: testPublicKey(9),
    reverseOwner: testPublicKey(10),
    sourceTokenAccount: testPublicKey(11),
  };
  addresses.mintAuthorityAddress = deriveProgramAddress(
    [
      Buffer.from("sccp-mint-authority-v1", "utf8"),
      new PublicKey(addresses.destinationStateAddress).toBuffer(),
    ],
    addresses.destinationProgramAddress,
  );
  const hashes = {
    destinationBindingHash: registrySummary.destinationBindingHash.slice(2),
  };
  const preflightReport = {
    schema: "iroha-demo-sccp-solana-route-preflight/v2",
    protocolSource: "typed-sccp-registry-v1",
    ready: true,
    manifestSource: "public-registry",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    routeRevision: 1,
    taira: {
      toriiUrl: "https://taira.sora.org",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      networkPrefix: 369,
      registryPath: "/v1/sccp/registry",
    },
    solana: {
      rpcUrl: "https://api.testnet.solana.com",
      network: "solana-testnet",
      caipChainId: TESTNET_CAIP_CHAIN_ID,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    },
    registryState: {
      lanePresent: true,
      routePresent: true,
      activation: "bidirectional",
      currentNativeTrustAnchorHash:
        registrySummary.currentNativeTrustAnchorHash,
    },
    registrySummary,
    checks: [
      {
        id: "solana-live-exact-programdata-evidence",
        status: "pass",
        evidence: {
          destination: {
            role: "destination",
            immutable: true,
            upgradeAuthority: null,
            programAddress: addresses.destinationProgramAddress,
            programdataAddress: addresses.destinationProgramDataAddress,
            programdataSlot: String(
              registrySummary.programDataSlots.destination,
            ),
            programCodeHash: registrySummary.codeHashes.destination,
          },
          source: {
            role: "source",
            immutable: true,
            upgradeAuthority: null,
            programAddress: addresses.sourceProgramAddress,
            programdataAddress: addresses.sourceProgramDataAddress,
            programdataSlot: String(registrySummary.programDataSlots.source),
            programCodeHash: registrySummary.codeHashes.source,
          },
          nativeVerifier: {
            role: "nativeVerifier",
            immutable: true,
            upgradeAuthority: null,
            programAddress: addresses.nativeVerifierProgramAddress,
            programdataAddress: addresses.nativeVerifierProgramDataAddress,
            programdataSlot: String(
              registrySummary.programDataSlots.nativeVerifier,
            ),
            programCodeHash: registrySummary.codeHashes.nativeVerifier,
          },
        },
      },
      {
        id: "solana-live-exact-runtime-state",
        status: "pass",
        evidence: {
          destinationState: { address: addresses.destinationStateAddress },
          sourceState: { address: addresses.sourceStateAddress },
          mint: {
            address: addresses.tokenMintAddress,
            mintAuthority: addresses.mintAuthorityAddress,
          },
          material: { address: addresses.nativeVerifierMaterialAddress },
          mintAuthority: addresses.mintAuthorityAddress,
        },
      },
      {
        id: "post-deploy-live-evidence",
        status: "pass",
        evidence: {
          sourceEventSignature: SOLANA_SIG_CANARY_A,
          routeCanarySignature: SOLANA_SIG_CANARY_B,
        },
      },
    ],
  };
  const normalizedEvidence = normalizeSolanaLiveTransferEvidence({
    schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    ...REQUIRED_PACKAGE_HASHES,
    publicRegistrySha256: registrySummary.registrySha256,
    tairaToSolana: {
      amount: "0.0001",
      messageId: HASH_A,
      tairaSourceTx: HASH_B,
      solanaTxId: SOLANA_SIG_A,
      solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_SIG_A}?cluster=testnet`,
    },
    solanaToTaira: {
      amount: "0.0001",
      messageId: HASH_D,
      solanaSourceTx: SOLANA_SIG_B,
      tairaSettlementTx: HASH_C,
      tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"cc".repeat(32)}`,
    },
  });
  const amountBaseUnits = "100000";
  const sourceNonce = "13";
  const sourceNonceBytes = u64Le(sourceNonce);
  const messageReceiptAddress = deriveProgramAddress(
    [
      Buffer.from("sccp-message-receipt", "utf8"),
      new PublicKey(addresses.destinationStateAddress).toBuffer(),
      Buffer.from(normalizedEvidence.tairaToSolana.messageId, "hex"),
    ],
    addresses.destinationProgramAddress,
  );
  const sourceBurnReceiptAddress = deriveProgramAddress(
    [
      Buffer.from("sccp-source-burn-receipt", "utf8"),
      new PublicKey(addresses.sourceStateAddress).toBuffer(),
      new PublicKey(addresses.reverseOwner).toBuffer(),
      sourceNonceBytes,
    ],
    addresses.sourceProgramAddress,
  );
  const forwardAccounts = [
    addresses.forwardPayer,
    addresses.destinationStateAddress,
    addresses.tokenMintAddress,
    addresses.destinationTokenAccount,
    addresses.mintAuthorityAddress,
    SPL_TOKEN_PROGRAM_ID,
    addresses.nativeVerifierProgramAddress,
    messageReceiptAddress,
    SYSTEM_PROGRAM_ID,
  ];
  const reverseAccounts = [
    addresses.reverseOwner,
    addresses.sourceStateAddress,
    addresses.sourceTokenAccount,
    addresses.tokenMintAddress,
    SPL_TOKEN_PROGRAM_ID,
    sourceBurnReceiptAddress,
    SYSTEM_PROGRAM_ID,
  ];
  const makeTransaction = ({
    signature,
    programId,
    accounts,
    data,
    tokenAccount,
    before,
    after,
    mutationType,
  }) => ({
    slot: 12345,
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: accounts,
        instructions: [{ programId, accounts, data }],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [
        {
          accountIndex: accounts.indexOf(tokenAccount),
          mint: addresses.tokenMintAddress,
          uiTokenAmount: { amount: before },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: accounts.indexOf(tokenAccount),
          mint: addresses.tokenMintAddress,
          uiTokenAmount: { amount: after },
        },
      ],
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programId: SPL_TOKEN_PROGRAM_ID,
              parsed: {
                type: mutationType,
                info: {
                  mint: addresses.tokenMintAddress,
                  account: tokenAccount,
                  amount: amountBaseUnits,
                },
              },
            },
          ],
        },
      ],
    },
  });
  const buildForwardData = (
    messageId = normalizedEvidence.tairaToSolana.messageId,
    amount = amountBaseUnits,
    destinationBindingHash = hashes.destinationBindingHash,
  ) =>
    encodeVectorsBase58([
      Buffer.from("submit_sccp_message_proof"),
      Buffer.from([1]),
      transparentPublicInputs(messageId),
      Buffer.from([2]),
      Buffer.from("11".repeat(32), "hex"),
      Buffer.from(destinationBindingHash, "hex"),
      Buffer.from("12".repeat(32), "hex"),
      u64Le(amount),
    ]);
  const forwardData = buildForwardData();
  const buildReverseData = ({
    amount = amountBaseUnits,
    recipient = Buffer.from(TAIRA_RECIPIENT),
    nonce = sourceNonceBytes,
  } = {}) =>
    encodeVectorsBase58([
      Buffer.from("burn_to_taira"),
      u64Le(amount),
      Buffer.from(recipient),
      Buffer.from(nonce),
    ]);
  const reverseData = buildReverseData();
  const forwardPayloadHash = "07".repeat(32);
  const recipientBytes = Buffer.from(TAIRA_RECIPIENT);
  const recipientLength = Buffer.alloc(2);
  recipientLength.writeUInt16LE(recipientBytes.length);
  const sourceEventHash = createHash("sha256")
    .update(Buffer.from(SOURCE_BURN_EVENT_PREFIX))
    .update(new PublicKey(addresses.sourceProgramAddress).toBuffer())
    .update(new PublicKey(addresses.sourceStateAddress).toBuffer())
    .update(new PublicKey(addresses.tokenMintAddress).toBuffer())
    .update(new PublicKey(addresses.reverseOwner).toBuffer())
    .update(new PublicKey(addresses.sourceTokenAccount).toBuffer())
    .update(recipientLength)
    .update(recipientBytes)
    .update(u64Le(amountBaseUnits))
    .update(sourceNonceBytes)
    .update(u64Le(12345))
    .digest("hex");
  const solanaTransactions = new Map([
    [
      SOLANA_SIG_A,
      makeTransaction({
        signature: SOLANA_SIG_A,
        programId: addresses.destinationProgramAddress,
        accounts: forwardAccounts,
        data: forwardData,
        tokenAccount: addresses.destinationTokenAccount,
        before: "9",
        after: "100009",
        mutationType: "mintTo",
      }),
    ],
    [
      SOLANA_SIG_B,
      makeTransaction({
        signature: SOLANA_SIG_B,
        programId: addresses.sourceProgramAddress,
        accounts: reverseAccounts,
        data: reverseData,
        tokenAccount: addresses.sourceTokenAccount,
        before: "200000",
        after: "100000",
        mutationType: "burn",
      }),
    ],
  ]);
  const pins = extractSolanaLiveRegistryPins(preflightReport);
  const transactionRecord = ({
    hash,
    messageId,
    direction,
    deltaDirection,
    sourceTransactionId,
    accountId,
    payloadHash,
    sourceEventHash: transactionSourceEventHash,
  }) => ({
    hash,
    status: "committed",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    direction,
    messageId,
    amountBaseUnits,
    registryPins: pins,
    ...(payloadHash ? { payloadHash } : {}),
    ...(transactionSourceEventHash
      ? { sourceEventHash: transactionSourceEventHash }
      : {}),
    ...(direction === "taira_to_solana"
      ? { sccpMessageRecorded: true, sender: accountId }
      : {
          sccpSettlementApplied: true,
          sourceTransactionId,
          recipient: accountId,
        }),
    stateDeltas: [
      {
        assetKey: "xor",
        kind: deltaDirection,
        role: "sccp_principal",
        accountId,
        amountBaseUnits,
        deltaBaseUnits:
          deltaDirection === "credit" ? amountBaseUnits : `-${amountBaseUnits}`,
        applied: true,
      },
    ],
  });
  const messageRecord = ({
    messageId,
    direction,
    sourceTransactionId,
    destinationTransactionId,
    accountBindings,
    payloadHash,
    sourceEventHash: messageSourceEventHash,
  }) => ({
    messageId,
    status: "settled",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    direction,
    amountBaseUnits,
    sourceDomain: direction === "taira_to_solana" ? 0 : 3,
    targetDomain: direction === "taira_to_solana" ? 3 : 0,
    sourceTransactionId,
    destinationTransactionId,
    accountBindings,
    ...(payloadHash ? { payloadHash } : {}),
    ...(messageSourceEventHash
      ? { sourceEventHash: messageSourceEventHash }
      : {}),
    registryPins: pins,
  });
  const tairaTransactions = new Map([
    [
      normalizedEvidence.tairaToSolana.tairaSourceTx,
      transactionRecord({
        hash: normalizedEvidence.tairaToSolana.tairaSourceTx,
        messageId: normalizedEvidence.tairaToSolana.messageId,
        direction: "taira_to_solana",
        deltaDirection: "debit",
        accountId: "sorau-test-sender",
        payloadHash: forwardPayloadHash,
      }),
    ],
    [
      normalizedEvidence.solanaToTaira.tairaSettlementTx,
      transactionRecord({
        hash: normalizedEvidence.solanaToTaira.tairaSettlementTx,
        messageId: normalizedEvidence.solanaToTaira.messageId,
        direction: "solana_to_taira",
        deltaDirection: "credit",
        sourceTransactionId: normalizedEvidence.solanaToTaira.solanaSourceTx,
        accountId: TAIRA_RECIPIENT,
        sourceEventHash,
      }),
    ],
  ]);
  const tairaMessages = new Map([
    [
      normalizedEvidence.tairaToSolana.messageId,
      messageRecord({
        messageId: normalizedEvidence.tairaToSolana.messageId,
        direction: "taira_to_solana",
        sourceTransactionId: normalizedEvidence.tairaToSolana.tairaSourceTx,
        destinationTransactionId: normalizedEvidence.tairaToSolana.solanaTxId,
        accountBindings: {
          destinationTokenAccount: addresses.destinationTokenAccount,
        },
        payloadHash: forwardPayloadHash,
      }),
    ],
    [
      normalizedEvidence.solanaToTaira.messageId,
      messageRecord({
        messageId: normalizedEvidence.solanaToTaira.messageId,
        direction: "solana_to_taira",
        sourceTransactionId: normalizedEvidence.solanaToTaira.solanaSourceTx,
        destinationTransactionId:
          normalizedEvidence.solanaToTaira.tairaSettlementTx,
        accountBindings: {
          solanaOwner: addresses.reverseOwner,
          sourceTokenAccount: addresses.sourceTokenAccount,
          tairaRecipient: TAIRA_RECIPIENT,
        },
        sourceEventHash,
      }),
    ],
  ]);
  const readbacks = {
    readSolanaGenesisHash: async () => SOLANA_TESTNET_GENESIS_HASH,
    readSolanaSignatureStatus: async () => ({
      value: [{ confirmationStatus: "finalized", err: null }],
    }),
    readSolanaTransaction: async (signature) =>
      solanaTransactions.get(signature) ?? null,
    readTairaChainMetadata: async () => ({
      chain_id: "fc56984b-2be7-431d-840e-21514d1883f0",
      network_prefix: 369,
    }),
    readTairaTransaction: async (hash) => tairaTransactions.get(hash) ?? null,
    readTairaRegistry: async () => structuredClone(registry),
    readTairaSccpMessage: async (messageId) =>
      tairaMessages.get(messageId) ?? null,
  };
  return {
    addresses,
    hashes,
    pins,
    registry,
    registrySummary,
    preflightReport,
    liveEvidence: normalizedEvidence,
    readbacks,
    solanaTransactions,
    tairaTransactions,
    tairaMessages,
    buildForwardData,
    buildReverseData,
    messageReceiptAddress,
    sourceBurnReceiptAddress,
    sourceNonce,
    tairaRecipient: TAIRA_RECIPIENT,
  };
};

describe("Solana SCCP live video gate", () => {
  it("parses explicit Solana RPC skip booleans used by operator commands", () => {
    expect(parseArgs(["--skip-solana-rpc"])).toEqual({
      "skip-solana-rpc": true,
    });
    expect(parseArgs(["--skip-solana-rpc", "false"])).toEqual({
      "skip-solana-rpc": false,
    });
    expect(
      parseArgs([
        "--write-live-evidence-template",
        "/tmp/live-evidence.template.json",
        "--skip-solana-rpc",
        "false",
      ]),
    ).toEqual({
      "write-live-evidence-template": "/tmp/live-evidence.template.json",
      "skip-solana-rpc": false,
    });
    expect(() => parseArgs(["--skip-solana-rpc", "maybe"])).toThrow(
      "--skip-solana-rpc must be true or false when a value is provided.",
    );
    expect(
      parseArgs([
        "--prover-governance-approval-sha256",
        REQUIRED_PACKAGE_HASHES.publicRegistrySha256,
        "--live-capture-video",
        "/tmp/real-capture.mp4",
        "--live-capture-video-sha256",
        HASH_A,
        "--live-capture-witness",
        "/tmp/capture-witness.json",
        "--live-capture-witness-sha256",
        HASH_B,
      ]),
    ).toEqual({
      "prover-governance-approval-sha256":
        REQUIRED_PACKAGE_HASHES.publicRegistrySha256,
      "live-capture-video": "/tmp/real-capture.mp4",
      "live-capture-video-sha256": HASH_A,
      "live-capture-witness": "/tmp/capture-witness.json",
      "live-capture-witness-sha256": HASH_B,
    });
    for (const option of [
      "production-requirements",
      "handoff-verification",
      "proof-material-bundle",
      "deployment-video-transcript",
    ]) {
      expect(() => parseArgs([`--${option}`, "retired.json"])).toThrow(
        /Unknown option/u,
      );
    }
  });

  const canonicalSuccessDiagnostics = () => ({
    governance: {
      registration: {
        toriiUrl: "https://taira-validator-1.sora.org",
      },
      activation: { toriiUrl: "https://taira-validator-1.sora.org" },
      evidence: { ready: true },
    },
  });

  it("binds the fresh production gate to the pinned prover approval path", () => {
    const pinnedApprovalPath = "/tmp/pinned/exact-prover-approval.json";
    const snapshot = {
      preLiveInputSnapshotSha256: HASH_D,
      inputs: {
        captureReviewPolicy: {
          path: "/tmp/pinned/capture-review-policy.json",
          sha256: HASH_D,
        },
        proverGovernanceApproval: {
          path: pinnedApprovalPath,
          sha256: HASH_A,
        },
        governancePlan: { path: "/tmp/pinned/governance-plan.json" },
        governanceRegistration: {
          path: "/tmp/pinned/governance-registration.json",
          sha256: HASH_B,
        },
        governanceActivation: {
          path: "/tmp/pinned/governance-activation.json",
          sha256: HASH_C,
        },
        orderedInitializationEvidence: {
          path: "/tmp/pinned/ordered-initialization.json",
          sha256: HASH_D,
        },
        smokeReadiness: { path: "/tmp/pinned/smoke-readiness.json" },
      },
    };

    const options = productionGateOptionsFromPreLiveSnapshot({
      snapshot,
      productionGateReport: {
        artifacts: {
          proverGovernanceApprovalPath:
            "/tmp/forged-sidecar/exact-prover-approval.json",
        },
        governanceEvidence: { planSha256: HASH_A },
      },
      outputDir: "/tmp/live-video",
      proverGovernanceApprovalSha256: HASH_A,
    });

    expect(options).toMatchObject({
      proverGovernanceApproval: pinnedApprovalPath,
      proverGovernanceApprovalSha256: HASH_A,
      expectedPreLiveInputSnapshotSha256: HASH_D,
    });
    expect(options.proverGovernanceApproval).not.toContain("forged-sidecar");
  });

  it("permits success qualification only on fresh canonical governance-pinned roots", () => {
    const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
      options: {
        toriiUrl: "https://taira-validator-1.sora.org/",
        solanaRpcUrl: "https://api.testnet.solana.com/",
        skipSolanaRpc: false,
        productionGateSnapshot: "/tmp/pre-live-production-gate.json",
        productionGateSnapshotSha256: HASH_A,
        liveCaptureVideo: "/tmp/real-bidirectional-capture.mp4",
        liveCaptureVideoSha256: HASH_B,
        liveCaptureWitness: "/tmp/reviewed-capture-witness.json",
        liveCaptureWitnessSha256: HASH_C,
        liveCaptureReviewAttestation: "/tmp/reviewed-capture-attestation.json",
        liveCaptureReviewAttestationSha256: HASH_D,
      },
      diagnostics: canonicalSuccessDiagnostics(),
      freshPreflightCompleted: true,
      freshProductionGateCompleted: true,
    });

    expect(policy).toMatchObject({
      ready: true,
      diagnosticOnly: false,
      canonicalTairaValidatorRoot: true,
      canonicalSolanaTestnetRpc: true,
      governancePinReady: true,
      freshPreflightCompleted: true,
      freshProductionGateCompleted: true,
      nativeNetworkClientsUsed: true,
      problems: [],
      liveCapturePinned: true,
      liveCaptureWitnessPinned: true,
    });
  });

  it("requires an independently pinned real capture for success qualification", () => {
    const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
      options: {
        toriiUrl: "https://taira-validator-1.sora.org",
        solanaRpcUrl: "https://api.testnet.solana.com",
        skipSolanaRpc: false,
        productionGateSnapshot: "/tmp/pre-live-production-gate.json",
        productionGateSnapshotSha256: HASH_A,
      },
      diagnostics: canonicalSuccessDiagnostics(),
      freshPreflightCompleted: true,
      freshProductionGateCompleted: true,
    });

    expect(policy.ready).toBe(false);
    expect(policy.liveCapturePinned).toBe(false);
    expect(policy.problems.map((problem) => problem.id)).toContain(
      "pinned-real-live-capture",
    );
  });

  it.each([
    [
      "loopback TAIRA",
      "http://127.0.0.1:8080",
      "https://api.testnet.solana.com",
    ],
    ["localhost TAIRA", "https://localhost", "https://api.testnet.solana.com"],
    [
      "arbitrary TAIRA",
      "https://taira.example",
      "https://api.testnet.solana.com",
    ],
    [
      "convenience TAIRA",
      "https://taira.sora.org",
      "https://api.testnet.solana.com",
    ],
    [
      "loopback Solana",
      "https://taira-validator-1.sora.org",
      "http://127.0.0.1:8899",
    ],
    [
      "arbitrary Solana",
      "https://taira-validator-1.sora.org",
      "https://rpc.example",
    ],
  ])(
    "rejects %s endpoint evidence even when reports coherently claim ready",
    (_name, toriiUrl, solanaRpcUrl) => {
      const diagnostics = canonicalSuccessDiagnostics();
      const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
        options: { toriiUrl, solanaRpcUrl, skipSolanaRpc: false },
        diagnostics,
        freshPreflightCompleted: true,
        freshProductionGateCompleted: true,
      });

      expect(policy.ready).toBe(false);
      expect(policy.problems.map((entry) => entry.id)).toEqual(
        expect.arrayContaining([
          toriiUrl.includes("taira-validator")
            ? "canonical-solana-testnet-rpc"
            : "canonical-taira-validator-root",
        ]),
      );
    },
  );

  it("makes coherent report overrides, injected clients, and skipped RPC diagnostic-only", () => {
    const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
      options: {
        toriiUrl: "https://taira-validator-1.sora.org",
        solanaRpcUrl: "https://api.testnet.solana.com",
        preflightReport: "/tmp/coherent-forged-preflight.json",
        productionGate: "/tmp/coherent-forged-gate.json",
        skipSolanaRpc: true,
        readbacks: {},
      },
      diagnostics: canonicalSuccessDiagnostics(),
      freshPreflightCompleted: true,
      freshProductionGateCompleted: true,
    });

    expect(policy).toMatchObject({ ready: false, diagnosticOnly: true });
    expect(policy.problems.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "fresh-public-preflight",
        "fresh-production-prerequisites",
        "solana-rpc-not-skipped",
        "native-read-only-network-clients",
      ]),
    );
    expect(policy.prerequisiteReportOverrideIds).toEqual(["production-gate"]);
  });

  it("rejects caller-declared trusted chains and production-gate option bags", () => {
    const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
      options: {
        toriiUrl: "https://taira-validator-1.sora.org",
        solanaRpcUrl: "https://api.testnet.solana.com",
        skipSolanaRpc: false,
        productionGateSnapshot: "/tmp/pre-live-production-gate.json",
        productionGateSnapshotSha256: HASH_A,
        trustedGeneratedChain: { activationPackage: "/tmp/forged.json" },
        productionGateOptions: { activationPackage: "/tmp/forged.json" },
      },
      diagnostics: canonicalSuccessDiagnostics(),
      freshPreflightCompleted: true,
      freshProductionGateCompleted: true,
    });

    expect(policy.ready).toBe(false);
    expect(policy.problems.map((problem) => problem.id)).toEqual(
      expect.arrayContaining([
        "caller-trusted-generated-chain",
        "caller-production-gate-options",
      ]),
    );
  });

  it("rejects mismatched governance registration and activation roots", () => {
    const diagnostics = canonicalSuccessDiagnostics();
    diagnostics.governance.activation.toriiUrl =
      "https://taira-validator-2.sora.org";
    const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
      options: {
        toriiUrl: "https://taira-validator-1.sora.org",
        solanaRpcUrl: "https://api.testnet.solana.com",
        skipSolanaRpc: false,
      },
      diagnostics,
      freshPreflightCompleted: true,
      freshProductionGateCompleted: true,
    });

    expect(policy.ready).toBe(false);
    expect(policy.problems.map((problem) => problem.id)).toContain(
      "governance-pinned-taira-validator-root",
    );
  });

  it("cannot turn a coherent forged local preflight into a successful artifact", async () => {
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-forged-live-video-"),
    );
    const preflightPath = path.join(outputDir, "forged-preflight.json");
    await writeFile(
      preflightPath,
      `${JSON.stringify({
        ...buildAuthoritativeReadbackFixture().preflightReport,
        taira: {
          toriiUrl: "https://localhost",
          chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
          networkPrefix: 369,
        },
        solana: {
          rpcUrl: "http://127.0.0.1:8899",
          network: "solana-testnet",
          caipChainId: TESTNET_CAIP_CHAIN_ID,
        },
      })}\n`,
    );
    try {
      const result = await runSccpSolanaLiveVideoGate({
        outputDir,
        toriiUrl: "https://localhost",
        solanaRpcUrl: "http://127.0.0.1:8899",
        preflightReport: preflightPath,
        skipSolanaRpc: true,
      });
      expect(result.ready).toBe(false);
      expect(result.reason).toContain("success evidence policy failed");
      expect(
        result.successEvidencePolicy.problems.map((entry) => entry.id),
      ).toEqual(
        expect.arrayContaining([
          "canonical-taira-validator-root",
          "canonical-solana-testnet-rpc",
          "fresh-public-preflight",
          "solana-rpc-not-skipped",
        ]),
      );
      await expect(
        access(path.join(outputDir, "sccp-solana-live-video.json")),
      ).rejects.toThrow();
      await expect(
        access(path.join(outputDir, "sccp-solana-live-video.mp4")),
      ).rejects.toThrow();
      await expect(
        access(path.join(outputDir, "sccp-solana-live-video-blocked.json")),
      ).resolves.toBeUndefined();
      const blockedTranscript = JSON.parse(
        await readFile(result.transcriptPath, "utf8"),
      );
      expect(blockedTranscript.mediaVerification).toMatchObject({
        ready: false,
        encodingReady: true,
        productionReady: false,
        diagnosticOnly: true,
        notLiveTransferEvidence: true,
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("preserves prior successful evidence when a later diagnostic run is blocked", async () => {
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-preserve-live-video-"),
    );
    const prior = {
      "sccp-solana-live-video.json": "prior transcript\n",
      "sccp-solana-live-video.vtt": "prior subtitles\n",
      "sccp-solana-live-video.mp4": "prior video\n",
    };
    try {
      await Promise.all(
        Object.entries(prior).map(([file, contents]) =>
          writeFile(path.join(outputDir, file), contents),
        ),
      );
      const result = await runSccpSolanaLiveVideoGate({
        outputDir,
        toriiUrl: "https://localhost",
        solanaRpcUrl: "http://127.0.0.1:8899",
        skipSolanaRpc: true,
      });
      expect(result.ready).toBe(false);
      for (const [file, contents] of Object.entries(prior)) {
        await expect(
          readFile(path.join(outputDir, file), "utf8"),
        ).resolves.toBe(contents);
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("uses Solana smoke root-cause blockers in blocked live-video diagnostics", () => {
    const rootCauseBlockerIds = [
      "solana-public-route-report",
      "walletconnect-project-id",
      "solana-destination-production-prover-package",
      "solana-source-production-prover-package",
    ];
    const diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
      smokeReadinessReport: {
        schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
        ready: false,
        blockerIds: [
          "route-preflight",
          "walletconnect-project-id",
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
        rootCauseBlockerIds,
        checks: [
          { id: "route-preflight", status: "fail", detail: "route missing" },
          {
            id: "walletconnect-project-id",
            status: "fail",
            detail: "WalletConnect missing",
          },
          {
            id: "destination-prover-module-url",
            status: "fail",
            detail: "Destination prover package is fail-closed",
          },
          {
            id: "source-prover-module-url",
            status: "fail",
            detail: "Source prover package is fail-closed",
          },
        ],
      },
      smokeReadinessPath: "/tmp/smoke-readiness.json",
    });

    expect(diagnostics.smokeReadiness.blockerIds).toEqual(rootCauseBlockerIds);
    expect(
      diagnostics.smokeReadiness.failedChecks.map((check) => check.id),
    ).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);

    const transcript = buildBlockedSolanaLiveVideoTranscript({
      preflightReport: { ready: true, checks: [] },
      reason: "blocked for test",
      diagnostics,
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
    const blockerIds = transcript.blockers.map((blocker) => blocker.id);
    expect(blockerIds).toEqual(expect.arrayContaining(rootCauseBlockerIds));
    expect(blockerIds).not.toContain("destination-prover-module-url");
    expect(blockerIds).not.toContain("source-prover-module-url");
  });

  it("categorizes malformed prerequisite diagnostics without echoing report text", () => {
    const secretMarker = "malformed-live-video-secret-marker";
    const diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
      smokeReadinessReport: {
        ready: false,
        blockerIds: [secretMarker],
        rootCauseBlockerIds: [secretMarker],
        missingProductionInputs: [{ id: secretMarker, password: secretMarker }],
        nextActions: [{ id: secretMarker, title: secretMarker }],
        checks: [
          { id: secretMarker, status: secretMarker, detail: secretMarker },
        ],
      },
      handoffVerificationReport: {
        statuses: [
          { id: secretMarker, status: secretMarker, detail: secretMarker },
        ],
        blockerIds: [secretMarker],
      },
      productionGateReport: {
        ready: false,
        governanceEvidence: {
          ready: false,
          publicRegistrySha256: secretMarker,
          password: secretMarker,
        },
        checks: [
          { id: secretMarker, status: secretMarker, detail: secretMarker },
        ],
        nextRequiredActions: [secretMarker],
        nextActionDetails: [{ id: secretMarker, title: secretMarker }],
      },
    });

    expect(JSON.stringify(diagnostics)).not.toContain(secretMarker);
    expect(diagnostics.smokeReadiness.failedChecks).toEqual([
      {
        id: "invalid-report-check",
        status: "fail",
        detail: "Referenced report contains a failed or invalid check.",
      },
    ]);
    const transcript = buildBlockedSolanaLiveVideoTranscript({
      preflightReport: {
        ready: false,
        publicSolanaCapability: { password: secretMarker },
        publicSolanaLane: { detail: secretMarker },
        checks: [
          { id: secretMarker, status: secretMarker, detail: secretMarker },
        ],
      },
      reason: "Blocked prerequisite report validation failed.",
      diagnostics,
    });
    expect(JSON.stringify(transcript)).not.toContain(secretMarker);
    expect(transcript.publicSolanaCapability).toEqual({
      present: true,
      ready: false,
    });
  });

  it("does not echo invalid pinned production-gate contents into blocked artifacts", async () => {
    const secretMarker = "pinned-gate-secret-marker";
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-pinned-redaction-"),
    );
    const gatePath = path.join(outputDir, "pinned-gate.json");
    const gateBytes = Buffer.from(
      `${JSON.stringify({
        schema: secretMarker,
        failedCheckIds: [secretMarker],
        preLiveInputSnapshot: { password: secretMarker },
      })}\n`,
      "utf8",
    );
    await writeFile(gatePath, gateBytes);
    try {
      const result = await runSccpSolanaLiveVideoGate({
        outputDir,
        productionGateSnapshot: gatePath,
        productionGateSnapshotSha256: `0x${createHash("sha256")
          .update(gateBytes)
          .digest("hex")}`,
      });
      const blockedJson = await readFile(result.transcriptPath, "utf8");
      const blockedVtt = await readFile(result.subtitlesPath, "utf8");
      expect(result.ready).toBe(false);
      expect(result.reason).not.toContain(secretMarker);
      expect(blockedJson).not.toContain(secretMarker);
      expect(blockedVtt).not.toContain(secretMarker);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("never overwrites a pinned input with a blocked diagnostic artifact", async () => {
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-blocked-output-collision-"),
    );
    const pinnedPath = path.join(
      outputDir,
      "sccp-solana-live-video-blocked.json",
    );
    const pinnedBytes = Buffer.from('{"invalid":true}\n', "utf8");
    await writeFile(pinnedPath, pinnedBytes);
    try {
      await expect(
        runSccpSolanaLiveVideoGate({
          outputDir,
          productionGateSnapshot: pinnedPath,
          productionGateSnapshotSha256: `0x${createHash("sha256")
            .update(pinnedBytes)
            .digest("hex")}`,
        }),
      ).rejects.toThrow(/disjoint from every pinned input/u);
      await expect(readFile(pinnedPath)).resolves.toEqual(pinnedBytes);
      await expect(
        access(path.join(outputDir, "sccp-solana-live-video-blocked.vtt")),
      ).rejects.toThrow();
      await expect(
        access(path.join(outputDir, "sccp-solana-live-video-blocked.mp4")),
      ).rejects.toThrow();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("summarizes governance blockers without resurrecting retired publication artifacts", () => {
    const diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
      governancePlanReport: {
        schema: "iroha-sccp-solana-route-governance-plan/v1",
        plan_sha256: REQUIRED_PACKAGE_HASHES.governancePlanSha256,
      },
      governancePlanPath: "/tmp/governance-plan.json",
      governanceRegistrationReport: {
        phase: "register",
        plan_sha256: REQUIRED_PACKAGE_HASHES.governancePlanSha256,
        torii_url: "https://taira-validator-1.sora.org",
        submitted: true,
      },
      governanceRegistrationPath: "/tmp/governance-register.json",
      governanceActivationReport: {
        phase: "activate",
        plan_sha256: REQUIRED_PACKAGE_HASHES.governancePlanSha256,
        torii_url: "https://taira-validator-1.sora.org",
        submitted: true,
      },
      governanceActivationPath: "/tmp/governance-activate.json",
      productionRequirementsReport: {
        ready: false,
        blockerIds: ["destination-proof-admission"],
      },
      smokeReadinessReport: {
        ready: false,
        blockerIds: SMOKE_PRODUCTION_BLOCKER_IDS,
      },
      productionGateReport: {
        ready: false,
        governanceEvidence: {
          ready: false,
          planSha256: REQUIRED_PACKAGE_HASHES.governancePlanSha256,
          registrationArtifactSha256:
            REQUIRED_PACKAGE_HASHES.governanceRegistrationSha256,
          activationArtifactSha256:
            REQUIRED_PACKAGE_HASHES.governanceActivationSha256,
          publicRegistrySha256: REQUIRED_PACKAGE_HASHES.publicRegistrySha256,
        },
        failedCheckIds: ["governance-enactment-readback"],
      },
      productionGatePath: "/tmp/production-gate.json",
    });

    expect(diagnostics).toMatchObject({
      governance: {
        plan: {
          present: true,
          planSha256: REQUIRED_PACKAGE_HASHES.governancePlanSha256,
        },
        registration: {
          phase: "register",
          toriiUrl: "https://taira-validator-1.sora.org",
          submitted: true,
        },
        activation: {
          phase: "activate",
          toriiUrl: "https://taira-validator-1.sora.org",
          submitted: true,
        },
        evidence: {
          ready: false,
          publicRegistrySha256: REQUIRED_PACKAGE_HASHES.publicRegistrySha256,
        },
      },
      productionGate: {
        present: true,
        ready: false,
      },
    });
    expect(diagnostics).not.toHaveProperty("publishReadiness");
    expect(diagnostics).not.toHaveProperty("routePublicationRequest");
    expect(diagnostics).not.toHaveProperty("operatorHandoff");
    expect(diagnostics).not.toHaveProperty("activationPackage");

    const transcript = buildBlockedSolanaLiveVideoTranscript({
      reason: "Parliament evidence is incomplete.",
      diagnostics,
      successPrerequisiteProblems: [
        {
          id: "governance-evidence-ready",
          detail: "Fresh exact registry readback is required.",
        },
      ],
    });
    expect(transcript.diagnosticVideoOnly).toBe(true);
    expect(transcript.notLiveTransferEvidence).toBe(true);
    expect(JSON.stringify(transcript)).not.toMatch(
      /route-manager|operator-handoff|activation-package/iu,
    );
  });
  it("allows a success video only when the production gate is blocked solely by the live-video check", () => {
    expect(
      solanaLiveVideoSuccessPrerequisiteProblems({
        diagnostics: {
          productionRequirements: {
            readyToBuildIsi: true,
          },
          governance: { evidence: { ready: true } },
          sourceMaterialHandoffVerification: {
            ready: true,
          },
          proofMaterialBundle: {
            productionRouteReady: true,
            readyToSubmitWithCurrentRuntime: true,
            productionProofMaterialIncluded: true,
          },
          smokeReadiness: {
            ready: true,
            runbookReady: true,
          },
          productionGate: {
            present: true,
            ready: false,
            failedChecks: [
              {
                id: "live-bidirectional-video",
                status: "fail",
                detail:
                  "No completed Solana bidirectional live-video transcript is available.",
              },
            ],
          },
        },
      }),
    ).toEqual([]);
  });

  it("writes a Solana live evidence template that cannot pass as completion evidence", () => {
    const template = buildSolanaLiveTransferEvidenceTemplate({
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(template).toMatchObject({
      schema: "iroha-demo-sccp-solana-live-transfer-evidence-template/v1",
      templateOnly: true,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      checkedAt: "2026-07-05T00:00:00.000Z",
      tairaToSolana: {
        amount: "<positive XOR amount finalized on Solana>",
        messageId: "<32-byte SCCP message id hex>",
        tairaSourceTx: "<32-byte TAIRA source transaction hash>",
        solanaTxId: "<Solana testnet finalize transaction signature>",
      },
      solanaToTaira: {
        amount: "<positive XOR amount settled back on TAIRA>",
        solanaSourceTx: "<Solana testnet source burn transaction signature>",
        tairaSettlementTx: "<32-byte TAIRA settlement transaction hash>",
      },
    });
    expect(template.completionRequirements).toContain(
      "change schema to iroha-demo-sccp-solana-live-transfer-evidence/v1",
    );
    expect(() => normalizeSolanaLiveTransferEvidence(template)).toThrow(
      "live evidence template files cannot be used as completed transfer evidence.",
    );
  });

  it("normalizes route-bound Solana live transfer evidence", () => {
    expect(
      normalizeSolanaLiveTransferEvidence(
        {
          schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
          routeId: "taira_sol_xor",
          assetKey: "xor",
          ...REQUIRED_PACKAGE_HASHES,
          tairaToSolana: {
            amount: "0.0001",
            messageId: HASH_A,
            tairaSourceTx: HASH_B,
            solanaTxId: SOLANA_SIG_A,
            solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_SIG_A}?cluster=testnet`,
          },
          solanaToTaira: {
            amount: "0.0001",
            messageId: HASH_D,
            solanaSourceTx: SOLANA_SIG_B,
            tairaSettlementTx: HASH_C,
            tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"CC".repeat(32)}`,
          },
        },
        {
          evidencePath: "/tmp/live-evidence.json",
          checkedAt: "2026-07-05T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      ...REQUIRED_PACKAGE_HASHES,
      evidencePath: "/tmp/live-evidence.json",
      checkedAt: "2026-07-05T00:00:00.000Z",
      tairaToSolana: {
        amount: "0.0001",
        amountBaseUnits: "100000",
        messageId: "aa".repeat(32),
        tairaSourceTx: "bb".repeat(32),
        solanaTxId: SOLANA_SIG_A,
        solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_SIG_A}?cluster=testnet`,
      },
      solanaToTaira: {
        amount: "0.0001",
        amountBaseUnits: "100000",
        messageId: "dd".repeat(32),
        solanaSourceTx: SOLANA_SIG_B,
        tairaSettlementTx: "cc".repeat(32),
        tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"cc".repeat(32)}`,
      },
    });
  });

  it("rejects Solana live evidence with non-route explorer links or zero amounts", () => {
    const evidence = {
      schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      ...REQUIRED_PACKAGE_HASHES,
      tairaToSolana: {
        amount: "0",
        messageId: HASH_A,
        tairaSourceTx: HASH_B,
        solanaTxId: SOLANA_SIG_A,
        solanaExplorerUrl: `https://evil.example/tx/${SOLANA_SIG_A}?cluster=testnet`,
      },
      solanaToTaira: {
        amount: "0.0001",
        messageId: HASH_D,
        solanaSourceTx: SOLANA_SIG_B,
        tairaSettlementTx: HASH_C,
        tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"cc".repeat(32)}`,
      },
    };

    expect(() => normalizeSolanaLiveTransferEvidence(evidence)).toThrow(
      "tairaToSolana.amount must be greater than zero.",
    );

    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...evidence,
        tairaToSolana: {
          ...evidence.tairaToSolana,
          amount: "0.0001",
        },
      }),
    ).toThrow("tairaToSolana.solanaExplorerUrl must use explorer.solana.com.");

    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...evidence,
        tairaToSolana: {
          ...evidence.tairaToSolana,
          amount: "0.0001",
          solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_SIG_B}?cluster=testnet`,
        },
      }),
    ).toThrow(
      `tairaToSolana.solanaExplorerUrl must use the /tx/${SOLANA_SIG_A} path.`,
    );

    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...evidence,
        tairaToSolana: {
          ...evidence.tairaToSolana,
          amount: "0.0001",
          solanaTxId: "5".repeat(64),
          solanaExplorerUrl: `https://explorer.solana.com/tx/${"5".repeat(64)}?cluster=testnet`,
        },
      }),
    ).toThrow(
      "tairaToSolana.solanaTxId must decode to a 64-byte Solana signature.",
    );
  });

  it("rejects completed live evidence without every governance package hash", () => {
    const fixture = buildAuthoritativeReadbackFixture();
    for (const key of Object.keys(REQUIRED_PACKAGE_HASHES)) {
      expect(() =>
        normalizeSolanaLiveTransferEvidence({
          ...fixture.liveEvidence,
          [key]: undefined,
        }),
      ).toThrow(`live evidence ${key} is required.`);
    }
  });

  it("rejects Solana live evidence that is not explicitly bound to XOR", () => {
    const evidence = {
      schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
      routeId: "taira_sol_xor",
      assetKey: "dot",
      ...REQUIRED_PACKAGE_HASHES,
      tairaToSolana: {
        amount: "0.0001",
        messageId: HASH_A,
        tairaSourceTx: HASH_B,
        solanaTxId: SOLANA_SIG_A,
        solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_SIG_A}?cluster=testnet`,
      },
      solanaToTaira: {
        amount: "0.0001",
        messageId: HASH_D,
        solanaSourceTx: SOLANA_SIG_B,
        tairaSettlementTx: HASH_C,
        tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"cc".repeat(32)}`,
      },
    };

    expect(() => normalizeSolanaLiveTransferEvidence(evidence)).toThrow(
      "live evidence assetKey must be xor.",
    );

    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...evidence,
        assetKey: "",
      }),
    ).toThrow("live evidence assetKey must be xor.");
  });

  it("rejects Solana live evidence that reuses transaction ids across directions", () => {
    const evidence = {
      schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      ...REQUIRED_PACKAGE_HASHES,
      tairaToSolana: {
        amount: "0.0001",
        messageId: HASH_A,
        tairaSourceTx: HASH_B,
        solanaTxId: SOLANA_SIG_A,
        solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_SIG_A}?cluster=testnet`,
      },
      solanaToTaira: {
        amount: "0.0001",
        messageId: HASH_D,
        solanaSourceTx: SOLANA_SIG_A,
        tairaSettlementTx: HASH_C,
        tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"cc".repeat(32)}`,
      },
    };

    expect(() => normalizeSolanaLiveTransferEvidence(evidence)).toThrow(
      "Solana live evidence transaction signatures must be distinct: tairaToSolana.solanaTxId and solanaToTaira.solanaSourceTx match.",
    );

    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...evidence,
        solanaToTaira: {
          ...evidence.solanaToTaira,
          solanaSourceTx: SOLANA_SIG_B,
          tairaSettlementTx: HASH_B,
          tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"bb".repeat(32)}`,
        },
      }),
    ).toThrow(
      "TAIRA live evidence transaction hashes must be distinct: tairaToSolana.tairaSourceTx and solanaToTaira.tairaSettlementTx match.",
    );
  });

  it("rejects zero TAIRA transaction and SCCP message identifiers", () => {
    const fixture = buildAuthoritativeReadbackFixture();
    const evidence = {
      schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      ...REQUIRED_PACKAGE_HASHES,
      tairaToSolana: {
        ...fixture.liveEvidence.tairaToSolana,
        messageId: "00".repeat(32),
      },
      solanaToTaira: fixture.liveEvidence.solanaToTaira,
    };

    expect(() => normalizeSolanaLiveTransferEvidence(evidence)).toThrow(
      "tairaToSolana.messageId must be non-zero.",
    );
  });

  it("requires and validates live evidence package hash bindings", () => {
    const liveEvidence = { ...REQUIRED_PACKAGE_HASHES };
    const diagnostics = {
      governance: {
        evidence: {
          planSha256: REQUIRED_PACKAGE_HASHES.governancePlanSha256,
          registrationArtifactSha256:
            REQUIRED_PACKAGE_HASHES.governanceRegistrationSha256,
          activationArtifactSha256:
            REQUIRED_PACKAGE_HASHES.governanceActivationSha256,
          publicRegistrySha256: REQUIRED_PACKAGE_HASHES.publicRegistrySha256,
        },
      },
    };

    expect(
      solanaLiveEvidencePackageHashProblems({ liveEvidence, diagnostics }),
    ).toEqual([]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence: {
          ...liveEvidence,
          governancePlanSha256: `0x${"99".repeat(32)}`,
        },
        diagnostics,
      }),
    ).toMatchObject([{ id: "live-evidence-governance-plan-hash" }]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence,
        diagnostics: {
          governance: {
            evidence: {
              ...diagnostics.governance.evidence,
              planSha256: "",
            },
          },
        },
      }),
    ).toMatchObject([{ id: "live-evidence-governance-plan-hash" }]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence,
        diagnostics: {
          governance: {
            evidence: {
              ...diagnostics.governance.evidence,
              planSha256: "not-a-hash",
            },
          },
        },
      }),
    ).toMatchObject([{ id: "live-evidence-governance-plan-hash" }]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence: {},
        diagnostics,
      }),
    ).toMatchObject([
      { id: "live-evidence-governance-plan-hash" },
      { id: "live-evidence-governance-registration-hash" },
      { id: "live-evidence-governance-activation-hash" },
      { id: "live-evidence-public-registry-hash" },
    ]);
  });

  it("requires authoritative finalized readback for both SCCP directions", async () => {
    const fixture = buildAuthoritativeReadbackFixture();
    const result = await verifySolanaLiveTransferReadbacks(fixture);

    expect(result).toMatchObject({
      ready: true,
      readOnly: true,
      solanaGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
      taira: {
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        networkPrefix: 369,
      },
      tairaToSolana: {
        solanaFinalize: {
          messageId: fixture.liveEvidence.tairaToSolana.messageId,
          amountBaseUnits: "100000",
          destinationProgramAddress:
            fixture.addresses.destinationProgramAddress,
          mint: fixture.addresses.tokenMintAddress,
        },
      },
      solanaToTaira: {
        solanaSource: {
          amountBaseUnits: "100000",
          sourceProgramAddress: fixture.addresses.sourceProgramAddress,
          mint: fixture.addresses.tokenMintAddress,
        },
        tairaSettlement: { status: "committed" },
      },
    });
  });

  it("fails closed on wrong or changing Solana cluster identity", async () => {
    const wrongCluster = buildAuthoritativeReadbackFixture();
    wrongCluster.readbacks.readSolanaGenesisHash = async () =>
      "EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
    await expect(
      verifySolanaLiveTransferReadbacks(wrongCluster),
    ).rejects.toThrow("Solana RPC is not canonical testnet.");

    const changingCluster = buildAuthoritativeReadbackFixture();
    let reads = 0;
    changingCluster.readbacks.readSolanaGenesisHash = async () => {
      reads += 1;
      return reads === 1
        ? SOLANA_TESTNET_GENESIS_HASH
        : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    };
    await expect(
      verifySolanaLiveTransferReadbacks(changingCluster),
    ).rejects.toThrow("Solana RPC cluster identity changed during readback.");
  });

  it("re-reads and pins the public TAIRA typed registry", async () => {
    const changingRegistry = buildAuthoritativeReadbackFixture();
    let reads = 0;
    changingRegistry.readbacks.readTairaRegistry = async () => {
      reads += 1;
      const registry = structuredClone(changingRegistry.registry);
      if (reads === 2) {
        registry.lanes[0].routes[0].activation = {
          activation: "staged",
          direction: null,
        };
      }
      return registry;
    };

    await expect(
      verifySolanaLiveTransferReadbacks(changingRegistry),
    ).rejects.toThrow(
      "taira_sol_xor must be bidirectional before production acceptance.",
    );
  });

  it("rejects legacy public manifests and a fourth Solana program role", async () => {
    const legacy = buildAuthoritativeReadbackFixture();
    legacy.preflightReport.manifestSource = "public";
    await expect(verifySolanaLiveTransferReadbacks(legacy)).rejects.toThrow(
      "exact v2 public typed-registry preflight",
    );

    const fourRole = buildAuthoritativeReadbackFixture();
    fourRole.preflightReport.registrySummary = {
      ...fourRole.preflightReport.registrySummary,
      programs: {
        ...fourRole.preflightReport.registrySummary.programs,
        outerVerifier: testPublicKey(13),
      },
    };
    await expect(verifySolanaLiveTransferReadbacks(fourRole)).rejects.toThrow(
      "program roles must contain exactly destination, nativeVerifier, source",
    );

    const publicFourRole = buildAuthoritativeReadbackFixture();
    publicFourRole.readbacks.readTairaRegistry = async () => {
      const registry = structuredClone(publicFourRole.registry);
      registry.lanes[0].routes[0].destination.deployment.outer_verifier_program_id =
        "0D".repeat(32);
      return registry;
    };
    await expect(
      verifySolanaLiveTransferReadbacks(publicFourRole),
    ).rejects.toThrow();

    const legacyReadback = buildAuthoritativeReadbackFixture();
    delete legacyReadback.readbacks.readTairaRegistry;
    legacyReadback.readbacks.readTairaRouteManifest = async () => ({
      manifests: [],
    });
    await expect(
      verifySolanaLiveTransferReadbacks(legacyReadback),
    ).rejects.toThrow(
      "Live evidence readback dependency readTairaRegistry is missing.",
    );
  });

  it.each([
    {
      name: "pruned transaction",
      mutate: (fixture) => {
        fixture.readbacks.readSolanaTransaction = async (signature) =>
          signature === SOLANA_SIG_A
            ? null
            : fixture.solanaTransactions.get(signature);
      },
      error: "TAIRA-to-Solana finalize transaction is missing or pruned.",
    },
    {
      name: "failed signature",
      mutate: (fixture) => {
        fixture.readbacks.readSolanaSignatureStatus = async (signature) => ({
          value: [
            {
              confirmationStatus:
                signature === SOLANA_SIG_A ? "confirmed" : "finalized",
              err: signature === SOLANA_SIG_A ? { InstructionError: 0 } : null,
            },
          ],
        });
      },
      error:
        "TAIRA-to-Solana finalize signature status is not a successful finalized transaction.",
    },
    {
      name: "failed transaction metadata",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(SOLANA_SIG_B).meta.err = {
          InstructionError: 0,
        };
      },
      error: "Solana-to-TAIRA source transaction failed on Solana.",
    },
    {
      name: "wrong bridge program",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].programId = testPublicKey(13);
      },
      error:
        "TAIRA-to-Solana finalize transaction must invoke the pinned SCCP program once.",
    },
    {
      name: "wrong mint",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].accounts[2] = testPublicKey(13);
      },
      error:
        "TAIRA-to-Solana finalize transaction accounts does not match the pinned account order.",
    },
    {
      name: "wrong native destination verifier",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].accounts[6] = testPublicKey(13);
      },
      error:
        "TAIRA-to-Solana finalize transaction accounts does not match the pinned account order.",
    },
    {
      name: "wrong destination replay receipt",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].accounts[7] = testPublicKey(13);
      },
      error:
        "TAIRA-to-Solana finalize transaction accounts does not match the pinned account order.",
    },
    {
      name: "missing destination account",
      mutate: (fixture) => {
        fixture.solanaTransactions
          .get(SOLANA_SIG_A)
          .transaction.message.instructions[0].accounts.pop();
      },
      error:
        "TAIRA-to-Solana finalize transaction account list is not canonical.",
    },
    {
      name: "extra destination account",
      mutate: (fixture) => {
        fixture.solanaTransactions
          .get(SOLANA_SIG_A)
          .transaction.message.instructions[0].accounts.push(testPublicKey(13));
      },
      error:
        "TAIRA-to-Solana finalize transaction account list is not canonical.",
    },
    {
      name: "wrong source state account",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_B,
        ).transaction.message.instructions[0].accounts[1] = testPublicKey(13);
      },
      error:
        "Solana-to-TAIRA source burn transaction accounts does not match the pinned account order.",
    },
    {
      name: "wrong source burn receipt",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_B,
        ).transaction.message.instructions[0].accounts[5] = testPublicKey(13);
      },
      error:
        "Solana-to-TAIRA source burn transaction accounts does not match the pinned account order.",
    },
    {
      name: "missing source account",
      mutate: (fixture) => {
        fixture.solanaTransactions
          .get(SOLANA_SIG_B)
          .transaction.message.instructions[0].accounts.pop();
      },
      error:
        "Solana-to-TAIRA source burn transaction account list is not canonical.",
    },
    {
      name: "extra source account",
      mutate: (fixture) => {
        fixture.solanaTransactions
          .get(SOLANA_SIG_B)
          .transaction.message.instructions[0].accounts.push(testPublicKey(13));
      },
      error:
        "Solana-to-TAIRA source burn transaction account list is not canonical.",
    },
    {
      name: "legacy text source nonce",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_B,
        ).transaction.message.instructions[0].data = fixture.buildReverseData({
          nonce: Buffer.from("13"),
        });
      },
      error:
        "Solana-to-TAIRA source burn transaction nonce must be an eight-byte little-endian u64.",
    },
    {
      name: "zero source nonce",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_B,
        ).transaction.message.instructions[0].data = fixture.buildReverseData({
          nonce: u64Le(0),
        });
      },
      error:
        "Solana-to-TAIRA source burn transaction nonce must be greater than zero.",
    },
    {
      name: "source nonce replay receipt mismatch",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_B,
        ).transaction.message.instructions[0].data = fixture.buildReverseData({
          nonce: u64Le(14),
        });
      },
      error:
        "Solana-to-TAIRA source burn transaction accounts does not match the pinned account order.",
    },
    {
      name: "source event slot mismatch",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(SOLANA_SIG_B).slot = 12346;
      },
      error:
        "TAIRA settlement transaction source event hash does not match the Solana burn.",
    },
    {
      name: "wrong route",
      mutate: (fixture) => {
        fixture.tairaMessages.get(
          fixture.liveEvidence.tairaToSolana.messageId,
        ).routeId = "invented_sol_xor";
      },
      error:
        "taira_to_solana SCCP message route, transaction, message, or amount binding is invalid.",
    },
    {
      name: "wrong message",
      mutate: (fixture) => {
        fixture.tairaTransactions.get(
          fixture.liveEvidence.tairaToSolana.tairaSourceTx,
        ).messageId = "ee".repeat(32);
      },
      error:
        "TAIRA source transaction SCCP route, message, asset, or amount binding is invalid.",
    },
    {
      name: "wrong on-chain public-input message",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].data = fixture.buildForwardData(
          "ee".repeat(32),
        );
      },
      error:
        "TAIRA-to-Solana finalize transaction message id does not match live evidence.",
    },
    {
      name: "wrong amount",
      mutate: (fixture) => {
        fixture.tairaTransactions.get(
          fixture.liveEvidence.solanaToTaira.tairaSettlementTx,
        ).amountBaseUnits = "99999";
      },
      error:
        "TAIRA settlement transaction SCCP route, message, asset, or amount binding is invalid.",
    },
    {
      name: "wrong on-chain instruction amount",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].data = fixture.buildForwardData(
          fixture.liveEvidence.tairaToSolana.messageId,
          "99999",
        );
      },
      error:
        "TAIRA-to-Solana finalize transaction amount does not match live evidence.",
    },
    {
      name: "wrong destination binding pin",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).transaction.message.instructions[0].data = fixture.buildForwardData(
          fixture.liveEvidence.tairaToSolana.messageId,
          fixture.liveEvidence.tairaToSolana.amountBaseUnits,
          "ee".repeat(32),
        );
      },
      error:
        "TAIRA-to-Solana finalize transaction destination binding hash does not match the manifest.",
    },
    {
      name: "unsuccessful Solana state delta",
      mutate: (fixture) => {
        fixture.solanaTransactions.get(
          SOLANA_SIG_A,
        ).meta.postTokenBalances[0].uiTokenAmount.amount = "100008";
      },
      error:
        "TAIRA-to-Solana finalize transaction token balance delta does not match the transfer amount.",
    },
    {
      name: "extra same-account token mutation",
      mutate: (fixture) => {
        const transaction = fixture.solanaTransactions.get(SOLANA_SIG_A);
        transaction.meta.innerInstructions[0].instructions.push({
          programId: SPL_TOKEN_PROGRAM_ID,
          parsed: {
            type: "burn",
            info: {
              mint: fixture.addresses.tokenMintAddress,
              account: fixture.addresses.destinationTokenAccount,
              amount: "1",
            },
          },
        });
      },
      error:
        "TAIRA-to-Solana finalize transaction is missing the exact successful SPL mintTo CPI.",
    },
    {
      name: "unsuccessful TAIRA state delta",
      mutate: (fixture) => {
        fixture.tairaTransactions.get(
          fixture.liveEvidence.tairaToSolana.tairaSourceTx,
        ).stateDeltas[0].applied = false;
      },
      error:
        "TAIRA source transaction does not prove the exact successful XOR state delta.",
    },
    {
      name: "wrong TAIRA recipient",
      mutate: (fixture) => {
        fixture.tairaTransactions.get(
          fixture.liveEvidence.solanaToTaira.tairaSettlementTx,
        ).recipient = "sorau-invented-recipient";
      },
      error:
        "TAIRA settlement transaction recipient does not match the Solana burn.",
    },
    {
      name: "wrong dynamic Solana account binding",
      mutate: (fixture) => {
        fixture.tairaMessages.get(
          fixture.liveEvidence.tairaToSolana.messageId,
        ).accountBindings.destinationTokenAccount = testPublicKey(13);
      },
      error:
        "taira_to_solana SCCP message destinationTokenAccount account binding is invalid.",
    },
    {
      name: "wrong proof payload hash",
      mutate: (fixture) => {
        fixture.tairaMessages.get(
          fixture.liveEvidence.tairaToSolana.messageId,
        ).payloadHash = "ee".repeat(32);
      },
      error:
        "taira_to_solana SCCP message payload hash does not match the Solana proof.",
    },
    {
      name: "wrong Solana burn event hash",
      mutate: (fixture) => {
        fixture.tairaTransactions.get(
          fixture.liveEvidence.solanaToTaira.tairaSettlementTx,
        ).sourceEventHash = "ee".repeat(32);
      },
      error:
        "TAIRA settlement transaction source event hash does not match the Solana burn.",
    },
    {
      name: "missing SCCP message",
      mutate: (fixture) => {
        fixture.tairaMessages.delete(
          fixture.liveEvidence.solanaToTaira.messageId,
        );
      },
      error: "solana_to_taira SCCP message is missing or pruned.",
    },
    {
      name: "uncommitted TAIRA settlement",
      mutate: (fixture) => {
        fixture.tairaTransactions.get(
          fixture.liveEvidence.solanaToTaira.tairaSettlementTx,
        ).status = "pending";
      },
      error: "TAIRA settlement transaction is not committed.",
    },
    {
      name: "wrong exact registry pin",
      mutate: (fixture) => {
        const message = fixture.tairaMessages.get(
          fixture.liveEvidence.solanaToTaira.messageId,
        );
        message.registryPins = {
          ...message.registryPins,
          tokenMintAddress: testPublicKey(13),
        };
      },
      error:
        "solana_to_taira SCCP message exact pins do not match the public typed registry.",
    },
    {
      name: "retired manifest pins",
      mutate: (fixture) => {
        const message = fixture.tairaMessages.get(
          fixture.liveEvidence.solanaToTaira.messageId,
        );
        message.manifestPins = message.registryPins;
        delete message.registryPins;
      },
      error: "solana_to_taira SCCP message uses retired manifest pins.",
    },
  ])("rejects invented live evidence: $name", async ({ mutate, error }) => {
    const fixture = buildAuthoritativeReadbackFixture();
    mutate(fixture);
    await expect(verifySolanaLiveTransferReadbacks(fixture)).rejects.toThrow(
      error,
    );
  });

  it("rejects live transfers that reuse deployment or route-canary transactions", async () => {
    const fixture = buildAuthoritativeReadbackFixture();
    fixture.liveEvidence.tairaToSolana.solanaTxId = SOLANA_SIG_CANARY_A;

    await expect(verifySolanaLiveTransferReadbacks(fixture)).rejects.toThrow(
      "tairaToSolana.solanaTxId reuses a deployment or route-canary transaction.",
    );
  });

  it("removes stale successful media before any blocked diagnostic run", async () => {
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-live-video-"),
    );
    const successful = [
      "sccp-solana-live-video.json",
      "sccp-solana-live-video.vtt",
      "sccp-solana-live-video.mp4",
    ];
    const diagnostic = "sccp-solana-live-video-blocked.vtt";
    try {
      await Promise.all(
        successful.map((file) =>
          writeFile(path.join(outputDir, file), "stale success"),
        ),
      );
      await writeFile(path.join(outputDir, diagnostic), "diagnostic only");

      await removeStaleSuccessfulArtifacts(outputDir);

      for (const file of successful) {
        await expect(access(path.join(outputDir, file))).rejects.toThrow();
      }
      await expect(
        readFile(path.join(outputDir, diagnostic), "utf8"),
      ).resolves.toBe("diagnostic only");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("uses the full 2 GiB capture cap for streamed final MP4 hashing", () => {
    const mp4Limit = 2 * 1024 * 1024 * 1024;
    expect(solanaLiveVideoMediaArtifactMaxBytes("video/mp4")).toBe(mp4Limit);
    expect(
      solanaLiveVideoMediaArtifactSizeAllowed({
        mediaType: "video/mp4",
        size: mp4Limit,
      }),
    ).toBe(true);
    expect(
      solanaLiveVideoMediaArtifactSizeAllowed({
        mediaType: "video/mp4",
        size: mp4Limit + 1,
      }),
    ).toBe(false);
    expect(solanaLiveVideoMediaArtifactMaxBytes("text/vtt")).toBe(
      4 * 1024 * 1024,
    );
  });

  it("verifies Solana live MP4 media streams for completed transcript evidence", () => {
    const report = buildSolanaLiveVideoMediaVerification({
      ffprobe: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "subtitle", codec_name: "mov_text" },
        ],
        format: { duration: "25.000000" },
      },
      subtitleSummary: {
        cueCount: 5,
        numberedStepCount: 5,
      },
    });

    expect(report).toMatchObject({
      ready: true,
      durationSeconds: 25,
      streams: {
        video: { present: true, codec: "h264", width: 1280, height: 720 },
        audio: { present: true, codec: "aac" },
        subtitle: { present: true, codec: "mov_text" },
      },
      subtitleCueCount: 5,
      numberedStepCount: 5,
      blockers: [],
    });
  });

  it("qualifies a changing, audible, duration-bounded real screen capture", () => {
    const frameHashes = Array.from({ length: 41 }, (_, index) =>
      `${(index % 8).toString(16)}`.repeat(32),
    );
    const inspection = buildSolanaLiveCaptureInspection({
      ffprobe: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "41.25", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      },
      frameHashes,
      audioFrameHashes: Array.from({ length: 41 }, (_, index) =>
        `${(index % 7).toString(16)}`.repeat(32),
      ),
      audioMaxVolumeDb: -12.5,
      videoEssenceSha256: HASH_B,
      audioEssenceSha256: HASH_C,
      size: 1_000_000,
      sha256: HASH_A,
      semanticWitnessAnalysis: {
        ready: true,
        semanticallyBound: true,
        reviewAuthentication: {
          ready: true,
          authenticated: true,
        },
      },
    });

    expect(inspection).toMatchObject({
      ready: true,
      verifiedRealCapture: true,
      sampledFrameCount: 41,
      uniqueFrameCount: 8,
      audioMaxVolumeDb: -12.5,
      blockers: [],
    });
  });

  it("rejects unrelated changing and audible media without semantic receipt witnesses", () => {
    const inspection = buildSolanaLiveCaptureInspection({
      ffprobe: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "41", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      },
      frameHashes: Array.from({ length: 41 }, (_, index) =>
        `${(index % 8).toString(16)}`.repeat(32),
      ),
      audioFrameHashes: Array.from({ length: 41 }, (_, index) =>
        `${(index % 7).toString(16)}`.repeat(32),
      ),
      audioMaxVolumeDb: -10,
      size: 1_000_000,
      sha256: HASH_A,
    });

    expect(inspection.ready).toBe(false);
    expect(inspection.blockers).toContain("capture-semantic-witness");
  });

  it("refuses ready output when the generated MP4 differs from source frames, audio, semantic markers, or VTT", () => {
    const sourceCapture = {
      sampledFrameSha256: HASH_A,
      audioSampleSha256: HASH_B,
      semanticWitnessAnalysis: { markers: [{ id: "public-registry" }] },
    };
    const binding = buildSolanaGeneratedLiveVideoBinding({
      inspection: {
        blockers: [],
        sampledFrameSha256: HASH_C,
        audioSampleSha256: HASH_B,
        semanticWitnessAnalysis: { markers: [{ id: "unrelated-media" }] },
      },
      sourceCapture,
      embeddedSubtitleSummary: {
        cueCount: 8,
        numberedStepCount: 8,
        cueTextSha256: HASH_C,
      },
      subtitleSummary: {
        cueCount: 8,
        numberedStepCount: 8,
        cueTextSha256: HASH_D,
      },
    });

    expect(binding).toMatchObject({
      ready: false,
      verifiedGeneratedMedia: false,
      subtitleMatches: false,
      sourceContentMatches: false,
      blockers: expect.arrayContaining([
        "generated-embedded-vtt-binding",
        "generated-source-capture-content-binding",
      ]),
    });
  });

  it("binds source and final media to identical essence, shape, and stream timelines", () => {
    const videoTimeline = {
      ready: true,
      timeBase: "1/10240",
      startTime: "0.000000",
      duration: "41.000000",
      frameCount: 410,
    };
    const audioTimeline = {
      ready: true,
      timeBase: "1/48000",
      startTime: "0.000000",
      duration: "41.000000",
      frameCount: 1923,
    };
    const sourceCapture = {
      blockers: [],
      durationSeconds: 41,
      streams: {
        video: { codec: "h264", width: 1280, height: 720 },
        audio: { codec: "aac" },
      },
      streamShape: {
        videoCount: 1,
        audioCount: 1,
        subtitleCount: 0,
        unexpectedCount: 0,
      },
      streamTimeline: { video: videoTimeline, audio: audioTimeline },
      sampledFrameSha256: HASH_A,
      audioSampleSha256: HASH_B,
      videoEssenceSha256: HASH_C,
      audioEssenceSha256: HASH_D,
      semanticWitnessAnalysis: { markers: [{ id: "public-registry" }] },
    };
    const inspection = {
      ...structuredClone(sourceCapture),
      streamShape: {
        videoCount: 1,
        audioCount: 1,
        subtitleCount: 1,
        subtitleCodec: "mov_text",
        unexpectedCount: 0,
      },
    };
    const subtitle = {
      cueCount: 8,
      numberedStepCount: 8,
      cueTextSha256: HASH_A,
      cueTimelineSha256: HASH_B,
    };
    const bound = buildSolanaGeneratedLiveVideoBinding({
      inspection,
      sourceCapture,
      embeddedSubtitleSummary: subtitle,
      subtitleSummary: subtitle,
    });
    expect(bound).toMatchObject({
      ready: true,
      sourceContentMatches: true,
      streamTimelineMatches: true,
      streamShapeMatches: true,
    });

    const shifted = structuredClone(inspection);
    shifted.streamTimeline.video.startTime = "0.100000";
    expect(
      buildSolanaGeneratedLiveVideoBinding({
        inspection: shifted,
        sourceCapture,
        embeddedSubtitleSummary: subtitle,
        subtitleSummary: subtitle,
      }),
    ).toMatchObject({
      ready: false,
      streamTimelineMatches: false,
      sourceContentMatches: false,
    });

    expect(
      buildSolanaGeneratedLiveVideoBinding({
        inspection,
        sourceCapture,
        embeddedSubtitleSummary: {
          ...subtitle,
          cueTimelineSha256: HASH_C,
        },
        subtitleSummary: subtitle,
      }),
    ).toMatchObject({
      ready: false,
      subtitleMatches: false,
      sourceContentMatches: true,
      blockers: expect.arrayContaining(["generated-embedded-vtt-binding"]),
    });
  });

  it("rejects subtitle timing shifts even when ordered cue text is unchanged", () => {
    const cues = [
      {
        start: "00:00.000",
        end: "00:02.000",
        text: "Step 1: public registry",
        step: 1,
      },
      {
        start: "00:02.000",
        end: "00:04.000",
        text: "Step 2: finalized transfer",
        step: 2,
      },
    ];
    const shifted = structuredClone(cues);
    shifted[1].start = "00:02.250";
    shifted[1].end = "00:04.250";
    const originalSummary = summarizeSolanaLiveVideoSubtitleCues(cues);
    const shiftedSummary = summarizeSolanaLiveVideoSubtitleCues(shifted);

    expect(shiftedSummary.cueTextSha256).toBe(originalSummary.cueTextSha256);
    expect(shiftedSummary.cueTimelineSha256).not.toBe(
      originalSummary.cueTimelineSha256,
    );
  });

  it("rejects a blank, silent capture even when container streams exist", () => {
    const inspection = buildSolanaLiveCaptureInspection({
      ffprobe: {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "41", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      },
      frameHashes: Array(41).fill("a".repeat(32)),
      audioFrameHashes: Array(41).fill("b".repeat(32)),
      audioMaxVolumeDb: null,
      size: 10_000,
      sha256: HASH_A,
    });

    expect(inspection.ready).toBe(false);
    expect(inspection.blockers).toEqual(
      expect.arrayContaining([
        "capture-frame-variation",
        "capture-non-silent-audio",
      ]),
    );
  });

  it("fails Solana live MP4 media verification without subtitle evidence", () => {
    const report = buildSolanaLiveVideoMediaVerification({
      ffprobe: {
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "aac" },
        ],
        format: { duration: "25.000000" },
      },
      subtitleSummary: {
        cueCount: 0,
        numberedStepCount: 0,
      },
    });

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([
      "subtitle-stream",
      "subtitle-cues",
      "numbered-steps",
    ]);
  });

  it("rejects a non-H.264 video stream even when audio and subtitles exist", () => {
    const report = buildSolanaLiveVideoMediaVerification({
      ffprobe: {
        streams: [
          { codec_type: "video", codec_name: "vp9" },
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "subtitle", codec_name: "mov_text" },
        ],
        format: { duration: "25.000000" },
      },
      subtitleSummary: { cueCount: 5, numberedStepCount: 5 },
    });
    expect(report).toMatchObject({
      ready: false,
      blockers: ["video-codec-h264"],
    });
  });
});
