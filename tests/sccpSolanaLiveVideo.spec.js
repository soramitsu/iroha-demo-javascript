/* global BigInt */
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  buildSolanaLiveTransferEvidenceTemplate,
  buildSolanaLiveVideoSuccessEvidencePolicy,
  buildSolanaLiveVideoMediaVerification,
  buildBlockedSolanaLiveVideoTranscript,
  buildSolanaLiveVideoBlockedDiagnostics,
  normalizeSolanaLiveTransferEvidence,
  parseArgs,
  removeStaleSuccessfulArtifacts,
  runSccpSolanaLiveVideoGate,
  SOLANA_TESTNET_GENESIS_HASH,
  solanaLiveEvidencePackageHashProblems,
  solanaLiveVideoSuccessPrerequisiteProblems,
  verifySolanaLiveTransferReadbacks,
} from "../scripts/e2e/sccp-solana-live-video.mjs";

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
const ACTIVATION_PACKAGE_HASH = `0x${"44".repeat(32)}`;
const OPERATOR_HANDOFF_HASH = `0x${"77".repeat(32)}`;
const REQUIRED_PACKAGE_HASHES = {
  activationPackageHash: ACTIVATION_PACKAGE_HASH,
  operatorHandoffHash: OPERATOR_HANDOFF_HASH,
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
  const addresses = {
    bridgeProgramAddress: testPublicKey(1),
    tokenMintAddress: testPublicKey(2),
    sourceBridgeProgramAddress: testPublicKey(3),
    verifierProgramAddress: testPublicKey(4),
    nativeVerifierProgramAddress: testPublicKey(12),
    verifierStateAddress: testPublicKey(5),
    sourceStateAddress: testPublicKey(6),
    mintAuthorityAddress: testPublicKey(7),
    forwardPayer: testPublicKey(8),
    destinationTokenAccount: testPublicKey(9),
    reverseOwner: testPublicKey(10),
    sourceTokenAccount: testPublicKey(11),
  };
  const hashes = {
    verifierCodeHash: "01".repeat(32),
    verifierKeyHash: "02".repeat(32),
    destinationBindingHash: "03".repeat(32),
    sourceTrustAnchorHash: "04".repeat(32),
    consensusVerifierHash: "05".repeat(32),
    messageInclusionVerifierHash: "06".repeat(32),
    finalityPolicyHash: "07".repeat(32),
    sourceStateVerifierHash: "08".repeat(32),
    adapterVerifierVkHash: "09".repeat(32),
    adapterDeploymentReceiptHash: "0a".repeat(32),
  };
  const settlementAssetDefinitionId = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
  const preflightReport = {
    ready: true,
    manifestSource: "public",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    taira: {
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      networkPrefix: 369,
    },
    solana: {
      rpcUrl: "https://api.testnet.solana.com",
      network: "solana-testnet",
      caipChainId: TESTNET_CAIP_CHAIN_ID,
    },
    checks: [
      {
        id: "solana-deployment-addresses",
        status: "pass",
        evidence: {
          bridgeProgramAddress: addresses.bridgeProgramAddress,
          tokenMintAddress: addresses.tokenMintAddress,
          sourceBridgeProgramAddress: addresses.sourceBridgeProgramAddress,
          verifierProgramAddress: addresses.verifierProgramAddress,
          nativeVerifierProgramAddress: addresses.nativeVerifierProgramAddress,
          verifierStateAddress: addresses.verifierStateAddress,
          sourceStateAddress: addresses.sourceStateAddress,
        },
      },
      {
        id: "solana-rollout-material",
        status: "pass",
        evidence: {
          verifierCodeHash: `0x${hashes.verifierCodeHash}`,
          verifierKeyHash: `0x${hashes.verifierKeyHash}`,
          destinationBindingHash: `0x${hashes.destinationBindingHash}`,
        },
      },
      {
        id: "solana-live-token-state-evidence",
        status: "pass",
        evidence: { expectedMintAuthority: addresses.mintAuthorityAddress },
      },
      {
        id: "source-lane-material",
        status: "pass",
        evidence: {
          verifier: {
            sourceTrustAnchorHash: `0x${hashes.sourceTrustAnchorHash}`,
            consensusVerifierHash: `0x${hashes.consensusVerifierHash}`,
            messageInclusionVerifierHash: `0x${hashes.messageInclusionVerifierHash}`,
            finalityPolicyHash: `0x${hashes.finalityPolicyHash}`,
            sourceStateVerifierHash: `0x${hashes.sourceStateVerifierHash}`,
          },
          adapter: {
            adapterVerifierVkHash: `0x${hashes.adapterVerifierVkHash}`,
            deploymentReceiptHash: `0x${hashes.adapterDeploymentReceiptHash}`,
          },
        },
      },
      {
        id: "taira-burn-record-material",
        status: "pass",
        evidence: { settlementAssetDefinitionId },
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
      new PublicKey(addresses.verifierStateAddress).toBuffer(),
      Buffer.from(normalizedEvidence.tairaToSolana.messageId, "hex"),
    ],
    addresses.verifierProgramAddress,
  );
  const sourceBurnReceiptAddress = deriveProgramAddress(
    [
      Buffer.from("sccp-source-burn-receipt", "utf8"),
      new PublicKey(addresses.sourceStateAddress).toBuffer(),
      new PublicKey(addresses.reverseOwner).toBuffer(),
      sourceNonceBytes,
    ],
    addresses.sourceBridgeProgramAddress,
  );
  const forwardAccounts = [
    addresses.forwardPayer,
    addresses.verifierStateAddress,
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
    .update(new PublicKey(addresses.sourceBridgeProgramAddress).toBuffer())
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
        programId: addresses.verifierProgramAddress,
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
        programId: addresses.sourceBridgeProgramAddress,
        accounts: reverseAccounts,
        data: reverseData,
        tokenAccount: addresses.sourceTokenAccount,
        before: "200000",
        after: "100000",
        mutationType: "burn",
      }),
    ],
  ]);
  const pins = {
    bridgeProgramAddress: addresses.bridgeProgramAddress,
    tokenMintAddress: addresses.tokenMintAddress,
    sourceBridgeProgramAddress: addresses.sourceBridgeProgramAddress,
    verifierProgramAddress: addresses.verifierProgramAddress,
    nativeVerifierProgramAddress: addresses.nativeVerifierProgramAddress,
    verifierStateAddress: addresses.verifierStateAddress,
    sourceStateAddress: addresses.sourceStateAddress,
    mintAuthorityAddress: addresses.mintAuthorityAddress,
    ...hashes,
    settlementAssetDefinitionId,
  };
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
    manifestPins: pins,
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
    manifestPins: pins,
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
      chain_id: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      network_prefix: 369,
    }),
    readTairaTransaction: async (hash) => tairaTransactions.get(hash) ?? null,
    readTairaRouteManifest: async () => ({
      manifests: [
        {
          routeId: "taira_sol_xor",
          assetKey: "xor",
          solanaNetwork: "solana-testnet",
          ...pins,
        },
      ],
    }),
    readTairaSccpMessage: async (messageId) =>
      tairaMessages.get(messageId) ?? null,
  };
  return {
    addresses,
    hashes,
    pins,
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
  });

  const canonicalSuccessDiagnostics = () => ({
    publishReadiness: {
      toriiUrl: "https://taira-validator-1.sora.org",
      mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      publicationTargetReady: true,
      directPublicNodePublicationReady: true,
      target: {
        toriiUrl: "https://taira-validator-1.sora.org",
        mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
        targetKind: "explicit-taira-public-node",
        canonicalPublicNodeRoot: true,
        canonicalRolloutTargetReady: true,
        mcpMatchesToriiRoot: true,
      },
    },
  });

  it("permits success qualification only on fresh canonical governance-pinned roots", () => {
    const policy = buildSolanaLiveVideoSuccessEvidencePolicy({
      options: {
        toriiUrl: "https://taira-validator-1.sora.org/",
        solanaRpcUrl: "https://api.testnet.solana.com/",
        skipSolanaRpc: false,
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
    });
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
      diagnostics.publishReadiness.toriiUrl = toriiUrl;
      diagnostics.publishReadiness.target.toriiUrl = toriiUrl;
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
        productionRequirements: "/tmp/coherent-forged-requirements.json",
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
    expect(policy.prerequisiteReportOverrideIds).toEqual([
      "production-gate",
      "production-requirements",
    ]);
  });

  it("rejects self-attested canonical target booleans when the MCP root is mismatched", () => {
    const diagnostics = canonicalSuccessDiagnostics();
    diagnostics.publishReadiness.target.mcpUrl =
      "https://taira-validator-2.sora.org/v1/mcp";
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
          chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
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

  it("summarizes blocked live-video prerequisites without claiming MP4 evidence", () => {
    const diagnostics = buildSolanaLiveVideoBlockedDiagnostics({
      productionRequirementsReport: {
        readyToBuildIsi: false,
        readyToSubmitWithCurrentRuntime: false,
        blockers: [
          { id: "destination-proof-admission" },
          { id: "source-verifier-material" },
        ],
      },
      productionRequirementsPath: "/tmp/requirements.json",
      publishReadinessReport: {
        readyForRuntimeSigner: false,
        readyToSubmitWithCurrentRuntime: false,
        publicEndpoint: {
          endpointReady: true,
          preflightReady: false,
          mcpTransactionTools: {
            ready: true,
            presentTools: [
              "iroha.transactions.submit",
              "iroha.transactions.submit_and_wait",
            ],
            missingTools: [],
          },
        },
        runtimeSigning: {
          authorityReady: false,
          permissionAudit: {
            authority: null,
            checked: false,
            ready: false,
            requiredPermission: "CanManageSccpRouteManifests",
            hasRequiredPermission: false,
          },
          privateKeyEnvPresent: false,
        },
        blockers: [{ id: "runtime-signing-key" }],
      },
      publishReadinessPath: "/tmp/publish-readiness.json",
      routePublicationRequestReport: {
        schema: "iroha-demo-sccp-solana-route-publication-request/v1",
        readyForRouteManagerReview: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        reviewPackageHash: `0x${"88".repeat(32)}`,
        manifest: {
          routeIdentityReady: true,
          productionReadyForIsi: false,
          manifestSha256: `0x${"99".repeat(32)}`,
          error:
            "Production Solana route manifest must not include manifest.disabledReason.",
        },
        proofMaterialBundle: {
          readyForProofMaterialCeremony: true,
          bundleManifestSha256: `0x${"33".repeat(32)}`,
          includedArtifactCount: 16,
        },
        blockers: [{ id: "route-manifest-production-shape" }],
        upstreamBlockerIds: ["production-requirements"],
      },
      routePublicationRequestPath: "/tmp/route-publication-request.json",
      smokeReadinessReport: {
        schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
        routeId: "taira_sol_xor",
        ready: false,
        blockerIds: [
          "route-preflight",
          "walletconnect-project-id",
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
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
          {
            id: "smoke-readiness-runbook-contract",
            status: "pass",
            detail:
              "Solana live smoke-readiness exposes a complete operator runbook.",
            evidence: {
              problems: [],
            },
          },
        ],
        nextActions: [
          { id: "refresh-solana-route-preflight" },
          { id: "configure-solana-walletconnect" },
          {
            id: "publish-solana-production-prover-packages",
            command: [
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "proof-material-bundle",
            ],
            requiredInputs: [
              "solana-destination-production-prover-package",
              "solana-source-production-prover-package",
            ],
          },
        ],
        missingProductionInputs: [
          { id: "solana-public-route-report" },
          { id: "walletconnect-project-id" },
          { id: "solana-destination-production-prover-package" },
          { id: "solana-source-production-prover-package" },
        ],
      },
      smokeReadinessPath: "/tmp/smoke-readiness.json",
      handoffVerificationReport: {
        ready: true,
        statuses: [
          { id: "handoff-schema", status: "pass" },
          { id: "route-canary-signature-finalized", status: "pass" },
        ],
        blockers: [],
      },
      handoffVerificationPath: "/tmp/handoff.verification.json",
      proofMaterialBundleReport: {
        schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: `0x${"33".repeat(32)}`,
        includedArtifactCount: 16,
        blockers: [],
        upstreamBlockerIds: ["production-requirements", "publish-readiness"],
      },
      proofMaterialBundlePath: "/tmp/proof-material-bundle.json",
      activationPackageReport: {
        schema: "iroha-demo-sccp-solana-activation-package/v1",
        readyForActivationReview: false,
        productionActivationReady: false,
        readyToSubmitWithCurrentRuntime: false,
        publicRouteAlreadyPublished: false,
        activationPackageHash: `0x${"44".repeat(32)}`,
        requiredRouteManager: {
          authority: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          authorityReady: false,
          authorityFormatReady: false,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: false,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
        publicTaira: {
          ready: false,
          publicSolanaLane: {
            present: true,
            ready: false,
            check: {
              status: "fail",
              detail: "Solana lane disabled",
            },
            blockerIds: ["immutable Solana verifier program"],
          },
        },
        artifacts: {
          proofMaterialBundle: {
            present: true,
            schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
            stableHash: `0x${"33".repeat(32)}`,
            blockerIds: ["production-requirements"],
            readyForProofMaterialCeremony: true,
            productionRouteReady: false,
            readyToSubmitWithCurrentRuntime: false,
          },
          routePublicationRequest: {
            present: true,
            schema: "iroha-demo-sccp-solana-route-publication-request/v1",
            stableHash: `0x${"88".repeat(32)}`,
            blockerIds: ["route-manifest-production-shape"],
            readyForRouteManagerReview: true,
            productionRouteReady: false,
            readyToSubmitWithCurrentRuntime: false,
          },
          routeManagerAccessRequest: {
            present: true,
            schema: "iroha-demo-sccp-solana-route-manager-access-request/v1",
            stableHash: `0x${"99".repeat(32)}`,
            blockerIds: ["route-manager-authority"],
            readyForOperatorReview: false,
            accessReady: false,
            readyToSubmitWithCurrentRuntime: false,
          },
          laneActivationRequest: {
            present: true,
            schema: "iroha-demo-sccp-solana-lane-activation-request/v1",
            stableHash: `0x${"55".repeat(32)}`,
            blockerIds: ["public-solana-lane"],
            ready: true,
            productionReady: false,
            submitReady: false,
          },
          operatorHandoff: {
            present: true,
            schema: "iroha-demo-sccp-solana-operator-handoff/v1",
            stableHash: `0x${"66".repeat(32)}`,
            blockerIds: ["route-manager-authority"],
            ready: false,
            productionReady: false,
            submitReady: false,
          },
          publishReadiness: {
            present: true,
            schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
            blockerIds: ["runtime-signing-key"],
            readyToSubmitWithCurrentRuntime: false,
          },
          productionRequirements: {
            present: true,
            schema: "iroha-demo-sccp-solana-production-requirements/v1",
            blockerIds: ["source-verifier-material"],
            readyToBuildIsi: false,
          },
          smokeReadiness: {
            present: true,
            schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
            blockerIds: [
              "route-preflight",
              "walletconnect-project-id",
              "destination-prover-module-url",
              "source-prover-module-url",
            ],
            ready: false,
            productionReady: false,
            submitReady: false,
            failedCheckIds: [
              "route-preflight",
              "walletconnect-project-id",
              "destination-prover-module-url",
              "source-prover-module-url",
            ],
            missingProductionInputIds: [
              "solana-public-route-report",
              "walletconnect-project-id",
              "solana-destination-production-prover-package",
              "solana-source-production-prover-package",
            ],
            nextActionIds: [
              "refresh-solana-route-preflight",
              "configure-solana-walletconnect",
              "publish-solana-production-prover-packages",
            ],
          },
        },
        blockers: [
          { id: "public-solana-lane" },
          { id: "runtime-route-manager" },
        ],
        nextActionDetails: [
          {
            id: "activate-public-solana-lane",
            title: "Activate public Solana lane",
            blockedBy: [{ id: "public-solana-lane" }],
            command: ["npm", "run", "e2e:sccp:solana-preflight"],
            requiredInputs: ["public-solana-lane-activation"],
          },
        ],
      },
      activationPackagePath: "/tmp/activation-package.json",
      deploymentVideoTranscriptReport: {
        schema: "iroha-demo-sccp-solana-deployment-video/v1",
        ready: false,
        routeId: "taira_sol_xor",
        checkedAt: "2026-07-05T00:10:00.000Z",
        deployment: {
          activationPackage: {
            activationPackageHash: `0x${"44".repeat(32)}`,
            smokeReadiness: {
              present: true,
              schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
              blockerIds: [
                "route-preflight",
                "walletconnect-project-id",
                "destination-prover-module-url",
                "source-prover-module-url",
              ],
              ready: false,
              productionReady: false,
              submitReady: false,
              failedCheckIds: [
                "route-preflight",
                "walletconnect-project-id",
                "destination-prover-module-url",
                "source-prover-module-url",
              ],
              missingProductionInputIds: [
                "solana-public-route-report",
                "walletconnect-project-id",
                "solana-destination-production-prover-package",
                "solana-source-production-prover-package",
              ],
              nextActionIds: [
                "refresh-solana-route-preflight",
                "configure-solana-walletconnect",
                "publish-solana-production-prover-packages",
              ],
            },
          },
        },
        videoArtifacts: [
          {
            path: "/tmp/sccp-solana-deployment-video.mp4",
            mediaType: "video/mp4",
          },
          {
            path: "/tmp/sccp-solana-deployment-video.vtt",
            mediaType: "text/vtt",
          },
        ],
      },
      deploymentVideoTranscriptPath: "/tmp/sccp-solana-deployment-video.json",
      operatorHandoffReport: {
        schema: "iroha-demo-sccp-solana-operator-handoff/v1",
        readyForOperatorReview: false,
        productionRouteReady: false,
        readyToPublish: false,
        publicRouteAlreadyPublished: false,
        handoffHash: `0x${"77".repeat(32)}`,
        requiredRouteManager: {
          authority: "EFopJQRwoAgQcSL124wixwbTvgTvidHy1GQbEyJPQKTf",
          authorityReady: false,
          authorityFormatReady: false,
          requiredPermission: "CanManageSccpRouteManifests",
          hasRequiredPermission: false,
        },
        runtimeSigning: {
          privateKeyEnv: "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
          privateKeyEnvPresent: false,
          privateKeyStoredInReport: false,
        },
        artifacts: {
          proofMaterialBundle: {
            present: true,
            schema: "iroha-demo-sccp-solana-proof-material-bundle/v1",
            stableHash: `0x${"33".repeat(32)}`,
            blockerIds: ["production-requirements"],
            readyForProofMaterialCeremony: true,
            productionRouteReady: false,
            readyToSubmitWithCurrentRuntime: false,
          },
          routePublicationRequest: {
            present: true,
            schema: "iroha-demo-sccp-solana-route-publication-request/v1",
            stableHash: `0x${"88".repeat(32)}`,
            blockerIds: ["route-manifest-production-shape"],
            readyForRouteManagerReview: true,
            productionRouteReady: false,
            readyToSubmitWithCurrentRuntime: false,
          },
          routeManagerAccessRequest: {
            present: true,
            schema: "iroha-demo-sccp-solana-route-manager-access-request/v1",
            stableHash: `0x${"99".repeat(32)}`,
            blockerIds: ["route-manager-authority"],
            readyForOperatorReview: false,
            accessReady: false,
            readyToSubmitWithCurrentRuntime: false,
          },
          laneActivationRequest: {
            present: true,
            schema: "iroha-demo-sccp-solana-lane-activation-request/v1",
            stableHash: `0x${"55".repeat(32)}`,
            blockerIds: ["public-solana-lane"],
            readyForLaneGovernanceReview: true,
            publicLaneReady: false,
            productionProofMaterialReady: false,
            productionLaneReady: false,
          },
          publishReadiness: {
            present: true,
            schema: "iroha-demo-sccp-solana-route-publish-readiness/v1",
            blockerIds: ["runtime-signing-key"],
            readyToSubmitWithCurrentRuntime: false,
          },
          productionRequirements: {
            present: true,
            schema: "iroha-demo-sccp-solana-production-requirements/v1",
            blockerIds: ["source-verifier-material"],
            readyToBuildIsi: false,
          },
          smokeReadiness: {
            present: true,
            schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
            blockerIds: [
              "route-preflight",
              "walletconnect-project-id",
              "destination-prover-module-url",
              "source-prover-module-url",
            ],
            ready: false,
            failedCheckIds: [
              "route-preflight",
              "walletconnect-project-id",
              "destination-prover-module-url",
              "source-prover-module-url",
            ],
            missingProductionInputIds: [
              "solana-public-route-report",
              "walletconnect-project-id",
              "solana-destination-production-prover-package",
              "solana-source-production-prover-package",
            ],
            nextActionIds: [
              "refresh-solana-route-preflight",
              "configure-solana-walletconnect",
              "publish-solana-production-prover-packages",
            ],
          },
        },
        blockers: [
          { id: "route-manager-authority" },
          { id: "runtime-signing-key" },
        ],
        nextActions: [
          "grant-taira-route-manager-access",
          "set-runtime-route-manager-private-key",
        ],
        nextActionDetails: [
          {
            id: "set-runtime-route-manager-private-key",
            title: "Set runtime route-manager private key",
            blockedBy: [{ id: "runtime-signing-key" }],
            command: [
              "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY=<runtime-only-private-key-hex>",
              "npm",
              "run",
              "sccp:solana:deploy",
              "--",
              "publish-route-manifest",
              "--submit",
              "true",
            ],
            requiredInputs: ["SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY"],
          },
        ],
      },
      operatorHandoffPath: "/tmp/operator-handoff.json",
      productionGateReport: {
        schema: "iroha-demo-sccp-solana-production-gate/v1",
        ready: false,
        checkedAt: "2026-07-05T00:00:00.000Z",
        checks: [
          {
            id: "activation-package-ready",
            status: "fail",
            detail: "activation blocked",
          },
          {
            id: "operator-handoff-ready",
            status: "fail",
            detail: "handoff blocked",
          },
        ],
        nextRequiredActions: [
          "Activate the public TAIRA Solana SCCP lane.",
          "Publish a production-ready route manifest.",
        ],
        nextActionDetails: [
          {
            id: "record-bidirectional-live-video",
            title: "Record bidirectional live-transfer MP4",
            blockedBy: [{ id: "live-bidirectional-video" }],
            command: [
              "npm",
              "run",
              "e2e:sccp:solana-video",
              "--",
              "--live-evidence",
              "<completed-solana-bidirectional-live-evidence.json>",
              "--production-gate",
              "output/sccp-solana-production-gate/sccp-solana-production-gate.json",
              "--smoke-readiness",
              "output/sccp-solana-smoke-readiness/latest.json",
              "--activation-package",
              "output/sccp-solana-deploy/taira-solana-xor-activation-package.json",
              "--operator-handoff",
              "output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json",
              "--skip-solana-rpc",
              "false",
            ],
            requiredInputs: [
              "public-solana-route-preflight-ready",
              "walletconnect-project-id",
              "production-solana-prover-packages",
              "funded-taira-and-solana-test-wallets",
              "completed-solana-bidirectional-live-evidence",
            ],
          },
        ],
      },
      productionGatePath: "/tmp/production-gate.json",
    });

    expect(diagnostics).toMatchObject({
      productionRequirements: {
        present: true,
        readyToBuildIsi: false,
        blockerIds: ["destination-proof-admission", "source-verifier-material"],
      },
      publishReadiness: {
        present: true,
        endpointReady: true,
        preflightReady: false,
        mcpTransactionToolsReady: true,
        authorityReady: false,
        authorityPermissionReady: false,
        privateKeyEnvPresent: false,
        blockerIds: ["runtime-signing-key"],
      },
      routePublicationRequest: {
        present: true,
        readyForRouteManagerReview: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        reviewPackageHash: `0x${"88".repeat(32)}`,
        manifest: {
          routeIdentityReady: true,
          productionReadyForIsi: false,
          manifestSha256: `0x${"99".repeat(32)}`,
        },
        proofMaterialBundle: {
          readyForProofMaterialCeremony: true,
          bundleManifestSha256: `0x${"33".repeat(32)}`,
          includedArtifactCount: 16,
        },
        blockerIds: ["route-manifest-production-shape"],
        upstreamBlockerIds: ["production-requirements"],
      },
      sourceMaterialHandoffVerification: {
        present: true,
        ready: true,
        statusCount: 2,
        blockerIds: [],
      },
      proofMaterialBundle: {
        present: true,
        readyForProofMaterialCeremony: true,
        productionRouteReady: false,
        readyToSubmitWithCurrentRuntime: false,
        productionProofMaterialIncluded: false,
        bundleManifestSha256: `0x${"33".repeat(32)}`,
        includedArtifactCount: 16,
        blockerIds: [],
        upstreamBlockerIds: ["production-requirements", "publish-readiness"],
      },
      activationPackage: {
        present: true,
        readyForActivationReview: false,
        productionActivationReady: false,
        readyToSubmitWithCurrentRuntime: false,
        activationPackageHash: `0x${"44".repeat(32)}`,
        publicSolanaLane: {
          present: true,
          ready: false,
          blockerIds: ["immutable Solana verifier program"],
        },
        artifacts: {
          laneActivationRequest: {
            present: true,
            stableHash: `0x${"55".repeat(32)}`,
            blockerIds: ["public-solana-lane"],
            ready: true,
            productionReady: false,
          },
          operatorHandoff: {
            present: true,
            stableHash: `0x${"66".repeat(32)}`,
            blockerIds: ["route-manager-authority"],
          },
          smokeReadiness: {
            present: true,
            ready: false,
            blockerIds: SMOKE_PRODUCTION_BLOCKER_IDS,
            failedCheckIds: [
              "route-preflight",
              "walletconnect-project-id",
              "destination-prover-module-url",
              "source-prover-module-url",
            ],
            missingProductionInputIds: [
              "solana-public-route-report",
              "walletconnect-project-id",
              "solana-destination-production-prover-package",
              "solana-source-production-prover-package",
            ],
          },
        },
        blockerIds: ["public-solana-lane", "runtime-route-manager"],
      },
      deploymentVideo: {
        present: true,
        ready: false,
        routeId: "taira_sol_xor",
        checkedAt: "2026-07-05T00:10:00.000Z",
        activationPackageHash: `0x${"44".repeat(32)}`,
        activationSmokeReadiness: {
          present: true,
          ready: false,
          blockerIds: SMOKE_PRODUCTION_BLOCKER_IDS,
          failedCheckIds: [
            "route-preflight",
            "walletconnect-project-id",
            "destination-prover-module-url",
            "source-prover-module-url",
          ],
          missingProductionInputIds: [
            "solana-public-route-report",
            "walletconnect-project-id",
            "solana-destination-production-prover-package",
            "solana-source-production-prover-package",
          ],
          nextActionIds: [
            "refresh-solana-route-preflight",
            "configure-solana-walletconnect",
            "publish-solana-production-prover-packages",
          ],
        },
        videoArtifacts: [
          {
            path: "/tmp/sccp-solana-deployment-video.mp4",
            mediaType: "video/mp4",
          },
          {
            path: "/tmp/sccp-solana-deployment-video.vtt",
            mediaType: "text/vtt",
          },
        ],
      },
      operatorHandoff: {
        present: true,
        readyForOperatorReview: false,
        productionRouteReady: false,
        readyToPublish: false,
        handoffHash: `0x${"77".repeat(32)}`,
        artifacts: {
          laneActivationRequest: {
            present: true,
            readyForLaneGovernanceReview: true,
            publicLaneReady: false,
            productionProofMaterialReady: false,
            productionLaneReady: false,
          },
          smokeReadiness: {
            present: true,
            ready: false,
            blockerIds: SMOKE_PRODUCTION_BLOCKER_IDS,
            failedCheckIds: [
              "route-preflight",
              "walletconnect-project-id",
              "destination-prover-module-url",
              "source-prover-module-url",
            ],
            missingProductionInputIds: [
              "solana-public-route-report",
              "walletconnect-project-id",
              "solana-destination-production-prover-package",
              "solana-source-production-prover-package",
            ],
          },
        },
        blockerIds: ["route-manager-authority", "runtime-signing-key"],
        nextActionIds: [
          "grant-taira-route-manager-access",
          "set-runtime-route-manager-private-key",
        ],
      },
      productionGate: {
        present: true,
        ready: false,
        checkedAt: "2026-07-05T00:00:00.000Z",
        failedChecks: [
          {
            id: "activation-package-ready",
            status: "fail",
            detail: "activation blocked",
          },
          {
            id: "operator-handoff-ready",
            status: "fail",
            detail: "handoff blocked",
          },
        ],
      },
      smokeReadiness: {
        present: true,
        ready: false,
        blockerIds: SMOKE_PRODUCTION_BLOCKER_IDS,
        runbookReady: true,
        runbookDetail:
          "Solana live smoke-readiness exposes a complete operator runbook.",
        runbookProblems: [],
        failedChecks: [
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
        nextActionIds: [
          "refresh-solana-route-preflight",
          "configure-solana-walletconnect",
          "publish-solana-production-prover-packages",
        ],
        missingProductionInputIds: [
          "solana-public-route-report",
          "walletconnect-project-id",
          "solana-destination-production-prover-package",
          "solana-source-production-prover-package",
        ],
      },
    });
    expect(
      solanaLiveVideoSuccessPrerequisiteProblems({ diagnostics }).map(
        (problem) => problem.id,
      ),
    ).toEqual([
      "production-requirements-ready",
      "publish-readiness-submit-ready",
      "route-publication-request-submit-ready",
      "route-publication-request-production-ready",
      "proof-material-bundle-production-ready",
      "proof-material-bundle-submit-ready",
      "proof-material-included",
      "activation-package-submit-ready",
      "activation-public-solana-lane-ready",
      "operator-handoff-publish-ready",
      "smoke-readiness-ready",
      "production-gate-non-video-checks",
    ]);

    const transcript = buildBlockedSolanaLiveVideoTranscript({
      preflightReport: {
        ready: false,
        publicSolanaCapability: {
          chain: "sol",
          productionReady: false,
          productionReadiness: {
            blockers: [
              "source verifier material is not production-ready for this SCCP lane",
            ],
          },
        },
        publicSolanaLane: {
          chain: "sol",
          productionReady: false,
          destinationRollout: {
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
            ],
          },
        },
        checks: [
          { id: "taira-endpoint", status: "pass", detail: "ok" },
          {
            id: "route-manifest-shape",
            status: "fail",
            detail: "No taira_sol_xor manifest found.",
          },
        ],
      },
      reason: "blocked for test",
      diagnostics,
      checkedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(transcript.ready).toBe(false);
    expect(transcript.videoArtifacts).toEqual([]);
    expect(transcript.preflightReady).toBe(false);
    expect(transcript.failedChecks).toEqual([
      {
        id: "route-manifest-shape",
        status: "fail",
        detail: "No taira_sol_xor manifest found.",
      },
    ]);
    expect(transcript.checks).toEqual(transcript.failedChecks);
    expect(transcript.blockers.map((blocker) => blocker.id)).toEqual([
      "preflight:route-manifest-shape",
      "destination-proof-admission",
      "source-verifier-material",
      "runtime-signing-key",
      "route-manifest-production-shape",
      ...SMOKE_PRODUCTION_BLOCKER_IDS,
      "public-solana-lane",
      "runtime-route-manager",
      "route-manager-authority",
      "production-gate:activation-package-ready",
      "production-gate:operator-handoff-ready",
    ]);
    expect(transcript.nextActionIds).toEqual([
      "smoke:refresh-solana-route-preflight",
      "smoke:configure-solana-walletconnect",
      "smoke:publish-solana-production-prover-packages",
      "activation-smoke:refresh-solana-route-preflight",
      "activation-smoke:configure-solana-walletconnect",
      "activation-smoke:publish-solana-production-prover-packages",
      "operator:grant-taira-route-manager-access",
      "operator:set-runtime-route-manager-private-key",
      "production-gate:record-bidirectional-live-video",
      "activation:activate-public-solana-lane",
    ]);
    expect(transcript.nextActionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "smoke:publish-solana-production-prover-packages",
          command: [
            "npm",
            "run",
            "sccp:solana:deploy",
            "--",
            "proof-material-bundle",
          ],
          requiredInputs: [
            "solana-destination-production-prover-package",
            "solana-source-production-prover-package",
          ],
        }),
        expect.objectContaining({
          id: "activation:activate-public-solana-lane",
          blockedBy: [{ id: "public-solana-lane", detail: null }],
          command: ["npm", "run", "e2e:sccp:solana-preflight"],
          requiredInputs: ["public-solana-lane-activation"],
        }),
        expect.objectContaining({
          id: "operator:set-runtime-route-manager-private-key",
          command: [
            "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY=<runtime-only-private-key-hex>",
            "npm",
            "run",
            "sccp:solana:deploy",
            "--",
            "publish-route-manifest",
            "--submit",
            "true",
          ],
          requiredInputs: ["SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY"],
        }),
        expect.objectContaining({
          id: "production-gate:record-bidirectional-live-video",
          command: [
            "npm",
            "run",
            "e2e:sccp:solana-video",
            "--",
            "--live-evidence",
            "<completed-solana-bidirectional-live-evidence.json>",
            "--production-gate",
            "output/sccp-solana-production-gate/sccp-solana-production-gate.json",
            "--smoke-readiness",
            "output/sccp-solana-smoke-readiness/latest.json",
            "--activation-package",
            "output/sccp-solana-deploy/taira-solana-xor-activation-package.json",
            "--operator-handoff",
            "output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json",
            "--skip-solana-rpc",
            "false",
          ],
          requiredInputs: [
            "public-solana-route-preflight-ready",
            "walletconnect-project-id",
            "production-solana-prover-packages",
            "funded-taira-and-solana-test-wallets",
            "completed-solana-bidirectional-live-evidence",
          ],
        }),
      ]),
    );
    expect(transcript.nextActionDetails.map((action) => action.id)).not.toEqual(
      expect.arrayContaining([
        "activation-smoke:refresh-solana-route-preflight",
        "activation-smoke:configure-solana-walletconnect",
        "activation-smoke:publish-solana-production-prover-packages",
        "production-gate:Activate the public TAIRA Solana SCCP lane.",
      ]),
    );
    expect(JSON.stringify(transcript.nextActionDetails)).not.toContain(
      "do-not-leak",
    );
    expect(transcript.diagnostics.sourceMaterialHandoffVerification.ready).toBe(
      true,
    );
    expect(
      transcript.diagnostics.proofMaterialBundle.readyForProofMaterialCeremony,
    ).toBe(true);
    expect(
      transcript.diagnostics.proofMaterialBundle.bundleManifestSha256,
    ).toBe(`0x${"33".repeat(32)}`);
    expect(
      transcript.diagnostics.routePublicationRequest.readyForRouteManagerReview,
    ).toBe(true);
    expect(
      transcript.diagnostics.routePublicationRequest.reviewPackageHash,
    ).toBe(`0x${"88".repeat(32)}`);
    expect(transcript.activationPackage.activationPackageHash).toBe(
      `0x${"44".repeat(32)}`,
    );
    expect(transcript.deploymentVideo.activationPackageHash).toBe(
      `0x${"44".repeat(32)}`,
    );
    expect(transcript.deploymentVideo.videoArtifacts).toEqual([
      {
        path: "/tmp/sccp-solana-deployment-video.mp4",
        mediaType: "video/mp4",
      },
      {
        path: "/tmp/sccp-solana-deployment-video.vtt",
        mediaType: "text/vtt",
      },
    ]);
    expect(
      transcript.deploymentVideo.activationSmokeReadiness.failedCheckIds,
    ).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(
      transcript.deploymentVideo.activationSmokeReadiness.blockerIds,
    ).toEqual(SMOKE_PRODUCTION_BLOCKER_IDS);
    expect(
      transcript.activationPackage.artifacts.laneActivationRequest.ready,
    ).toBe(true);
    expect(
      transcript.activationPackage.artifacts.smokeReadiness.failedCheckIds,
    ).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(
      transcript.activationPackage.artifacts.smokeReadiness.blockerIds,
    ).toEqual(SMOKE_PRODUCTION_BLOCKER_IDS);
    expect(
      transcript.activationPackage.artifacts.smokeReadiness.nextActionIds,
    ).toEqual([
      "refresh-solana-route-preflight",
      "configure-solana-walletconnect",
      "publish-solana-production-prover-packages",
    ]);
    expect(transcript.operatorHandoff.handoffHash).toBe(`0x${"77".repeat(32)}`);
    expect(transcript.operatorHandoff.artifacts.proofMaterialBundle.ready).toBe(
      true,
    );
    expect(
      transcript.operatorHandoff.artifacts.routePublicationRequest.ready,
    ).toBe(true);
    expect(
      transcript.operatorHandoff.artifacts.routeManagerAccessRequest.ready,
    ).toBe(false);
    expect(transcript.operatorHandoff.artifacts.publishReadiness.ready).toBe(
      false,
    );
    expect(
      transcript.operatorHandoff.artifacts.productionRequirements.ready,
    ).toBe(false);
    expect(
      transcript.operatorHandoff.artifacts.laneActivationRequest
        .productionLaneReady,
    ).toBe(false);
    expect(
      transcript.operatorHandoff.artifacts.laneActivationRequest.ready,
    ).toBe(true);
    expect(
      transcript.operatorHandoff.artifacts.smokeReadiness.failedCheckIds,
    ).toEqual([
      "route-preflight",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
    ]);
    expect(
      transcript.operatorHandoff.artifacts.smokeReadiness.blockerIds,
    ).toEqual(SMOKE_PRODUCTION_BLOCKER_IDS);
    expect(
      transcript.productionGate.failedChecks.map((check) => check.id),
    ).toEqual(["activation-package-ready", "operator-handoff-ready"]);
    expect(transcript.diagnostics.smokeReadiness.failedChecks).toEqual([
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
    ]);
    expect(
      transcript.diagnostics.publishReadiness.mcpTransactionTools.presentTools,
    ).toEqual([
      "iroha.transactions.submit",
      "iroha.transactions.submit_and_wait",
    ]);
    expect(
      transcript.diagnostics.publishReadiness.permissionAudit
        .requiredPermission,
    ).toBe("CanManageSccpRouteManifests");
    expect(
      transcript.publicSolanaCapability.productionReadiness.blockers,
    ).toEqual([
      "source verifier material is not production-ready for this SCCP lane",
    ]);
    expect(transcript.publicSolanaLane.destinationRollout.blockers).toEqual([
      "immutable Solana verifier program is not deployed for this SCCP lane",
    ]);
  });

  it("allows a success video only when the production gate is blocked solely by the live-video check", () => {
    expect(
      solanaLiveVideoSuccessPrerequisiteProblems({
        diagnostics: {
          productionRequirements: {
            readyToBuildIsi: true,
          },
          publishReadiness: {
            readyToSubmitWithCurrentRuntime: true,
          },
          routePublicationRequest: {
            readyToSubmitWithCurrentRuntime: true,
            productionRouteReady: true,
          },
          sourceMaterialHandoffVerification: {
            ready: true,
          },
          proofMaterialBundle: {
            productionRouteReady: true,
            readyToSubmitWithCurrentRuntime: true,
            productionProofMaterialIncluded: true,
          },
          activationPackage: {
            readyToSubmitWithCurrentRuntime: true,
            publicSolanaLane: {
              ready: true,
            },
          },
          operatorHandoff: {
            readyToPublish: true,
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
          activationPackageHash: `0x${"44".repeat(32)}`,
          operatorHandoffHash: `0x${"77".repeat(32)}`,
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
      activationPackageHash: `0x${"44".repeat(32)}`,
      operatorHandoffHash: `0x${"77".repeat(32)}`,
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

  it("rejects completed live evidence without both production package hashes", () => {
    const fixture = buildAuthoritativeReadbackFixture();
    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...fixture.liveEvidence,
        activationPackageHash: undefined,
      }),
    ).toThrow("live evidence activationPackageHash is required.");
    expect(() =>
      normalizeSolanaLiveTransferEvidence({
        ...fixture.liveEvidence,
        operatorHandoffHash: undefined,
      }),
    ).toThrow("live evidence operatorHandoffHash is required.");
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
    const liveEvidence = {
      activationPackageHash: `0x${"44".repeat(32)}`,
      operatorHandoffHash: `0x${"77".repeat(32)}`,
    };
    const diagnostics = {
      activationPackage: {
        activationPackageHash: `0x${"44".repeat(32)}`,
      },
      operatorHandoff: {
        handoffHash: `0x${"77".repeat(32)}`,
      },
    };

    expect(
      solanaLiveEvidencePackageHashProblems({ liveEvidence, diagnostics }),
    ).toEqual([]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence: {
          ...liveEvidence,
          activationPackageHash: `0x${"55".repeat(32)}`,
        },
        diagnostics,
      }),
    ).toEqual([
      {
        id: "live-evidence-activation-package-hash",
        detail: `activationPackageHash 0x${"55".repeat(32)} does not match diagnostics value 0x${"44".repeat(32)}.`,
      },
    ]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence,
        diagnostics: {
          activationPackage: {},
          operatorHandoff: diagnostics.operatorHandoff,
        },
      }),
    ).toEqual([
      {
        id: "live-evidence-activation-package-hash",
        detail:
          "activationPackageHash is missing from the freshly loaded production package.",
      },
    ]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence,
        diagnostics: {
          activationPackage: {
            activationPackageHash: "not-a-hash",
          },
          operatorHandoff: diagnostics.operatorHandoff,
        },
      }),
    ).toEqual([
      {
        id: "live-evidence-activation-package-hash",
        detail:
          "activationPackageHash expected hash is invalid: activationPackageHash expected hash must be a 32-byte transaction/message hash.",
      },
    ]);

    expect(
      solanaLiveEvidencePackageHashProblems({
        liveEvidence: {},
        diagnostics,
      }),
    ).toEqual([
      {
        id: "live-evidence-activation-package-hash",
        detail: "activationPackageHash is required in live evidence.",
      },
      {
        id: "live-evidence-operator-handoff-hash",
        detail: "operatorHandoffHash is required in live evidence.",
      },
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
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        networkPrefix: 369,
      },
      tairaToSolana: {
        solanaFinalize: {
          messageId: fixture.liveEvidence.tairaToSolana.messageId,
          amountBaseUnits: "100000",
          bridgeProgramAddress: fixture.addresses.verifierProgramAddress,
          mint: fixture.addresses.tokenMintAddress,
        },
      },
      solanaToTaira: {
        solanaSource: {
          amountBaseUnits: "100000",
          sourceBridgeProgramAddress:
            fixture.addresses.sourceBridgeProgramAddress,
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

  it("re-reads and pins the public TAIRA route manifest", async () => {
    const wrongManifest = buildAuthoritativeReadbackFixture();
    wrongManifest.readbacks.readTairaRouteManifest = async () => ({
      manifests: [
        {
          routeId: "taira_sol_xor",
          assetKey: "xor",
          solanaNetwork: "solana-testnet",
          ...wrongManifest.pins,
          tokenMintAddress: testPublicKey(13),
        },
      ],
    });

    await expect(
      verifySolanaLiveTransferReadbacks(wrongManifest),
    ).rejects.toThrow(
      "Public taira_sol_xor manifest tokenMintAddress pin is invalid.",
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
      name: "wrong manifest pin",
      mutate: (fixture) => {
        const message = fixture.tairaMessages.get(
          fixture.liveEvidence.solanaToTaira.messageId,
        );
        message.manifestPins = {
          ...message.manifestPins,
          tokenMintAddress: testPublicKey(13),
        };
      },
      error:
        "solana_to_taira SCCP message tokenMintAddress does not match the public manifest.",
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
});
