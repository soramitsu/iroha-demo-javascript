import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  buildWalletConfidentialMetadata,
  createWalletConfidentialNote,
  deriveWalletConfidentialNullifierHex,
  deriveWalletConfidentialOwnerTagHex,
  deriveWalletConfidentialReceiveAddress,
} from "../electron/confidentialWallet";
import {
  decryptKaigiPayload,
  decryptKaigiPayloadWithSecret,
  generateKaigiX25519KeyPair,
} from "../electron/kaigiCrypto";
import { deriveTronTestSignerAddressFromPrivateKey } from "../electron/tronTestSigner";

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? "OK" : "ERR",
  headers: {
    get: (name: string) =>
      name.toLowerCase() === "content-type" ? "application/json" : null,
  },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const htmlResponse = (body: string, status: number, statusText = "ERR") => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: {
    get: (name: string) =>
      name.toLowerCase() === "content-type" ? "text/html" : null,
  },
  json: async () => {
    throw new Error("Response is not JSON");
  },
  text: async () => body,
});

const ALICE_ACCOUNT_ID =
  "testuﾛ1PｸCｶrﾑhyﾜｴﾄhｳﾔSqP2GFGﾗヱﾐｹﾇﾏzﾍｵﾐMﾇﾖﾄksJヱRRJXVB";
const BOB_ACCOUNT_ID = "testuﾛ1Prﾇuﾉﾉ4ﾒdﾛﾑｲﾄn5tﾆﾒrsR9ﾋ2Gｷ7gWeFzyﾁﾋﾁAHﾌTJQQ4L";
const LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID =
  "61CtjvNd9T3THAR65GsMVHr82Bjc";
const RELAY_TX_HASH = "ab".repeat(32);
const MINAMOTO_CHAIN_ID = "00000000-0000-0000-0000-000000000000";
const TRON_BROADCAST_PRIVATE_KEY = new Uint8Array(32).fill(7);
const OTHER_TRON_BROADCAST_PRIVATE_KEY = new Uint8Array(32).fill(8);
const TRON_BROADCAST_ADDRESS_BASE58 =
  deriveTronTestSignerAddressFromPrivateKey(
    TRON_BROADCAST_PRIVATE_KEY,
  ).base58;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(
    hex
      .trim()
      .replace(/^0x/iu, "")
      .match(/.{2}/gu)
      ?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );

const tronPayloadHexFromPrivateKey = (
  privateKey = TRON_BROADCAST_PRIVATE_KEY,
): string => {
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  const addressHash = keccak_256(publicKey.slice(1));
  return `41${Buffer.from(addressHash.slice(-20)).toString("hex")}`;
};

const exposedEd25519PrivateKey = (privateKeyHex: string): string =>
  `ed25519:802620${privateKeyHex.toUpperCase()}`;

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const protobufVarint = (value: bigint): Uint8Array => {
  const out: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (remaining);
  return Uint8Array.from(out);
};

const protobufKey = (field: number, wireType: number): Uint8Array =>
  protobufVarint((BigInt(field) << 3n) | BigInt(wireType));

const protobufBytesField = (field: number, value: Uint8Array): Uint8Array =>
  concatBytes(
    protobufKey(field, 2),
    protobufVarint(BigInt(value.length)),
    value,
  );

const protobufU64Field = (field: number, value: bigint): Uint8Array =>
  concatBytes(protobufKey(field, 0), protobufVarint(value));

const buildTronBroadcastTriggerRawDataHex = (
  input: {
    ownerPayload?: string;
    contractPayload?: string;
    dataHex?: string;
    feeLimit?: bigint;
  } = {},
): string => {
  const owner = hexToBytes(
    input.ownerPayload ?? tronPayloadHexFromPrivateKey(),
  );
  const contract = hexToBytes(
    input.contractPayload ?? tronPayloadHexFromPrivateKey(),
  );
  const data = hexToBytes(input.dataHex ?? "abcdef01");
  const trigger = concatBytes(
    protobufBytesField(1, owner),
    protobufBytesField(2, contract),
    protobufBytesField(4, data),
  );
  const any = concatBytes(
    protobufBytesField(
      1,
      new TextEncoder().encode(
        "type.googleapis.com/protocol.TriggerSmartContract",
      ),
    ),
    protobufBytesField(2, trigger),
  );
  const contractEntry = concatBytes(
    protobufU64Field(1, 31n),
    protobufBytesField(2, any),
  );
  return Buffer.from(
    concatBytes(
      protobufBytesField(1, Uint8Array.from([0x12, 0x34])),
      protobufBytesField(4, Uint8Array.from(Array(8).fill(0x56))),
      protobufU64Field(8, 123_456_789n),
      protobufBytesField(11, contractEntry),
      protobufU64Field(14, 123_450_000n),
      protobufU64Field(18, input.feeLimit ?? 50_000_000n),
    ),
  ).toString("hex");
};

const signTronRawDataHex = (
  rawDataHex: string,
  privateKey = TRON_BROADCAST_PRIVATE_KEY,
): string => {
  const signature = secp256k1.sign(
    Uint8Array.from(
      createHash("sha256").update(Buffer.from(rawDataHex, "hex")).digest(),
    ),
    privateKey,
    {
      prehash: false,
      lowS: true,
    },
  );
  const out = new Uint8Array(65);
  out.set(signature.toCompactRawBytes());
  out[64] = signature.recovery;
  return Buffer.from(out).toString("hex");
};

const signedTronBroadcastTransaction = (
  rawDataHex = buildTronBroadcastTriggerRawDataHex(),
) => ({
  txID: createHash("sha256")
    .update(Buffer.from(rawDataHex, "hex"))
    .digest("hex"),
  raw_data: {
    contract: [
      {
        type: "TriggerSmartContract",
        parameter: {
          type_url: "type.googleapis.com/protocol.TriggerSmartContract",
          value: {
            owner_address: tronPayloadHexFromPrivateKey(),
            contract_address: tronPayloadHexFromPrivateKey(),
            data: "abcdef01",
          },
        },
      },
    ],
    timestamp: 1,
    expiration: 2,
  },
  raw_data_hex: rawDataHex,
  signature: [signTronRawDataHex(rawDataHex)],
});

const buildNrt0Frame = (payload: Buffer) => {
  const header = Buffer.alloc(40);
  header.write("NRT0", 0, "ascii");
  header.writeBigUInt64LE(BigInt(payload.length), 23);
  return Buffer.concat([header, payload]);
};

const unwrapNrt0Frame = (payload: Buffer) => {
  if (
    payload.length < 40 ||
    payload.subarray(0, 4).toString("ascii") !== "NRT0"
  ) {
    return payload;
  }
  const payloadLength = payload.readBigUInt64LE(23);
  return payload.subarray(payload.length - Number(payloadLength));
};

const versionedPayload = (payload: Buffer) =>
  Buffer.concat([Buffer.from([0x01]), unwrapNrt0Frame(payload)]);

const mocks = vi.hoisted(() => ({
  exposedApi: null as any,
  clipboardWriteTextMock: vi.fn(),
  ipcInvokeMock: vi.fn(),
  vaultAvailable: true,
  storedAccountSecrets: new Map<string, string>(),
  storedReceiveKeys: new Map<string, Record<string, unknown>>(),
  normalizeCanonicalAccountIdLiteralMock: vi.fn(),
  normalizeCompatAccountIdLiteralMock: vi.fn(),
  requestFaucetFundsWithPuzzleMock: vi.fn(),
  getTransactionStatusMock: vi.fn(),
  getStatusSnapshotMock: vi.fn(),
  getExplorerMetricsMock: vi.fn(),
  getSumeragiStatusTypedMock: vi.fn(),
  getSccpCapabilitiesMock: vi.fn(),
  getSccpProofManifestsMock: vi.fn(),
  getSccpMessageProofArtifactMock: vi.fn(),
  getSccpMessageProofJobMock: vi.fn(),
  submitBridgeProofMock: vi.fn(),
  submitBridgeMessageMock: vi.fn(),
  listKaigiRelaysMock: vi.fn(),
  getKaigiRelayMock: vi.fn(),
  getKaigiCallMock: vi.fn(),
  resolveAliasMock: vi.fn(),
  getExplorerAccountQrMock: vi.fn(),
  listAccountAssetsMock: vi.fn(),
  listAccountTransactionsMock: vi.fn(),
  getConfigurationMock: vi.fn(),
  getGovernanceUnlockStatsTypedMock: vi.fn(),
  governanceProposeDeployContractMock: vi.fn(),
  getVerifyingKeyTypedMock: vi.fn(),
  nodeFetchMock: vi.fn(),
  buildKaigiRosterJoinProofMock: vi.fn(
    (input?: { rosterRootHex?: string | null }) => ({
      commitment: Buffer.from("01".repeat(32), "hex"),
      nullifier: Buffer.from("02".repeat(32), "hex"),
      rosterRoot: Buffer.from(
        String(input?.rosterRootHex ?? "03".repeat(32)),
        "hex",
      ),
      proof: Buffer.from("roster-proof", "utf8"),
      commitmentHex: "01".repeat(32),
      nullifierHex: "02".repeat(32),
      rosterRootHex: String(input?.rosterRootHex ?? "03".repeat(32)),
      proofBase64: Buffer.from("roster-proof", "utf8").toString("base64"),
    }),
  ),
  buildShieldTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("shield-xor", "utf8"),
  })),
  buildUnshieldTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("unshield", "utf8"),
  })),
  buildZkTransferTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("zk-transfer", "utf8"),
  })),
  buildConfidentialTransferProofV2Mock: vi.fn(
    (input?: { rootHintHex?: string }) => ({
      nullifiers: [Buffer.from("11".repeat(32), "hex")],
      outputCommitments: [Buffer.from("22".repeat(32), "hex")],
      root: Buffer.from(String(input?.rootHintHex ?? "44".repeat(32)), "hex"),
      proof: Buffer.from("transfer-proof", "utf8"),
    }),
  ),
  buildConfidentialUnshieldProofV2Mock: vi.fn(() => ({
    nullifiers: [Buffer.from("11".repeat(32), "hex")],
    root: Buffer.from("44".repeat(32), "hex"),
    proof: Buffer.from("unshield-proof", "utf8"),
  })),
  buildConfidentialUnshieldProofV3Mock: vi.fn(() => ({
    nullifiers: [Buffer.from("11".repeat(32), "hex")],
    outputCommitments: [Buffer.from("22".repeat(32), "hex")],
    root: Buffer.from("44".repeat(32), "hex"),
    proof: Buffer.from("unshield-proof-v3", "utf8"),
  })),
  buildCreateKaigiTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("create-transparent", "utf8"),
  })),
  buildJoinKaigiTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("join-transparent", "utf8"),
  })),
  buildEndKaigiTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("end-transparent", "utf8"),
  })),
  buildTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("instruction-tx", "utf8"),
  })),
  buildIvmProvedTransactionMock: vi.fn(
    (input?: { privateKey?: Buffer | Uint8Array }) => ({
      signedTransaction: Buffer.from(
        `ivm-proved-${Buffer.from(input?.privateKey ?? []).toString("hex")}`,
        "utf8",
      ),
    }),
  ),
  buildTransferAssetTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("public-transfer", "utf8"),
  })),
  buildRegisterAccountAndTransferTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("register-account", "utf8"),
  })),
  buildPrivateKaigiFeeSpendMock: vi.fn(() => ({
    asset_definition_id: "xor#universal",
    anchor_root: Buffer.from("44".repeat(32), "hex"),
    nullifiers: [Buffer.from("11".repeat(32), "hex")],
    output_commitments: [Buffer.from("22".repeat(32), "hex")],
    encrypted_change_payloads: [Buffer.from([0xde, 0xad])],
    proof: Buffer.from("fee-proof", "utf8"),
  })),
  buildSoraCloudHfDeployRequestMock: vi.fn(() => ({
    payload: {
      repo_id: "openai/demo-model",
      revision: "main",
      model_name: "demo-model",
      service_name: "alice-demo-model",
      apartment_name: "default",
      storage_class: "Warm",
      lease_term_ms: 3_600_000,
      lease_asset_definition_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      base_fee_nanos: "1",
    },
    provenance: {
      signer: "test-signer",
      signature_hex: "11".repeat(64),
      payload_hash_hex: "22".repeat(32),
    },
    generated_service_provenance: {
      signer: "test-signer",
      signature_hex: "33".repeat(64),
      payload_hash_hex: "44".repeat(32),
    },
    generated_apartment_provenance: {
      signer: "test-signer",
      signature_hex: "55".repeat(64),
      payload_hash_hex: "66".repeat(32),
    },
  })),
  buildPrivateCreateKaigiTransactionMock: vi.fn(() => ({
    transactionEntrypoint: Buffer.from("private-create-entrypoint", "utf8"),
    hash: Buffer.from("aa".repeat(32), "hex"),
    actionHash: Buffer.from("bb".repeat(32), "hex"),
  })),
  buildPrivateJoinKaigiTransactionMock: vi.fn(() => ({
    transactionEntrypoint: Buffer.from("private-join-entrypoint", "utf8"),
    hash: Buffer.from("cc".repeat(32), "hex"),
    actionHash: Buffer.from("dd".repeat(32), "hex"),
  })),
  buildPrivateEndKaigiTransactionMock: vi.fn(() => ({
    transactionEntrypoint: Buffer.from("private-end-entrypoint", "utf8"),
    hash: Buffer.from("ee".repeat(32), "hex"),
    actionHash: Buffer.from("ff".repeat(32), "hex"),
  })),
  submitSignedTransactionMock: vi.fn(
    async (_client: unknown, signedTransaction: Buffer) => ({
      hash: `hash-${signedTransaction.toString("utf8")}`,
    }),
  ),
  submitTransactionMock: vi.fn(async (...args: unknown[]) => {
    const payload = args[0] as Buffer;
    return {
      route: "pipeline",
      payloadHex: payload.toString("hex"),
    };
  }),
  submitTransactionEntrypointMock: vi.fn(
    async (
      client: { submitTransaction: (payload: Buffer) => Promise<unknown> },
      transactionEntrypoint: Buffer,
      options: { hashHex: string },
    ) => {
      const submission = await client.submitTransaction(transactionEntrypoint);
      return {
        hash: options.hashHex,
        submission,
        status: {
          status: "Committed",
        },
      };
    },
  ),
}));

vi.mock("electron", () => ({
  clipboard: {
    writeText: (text: string) => mocks.clipboardWriteTextMock(text),
  },
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => {
      if (name === "iroha") {
        mocks.exposedApi = api;
      }
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => mocks.ipcInvokeMock(...args),
  },
}));

vi.mock("../electron/nodeFetch", () => ({
  nodeFetch: (input: unknown, init?: Record<string, unknown>) =>
    mocks.nodeFetchMock(input, init),
}));

vi.mock("../electron/accountAddress", async () => {
  const actual = await vi.importActual<
    typeof import("../electron/accountAddress")
  >("../electron/accountAddress");
  return {
    ...actual,
    deriveAccountAddressView: vi.fn(),
    normalizeCanonicalAccountIdLiteral: (
      value: string,
      label?: string,
      networkPrefix?: number,
    ) =>
      mocks.normalizeCanonicalAccountIdLiteralMock(value, label, networkPrefix),
    normalizeCompatAccountIdLiteral: (
      value: string,
      label?: string,
      networkPrefix?: number,
    ) => mocks.normalizeCompatAccountIdLiteralMock(value, label, networkPrefix),
  };
});

vi.mock("../electron/faucetApi", async () => {
  const actual = await vi.importActual<typeof import("../electron/faucetApi")>(
    "../electron/faucetApi",
  );
  return {
    ...actual,
    requestFaucetFundsWithPuzzle: (input: unknown, onStatus?: unknown) =>
      mocks.requestFaucetFundsWithPuzzleMock(input, onStatus),
  };
});

vi.mock("@iroha/iroha-js", async () => {
  const actual =
    await vi.importActual<typeof import("@iroha/iroha-js")>("@iroha/iroha-js");
  class MockToriiClient {
    baseUrl: string;
    options: unknown;

    constructor(baseUrl: string, options: unknown) {
      this.baseUrl = baseUrl;
      this.options = options;
    }

    listKaigiRelays(...args: unknown[]) {
      return mocks.listKaigiRelaysMock(...args);
    }

    getKaigiRelay(...args: unknown[]) {
      return mocks.getKaigiRelayMock(...args);
    }

    getKaigiCall(...args: unknown[]) {
      return mocks.getKaigiCallMock(...args);
    }

    resolveAlias(...args: unknown[]) {
      return mocks.resolveAliasMock(...args);
    }

    getExplorerAccountQr(...args: unknown[]) {
      return mocks.getExplorerAccountQrMock(...args);
    }

    listAccountAssets(...args: unknown[]) {
      return mocks.listAccountAssetsMock(...args);
    }

    listAccountTransactions(...args: unknown[]) {
      return mocks.listAccountTransactionsMock(...args);
    }

    getConfiguration(...args: unknown[]) {
      return mocks.getConfigurationMock(...args);
    }

    getGovernanceUnlockStatsTyped(...args: unknown[]) {
      return mocks.getGovernanceUnlockStatsTypedMock(...args);
    }

    governanceProposeDeployContract(...args: unknown[]) {
      return mocks.governanceProposeDeployContractMock(...args);
    }

    getVerifyingKeyTyped(...args: unknown[]) {
      return mocks.getVerifyingKeyTypedMock(...args);
    }

    getTransactionStatus(...args: unknown[]) {
      return mocks.getTransactionStatusMock(...args);
    }

    submitTransaction(...args: unknown[]) {
      const [payload, ...rest] = args;
      return mocks.submitTransactionMock(
        versionedPayload(payload as Buffer),
        ...rest,
      );
    }

    getStatusSnapshot(...args: unknown[]) {
      return mocks.getStatusSnapshotMock(...args);
    }

    getExplorerMetrics(...args: unknown[]) {
      return mocks.getExplorerMetricsMock(...args);
    }

    getSumeragiStatusTyped(...args: unknown[]) {
      return mocks.getSumeragiStatusTypedMock(...args);
    }

    getSccpCapabilities(...args: unknown[]) {
      return mocks.getSccpCapabilitiesMock(...args);
    }

    getSccpProofManifests(...args: unknown[]) {
      return mocks.getSccpProofManifestsMock(...args);
    }

    getSccpMessageProofArtifact(...args: unknown[]) {
      return mocks.getSccpMessageProofArtifactMock(...args);
    }

    getSccpMessageProofJob(...args: unknown[]) {
      return mocks.getSccpMessageProofJobMock(...args);
    }

    submitBridgeProof(...args: unknown[]) {
      return mocks.submitBridgeProofMock(...args);
    }

    submitBridgeMessage(...args: unknown[]) {
      return mocks.submitBridgeMessageMock(...args);
    }
  }

  return {
    ...actual,
    ToriiClient: MockToriiClient,
    buildConfidentialTransferProofV2:
      mocks.buildConfidentialTransferProofV2Mock,
    buildConfidentialUnshieldProofV2:
      mocks.buildConfidentialUnshieldProofV2Mock,
    buildConfidentialUnshieldProofV3:
      mocks.buildConfidentialUnshieldProofV3Mock,
    buildShieldTransaction: mocks.buildShieldTransactionMock,
    buildUnshieldTransaction: mocks.buildUnshieldTransactionMock,
    buildZkTransferTransaction: mocks.buildZkTransferTransactionMock,
    buildCreateKaigiTransaction: mocks.buildCreateKaigiTransactionMock,
    buildJoinKaigiTransaction: mocks.buildJoinKaigiTransactionMock,
    buildEndKaigiTransaction: mocks.buildEndKaigiTransactionMock,
    buildPrivateKaigiFeeSpend: mocks.buildPrivateKaigiFeeSpendMock,
    buildPrivateCreateKaigiTransaction:
      mocks.buildPrivateCreateKaigiTransactionMock,
    buildPrivateJoinKaigiTransaction:
      mocks.buildPrivateJoinKaigiTransactionMock,
    buildPrivateEndKaigiTransaction: mocks.buildPrivateEndKaigiTransactionMock,
    buildRegisterAccountAndTransferTransaction:
      mocks.buildRegisterAccountAndTransferTransactionMock,
    buildTransaction: mocks.buildTransactionMock,
    buildIvmProvedTransaction: mocks.buildIvmProvedTransactionMock,
    buildTransferAssetTransaction: mocks.buildTransferAssetTransactionMock,
    submitSignedTransaction: mocks.submitSignedTransactionMock,
    submitTransactionEntrypoint: mocks.submitTransactionEntrypointMock,
    hashSignedTransaction: (signedTransaction: Buffer) => {
      const text = signedTransaction.toString("utf8");
      return /^[\x20-\x7e]+$/.test(text)
        ? `hash-${text}`
        : `hash-${signedTransaction.toString("hex")}`;
    },
    extractPipelineRejectionReason: (payload: unknown) => {
      const readReason = (value: unknown): string | null => {
        if (typeof value === "string") {
          return value.trim() || null;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return null;
        }
        const record = value as Record<string, unknown>;
        for (const key of [
          "message",
          "rejection_reason",
          "rejectionReason",
          "reason",
        ]) {
          const reason = readReason(record[key]);
          if (reason) {
            return reason;
          }
        }
        return null;
      };
      return readReason(payload);
    },
    normalizeAssetId: (value: string, name = "assetId") => {
      const literal = String(value).trim();
      if (literal.includes("#")) {
        throw new Error(`${name} must be a canonical Base58 asset id`);
      }
      return literal;
    },
    normalizeAssetHoldingId: (value: string) => String(value).trim(),
    normalizeAccountId: (value: string) => String(value).trim(),
  };
});

vi.mock("../electron/soraCloudDeployRequest", () => ({
  buildSoraCloudHfDeployRequest: mocks.buildSoraCloudHfDeployRequestMock,
}));

vi.mock("@iroha/iroha-js/crypto", async () => {
  const actual = await vi.importActual<typeof import("@iroha/iroha-js/crypto")>(
    "@iroha/iroha-js/crypto",
  );
  return {
    ...actual,
    buildKaigiRosterJoinProof: (input: unknown) =>
      mocks.buildKaigiRosterJoinProofMock(
        input as { rosterRootHex?: string | null } | undefined,
      ),
    deriveConfidentialKeysetFromHex: vi.fn(() => ({
      nkHex: "ab".repeat(32),
    })),
    generateKeyPair: vi.fn(() => ({
      publicKey: Buffer.alloc(32, 0x21),
      privateKey: Buffer.alloc(32, 0x34),
    })),
    privateKeyMultihash: vi.fn((privateKey: Buffer | Uint8Array) =>
      `802620${Buffer.from(privateKey).toString("hex").toUpperCase()}`,
    ),
  };
});

const loadBridge = async () => {
  mocks.exposedApi = null;
  await import("../electron/preload");
  expect(mocks.exposedApi).toBeTruthy();
  return mocks.exposedApi as {
    createKaigiMeeting: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    registerCitizen: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    registerPublicLaneValidator: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    getGovernanceRegistrationPolicy: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    joinKaigiMeeting: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    endKaigiMeeting: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    getPrivateKaigiConfidentialXorState: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    selfShieldPrivateKaigiXor: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    transferAsset: (
      input: Record<string, unknown>,
    ) => Promise<{ hash: string }>;
    resolveAccountAlias: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    deriveConfidentialReceiveAddress: (privateKeyHex: string) => {
      ownerTagHex: string;
      diversifierHex: string;
    };
    exportConfidentialWalletBackup: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    importConfidentialWalletBackup: (
      input: Record<string, unknown>,
    ) => Promise<void>;
    getConfidentialAssetPolicy: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getConfidentialAssetBalance: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    fetchAccountAssets: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    fetchAccountTransactions: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    requestFaucetFunds: (
      input: Record<string, unknown>,
      onStatus?: (progress: unknown) => void,
    ) => Promise<Record<string, unknown>>;
    cancelFaucetRequest: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getNetworkStats: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getSccpCapabilities: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getSccpProofManifests: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getSccpMessageProofBundle: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getSccpMessageProofArtifact: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getSccpMessageProofJob: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    submitSccpBridgeProof: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    submitSccpBridgeMessage: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    submitZkIvmProvedTransaction: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getChainMetadata: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getGovernanceCouncilCurrent: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getGovernanceUnlockStats: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    proposeGovernanceDeployContract: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    deploySoraCloudHf: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getTronAccount: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    broadcastTronTransaction: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    triggerTronSmartContract: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    triggerTronConstantContract: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    copyTextToClipboard: (input: { text: string }) => Promise<void>;
  };
};

describe("preload Kaigi bridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00.000Z"));
    globalThis.localStorage?.clear();
    mocks.clipboardWriteTextMock.mockReset();
    mocks.ipcInvokeMock.mockReset();
    mocks.vaultAvailable = true;
    mocks.storedAccountSecrets = new Map<string, string>();
    mocks.storedReceiveKeys = new Map<string, Record<string, unknown>>();
    mocks.normalizeCanonicalAccountIdLiteralMock.mockReset();
    mocks.normalizeCompatAccountIdLiteralMock.mockReset();
    mocks.requestFaucetFundsWithPuzzleMock.mockReset();
    mocks.getTransactionStatusMock.mockReset();
    mocks.getStatusSnapshotMock.mockReset();
    mocks.getExplorerMetricsMock.mockReset();
    mocks.getSumeragiStatusTypedMock.mockReset();
    mocks.getSccpCapabilitiesMock.mockReset();
    mocks.getSccpProofManifestsMock.mockReset();
    mocks.getSccpMessageProofArtifactMock.mockReset();
    mocks.getSccpMessageProofJobMock.mockReset();
    mocks.submitBridgeProofMock.mockReset();
    mocks.submitBridgeMessageMock.mockReset();
    mocks.listKaigiRelaysMock.mockReset();
    mocks.getKaigiRelayMock.mockReset();
    mocks.getKaigiCallMock.mockReset();
    mocks.resolveAliasMock.mockReset();
    mocks.getExplorerAccountQrMock.mockReset();
    mocks.listAccountAssetsMock.mockReset();
    mocks.listAccountTransactionsMock.mockReset();
    mocks.getConfigurationMock.mockReset();
    mocks.getGovernanceUnlockStatsTypedMock.mockReset();
    mocks.governanceProposeDeployContractMock.mockReset();
    mocks.getVerifyingKeyTypedMock.mockReset();
    mocks.nodeFetchMock.mockReset();
    mocks.buildKaigiRosterJoinProofMock.mockClear();
    mocks.buildShieldTransactionMock.mockClear();
    mocks.buildUnshieldTransactionMock.mockClear();
    mocks.buildZkTransferTransactionMock.mockClear();
    mocks.buildConfidentialTransferProofV2Mock.mockClear();
    mocks.buildConfidentialUnshieldProofV2Mock.mockClear();
    mocks.buildConfidentialUnshieldProofV3Mock.mockClear();
    mocks.buildCreateKaigiTransactionMock.mockClear();
    mocks.buildJoinKaigiTransactionMock.mockClear();
    mocks.buildEndKaigiTransactionMock.mockClear();
    mocks.buildTransactionMock.mockClear();
    mocks.buildIvmProvedTransactionMock.mockClear();
    mocks.buildTransferAssetTransactionMock.mockClear();
    mocks.buildRegisterAccountAndTransferTransactionMock.mockClear();
    mocks.buildPrivateKaigiFeeSpendMock.mockClear();
    mocks.buildSoraCloudHfDeployRequestMock.mockClear();
    mocks.buildPrivateCreateKaigiTransactionMock.mockClear();
    mocks.buildPrivateJoinKaigiTransactionMock.mockClear();
    mocks.buildPrivateEndKaigiTransactionMock.mockClear();
    mocks.submitSignedTransactionMock.mockClear();
    mocks.submitTransactionMock.mockClear();
    mocks.submitTransactionEntrypointMock.mockClear();

    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string) => String(value).trim(),
    );
    mocks.normalizeCompatAccountIdLiteralMock.mockImplementation(
      (value: string) => String(value).trim(),
    );
    mocks.requestFaucetFundsWithPuzzleMock.mockResolvedValue({
      tx_hash_hex: "0xfaucet",
    });
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Committed",
      },
    });
    mocks.getStatusSnapshotMock.mockResolvedValue({
      status: {
        queue_size: 0,
        commit_time_ms: 1_000,
        raw: {
          sumeragi: {
            tx_queue_saturated: false,
            tx_queue_capacity: 65_536,
            effective_block_time_ms: 2_000,
            highest_qc_height: 701,
            locked_qc_height: 701,
          },
        },
        sumeragi: {
          tx_queue_saturated: false,
        },
      },
    });
    mocks.getExplorerMetricsMock.mockResolvedValue({
      peers: 4,
      domains: 3,
      accounts: 12,
      assets: 6,
      transactionsAccepted: 200,
      transactionsRejected: 5,
      blockHeight: 701,
      blockCreatedAt: "2026-03-29T12:00:00.000Z",
      finalizedBlockHeight: 699,
      averageCommitTimeMs: 1_500,
      averageBlockTimeMs: 2_000,
    });
    mocks.getSumeragiStatusTypedMock.mockResolvedValue({
      lane_governance: [
        {
          lane_id: 7,
          dataspace_id: 2,
          validator_ids: ["alice", "bob"],
        },
      ],
      dataspace_commitments: [
        {
          lane_id: 7,
          dataspace_id: 2,
        },
      ],
    });
    mocks.getSccpCapabilitiesMock.mockResolvedValue({
      proofSubmitPath: "/v1/bridge/proofs/submit",
      bridgeMessageSubmitPath: "/v1/bridge/messages",
    });
    mocks.getSccpProofManifestsMock.mockResolvedValue({ manifests: [] });
    mocks.getSccpMessageProofArtifactMock.mockResolvedValue({
      bundle: { commitment: { message_id: "11".repeat(32) } },
    });
    mocks.getSccpMessageProofJobMock.mockResolvedValue({
      publicInputs: { messageId: "11".repeat(32) },
    });
    mocks.submitBridgeProofMock.mockResolvedValue({ ok: true });
    mocks.submitBridgeMessageMock.mockResolvedValue({ ok: true });
    mocks.resolveAliasMock.mockResolvedValue(null);
    mocks.getExplorerAccountQrMock.mockRejectedValue(
      new Error("explorer account QR unavailable"),
    );

    mocks.listKaigiRelaysMock.mockResolvedValue({
      items: [
        {
          relay_id: "relay-1",
          status: "healthy",
          bandwidth_class: 5,
        },
      ],
    });
    mocks.getKaigiRelayMock.mockResolvedValue({
      relay: {
        relay_id: "relay-1",
      },
      hpke_public_key_b64: "relay-hpke-key",
    });
    mocks.listAccountAssetsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    mocks.listAccountTransactionsMock.mockResolvedValue({
      items: [
        {
          entrypoint_hash: "tx-1",
          result_ok: true,
          authority: ALICE_ACCOUNT_ID,
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "xor#universal",
                  from: ALICE_ACCOUNT_ID,
                  amount: "5",
                },
              },
            },
          ],
        },
      ],
      total: 1,
    });
    mocks.getConfigurationMock.mockResolvedValue({
      nexus: {
        enabled: true,
        fees: {
          base_fee: "1",
          per_byte_fee: "0",
          per_instruction_fee: "0",
          per_gas_unit_fee: "0",
        },
      },
    });
    mocks.getGovernanceUnlockStatsTypedMock.mockResolvedValue({
      height_current: 10,
      expired_locks_now: 0,
      referenda_with_expired: 0,
      last_sweep_height: 8,
    });
    mocks.governanceProposeDeployContractMock.mockResolvedValue({
      ok: true,
      proposal_id: "0x".padEnd(66, "3"),
      tx_instructions: [],
    });
    mocks.getVerifyingKeyTypedMock.mockImplementation(
      async (backend: string, name: string) => ({
        id: {
          backend,
          name,
        },
        record: {
          circuit_id:
            name === "vk_unshield"
              ? "halo2/pasta/ipa/anon-unshield-merkle16-poseidon-diversified"
              : "halo2/ipa:tiny-add",
          inline_key: {
            backend,
            bytes_b64: Buffer.from("fixture-vk", "utf8").toString("base64"),
          },
        },
        inline_key: {
          backend,
          bytes_b64: Buffer.from("fixture-vk", "utf8").toString("base64"),
        },
      }),
    );
    mocks.ipcInvokeMock.mockImplementation(
      async (channel: string, input?: Record<string, unknown>) => {
        if (channel === "vault:isAvailable") {
          return mocks.vaultAvailable;
        }
        if (channel === "vault:storeAccountSecret") {
          const accountId = String(input?.accountId ?? "").trim();
          const privateKeyHex = String(input?.privateKeyHex ?? "").trim();
          if (accountId && privateKeyHex) {
            mocks.storedAccountSecrets.set(accountId, privateKeyHex);
          }
          return undefined;
        }
        if (channel === "vault:getAccountSecret") {
          return (
            mocks.storedAccountSecrets.get(
              String(input?.accountId ?? "").trim(),
            ) ?? null
          );
        }
        if (channel === "vault:listAccountSecretFlags") {
          const accountIds = Array.isArray(input?.accountIds)
            ? input.accountIds.map((entry) => String(entry).trim())
            : [];
          return Object.fromEntries(
            accountIds.map((accountId) => [
              accountId,
              mocks.storedAccountSecrets.has(accountId),
            ]),
          );
        }
        if (channel === "vault:storeReceiveKey") {
          const record = {
            keyId: String(input?.keyId ?? "").trim(),
            accountId: String(input?.accountId ?? "").trim(),
            ownerTagHex: String(input?.ownerTagHex ?? "").trim(),
            diversifierHex: String(input?.diversifierHex ?? "").trim(),
            publicKeyBase64Url: String(input?.publicKeyBase64Url ?? "").trim(),
            privateKeyBase64Url: String(
              input?.privateKeyBase64Url ?? "",
            ).trim(),
            createdAtMs: Number(input?.createdAtMs ?? Date.now()),
          };
          mocks.storedReceiveKeys.set(record.keyId, record);
          return record;
        }
        if (channel === "vault:listReceiveKeysForAccount") {
          const accountId = String(input?.accountId ?? "").trim();
          return [...mocks.storedReceiveKeys.values()]
            .filter((record) => record.accountId === accountId)
            .sort(
              (left, right) =>
                Number(left.createdAtMs ?? 0) - Number(right.createdAtMs ?? 0),
            );
        }
        if (channel === "vault:getReceiveKey") {
          return (
            mocks.storedReceiveKeys.get(String(input?.keyId ?? "").trim()) ??
            null
          );
        }
        return undefined;
      },
    );

    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.includes("/v1/ledger/headers")) {
          return jsonResponse([
            {
              height: 701,
              creation_time_ms: Date.now(),
            },
          ]);
        }
        if (method === "GET" && href.includes("/v1/sumeragi/status")) {
          return jsonResponse({
            commit_qc: {
              height: 701,
            },
            lane_commitments: [],
            tx_queue: {
              depth: 0,
              saturated: false,
            },
          });
        }
        if (
          method === "GET" &&
          href.includes(
            "/v1/explorer/asset-definitions/6TEAJqbb8oEPmLncoNiMRbLEK6tw/snapshot",
          )
        ) {
          return jsonResponse({
            definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            computed_at_ms: 1711713600000,
            holders_total: 3,
            total_supply: "10000000000000000000000000",
            top_holders: [
              {
                account_id: ALICE_ACCOUNT_ID,
                balance: "9999999999999999999999999",
              },
              {
                account_id: BOB_ACCOUNT_ID,
                balance: "1",
              },
            ],
            distribution: {
              gini: 0.99,
              hhi: 0.9,
              theil: 10,
              entropy: 0.1,
              entropy_normalized: 0.05,
              nakamoto_33: 1,
              nakamoto_51: 1,
              nakamoto_67: 1,
              top1: 0.9999,
              top5: 1,
              top10: 1,
              median: "1",
              p90: "1",
              p99: "9999999999999999999999999",
              lorenz: [],
            },
          });
        }
        if (
          method === "GET" &&
          href.includes(
            "/v1/explorer/asset-definitions/6TEAJqbb8oEPmLncoNiMRbLEK6tw/econometrics",
          )
        ) {
          return jsonResponse({
            definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            computed_at_ms: 1711713600000,
            velocity_windows: [
              {
                key: "1h",
                start_ms: 1711710000000,
                end_ms: 1711713600000,
                transfers: 3,
                unique_senders: 2,
                unique_receivers: 2,
                amount: "250",
              },
            ],
            issuance_windows: [
              {
                key: "24h",
                start_ms: 1711627200000,
                end_ms: 1711713600000,
                mint_count: 1,
                burn_count: 0,
                minted: "100",
                burned: "0",
                net: "100",
              },
            ],
            issuance_series: [
              {
                bucket_start_ms: 1711627200000,
                minted: "100",
                burned: "0",
                net: "100",
              },
            ],
          });
        }
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Confidential note index request failed",
              status: 404,
            },
            404,
          );
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        if (
          method === "POST" &&
          href.endsWith("/v1/confidential/relay/submit")
        ) {
          return jsonResponse({
            tx_hash_hex: RELAY_TX_HASH,
            relay_authority: "relay-1",
          });
        }
        if (
          method === "GET" &&
          href.includes("/v1/accounts/") &&
          href.includes("/assets")
        ) {
          return jsonResponse({
            items: [
              {
                asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}##${ALICE_ACCOUNT_ID}`,
                quantity: "9",
              },
            ],
            total: 1,
          });
        }
        if (method === "GET" && href.includes("/v1/explorer/transactions/")) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Failed to process query",
              status: 404,
            },
            404,
          );
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
  });

  afterEach(() => {
    mocks.exposedApi = null;
    globalThis.localStorage?.clear();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("copies text through the native Electron clipboard", async () => {
    const bridge = await loadBridge();

    await bridge.copyTextToClipboard({ text: "alpha beta gamma" });

    expect(mocks.clipboardWriteTextMock).toHaveBeenCalledWith(
      "alpha beta gamma",
    );
  });

  it("submits SCCP bridge payloads with stored vault authority only", async () => {
    const bridge = await loadBridge();
    const privateKeyHex = "11".repeat(32);
    const messageBundle = {
      commitment: {
        message_id: "22".repeat(32),
        payload_hash: "33".repeat(32),
      },
      payload: {
        kind: "Transfer",
      },
    };
    mocks.storedAccountSecrets.set(ALICE_ACCOUNT_ID, privateKeyHex);

    await expect(
      bridge.submitSccpBridgeProof({
        toriiUrl: "https://taira.sora.org",
        accountId: ALICE_ACCOUNT_ID,
        networkIdHex: "0x" + "44".repeat(32),
        tronVerifierAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
        messageBundle,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      bridge.submitSccpBridgeMessage({
        toriiUrl: "https://taira.sora.org",
        accountId: ALICE_ACCOUNT_ID,
        messageBundle,
        settlement: { finalize_inbound: true },
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.submitBridgeProofMock).toHaveBeenCalledWith({
      authority: ALICE_ACCOUNT_ID,
      privateKey: exposedEd25519PrivateKey(privateKeyHex),
      messageBundle,
      networkIdHex: "0x" + "44".repeat(32),
      tronVerifierAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
    });
    expect(mocks.submitBridgeMessageMock).toHaveBeenCalledWith({
      authority: ALICE_ACCOUNT_ID,
      privateKey: exposedEd25519PrivateKey(privateKeyHex),
      messageBundle,
      settlement: { finalize_inbound: true },
    });
  });

  it("rejects inline keys and secret-bearing SCCP submission payloads before Torii", async () => {
    const bridge = await loadBridge();
    const baseInput = {
      toriiUrl: "https://taira.sora.org",
      accountId: ALICE_ACCOUNT_ID,
      messageBundle: {
        commitment: {
          message_id: "22".repeat(32),
        },
      },
    };

    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        privateKeyHex: "11".repeat(32),
      }),
    ).rejects.toThrow(/inline private keys are not accepted/);
    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        publicKeyHex: "11".repeat(32),
      }),
    ).rejects.toThrow(/both publicKeyHex and signatureB64/);
    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        signatureB64: Buffer.from("signature").toString("base64"),
      }),
    ).rejects.toThrow(/both publicKeyHex and signatureB64/);
    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        messageBundle: {
          ...baseInput.messageBundle,
          privateKeyHex: "11".repeat(32),
        },
      }),
    ).rejects.toThrow(/SCCP messageBundle\.privateKeyHex/);
    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        burnBundle: {
          records: [{ seedPhrase: "do not submit this" }],
        },
      }),
    ).rejects.toThrow(/SCCP burnBundle\.records\[0\]\.seedPhrase/);
    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        messageBundle: {
          ...baseInput.messageBundle,
          note: VALID_MNEMONIC,
        },
      }),
    ).rejects.toThrow(/SCCP messageBundle\.note.*Torii submission/);
    await expect(
      bridge.submitSccpBridgeProof({
        ...baseInput,
        messageBundle: {
          ...baseInput.messageBundle,
          signature_b64: Buffer.from("detached").toString("base64"),
        },
      }),
    ).rejects.toThrow(/SCCP messageBundle\.signature_b64.*helper payloads/);
    await expect(
      bridge.submitSccpBridgeMessage({
        ...baseInput,
        settlement: {
          finalize_inbound: {
            recoveryPhrase: "do not submit this",
          },
        },
      }),
    ).rejects.toThrow(/SCCP settlement\.finalize_inbound\.recoveryPhrase/);
    await expect(
      bridge.submitSccpBridgeMessage({
        ...baseInput,
        messageBundle: null,
      }),
    ).rejects.toThrow(/SCCP messageBundle must be an object/);

    expect(mocks.submitBridgeProofMock).not.toHaveBeenCalled();
    expect(mocks.submitBridgeMessageMock).not.toHaveBeenCalled();
  });

  it("snapshots SCCP submission bundles before resolving wallet authority", async () => {
    const bridge = await loadBridge();
    const privateKeyHex = "11".repeat(32);
    const messageBundle: Record<string, unknown> = {
      commitment: {
        message_id: "22".repeat(32),
      },
    };
    const settlement: Record<string, unknown> = {
      finalize_inbound: true,
    };
    mocks.storedAccountSecrets.set(ALICE_ACCOUNT_ID, privateKeyHex);

    const submitPromise = bridge.submitSccpBridgeMessage({
      toriiUrl: "https://taira.sora.org",
      accountId: ALICE_ACCOUNT_ID,
      messageBundle,
      settlement,
    });
    messageBundle.privateKeyHex = "ff".repeat(32);
    settlement.finalize_inbound = { seedPhrase: "mutated after validation" };

    await expect(submitPromise).resolves.toEqual({ ok: true });
    expect(mocks.submitBridgeMessageMock).toHaveBeenCalledWith({
      authority: ALICE_ACCOUNT_ID,
      privateKey: exposedEd25519PrivateKey(privateKeyHex),
      messageBundle: {
        commitment: {
          message_id: "22".repeat(32),
        },
      },
      settlement: {
        finalize_inbound: true,
      },
    });
  });

  it("submits ZK IVM proved transactions with the stored vault key only", async () => {
    const bridge = await loadBridge();
    const privateKeyHex = "12".repeat(32);
    mocks.storedAccountSecrets.set(ALICE_ACCOUNT_ID, privateKeyHex);

    await expect(
      bridge.submitZkIvmProvedTransaction({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        proved: { overlay: [] },
        attachment: {
          backend: "halo2/ipa",
          proof: { backend: "halo2/ipa", bytes: [1, 2, 3] },
          vk_ref: { backend: "halo2/ipa", name: "ivm-exec-v1" },
        },
        metadata: { gas_limit: 1000 },
      }),
    ).resolves.toMatchObject({
      hash: `hash-ivm-proved-${privateKeyHex}`,
    });

    expect(mocks.buildIvmProvedTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: ALICE_ACCOUNT_ID,
        privateKey: Buffer.from(privateKeyHex, "hex"),
      }),
    );
    expect(
      JSON.stringify(mocks.submitTransactionMock.mock.calls),
    ).not.toContain(privateKeyHex);
  });

  it("rejects inline keys for ZK IVM proved transaction submissions before signing", async () => {
    const bridge = await loadBridge();

    await expect(
      bridge.submitZkIvmProvedTransaction({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "12".repeat(32),
        proved: { overlay: [] },
        attachment: {
          backend: "halo2/ipa",
          proof: { backend: "halo2/ipa", bytes: [1, 2, 3] },
          vk_ref: { backend: "halo2/ipa", name: "ivm-exec-v1" },
        },
      }),
    ).rejects.toThrow(/inline private keys are not accepted/);

    await expect(
      bridge.submitZkIvmProvedTransaction({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        proved: { overlay: [] },
        attachment: {
          backend: "halo2/ipa",
          proof: { backend: "halo2/ipa", bytes: [1, 2, 3] },
          vk_ref: { backend: "halo2/ipa", name: "ivm-exec-v1" },
        },
      }),
    ).rejects.toThrow(/requires a stored wallet secret/);

    expect(mocks.buildIvmProvedTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitTransactionMock).not.toHaveBeenCalled();
  });

  it("passes through successful TRON broadcast responses", async () => {
    const bridge = await loadBridge();
    const transaction = signedTronBroadcastTransaction();
    transaction.raw_data_hex = transaction.raw_data_hex.toUpperCase();
    const signature = signTronRawDataHex(transaction.raw_data_hex);
    transaction.signature = [`0x${signature.toUpperCase()}`];
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ result: true, txid: transaction.txID }),
    );

    await expect(
      bridge.broadcastTronTransaction({ transaction }),
    ).resolves.toMatchObject({
      result: true,
      txid: transaction.txID,
    });

    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/broadcasttransaction",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ...transaction,
          raw_data_hex: transaction.raw_data_hex.toLowerCase(),
          signature: [signature],
        }),
      }),
    );
  });

  it("normalizes non-visible TRON broadcast raw_data addresses before Node fetch", async () => {
    const bridge = await loadBridge();
    const transaction = signedTronBroadcastTransaction();
    const value = (
      (
        (transaction.raw_data.contract[0] as Record<string, unknown>)
          .parameter as Record<string, unknown>
      ).value as Record<string, unknown>
    );
    value.owner_address = TRON_BROADCAST_ADDRESS_BASE58;
    value.contract_address = TRON_BROADCAST_ADDRESS_BASE58;
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ result: true, txid: transaction.txID }),
    );

    await expect(
      bridge.broadcastTronTransaction({ transaction }),
    ).resolves.toMatchObject({
      result: true,
      txid: transaction.txID,
    });

    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/broadcasttransaction",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ...transaction,
          raw_data: {
            ...transaction.raw_data,
            contract: [
              {
                ...transaction.raw_data.contract[0],
                parameter: {
                  ...transaction.raw_data.contract[0].parameter,
                  value: {
                    ...value,
                    owner_address: tronPayloadHexFromPrivateKey(),
                    contract_address: tronPayloadHexFromPrivateKey(),
                    data: "abcdef01",
                  },
                },
              },
            ],
          },
        }),
      }),
    );
  });

  it("preserves visible TRON broadcast raw_data addresses before Node fetch", async () => {
    const bridge = await loadBridge();
    const transaction = {
      ...signedTronBroadcastTransaction(),
      visible: true,
    };
    const value = (
      (
        (transaction.raw_data.contract[0] as Record<string, unknown>)
          .parameter as Record<string, unknown>
      ).value as Record<string, unknown>
    );
    value.owner_address = TRON_BROADCAST_ADDRESS_BASE58;
    value.contract_address = TRON_BROADCAST_ADDRESS_BASE58;
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ result: true, txid: transaction.txID }),
    );

    await expect(
      bridge.broadcastTronTransaction({ transaction }),
    ).resolves.toMatchObject({
      result: true,
      txid: transaction.txID,
    });

    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/broadcasttransaction",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(transaction),
      }),
    );
  });

  it("rejects malformed or secret-bearing TRON broadcasts before Node fetch", async () => {
    const bridge = await loadBridge();
    const transaction = signedTronBroadcastTransaction();
    mocks.nodeFetchMock.mockClear();

    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          txID: transaction.txID,
          raw_data_hex: transaction.raw_data_hex,
        },
      }),
    ).rejects.toThrow(/signature/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          signature: ["12"],
        },
      }),
    ).rejects.toThrow(/65-byte/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          signature: [transaction.signature[0], transaction.signature[0]],
        },
      }),
    ).rejects.toThrow(/exactly one signature/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          signature: [
            signTronRawDataHex(
              transaction.raw_data_hex,
              OTHER_TRON_BROADCAST_PRIVATE_KEY,
            ),
          ],
        },
      }),
    ).rejects.toThrow(/signature.*transaction owner/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          signature: [
            (() => {
              const nonCanonical = hexToBytes(transaction.signature[0]);
              nonCanonical[64] = 31;
              return Buffer.from(nonCanonical).toString("hex");
            })(),
          ],
        },
      }),
    ).rejects.toThrow(/canonical recoverable signature/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          txID: "aa".repeat(32),
        },
      }),
    ).rejects.toThrow(/match raw_data_hex/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          txID: transaction.txID,
          signature: transaction.signature,
        },
      }),
    ).rejects.toThrow(/raw_data/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          txID: transaction.txID,
          raw_data_hex: transaction.raw_data_hex,
          signature: transaction.signature,
        },
      }),
    ).rejects.toThrow(/decoded raw_data/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          txID: transaction.txID,
          raw_data: transaction.raw_data,
          signature: transaction.signature,
        },
      }),
    ).rejects.toThrow(/raw_data_hex/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          raw_data: {
            ...transaction.raw_data,
            contract: [],
          },
        },
      }),
    ).rejects.toThrow(/exactly one contract/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          raw_data: {
            ...transaction.raw_data,
            contract: [
              {
                type: "TransferContract",
                parameter: {
                  value: {
                    owner_address: tronPayloadHexFromPrivateKey(),
                    to_address: tronPayloadHexFromPrivateKey(
                      OTHER_TRON_BROADCAST_PRIVATE_KEY,
                    ),
                    amount: 1,
                  },
                },
              },
            ],
          },
        },
      }),
    ).rejects.toThrow(/TriggerSmartContract/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          raw_data: {
            ...transaction.raw_data,
            contract: [
              ...(transaction.raw_data.contract as Array<
                Record<string, unknown>
              >),
              {
                type: "TransferContract",
                parameter: {
                  value: {
                    owner_address: tronPayloadHexFromPrivateKey(),
                    to_address: tronPayloadHexFromPrivateKey(
                      OTHER_TRON_BROADCAST_PRIVATE_KEY,
                    ),
                    amount: 1,
                  },
                },
              },
            ],
          },
        },
      }),
    ).rejects.toThrow(/exactly one contract/);
    const mismatchedOwnerRawDataHex = buildTronBroadcastTriggerRawDataHex({
      ownerPayload: tronPayloadHexFromPrivateKey(
        OTHER_TRON_BROADCAST_PRIVATE_KEY,
      ),
    });
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          txID: createHash("sha256")
            .update(Buffer.from(mismatchedOwnerRawDataHex, "hex"))
            .digest("hex"),
          raw_data_hex: mismatchedOwnerRawDataHex,
          signature: [
            signTronRawDataHex(
              mismatchedOwnerRawDataHex,
              OTHER_TRON_BROADCAST_PRIVATE_KEY,
            ),
          ],
        },
      }),
    ).rejects.toThrow(/raw_data_hex.*decoded TriggerSmartContract/i);
    const mismatchedCallDataRawDataHex = buildTronBroadcastTriggerRawDataHex({
      dataHex: "feedface",
    });
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          txID: createHash("sha256")
            .update(Buffer.from(mismatchedCallDataRawDataHex, "hex"))
            .digest("hex"),
          raw_data_hex: mismatchedCallDataRawDataHex,
          signature: [signTronRawDataHex(mismatchedCallDataRawDataHex)],
        },
      }),
    ).rejects.toThrow(/raw_data_hex.*decoded TriggerSmartContract/i);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          privateKeyHex: "11".repeat(32),
        },
      }),
    ).rejects.toThrow(/must not be sent/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          signature_b64: "already-signed",
        },
      }),
    ).rejects.toThrow(/signature_b64.*signing helper/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          raw_data: {
            ...transaction.raw_data,
            walletSignature: "11".repeat(65),
          },
        },
      }),
    ).rejects.toThrow(/walletSignature.*signing helper/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          raw_data: {
            ...transaction.raw_data,
            memo: VALID_MNEMONIC,
          },
        },
      }),
    ).rejects.toThrow(/memo.*TRON gateway submission/);
    await expect(
      bridge.broadcastTronTransaction({
        transaction: {
          ...transaction,
          debug: () => "not cloneable",
        },
      }),
    ).rejects.toThrow(/structured-cloneable/);

    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("loads TRON account balance with Base58Check gateway addresses", async () => {
    const bridge = await loadBridge();
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ balance: 1234567 }),
    );

    await expect(
      bridge.getTronAccount({
        address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      }),
    ).resolves.toMatchObject({ balance: 1234567 });

    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/getaccount",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          visible: true,
        }),
      }),
    );

    mocks.nodeFetchMock.mockClear();
    expect(() =>
      bridge.getTronAccount({
        address: "411111111111111111111111111111111111111111",
      }),
    ).toThrow(/Base58Check/);
    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe TRON gateway overrides before Node fetch", async () => {
    const bridge = await loadBridge();
    const transaction = signedTronBroadcastTransaction();
    mocks.nodeFetchMock.mockClear();

    await expect(
      bridge.broadcastTronTransaction({
        endpoint: "http://api.trongrid.io",
        transaction,
      }),
    ).rejects.toThrow(/HTTPS/);
    await expect(
      bridge.broadcastTronTransaction({
        endpoint: "https://user:pass@api.trongrid.io",
        transaction,
      }),
    ).rejects.toThrow(/credentials/);
    await expect(
      bridge.broadcastTronTransaction({
        endpoint: "https://127.0.0.1:9090",
        transaction,
      }),
    ).rejects.toThrow(/local network/);
    await expect(
      bridge.broadcastTronTransaction({
        endpoint: "https://api.trongrid.io?redirect=http://127.0.0.1",
        transaction,
      }),
    ).rejects.toThrow(/query or hash/);
    for (const endpoint of [
      "https://0.0.0.0",
      "https://100.64.0.1",
      "https://[::1]",
      "https://[fd00::1]",
      "https://[fe80::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::7f00:1]",
      "https://[64:ff9b::7f00:1]",
      "https://[2002:7f00:0001::1]",
      "https://[2001:0000:7f00:0001::1]",
      "https://node.localhost",
    ]) {
      await expect(
        bridge.broadcastTronTransaction({
          endpoint,
          transaction,
        }),
      ).rejects.toThrow(/local network/);
    }

    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("normalizes TRON constant-contract balance calls", async () => {
    const bridge = await loadBridge();
    const input = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "balanceOf(address)",
      parameter: "00".repeat(32),
    };
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: { result: true },
        constant_result: ["0".repeat(63) + "7"],
      }),
    );

    await expect(
      bridge.triggerTronConstantContract(input),
    ).resolves.toMatchObject({
      constant_result: ["0".repeat(63) + "7"],
    });

    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/triggerconstantcontract",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          owner_address: input.ownerAddress,
          contract_address: input.contractAddress,
          function_selector: input.functionSelector,
          parameter: "00".repeat(32),
          visible: true,
        }),
      }),
    );

    mocks.nodeFetchMock.mockClear();
    expect(() =>
      bridge.triggerTronConstantContract({
        ...input,
        callData: "0x1234",
        parameter: undefined,
      }),
    ).toThrow(/4-byte selector/);
    expect(() =>
      bridge.triggerTronConstantContract({
        ...input,
        callData: `0x${"12".repeat(4)}${"34".repeat(32)}`,
        parameter: "00".repeat(32),
      }),
    ).toThrow(/either callData or parameter/);
    expect(() =>
      bridge.triggerTronConstantContract({
        ...input,
        contractAddress: "410000000000000000000000000000000000000000",
      }),
    ).toThrow(/Base58Check/);
    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("rejects failed TRON contract trigger responses returned with HTTP 200", async () => {
    const bridge = await loadBridge();
    const input = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "balanceOf(address)",
      parameter: "00".repeat(32),
    };

    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: { result: false, code: "CONTRACT_VALIDATE_ERROR" },
      }),
    );
    await expect(bridge.triggerTronConstantContract(input)).rejects.toThrow(
      /Trigger TRON constant contract.*CONTRACT_VALIDATE_ERROR/,
    );

    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: {
          result: false,
          message: Buffer.from("contract validate error", "utf8").toString(
            "hex",
          ),
        },
      }),
    );
    await expect(
      bridge.triggerTronSmartContract({
        ...input,
        functionSelector: "burnToTaira(bytes,uint256)",
        callData: `0x${"12".repeat(4)}${"34".repeat(32)}`,
        parameter: undefined,
      }),
    ).rejects.toThrow(/contract validate error/);
  });

  it("rejects failed TRON broadcast responses returned with HTTP 200", async () => {
    const bridge = await loadBridge();
    const transaction = signedTronBroadcastTransaction();
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: false,
        code: "SIGERROR",
        message: "signature validation failed",
      }),
    );

    await expect(
      bridge.broadcastTronTransaction({ transaction }),
    ).rejects.toThrow(/SIGERROR: signature validation failed/);
  });

  it("rejects TRON broadcast responses without explicit acceptance", async () => {
    const bridge = await loadBridge();
    const transaction = signedTronBroadcastTransaction();
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ txid: "aa".repeat(32) }),
    );

    await expect(
      bridge.broadcastTronTransaction({ transaction }),
    ).rejects.toThrow(/rejected by the TRON node|not accepted/);
  });

  it("normalizes TRON smart-contract triggers and validates gateway addresses", async () => {
    const bridge = await loadBridge();
    const trigger = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "burnToTaira(bytes,uint256)",
      callData: `0x${"12".repeat(4)}${"34".repeat(32)}`,
      feeLimit: 100_000_000,
    };
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ transaction: { txID: "aa".repeat(32) } }),
    );

    await expect(
      bridge.triggerTronSmartContract(trigger),
    ).resolves.toMatchObject({
      transaction: { txID: "aa".repeat(32) },
    });

    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/triggersmartcontract",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          owner_address: trigger.ownerAddress,
          contract_address: trigger.contractAddress,
          function_selector: trigger.functionSelector,
          parameter: "34".repeat(32),
          fee_limit: 100_000_000,
          call_value: 0,
          visible: true,
        }),
      }),
    );

    mocks.nodeFetchMock.mockClear();
    expect(() =>
      bridge.triggerTronSmartContract({
        ...trigger,
        parameter: "34".repeat(32),
      }),
    ).toThrow(/either callData or parameter/);
    expect(() =>
      bridge.triggerTronSmartContract({
        ...trigger,
        ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv9",
      }),
    ).toThrow(/checksum|Base58Check/);
    expect(() =>
      bridge.triggerTronSmartContract({
        ...trigger,
        ownerAddress: "411111111111111111111111111111111111111111",
      }),
    ).toThrow(/Base58Check/);
    expect(() =>
      bridge.triggerTronSmartContract({
        ...trigger,
        contractAddress: "410000000000000000000000000000000000000000",
      }),
    ).toThrow(/Base58Check/);
    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("aggregates network stats across explorer, status, and econometrics surfaces", async () => {
    const bridge = await loadBridge();

    await expect(
      bridge.getNetworkStats({
        toriiUrl: "https://taira.sora.org",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      }),
    ).resolves.toMatchObject({
      xorAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      partial: false,
      warnings: [],
      explorer: {
        blockHeight: 701,
        finalizedBlockHeight: 699,
      },
      supply: {
        definitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        holdersTotal: 3,
        totalSupply: "10000000000000000000000000",
      },
      econometrics: {
        velocityWindows: [
          expect.objectContaining({
            key: "1h",
            transfers: 3,
          }),
        ],
        issuanceWindows: [
          expect.objectContaining({
            key: "24h",
            net: "100",
          }),
        ],
      },
      runtime: {
        queueSize: 0,
        queueCapacity: 65536,
        txQueueSaturated: false,
        finalizationLag: 2,
      },
      governance: {
        laneCount: 1,
        dataspaceCount: 1,
        validatorCount: 2,
      },
    });
  });

  it("uses root runtime status telemetry for network stats", async () => {
    const defaultNodeFetch = mocks.nodeFetchMock.getMockImplementation();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.endsWith("/status")) {
          return jsonResponse({
            blocks: 702,
            commit_time_ms: 1200,
            queue_size: 2,
            sumeragi: {
              effective_block_time_ms: 2100,
              highest_qc_height: 702,
              locked_qc_height: 701,
              tx_queue_capacity: 64,
              tx_queue_saturated: false,
            },
          });
        }
        if (defaultNodeFetch) {
          return defaultNodeFetch(input, init);
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    const bridge = await loadBridge();

    await expect(
      bridge.getNetworkStats({
        toriiUrl: "https://taira.sora.org",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      }),
    ).resolves.toMatchObject({
      partial: false,
      warnings: [],
      runtime: {
        queueSize: 2,
        queueCapacity: 64,
        commitTimeMs: 1200,
        effectiveBlockTimeMs: 2100,
        txQueueSaturated: false,
        highestQcHeight: 702,
        lockedQcHeight: 701,
        currentBlockHeight: 701,
        finalizedBlockHeight: 699,
        finalizationLag: 2,
      },
    });
    expect(mocks.getStatusSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns partial network stats when runtime telemetry stalls", async () => {
    const defaultNodeFetch = mocks.nodeFetchMock.getMockImplementation();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.endsWith("/status")) {
          return new Promise(() => {});
        }
        if (defaultNodeFetch) {
          return defaultNodeFetch(input, init);
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    const bridge = await loadBridge();
    const statsPromise = bridge.getNetworkStats({
      toriiUrl: "https://taira.sora.org",
      assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });

    await vi.advanceTimersByTimeAsync(3_600);

    await expect(statsPromise).resolves.toMatchObject({
      partial: true,
      explorer: expect.objectContaining({
        blockHeight: 701,
      }),
      runtime: expect.objectContaining({
        currentBlockHeight: 701,
        finalizedBlockHeight: 699,
        finalizationLag: 2,
      }),
      warnings: expect.arrayContaining([
        "Runtime status telemetry is unavailable.",
      ]),
    });
  });

  it("loads chain metadata from Torii endpoint payloads", async () => {
    mocks.nodeFetchMock.mockImplementation(async (input: unknown) => {
      const href = String(input);
      if (href.endsWith("/v1/chain/metadata")) {
        return jsonResponse({
          chain_id: "chain-alpha",
          network_prefix: 42,
        });
      }
      return jsonResponse({}, 404);
    });

    const bridge = await loadBridge();

    await expect(
      bridge.getChainMetadata({
        toriiUrl: "http://localhost:8080",
      }),
    ).resolves.toEqual({
      chainId: "chain-alpha",
      networkPrefix: 42,
    });
    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/v1/chain/metadata",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("loads current governance council payloads with non-Vrf derivation labels", async () => {
    mocks.nodeFetchMock.mockImplementation(async (input: unknown) => {
      const href = String(input);
      if (href.endsWith("/v1/gov/council/current")) {
        return jsonResponse({
          epoch: "3",
          members: [{ account_id: ALICE_ACCOUNT_ID }],
          alternates: [],
          candidate_count: "1",
          verified: "1",
          derived_by: "Fallback",
        });
      }
      return jsonResponse({}, 404);
    });

    const bridge = await loadBridge();

    await expect(
      bridge.getGovernanceCouncilCurrent({
        toriiUrl: "http://localhost:8080",
      }),
    ).resolves.toEqual({
      epoch: 3,
      members: [{ account_id: ALICE_ACCOUNT_ID }],
      alternates: [],
      candidate_count: 1,
      verified: 1,
      derived_by: "Fallback",
    });
    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/v1/gov/council/current",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("forwards governance unlock stats through the typed Torii helper", async () => {
    mocks.getGovernanceUnlockStatsTypedMock.mockResolvedValueOnce({
      height_current: 44,
      expired_locks_now: 3,
      referenda_with_expired: 2,
      last_sweep_height: 40,
    });
    const bridge = await loadBridge();

    await expect(
      bridge.getGovernanceUnlockStats({
        toriiUrl: "http://localhost:8080",
      }),
    ).resolves.toEqual({
      height_current: 44,
      expired_locks_now: 3,
      referenda_with_expired: 2,
      last_sweep_height: 40,
    });
    expect(mocks.getGovernanceUnlockStatsTypedMock).toHaveBeenCalledWith();
  });

  it("prepares deploy-contract governance proposal drafts through Torii", async () => {
    const bridge = await loadBridge();

    await bridge.proposeGovernanceDeployContract({
      toriiUrl: "http://localhost:8080",
      contractAddress: "tairac1contract",
      contractAlias: null,
      codeHash: "0x".padEnd(66, "1"),
      abiHash: "0x".padEnd(66, "2"),
      abiVersion: "1",
      mode: "Plain",
      window: { lower: 10, upper: 20 },
      limits: { max_instructions: 4 },
    });

    expect(mocks.governanceProposeDeployContractMock).toHaveBeenCalledWith({
      contractAddress: "tairac1contract",
      codeHash: "0x".padEnd(66, "1"),
      abiHash: "0x".padEnd(66, "2"),
      abiVersion: "1",
      mode: "Plain",
      window: { lower: 10, upper: 20 },
      limits: { max_instructions: 4 },
    });
  });

  it("uses the active network prefix for account asset and transaction refreshes", async () => {
    const bridge = await loadBridge();
    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string, _label: string, networkPrefix?: number) =>
        `prefix-${networkPrefix}:${String(value).trim()}`,
    );

    await bridge.fetchAccountAssets({
      toriiUrl: "https://taira.sora.org",
      accountId: "sorau-stale-id",
      networkPrefix: 369,
      assetDefinitionId: "xor#universal",
      limit: 25,
    });
    await bridge.fetchAccountTransactions({
      toriiUrl: "https://taira.sora.org",
      accountId: "sorau-stale-id",
      networkPrefix: 369,
      limit: 25,
    });

    expect(mocks.normalizeCanonicalAccountIdLiteralMock).toHaveBeenCalledWith(
      "sorau-stale-id",
      "accountId",
      369,
    );
    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/accounts/prefix-369%3Asorau-stale-id/assets",
      ),
      expect.objectContaining({
        method: "GET",
      }),
    );
    const assetFetchUrl = String(
      mocks.nodeFetchMock.mock.calls.find(([input]) =>
        String(input).includes("/assets"),
      )?.[0] ?? "",
    );
    expect(new URL(assetFetchUrl).searchParams.get("asset")).toBe(
      "xor#universal",
    );
    expect(mocks.listAccountTransactionsMock).toHaveBeenCalledWith(
      "prefix-369:sorau-stale-id",
      expect.objectContaining({
        limit: 25,
      }),
    );
  });

  it("reports account asset gateway outages without raw HTML", async () => {
    const bridge = await loadBridge();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          href.includes("/v1/accounts/") &&
          href.includes("/assets")
        ) {
          return htmlResponse(
            "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx/1.29.8</center></body></html>",
            502,
            "Bad Gateway",
          );
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    await expect(
      bridge.fetchAccountAssets({
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      }),
    ).rejects.toThrow(
      "Account assets request failed because the Torii endpoint is unavailable (502 Bad Gateway).",
    );
    await expect(
      bridge.fetchAccountAssets({
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      }),
    ).rejects.not.toThrow("<html>");
  });

  it("posts signed SoraCloud HF deploy provenance without forwarding the private key", async () => {
    const bridge = await loadBridge();
    const privateKeyHex = "12".repeat(32);
    let requestBody: Record<string, unknown> | null = null;
    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string) => `canonical:${String(value).trim()}`,
    );
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "POST" && href.endsWith("/v1/soracloud/hf/deploy")) {
          requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          return jsonResponse({
            ok: true,
            action: "deploy",
            service_name: "alice-demo-model",
            tx_hash_hex: "ab".repeat(32),
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    await expect(
      bridge.deploySoraCloudHf({
        toriiUrl: "https://taira.sora.org",
        accountId: "  testu-alice  ",
        privateKeyHex,
        repoId: "openai/demo-model",
        revision: "main",
        modelName: "demo-model",
        serviceName: "alice-demo-model",
        apartmentName: "default",
        storageClass: "warm",
        leaseTermMs: 3_600_000,
        leaseAssetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
        baseFeeNanos: "1",
      }),
    ).resolves.toMatchObject({
      ok: true,
      action: "deploy",
      service_name: "alice-demo-model",
      tx_hash_hex: "ab".repeat(32),
    });

    expect(mocks.buildSoraCloudHfDeployRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKeyHex,
        storageClass: "warm",
        leaseAssetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      }),
    );
    expect(requestBody).toMatchObject({
      authority: "canonical:testu-alice",
      payload: expect.any(Object),
      provenance: expect.any(Object),
      generated_service_provenance: expect.any(Object),
      generated_apartment_provenance: expect.any(Object),
    });
    expect(requestBody).not.toHaveProperty("private_key");
    expect(JSON.stringify(requestBody)).not.toContain(privateKeyHex);
  });

  it("returns partial network stats when explorer endpoints fail", async () => {
    const bridge = await loadBridge();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          href.includes("/v1/explorer/asset-definitions/")
        ) {
          return jsonResponse({ message: "down" }, 502);
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    await expect(
      bridge.getNetworkStats({
        toriiUrl: "https://taira.sora.org",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      }),
    ).resolves.toMatchObject({
      partial: true,
      explorer: expect.objectContaining({
        blockHeight: 701,
      }),
      supply: null,
      econometrics: null,
      runtime: expect.objectContaining({
        queueCapacity: 65536,
      }),
      warnings: [
        "XOR supply snapshot is unavailable.",
        "XOR flow econometrics are unavailable.",
      ],
    });
  });

  it("routes faucet requests through canonical account-id normalization", async () => {
    const bridge = await loadBridge();
    const statusEvents: string[] = [];
    const onStatus = vi.fn((progress: unknown) => {
      const phase =
        progress &&
        typeof progress === "object" &&
        "phase" in progress &&
        typeof progress.phase === "string"
          ? progress.phase
          : "";
      statusEvents.push(phase);
    });
    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string) => `canonical:${String(value).trim()}`,
    );
    mocks.requestFaucetFundsWithPuzzleMock.mockImplementation(
      async (input: { onStatus?: (progress: unknown) => void }) => {
        await input.onStatus?.({
          phase: "submittingClaim",
          txHashHex: "0xfaucet",
        });
        return {
          tx_hash_hex: "0xfaucet",
        };
      },
    );
    mocks.getTransactionStatusMock.mockImplementation(async () => {
      statusEvents.push("statusChecked");
      return {
        status: {
          kind: "Committed",
        },
      };
    });

    await expect(
      bridge.requestFaucetFunds(
        {
          toriiUrl: "https://taira.sora.org",
          accountId: "  sorau-stale-id  ",
          networkPrefix: 369,
        },
        onStatus,
      ),
    ).resolves.toEqual({
      tx_hash_hex: "0xfaucet",
      status: "Committed",
    });

    expect(mocks.normalizeCanonicalAccountIdLiteralMock).toHaveBeenCalledWith(
      "  sorau-stale-id  ",
      "accountId",
      369,
    );
    expect(mocks.normalizeCompatAccountIdLiteralMock).not.toHaveBeenCalledWith(
      "  sorau-stale-id  ",
      "accountId",
    );
    expect(mocks.requestFaucetFundsWithPuzzleMock).toHaveBeenCalledWith(
      {
        baseUrl: "https://taira.sora.org",
        accountId: "canonical:sorau-stale-id",
        networkPrefix: 369,
        fetchImpl: expect.any(Function),
        signal: undefined,
        onStatus,
      },
      undefined,
    );
    expect(mocks.getTransactionStatusMock).toHaveBeenCalledWith("0xfaucet");
    expect(statusEvents).toEqual([
      "submittingClaim",
      "claimAccepted",
      "waitingForCommit",
      "statusChecked",
      "claimCommitted",
    ]);
  });

  it("cancels an in-flight faucet request by request id", async () => {
    const bridge = await loadBridge();
    let capturedSignal: AbortSignal | undefined;
    mocks.requestFaucetFundsWithPuzzleMock.mockImplementation(
      async (input: { signal?: AbortSignal }) => {
        capturedSignal = input.signal;
        return new Promise((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => reject(input.signal?.reason),
            { once: true },
          );
        });
      },
    );

    const requestPromise = bridge.requestFaucetFunds({
      toriiUrl: "https://taira.sora.org",
      accountId: "testu-faucet",
      networkPrefix: 369,
      requestId: "faucet-request-1",
    });
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());

    expect(capturedSignal?.aborted).toBe(false);
    await expect(
      bridge.cancelFaucetRequest({ requestId: "faucet-request-1" }),
    ).resolves.toEqual({ canceled: true });
    expect(capturedSignal?.aborted).toBe(true);
    await expect(requestPromise).rejects.toThrow("Faucet request canceled.");
    await expect(
      bridge.cancelFaucetRequest({ requestId: "faucet-request-1" }),
    ).resolves.toEqual({ canceled: false });
  });

  it("blocks faucet requests when TAIRA is not finalizing new blocks", async () => {
    const bridge = await loadBridge();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.includes("/v1/ledger/headers")) {
          return jsonResponse([
            {
              height: 741,
              creation_time_ms: Date.now() - 10 * 60_000,
            },
          ]);
        }
        if (method === "GET" && href.includes("/v1/sumeragi/status")) {
          return jsonResponse({
            commit_qc: {
              height: 741,
            },
            lane_commitments: [
              {
                block_height: 742,
              },
            ],
            tx_queue: {
              depth: 43,
              saturated: true,
            },
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    await expect(
      bridge.requestFaucetFunds({
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      }),
    ).rejects.toThrow(
      "The active Torii endpoint is not finalizing new blocks right now",
    );
    expect(mocks.requestFaucetFundsWithPuzzleMock).not.toHaveBeenCalled();
  });

  it("adds TAIRA faucet funding diagnostics when finality is stale", async () => {
    const bridge = await loadBridge();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.includes("/v1/ledger/headers")) {
          return jsonResponse([
            {
              height: 741,
              creation_time_ms: Date.now() - 10 * 60_000,
            },
          ]);
        }
        if (method === "GET" && href.includes("/v1/sumeragi/status")) {
          return jsonResponse({
            commit_qc: {
              height: 741,
            },
            lane_commitments: [],
            tx_queue: {
              depth: 0,
              saturated: false,
            },
          });
        }
        if (method === "GET" && href.includes("/v1/accounts/")) {
          return jsonResponse({
            items: [
              {
                account_id: "testu-faucet-authority",
                asset: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
                quantity: "8427.65210",
              },
            ],
            total: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    await expect(
      bridge.requestFaucetFunds({
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      }),
    ).rejects.toThrow(
      "TAIRA faucet is out of funds. The faucet authority has 8427.65210 XOR available, but each claim requires 25000 XOR.",
    );
    expect(mocks.requestFaucetFundsWithPuzzleMock).not.toHaveBeenCalled();
  });

  it("blocks faucet requests when TAIRA finality diagnostics are unavailable", async () => {
    const bridge = await loadBridge();
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.includes("/v1/ledger/headers")) {
          return htmlResponse(
            "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx/1.29.8</center></body></html>",
            502,
            "Bad Gateway",
          );
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );

    await expect(
      bridge.requestFaucetFunds({
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      }),
    ).rejects.toThrow(
      "The active Torii endpoint could not verify faucet finality via /v1/ledger/headers because Torii is unavailable (502 Bad Gateway).",
    );
    expect(mocks.requestFaucetFundsWithPuzzleMock).not.toHaveBeenCalled();
  });

  it("treats a visible funded faucet asset as success when TAIRA pipeline status is missing", async () => {
    const bridge = await loadBridge();
    const statusEvents: string[] = [];
    mocks.requestFaucetFundsWithPuzzleMock.mockResolvedValue({
      account_id: "testu-faucet",
      asset_definition_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}#testu-faucet`,
      amount: "25000",
      tx_hash_hex: "0xfaucet",
      status: "QUEUED",
    });
    mocks.getTransactionStatusMock.mockResolvedValue(null);
    mocks.listAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}#testu-faucet`,
          quantity: "25000",
        },
      ],
      total: 1,
    });

    await expect(
      bridge.requestFaucetFunds(
        {
          toriiUrl: "https://taira.sora.org",
          accountId: "testu-faucet",
          networkPrefix: 369,
        },
        (progress: unknown) => {
          const phase =
            progress &&
            typeof progress === "object" &&
            "phase" in progress &&
            typeof progress.phase === "string"
              ? progress.phase
              : "";
          statusEvents.push(phase);
        },
      ),
    ).resolves.toMatchObject({
      tx_hash_hex: "0xfaucet",
      status: "Funded",
    });

    expect(mocks.getTransactionStatusMock).toHaveBeenCalledWith("0xfaucet");
    expect(mocks.listAccountAssetsMock).toHaveBeenCalledWith("testu-faucet", {
      limit: 200,
    });
    expect(statusEvents).toEqual([
      "claimAccepted",
      "waitingForCommit",
      "claimCommitted",
    ]);
  });

  it("matches split-field TAIRA faucet balances when the faucet returns only the asset definition", async () => {
    const bridge = await loadBridge();
    mocks.requestFaucetFundsWithPuzzleMock.mockResolvedValue({
      account_id: "testu-faucet",
      asset_definition_id: "",
      asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "25000",
      tx_hash_hex: "0xfaucet",
      status: "QUEUED",
    });
    mocks.getTransactionStatusMock.mockResolvedValue(null);
    mocks.listAccountAssetsMock.mockResolvedValue({
      items: [
        {
          account_id: "testu-faucet",
          asset_definition_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
          quantity: "25000",
        },
      ],
      total: 1,
    });

    await expect(
      bridge.requestFaucetFunds({
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      }),
    ).resolves.toMatchObject({
      tx_hash_hex: "0xfaucet",
      status: "Funded",
    });
  });

  it("retries faucet claims when TAIRA accepts a claim that never appears in pipeline status", async () => {
    const bridge = await loadBridge();
    const statusEvents: string[] = [];
    mocks.requestFaucetFundsWithPuzzleMock
      .mockResolvedValueOnce({
        asset_definition_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
        asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}#testu-faucet`,
        tx_hash_hex: "0xinvisible",
      })
      .mockResolvedValueOnce({
        asset_definition_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
        asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}#testu-faucet`,
        tx_hash_hex: "0xcommitted",
      });
    mocks.getTransactionStatusMock.mockImplementation(async (hash: string) =>
      hash === "0xcommitted"
        ? {
            status: {
              kind: "Committed",
            },
          }
        : null,
    );
    mocks.listAccountAssetsMock.mockResolvedValue({
      items: [],
      total: 0,
    });

    const requestPromise = bridge.requestFaucetFunds(
      {
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      },
      (progress: unknown) => {
        const phase =
          progress &&
          typeof progress === "object" &&
          "phase" in progress &&
          typeof progress.phase === "string"
            ? progress.phase
            : "";
        statusEvents.push(phase);
      },
    );
    await vi.runAllTimersAsync();
    await expect(requestPromise).resolves.toMatchObject({
      tx_hash_hex: "0xcommitted",
      status: "Committed",
    });
    expect(mocks.requestFaucetFundsWithPuzzleMock).toHaveBeenCalledTimes(2);
    expect(statusEvents).toEqual([
      "claimAccepted",
      "waitingForCommit",
      "waitingForClaimRetry",
      "claimAccepted",
      "waitingForCommit",
      "claimCommitted",
    ]);
  });

  it("stops retrying invisible accepted faucet claims when finality stalls", async () => {
    const bridge = await loadBridge();
    let ledgerChecks = 0;
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method === "GET" && href.includes("/v1/ledger/headers")) {
          ledgerChecks += 1;
          return jsonResponse([
            {
              height: 741,
              creation_time_ms:
                ledgerChecks === 1 ? Date.now() : Date.now() - 10 * 60_000,
            },
          ]);
        }
        if (method === "GET" && href.includes("/v1/sumeragi/status")) {
          return jsonResponse({
            commit_qc: {
              height: 741,
            },
            lane_commitments: [
              {
                block_height: 742,
              },
            ],
            tx_queue: {
              depth: 43,
              saturated: true,
            },
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    mocks.requestFaucetFundsWithPuzzleMock.mockResolvedValue({
      asset_definition_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}#testu-faucet`,
      tx_hash_hex: "0xinvisible",
    });
    mocks.getTransactionStatusMock.mockResolvedValue(null);
    mocks.listAccountAssetsMock.mockResolvedValue({
      items: [],
      total: 0,
    });

    const requestPromise = bridge.requestFaucetFunds({
      toriiUrl: "https://taira.sora.org",
      accountId: "testu-faucet",
      networkPrefix: 369,
    });
    const rejection = requestPromise.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "The active Torii endpoint is not finalizing new blocks right now",
    );
    expect(mocks.requestFaucetFundsWithPuzzleMock).toHaveBeenCalledTimes(1);
  });

  it("retries faucet claims when TAIRA expires the queued transaction", async () => {
    const bridge = await loadBridge();
    const statusEvents: string[] = [];
    mocks.requestFaucetFundsWithPuzzleMock
      .mockImplementationOnce(
        async (input: { onStatus?: (progress: unknown) => void }) => {
          await input.onStatus?.({
            phase: "submittingClaim",
            txHashHex: "0xexpired",
          });
          return {
            tx_hash_hex: "0xexpired",
          };
        },
      )
      .mockImplementationOnce(
        async (input: { onStatus?: (progress: unknown) => void }) => {
          await input.onStatus?.({
            phase: "submittingClaim",
            txHashHex: "0xcommitted",
          });
          return {
            tx_hash_hex: "0xcommitted",
          };
        },
      );
    mocks.getTransactionStatusMock
      .mockResolvedValueOnce({
        status: {
          kind: "Expired",
        },
      })
      .mockResolvedValueOnce({
        status: {
          kind: "Committed",
        },
      });
    mocks.getStatusSnapshotMock.mockResolvedValue({
      status: {
        queue_size: 0,
        commit_time_ms: 1_000,
        sumeragi: {
          tx_queue_saturated: false,
        },
      },
    });

    const requestPromise = bridge.requestFaucetFunds(
      {
        toriiUrl: "https://taira.sora.org",
        accountId: "testu-faucet",
        networkPrefix: 369,
      },
      (progress: unknown) => {
        const phase =
          progress &&
          typeof progress === "object" &&
          "phase" in progress &&
          typeof progress.phase === "string"
            ? progress.phase
            : "";
        statusEvents.push(phase);
      },
    );
    await vi.runAllTimersAsync();
    await expect(requestPromise).resolves.toEqual({
      tx_hash_hex: "0xcommitted",
      status: "Committed",
    });
    expect(mocks.requestFaucetFundsWithPuzzleMock).toHaveBeenCalledTimes(2);
    expect(mocks.getTransactionStatusMock).toHaveBeenNthCalledWith(
      1,
      "0xexpired",
    );
    expect(mocks.getTransactionStatusMock).toHaveBeenNthCalledWith(
      2,
      "0xcommitted",
    );
    expect(mocks.getStatusSnapshotMock).toHaveBeenCalledTimes(1);
    expect(statusEvents).toEqual([
      "submittingClaim",
      "claimAccepted",
      "waitingForCommit",
      "waitingForClaimRetry",
      "submittingClaim",
      "claimAccepted",
      "waitingForCommit",
      "claimCommitted",
    ]);
  });

  it("surfaces a clear error after repeated faucet claim expiries", async () => {
    const bridge = await loadBridge();
    let expiredAttempt = 0;
    mocks.requestFaucetFundsWithPuzzleMock.mockImplementation(async () => {
      expiredAttempt += 1;
      return {
        tx_hash_hex: `0xexpired-${expiredAttempt}`,
      };
    });
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Expired",
      },
    });
    mocks.getStatusSnapshotMock.mockResolvedValue({
      status: {
        queue_size: 0,
        commit_time_ms: 1_000,
        sumeragi: {
          tx_queue_saturated: false,
        },
      },
    });

    const requestPromise = bridge.requestFaucetFunds({
      toriiUrl: "https://taira.sora.org",
      accountId: "testu-faucet",
      networkPrefix: 369,
    });
    const rejection = expect(requestPromise).rejects.toThrow(
      "Faucet claim 0xexpired-6 expired before the network committed it. Please retry once the faucet queue clears.",
    );
    await vi.runAllTimersAsync();
    await rejection;
    expect(mocks.requestFaucetFundsWithPuzzleMock).toHaveBeenCalledTimes(6);
    expect(mocks.getTransactionStatusMock).toHaveBeenCalledTimes(6);
    expect(mocks.getStatusSnapshotMock).toHaveBeenCalledTimes(5);
  });

  it("adds TAIRA gas metadata to generic instruction transactions", async () => {
    const bridge = await loadBridge();
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Committed",
      },
    });

    await expect(
      bridge.registerCitizen({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "10000",
      }),
    ).resolves.toEqual({
      hash: "hash-instruction-tx",
    });

    expect(mocks.buildTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        },
      }),
    );
  });

  it("serializes validator registration self stake as initial_stake", async () => {
    const bridge = await loadBridge();

    await expect(
      bridge.registerPublicLaneValidator({
        toriiUrl: "https://minamoto.sora.org",
        chainId: MINAMOTO_CHAIN_ID,
        laneId: 7,
        validatorAccountId: ALICE_ACCOUNT_ID,
        stakeAccountId: BOB_ACCOUNT_ID,
        peerId: "peer:alice",
        selfStake: "10.5",
        metadata: {
          endpoint: "https://validator.example",
          commission_bps: 250,
        },
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-instruction-tx",
    });

    expect(mocks.buildTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: MINAMOTO_CHAIN_ID,
        authority: ALICE_ACCOUNT_ID,
        instructions: [
          {
            RegisterPublicLaneValidator: expect.objectContaining({
              lane_id: 7,
              validator: ALICE_ACCOUNT_ID,
              stake_account: BOB_ACCOUNT_ID,
              peer_id: "peer:alice",
              initial_stake: "10.5",
              metadata: {
                endpoint: "https://validator.example",
                commission_bps: 250,
              },
            }),
          },
        ],
      }),
    );
    const buildTransactionCalls = mocks.buildTransactionMock.mock
      .calls as Array<unknown[]>;
    const transactionInput = buildTransactionCalls.at(-1)?.[0] as
      | { instructions?: Array<Record<string, Record<string, unknown>>> }
      | undefined;
    const instruction =
      transactionInput?.instructions?.[0]?.RegisterPublicLaneValidator;
    expect(instruction).not.toHaveProperty("self_stake");
  });

  it("explains citizenship route health without falling back to the removed public transaction route", async () => {
    const bridge = await loadBridge();
    const signedTransaction = buildNrt0Frame(Buffer.from("instruction-tx"));
    mocks.buildTransactionMock.mockReturnValueOnce({
      signedTransaction,
    });
    mocks.submitTransactionMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "Torii responded with HTTP 503 Service Unavailable (expected 200, 201, 202, 204): route_unavailable — NRT0\uFFFDF no authoritative peer binding is registered for lane 1 dataspace 1",
        ),
        {
          status: 503,
          code: "route_unavailable",
        },
      ),
    );

    let caughtError: unknown;
    try {
      await bridge.registerCitizen({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "10000",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = (caughtError as Error).message;
    expect(message).toContain(
      "Citizenship bonding reached Torii, but Torii returned route_unavailable because it has no authoritative peer route for lane 1 / dataspace 1.",
    );
    expect(message).not.toContain("NRT0");
    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("does not post signed transactions to the removed public transaction route when the pipeline route is read-only", async () => {
    const bridge = await loadBridge();
    const signedTransaction = buildNrt0Frame(Buffer.from("instruction-tx"));
    mocks.buildTransactionMock.mockReturnValueOnce({
      signedTransaction,
    });
    mocks.submitTransactionMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "Torii responded with HTTP 405 Method Not Allowed (expected 200, 201, 202, 204)",
        ),
        {
          status: 405,
          statusText: "Method Not Allowed",
        },
      ),
    );

    await expect(
      bridge.registerCitizen({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "10000",
      }),
    ).rejects.toThrow("HTTP 405 Method Not Allowed");

    expect(mocks.nodeFetchMock).not.toHaveBeenCalled();
  });

  it("does not sign RegisterCitizen when live telemetry shows no governance lane validators", async () => {
    const bridge = await loadBridge();
    mocks.getConfigurationMock.mockRejectedValueOnce(
      new Error("configuration endpoint unavailable"),
    );
    mocks.getSumeragiStatusTypedMock.mockResolvedValueOnce({
      lane_governance: [
        {
          alias: "core",
          lane_id: 0,
          validator_ids: ["alice"],
        },
        {
          alias: "governance",
          lane_id: 1,
          validator_ids: [],
        },
      ],
    });

    await expect(
      bridge.registerCitizen({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "10000",
      }),
    ).rejects.toThrow(/no validator ids for lane 1 \/ dataspace 1/);

    expect(mocks.buildTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitTransactionMock).not.toHaveBeenCalled();
    expect(
      mocks.nodeFetchMock.mock.calls.some(([input]) =>
        String(input).includes("/v1/pipeline/transactions"),
      ),
    ).toBe(false);
  });

  it("reports unavailable governance citizenship assets before bonding", async () => {
    const bridge = await loadBridge();
    mocks.getConfigurationMock.mockResolvedValueOnce({
      gov: {
        citizenship_asset_id: "5PgFjEiWr1iqE2a7Wp1R2gB4eVEB",
        citizenship_bond_amount: "10000",
      },
    });
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "missing" }, 404),
    );

    await expect(
      bridge.getGovernanceRegistrationPolicy({
        toriiUrl: "https://taira.sora.org",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        citizenshipAssetDefinitionId: "5PgFjEiWr1iqE2a7Wp1R2gB4eVEB",
        citizenshipBondAmount: "10000",
        citizenshipAssetDefinitionExists: false,
        configurationLoaded: true,
      }),
    );
  });

  it("does not submit RegisterCitizen when governance citizenship asset definition is missing", async () => {
    const bridge = await loadBridge();
    mocks.getConfigurationMock.mockResolvedValueOnce({
      gov: {
        citizenship_asset_id: "5PgFjEiWr1iqE2a7Wp1R2gB4eVEB",
        citizenship_bond_amount: "10000",
      },
    });
    mocks.nodeFetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "missing" }, 404),
    );

    await expect(
      bridge.registerCitizen({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "10000",
      }),
    ).rejects.toThrow("GOV_CITIZENSHIP_ASSET_ID");

    expect(mocks.buildTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitTransactionMock).not.toHaveBeenCalled();
  });

  it("adds a governance citizenship hint when RegisterCitizen rejects with a missing asset definition", async () => {
    const bridge = await loadBridge();
    mocks.getConfigurationMock.mockRejectedValueOnce(
      new Error("config private"),
    );
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Rejected",
        reason:
          "Validation failed: Instruction execution failed: Failed to find asset definition: `5PgFjEiWr1iqE2a7Wp1R2gB4eVEB`",
      },
    });

    await expect(
      bridge.registerCitizen({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "10000",
      }),
    ).rejects.toThrow(
      "configured to use missing governance citizenship asset definition 5PgFjEiWr1iqE2a7Wp1R2gB4eVEB",
    );

    expect(mocks.buildTransactionMock).toHaveBeenCalled();
  });

  it("adds TAIRA gas metadata to public transfers without dropping memos", async () => {
    const bridge = await loadBridge();
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Committed",
      },
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
        metadata: {
          memo: "hello from test",
        },
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
    });

    expect(mocks.buildTransferAssetTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          memo: "hello from test",
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        },
      }),
    );
  });

  it("returns the real TAIRA fee from committed pipeline status payloads", async () => {
    const bridge = await loadBridge();
    mocks.getTransactionStatusMock.mockResolvedValue({
      hash: "hash-public-transfer",
      resolved_from: "state",
      scope: "global",
      status: {
        block_height: 12682,
        kind: "Applied",
        content: {
          block_height: 12682,
          fee: {
            amount: "0.01",
            asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          },
        },
      },
      kind: "Transaction",
      content: {
        hash: "hash-public-transfer",
        status: {
          block_height: 12682,
          kind: "Applied",
          content: {
            block_height: 12682,
            fee: {
              amount: "0.01",
              asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
            },
          },
        },
      },
    });
    mocks.nodeFetchMock.mockImplementation(async (input: unknown) => {
      const href = String(input);
      if (href.includes("/v1/transactions/hash-public-transfer")) {
        return jsonResponse(
          {
            code: "not_found",
            message: "transaction not found",
          },
          404,
        );
      }
      throw new Error(`Unexpected nodeFetch request: ${href}`);
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
      fee: {
        amount: "0.01",
        asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      },
    });
  });

  it("returns the real TAIRA fee from explorer transaction details", async () => {
    const bridge = await loadBridge();
    mocks.getTransactionStatusMock.mockResolvedValue({
      hash: "hash-public-transfer",
      resolved_from: "state",
      scope: "global",
      status: {
        block_height: 12673,
        kind: "Committed",
      },
    });
    mocks.nodeFetchMock.mockImplementation(async (input: unknown) => {
      const href = String(input);
      if (href.includes("/v1/transactions/hash-public-transfer")) {
        return jsonResponse(
          {
            code: "not_found",
            message: "transaction not found",
          },
          404,
        );
      }
      if (href.includes("/v1/explorer/transactions/hash-public-transfer")) {
        return jsonResponse({
          authority: ALICE_ACCOUNT_ID,
          hash: "hash-public-transfer",
          block: 12673,
          created_at: "2026-04-30T17:53:53.123Z",
          executable: "Instructions",
          status: "Committed",
          rejection_reason: null,
          executable_payload: {
            instruction_count: 1,
          },
          metadata: {
            gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          },
          transaction_fee: {
            quantity: "0.01",
            gasAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          },
          nonce: null,
          signature: "9ff763df39e338a4cc3cac7c29bb14a29d0d10ae6125f5ef",
          time_to_live: null,
        });
      }
      throw new Error(`Unexpected nodeFetch request: ${href}`);
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
      fee: {
        quantity: "0.01",
        gasAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      },
    });
  });

  it("uses a full Minamoto source asset holding id for public transfers", async () => {
    const bridge = await loadBridge();
    const sourceAccountId =
      "sorauロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY";
    const destinationAccountId =
      "sorauロ1Prヌuノノ4メdロムイトn5tニメrsR9ヒ2Gキ7gWeFzyチヒチAHフTJQQ4L";

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://minamoto.sora.org",
        chainId: MINAMOTO_CHAIN_ID,
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        accountId: sourceAccountId,
        destinationAccountId,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
    });

    expect(mocks.listAccountAssetsMock).not.toHaveBeenCalled();
    expect(mocks.buildTransferAssetTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: sourceAccountId,
        sourceAssetHoldingId: `6TEAJqbb8oEPmLncoNiMRbLEK6tw#${sourceAccountId}`,
        destinationAccountId,
        metadata: {},
      }),
    );
  });

  it("surfaces explorer rejection reasons when transaction finality fails", async () => {
    const bridge = await loadBridge();
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Rejected",
      },
    });
    mocks.nodeFetchMock.mockImplementation(async (input: unknown) => {
      const href = String(input);
      if (href.includes("/v1/explorer/transactions/hash-public-transfer")) {
        return jsonResponse({
          hash: "hash-public-transfer",
          status: "Rejected",
          rejection_reason: {
            message:
              "Validation failed: Operation is not permitted: missing units_per_gas mapping for `6TEAJqbb8oEPmLncoNiMRbLEK6tw`",
          },
        });
      }
      throw new Error(`Unexpected nodeFetch request: ${href}`);
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).rejects.toThrow(
      "Transaction hash-public-transfer rejected before it committed. Validation failed: Operation is not permitted: missing units_per_gas mapping for `6TEAJqbb8oEPmLncoNiMRbLEK6tw`",
    );
  });

  it("submits public transfers as versioned Norito requests before Torii sees raw frames", async () => {
    const bridge = await loadBridge();
    const rawSignedTransaction = Buffer.from([0x01, 0x8a, 0x88, 0x01]);
    const framedSignedTransaction = buildNrt0Frame(rawSignedTransaction);
    const versionedSignedTransaction = versionedPayload(rawSignedTransaction);
    mocks.buildTransferAssetTransactionMock.mockReturnValueOnce({
      signedTransaction: framedSignedTransaction,
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://minamoto.sora.org",
        chainId: MINAMOTO_CHAIN_ID,
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: `hash-${framedSignedTransaction.toString("hex")}`,
    });

    expect(mocks.submitSignedTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitTransactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.submitTransactionMock.mock.calls[0]?.[0]).toEqual(
      versionedSignedTransaction,
    );
  });

  it("does not mistake raw payloads starting with the version byte for versioned requests", async () => {
    const bridge = await loadBridge();
    const rawSignedTransaction = Buffer.from([0x01, 0x8a, 0x88, 0x01]);
    mocks.buildTransferAssetTransactionMock.mockReturnValueOnce({
      signedTransaction: rawSignedTransaction,
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://minamoto.sora.org",
        chainId: MINAMOTO_CHAIN_ID,
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: `hash-${rawSignedTransaction.toString("hex")}`,
    });

    expect(mocks.submitSignedTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitTransactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.submitTransactionMock.mock.calls[0]?.[0]).toEqual(
      versionedPayload(rawSignedTransaction),
    );
  });

  it("normalizes public transfer sources onto the active network prefix", async () => {
    const bridge = await loadBridge();
    const sourceAccountId =
      "testuロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY";
    const minamotoSourceAccountId =
      "sorauロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY";
    const destinationAccountId =
      "sorauロ1Prヌuノノ4メdロムイトn5tニメrsR9ヒ2Gキ7gWeFzyチヒチAHフTJQQ4L";
    mocks.normalizeCompatAccountIdLiteralMock.mockImplementation(
      (value: string, _label: string, networkPrefix?: number) => {
        const literal = String(value).trim();
        return networkPrefix === 753 && literal.startsWith("testu")
          ? `sorau${literal.slice("testu".length)}`
          : literal;
      },
    );

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://minamoto.sora.org",
        chainId: MINAMOTO_CHAIN_ID,
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        accountId: sourceAccountId,
        destinationAccountId,
        networkPrefix: 753,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
    });

    expect(mocks.buildTransferAssetTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: minamotoSourceAccountId,
        sourceAssetHoldingId: `6TEAJqbb8oEPmLncoNiMRbLEK6tw#${minamotoSourceAccountId}`,
        destinationAccountId,
      }),
    );
  });

  it("blocks transfers when endpoint metadata reports a different chain id", async () => {
    mocks.nodeFetchMock.mockImplementation(async (input: unknown) => {
      const href = String(input);
      if (href.endsWith("/v1/chain/metadata")) {
        return jsonResponse({
          chain_id: "00000000-0000-0000-0000-000000000000",
          network_prefix: 753,
        });
      }
      return jsonResponse({}, 404);
    });
    const bridge = await loadBridge();

    await expect(
      bridge.transferAsset({
        toriiUrl: "http://localhost:8080",
        chainId: "sora nexus main net",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        networkPrefix: 753,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).rejects.toThrow(
      'Torii endpoint chain id mismatch: endpoint expects "00000000-0000-0000-0000-000000000000", but the app is configured for "sora nexus main net". Open Settings and use Check & Save for this endpoint before sending.',
    );

    expect(mocks.buildTransferAssetTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitTransactionMock).not.toHaveBeenCalled();
  });

  it("resolves account aliases to I105 literals through the bridge", async () => {
    const bridge = await loadBridge();
    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string, _label: string, networkPrefix?: number) => {
        const literal = String(value).trim();
        if (literal === "bob@universal") {
          throw new Error("invalid account literal");
        }
        return networkPrefix ? `${literal}@n${networkPrefix}` : literal;
      },
    );
    mocks.resolveAliasMock.mockResolvedValue({
      alias: "bob@universal",
      account_id: BOB_ACCOUNT_ID,
      source: "on_chain",
    });

    await expect(
      bridge.resolveAccountAlias({
        toriiUrl: "https://taira.sora.org",
        alias: " bob@universal ",
        networkPrefix: 369,
      }),
    ).resolves.toEqual({
      alias: "bob@universal",
      accountId: `${BOB_ACCOUNT_ID}@n369`,
      resolved: true,
      source: "on_chain",
    });
    expect(mocks.resolveAliasMock).toHaveBeenCalledWith("bob@universal");
  });

  it("resolves public transfer destination aliases before building transactions", async () => {
    const bridge = await loadBridge();
    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string, _label: string, networkPrefix?: number) => {
        const literal = String(value).trim();
        if (literal === "bob@universal") {
          throw new Error("invalid account literal");
        }
        return networkPrefix ? `${literal}@n${networkPrefix}` : literal;
      },
    );
    mocks.resolveAliasMock.mockResolvedValue({
      alias: "bob@universal",
      account_id: BOB_ACCOUNT_ID,
      source: "on_chain",
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: "bob@universal",
        networkPrefix: 369,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
    });

    expect(mocks.buildTransferAssetTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: `${BOB_ACCOUNT_ID}@n369`,
      }),
    );
  });

  it("resolves stale public XOR aliases to live source holding ids", async () => {
    const bridge = await loadBridge();
    mocks.listAccountAssetsMock.mockResolvedValue({
      items: [
        {
          asset_id: `6TEAJqbb8oEPmLncoNiMRbLEK6tw#${ALICE_ACCOUNT_ID}#dataspace:2`,
          quantity: "25",
        },
      ],
      total: 1,
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://minamoto.sora.org",
        chainId: MINAMOTO_CHAIN_ID,
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
      }),
    ).resolves.toEqual({
      hash: "hash-public-transfer",
    });

    expect(mocks.listAccountAssetsMock).toHaveBeenCalledWith(ALICE_ACCOUNT_ID, {
      limit: 200,
    });
    expect(mocks.buildTransferAssetTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAssetHoldingId: `6TEAJqbb8oEPmLncoNiMRbLEK6tw#${ALICE_ACCOUNT_ID}#dataspace:2`,
      }),
    );
  });

  it("creates a private Kaigi meeting through the authority-free entrypoint path", async () => {
    const bridge = await loadBridge();
    const hostKaigiKeys = generateKaigiX25519KeyPair();
    const inviteSecretBase64Url = Buffer.from(
      "kaigi-create-secret",
      "utf8",
    ).toString("base64url");

    await expect(
      bridge.createKaigiMeeting({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        hostAccountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        callId: "wonderland:kaigi-private-room",
        title: "Private Room",
        scheduledStartMs: Date.now() + 60_000,
        meetingCode: "private-room",
        inviteSecretBase64Url,
        hostDisplayName: "Alice",
        hostParticipantId: "alice",
        hostKaigiPublicKeyBase64Url: hostKaigiKeys.publicKeyBase64Url,
        offerDescription: {
          type: "offer",
          sdp: "offer-sdp",
        },
        privacyMode: "private",
        peerIdentityReveal: "Hidden",
      }),
    ).resolves.toEqual({
      hash: "aa".repeat(32),
    });

    expect(mocks.buildCreateKaigiTransactionMock).not.toHaveBeenCalled();
    expect(mocks.submitSignedTransactionMock).not.toHaveBeenCalled();
    expect(mocks.buildPrivateCreateKaigiTransactionMock).toHaveBeenCalled();
    expect(mocks.buildPrivateKaigiFeeSpendMock).toHaveBeenCalled();
    expect(mocks.submitTransactionEntrypointMock).toHaveBeenCalledWith(
      expect.anything(),
      Buffer.from("private-create-entrypoint", "utf8"),
      expect.objectContaining({
        hashHex: "aa".repeat(32),
      }),
    );
    expect(mocks.submitTransactionMock).toHaveBeenCalledWith(
      versionedPayload(Buffer.from("private-create-entrypoint", "utf8")),
    );

    const createCalls = mocks.buildPrivateCreateKaigiTransactionMock.mock
      .calls as unknown as Array<[Record<string, any>]>;
    const lastCreateInput = createCalls.at(-1)?.[0];
    expect(lastCreateInput).toBeDefined();
    if (!lastCreateInput) {
      throw new Error("private create input missing");
    }
    expect(lastCreateInput.call.privacy_mode.mode).toBe("ZkRosterV1");
    expect(lastCreateInput.call.room_policy.policy).toBe("Authenticated");
    expect(lastCreateInput.call.id).toEqual({
      domain_id: "wonderland.universal",
      call_name: "kaigi-private-room",
    });
    expect(lastCreateInput.artifacts.commitment.commitment).toMatch(/^hash:/);
    expect(lastCreateInput.feeSpend.asset_definition_id).toBe("xor#universal");
    expect(lastCreateInput.feeSpend.proof).toBe(
      Buffer.from("fee-proof", "utf8").toString("base64"),
    );

    const encryptedOffer =
      lastCreateInput.call.metadata.kaigi_call.encryptedOffer;
    const decryptedOffer = decryptKaigiPayloadWithSecret<{
      callId: string;
      hostDisplayName: string;
      hostParticipantId: string;
      description: { type: string; sdp: string };
    }>(encryptedOffer, inviteSecretBase64Url);
    expect(decryptedOffer).toMatchObject({
      callId: "wonderland.universal:kaigi-private-room",
      hostDisplayName: "Alice",
      hostParticipantId: "alice",
      description: {
        type: "offer",
        sdp: "offer-sdp",
      },
    });
  });

  it("submits private entrypoints as versioned Norito requests before Torii sees raw frames", async () => {
    const bridge = await loadBridge();
    const hostKaigiKeys = generateKaigiX25519KeyPair();
    const inviteSecretBase64Url = Buffer.from(
      "kaigi-create-secret",
      "utf8",
    ).toString("base64url");
    const rawEntrypoint = Buffer.from([0x99, 0x01, 0x42]);
    const framedEntrypoint = buildNrt0Frame(rawEntrypoint);
    const versionedEntrypoint = versionedPayload(rawEntrypoint);
    const hashHex = "aa".repeat(32);
    const framedBuildResult = {
      transactionEntrypoint: framedEntrypoint,
      hash: Buffer.from(hashHex, "hex"),
      actionHash: Buffer.from("bb".repeat(32), "hex"),
    };
    for (let index = 0; index < 10; index += 1) {
      mocks.buildPrivateCreateKaigiTransactionMock.mockReturnValueOnce(
        framedBuildResult,
      );
    }

    await expect(
      bridge.createKaigiMeeting({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        hostAccountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        callId: "wonderland:kaigi-private-room",
        title: "Private Room",
        scheduledStartMs: Date.now() + 60_000,
        meetingCode: "private-room",
        inviteSecretBase64Url,
        hostDisplayName: "Alice",
        hostParticipantId: "alice",
        hostKaigiPublicKeyBase64Url: hostKaigiKeys.publicKeyBase64Url,
        offerDescription: {
          type: "offer",
          sdp: "offer-sdp",
        },
        privacyMode: "private",
        peerIdentityReveal: "Hidden",
      }),
    ).resolves.toEqual({
      hash: hashHex,
    });

    expect(mocks.submitTransactionEntrypointMock).toHaveBeenCalledTimes(1);
    expect(mocks.submitTransactionEntrypointMock.mock.calls[0]?.[1]).toEqual(
      framedEntrypoint,
    );
    expect(mocks.submitTransactionMock).toHaveBeenCalledWith(
      versionedEntrypoint,
    );
  });

  it("joins a private Kaigi meeting through the authority-free entrypoint path", async () => {
    const bridge = await loadBridge();
    const hostKaigiKeys = generateKaigiX25519KeyPair();

    await expect(
      bridge.joinKaigiMeeting({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        participantAccountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "22".repeat(32),
        callId: "wonderland:kaigi-private-room",
        hostAccountId: "sora:host",
        hostKaigiPublicKeyBase64Url: hostKaigiKeys.publicKeyBase64Url,
        participantId: "guest",
        participantName: "Guest",
        roomId: "wonderland:kaigi-private-room",
        privacyMode: "private",
        rosterRootHex: "ab".repeat(32),
        answerDescription: {
          type: "answer",
          sdp: "answer-sdp",
        },
      }),
    ).resolves.toEqual({
      hash: "cc".repeat(32),
    });

    expect(mocks.buildJoinKaigiTransactionMock).not.toHaveBeenCalled();
    expect(mocks.buildPrivateJoinKaigiTransactionMock).toHaveBeenCalled();
    expect(mocks.submitTransactionEntrypointMock).toHaveBeenCalledWith(
      expect.anything(),
      Buffer.from("private-join-entrypoint", "utf8"),
      expect.objectContaining({
        hashHex: "cc".repeat(32),
      }),
    );
    expect(mocks.submitTransactionMock).toHaveBeenCalledWith(
      versionedPayload(Buffer.from("private-join-entrypoint", "utf8")),
    );

    const joinCalls = mocks.buildPrivateJoinKaigiTransactionMock.mock
      .calls as unknown as Array<[Record<string, any>]>;
    const lastJoinInput = joinCalls.at(-1)?.[0];
    expect(lastJoinInput).toBeDefined();
    if (!lastJoinInput) {
      throw new Error("private join input missing");
    }
    expect(lastJoinInput.callId).toBe(
      "wonderland.universal:kaigi-private-room",
    );
    expect(lastJoinInput.artifacts.roster_root).toMatch(/^hash:/);
    const decryptedAnswer = decryptKaigiPayload<{
      callId: string;
      participantId: string;
      participantName: string;
      roomId: string;
      description: { type: string; sdp: string };
    }>(lastJoinInput.metadata.kaigi_signal.encryptedSignal, hostKaigiKeys);
    expect(decryptedAnswer).toMatchObject({
      callId: "wonderland.universal:kaigi-private-room",
      participantId: "guest",
      participantName: "Guest",
      roomId: "wonderland:kaigi-private-room",
      description: {
        type: "answer",
        sdp: "answer-sdp",
      },
    });
  });

  it("ends a private Kaigi meeting through the authority-free entrypoint path", async () => {
    const bridge = await loadBridge();
    mocks.getKaigiCallMock.mockResolvedValue({
      privacy_mode: "ZkRosterV1",
      roster_root_hex: "cd".repeat(32),
    });

    await expect(
      bridge.endKaigiMeeting({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        hostAccountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        callId: "wonderland:kaigi-private-room",
        endedAtMs: Date.now(),
      }),
    ).resolves.toEqual({
      hash: "ee".repeat(32),
    });

    expect(mocks.buildEndKaigiTransactionMock).not.toHaveBeenCalled();
    expect(mocks.buildPrivateEndKaigiTransactionMock).toHaveBeenCalled();
    expect(mocks.submitTransactionEntrypointMock).toHaveBeenCalledWith(
      expect.anything(),
      Buffer.from("private-end-entrypoint", "utf8"),
      expect.objectContaining({
        hashHex: "ee".repeat(32),
      }),
    );
    expect(mocks.submitTransactionMock).toHaveBeenCalledWith(
      versionedPayload(Buffer.from("private-end-entrypoint", "utf8")),
    );
  });

  it("makes an accepted self-shield immediately spendable before explorer hydration catches up", async () => {
    mocks.listAccountTransactionsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    const bridge = await loadBridge();

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: ALICE_ACCOUNT_ID,
        quantity: "5",
        privateKeyHex: "11".repeat(32),
        shielded: true,
      }),
    ).resolves.toEqual({
      hash: "hash-shield-xor",
    });

    await expect(
      bridge.getConfidentialAssetBalance({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        assetDefinitionId: "xor#universal",
      }),
    ).resolves.toMatchObject({
      resolvedAssetId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      quantity: "5",
      onChainQuantity: "0",
      spendableQuantity: "5",
      exact: true,
    });
  });

  it("builds a real unshield transaction and debits spendable balance immediately after commit", async () => {
    const receiveAddress = deriveWalletConfidentialReceiveAddress({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "5",
      ownerTagHex: receiveAddress.ownerTagHex,
      diversifierHex: receiveAddress.diversifierHex,
      createdAtMs: Date.now(),
    });
    const nullifierHex = deriveWalletConfidentialNullifierHex({
      privateKeyHex: "11".repeat(32),
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      rhoHex: note.rho_hex,
    });
    mocks.buildConfidentialUnshieldProofV2Mock.mockImplementationOnce(() => ({
      nullifiers: [Buffer.from(nullifierHex, "hex")],
      root: Buffer.from("44".repeat(32), "hex"),
      proof: Buffer.from("unshield-proof", "utf8"),
    }));
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "5",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: ALICE_ACCOUNT_ID,
        quantity: "5",
        privateKeyHex: "11".repeat(32),
        unshield: true,
      }),
    ).resolves.toEqual({
      hash: "hash-unshield",
    });

    expect(mocks.buildConfidentialUnshieldProofV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
        publicAmount: "5",
        inputs: [
          expect.objectContaining({
            amount: "5",
            rhoHex: note.rho_hex,
            diversifierHex: note.diversifier_hex,
            leafIndex: 0,
          }),
        ],
      }),
    );
    expect(mocks.buildUnshieldTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        }),
        unshield: expect.objectContaining({
          assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
          destinationAccountId: ALICE_ACCOUNT_ID,
          publicAmount: "5",
        }),
      }),
    );

    await expect(
      bridge.getConfidentialAssetBalance({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        assetDefinitionId: "xor#universal",
      }),
    ).resolves.toMatchObject({
      resolvedAssetId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      quantity: "0",
      onChainQuantity: "5",
      spendableQuantity: "0",
      exact: true,
    });
  });

  it("accepts committed transaction detail when pipeline status lags at Applied", async () => {
    const ownerTagHex = deriveWalletConfidentialOwnerTagHex({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "5",
      ownerTagHex,
      createdAtMs: Date.now(),
    });
    const nullifierHex = deriveWalletConfidentialNullifierHex({
      privateKeyHex: "11".repeat(32),
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      rhoHex: note.rho_hex,
    });
    mocks.buildConfidentialUnshieldProofV2Mock.mockImplementationOnce(() => ({
      nullifiers: [Buffer.from(nullifierHex, "hex")],
      root: Buffer.from("44".repeat(32), "hex"),
      proof: Buffer.from("unshield-proof", "utf8"),
    }));
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Applied",
      },
    });
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "5",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        if (
          method === "GET" &&
          href.includes("/v1/transactions/hash-unshield")
        ) {
          return jsonResponse({
            hash: "hash-unshield",
            status: "Committed",
            block: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    const transferPromise = bridge.transferAsset({
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      assetDefinitionId: "xor#universal",
      accountId: ALICE_ACCOUNT_ID,
      destinationAccountId: ALICE_ACCOUNT_ID,
      quantity: "5",
      privateKeyHex: "11".repeat(32),
      unshield: true,
    });

    await expect(transferPromise).resolves.toEqual({
      hash: "hash-unshield",
    });
    expect(mocks.nodeFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/transactions/hash-unshield"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("accepts Applied unshield finality even when transaction detail also lags", async () => {
    const ownerTagHex = deriveWalletConfidentialOwnerTagHex({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "5",
      ownerTagHex,
      createdAtMs: Date.now(),
    });
    const nullifierHex = deriveWalletConfidentialNullifierHex({
      privateKeyHex: "11".repeat(32),
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      rhoHex: note.rho_hex,
    });
    mocks.buildConfidentialUnshieldProofV2Mock.mockImplementationOnce(() => ({
      nullifiers: [Buffer.from(nullifierHex, "hex")],
      root: Buffer.from("44".repeat(32), "hex"),
      proof: Buffer.from("unshield-proof", "utf8"),
    }));
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Applied",
      },
    });
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "5",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        if (
          method === "GET" &&
          href.includes("/v1/transactions/hash-unshield")
        ) {
          return jsonResponse({
            hash: "hash-unshield",
            status: "Applied",
            block: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    const transferPromise = bridge.transferAsset({
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      assetDefinitionId: "xor#universal",
      accountId: ALICE_ACCOUNT_ID,
      destinationAccountId: ALICE_ACCOUNT_ID,
      quantity: "5",
      privateKeyHex: "11".repeat(32),
      unshield: true,
    });

    await expect(transferPromise).resolves.toEqual({
      hash: "hash-unshield",
    });
  });

  it("uses the v3 unshield circuit to preserve private change outputs", async () => {
    const receiveAddress = deriveWalletConfidentialReceiveAddress({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "7",
      ownerTagHex: receiveAddress.ownerTagHex,
      diversifierHex: receiveAddress.diversifierHex,
      createdAtMs: Date.now(),
    });
    const inputNullifierHex = deriveWalletConfidentialNullifierHex({
      privateKeyHex: "11".repeat(32),
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      rhoHex: note.rho_hex,
    });
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    mocks.getVerifyingKeyTypedMock.mockImplementationOnce(
      async (backend: string, name: string) => ({
        id: {
          backend,
          name,
        },
        record: {
          circuit_id:
            name === "vk_unshield"
              ? "halo2/pasta/ipa/anon-unshield-2in-1change-merkle16-poseidon-diversified"
              : "halo2/ipa:tiny-add",
          inline_key: {
            backend,
            bytes_b64: Buffer.from("fixture-vk", "utf8").toString("base64"),
          },
        },
        inline_key: {
          backend,
          bytes_b64: Buffer.from("fixture-vk", "utf8").toString("base64"),
        },
      }),
    );
    mocks.buildConfidentialUnshieldProofV3Mock.mockImplementationOnce(() => ({
      nullifiers: [Buffer.from(inputNullifierHex, "hex")],
      outputCommitments: [Buffer.from("55".repeat(32), "hex")],
      root: Buffer.from("44".repeat(32), "hex"),
      proof: Buffer.from("unshield-proof-v3", "utf8"),
    }));
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "7",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: ALICE_ACCOUNT_ID,
        quantity: "5",
        privateKeyHex: "11".repeat(32),
        unshield: true,
      }),
    ).resolves.toEqual({
      hash: "hash-unshield",
    });

    expect(mocks.buildConfidentialUnshieldProofV3Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
        publicAmount: "5",
        inputs: [
          expect.objectContaining({
            amount: "7",
            rhoHex: note.rho_hex,
            diversifierHex: note.diversifier_hex,
            leafIndex: 0,
          }),
        ],
        outputs: [expect.objectContaining({ amount: "2" })],
      }),
    );
    expect(mocks.buildUnshieldTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        }),
        unshield: expect.objectContaining({
          assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
          destinationAccountId: ALICE_ACCOUNT_ID,
          publicAmount: "5",
          outputs: [Buffer.from("55".repeat(32), "hex")],
        }),
      }),
    );

    await expect(
      bridge.getConfidentialAssetBalance({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        assetDefinitionId: "xor#universal",
      }),
    ).resolves.toMatchObject({
      resolvedAssetId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      quantity: "2",
      onChainQuantity: "7",
      spendableQuantity: "2",
      exact: true,
    });
  });

  it("falls back to the live funded asset bucket when xor#universal policy lookup returns 404", async () => {
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          href.includes("/v1/confidential/assets/xor%23universal/transitions")
        ) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Confidential asset policy request failed",
              status: 404,
            },
            404,
          );
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
          )
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Confidential note index request failed",
              status: 404,
            },
            404,
          );
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        if (
          method === "POST" &&
          href.endsWith("/v1/confidential/relay/submit")
        ) {
          return jsonResponse({
            tx_hash_hex: RELAY_TX_HASH,
            relay_authority: "relay-1",
          });
        }
        if (
          method === "GET" &&
          href.includes("/v1/accounts/") &&
          href.includes("/assets")
        ) {
          return jsonResponse({
            items: [
              {
                asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}##${ALICE_ACCOUNT_ID}`,
                quantity: "9",
              },
            ],
            total: 1,
          });
        }
        if (method === "GET" && href.includes("/v1/explorer/transactions/")) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Failed to process query",
              status: 404,
            },
            404,
          );
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: ALICE_ACCOUNT_ID,
        quantity: "5",
        privateKeyHex: "11".repeat(32),
        shielded: true,
      }),
    ).resolves.toEqual({
      hash: "hash-shield-xor",
    });

    await expect(
      bridge.getConfidentialAssetBalance({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        assetDefinitionId: "xor#universal",
      }),
    ).resolves.toMatchObject({
      resolvedAssetId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      spendableQuantity: "5",
      exact: true,
    });

    expect(mocks.buildShieldTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        }),
        shield: expect.objectContaining({
          assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
        }),
      }),
    );
  });

  it("heals stale canonical policy lookups through the account-aware bridge path", async () => {
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          href.includes(
            "/v1/confidential/assets/5OldBucket1111111111111111111/transitions",
          )
        ) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Confidential asset policy request failed",
              status: 404,
            },
            404,
          );
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
          )
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (
          method === "GET" &&
          href.includes("/v1/accounts/") &&
          href.includes("/assets")
        ) {
          return jsonResponse({
            items: [
              {
                asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}##${ALICE_ACCOUNT_ID}`,
                quantity: "9",
              },
            ],
            total: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    await expect(
      bridge.getConfidentialAssetPolicy({
        toriiUrl: "https://taira.sora.org",
        accountId: ALICE_ACCOUNT_ID,
        assetDefinitionId: "5OldBucket1111111111111111111",
      }),
    ).resolves.toMatchObject({
      asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      effective_mode: "Convertible",
    });
  });

  it("refuses to guess across multiple live funded asset buckets on policy 404", async () => {
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          href.includes(
            "/v1/confidential/assets/5OldBucket1111111111111111111/transitions",
          )
        ) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Confidential asset policy request failed",
              status: 404,
            },
            404,
          );
        }
        if (
          method === "GET" &&
          href.includes("/v1/accounts/") &&
          href.includes("/assets")
        ) {
          return jsonResponse({
            items: [
              {
                asset_id: `${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}##${ALICE_ACCOUNT_ID}`,
                quantity: "9",
              },
              {
                asset_id: `72AnotherLiveBucket1111111111##${ALICE_ACCOUNT_ID}`,
                quantity: "4",
              },
            ],
            total: 2,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    await expect(
      bridge.getConfidentialAssetPolicy({
        toriiUrl: "https://taira.sora.org",
        accountId: ALICE_ACCOUNT_ID,
        assetDefinitionId: "5OldBucket1111111111111111111",
      }),
    ).rejects.toThrow(
      "Confidential asset policy request failed with status 404 (ERR)",
    );

    const policyFetches = mocks.nodeFetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/v1/confidential/assets/"),
    );
    expect(policyFetches).toHaveLength(1);
  });

  it("does not retry account-asset fallback for policy 500 responses", async () => {
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          href.includes("/v1/confidential/assets/xor%23universal/transitions")
        ) {
          return jsonResponse(
            {
              error: "request_failed",
              message: "Confidential asset policy request failed",
              status: 500,
            },
            500,
          );
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();

    await expect(
      bridge.getConfidentialAssetPolicy({
        toriiUrl: "https://taira.sora.org",
        accountId: ALICE_ACCOUNT_ID,
        assetDefinitionId: "xor#universal",
      }),
    ).rejects.toThrow(
      "Confidential asset policy request failed with status 500 (ERR)",
    );

    expect(
      mocks.nodeFetchMock.mock.calls.some(
        ([input]) =>
          String(input).includes("/v1/accounts/") &&
          String(input).includes("/assets"),
      ),
    ).toBe(false);
  });

  it("keeps recipient shielded sends blocked until the global note index catches up", async () => {
    mocks.listAccountTransactionsMock.mockResolvedValue({
      items: [],
      total: 0,
    });
    const bridge = await loadBridge();

    await bridge.transferAsset({
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      assetDefinitionId: "xor#universal",
      accountId: ALICE_ACCOUNT_ID,
      destinationAccountId: ALICE_ACCOUNT_ID,
      quantity: "5",
      privateKeyHex: "11".repeat(32),
      shielded: true,
    });

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
        shielded: true,
      }),
    ).rejects.toThrow(
      "Confidential note index is unavailable for this asset; recipient shielded transfers require the global note index.",
    );

    await expect(
      bridge.getConfidentialAssetBalance({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        assetDefinitionId: "xor#universal",
      }),
    ).resolves.toMatchObject({
      resolvedAssetId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      quantity: "5",
      spendableQuantity: "5",
      exact: true,
    });
  });

  it("falls back to an older compatible root from the recent root window", async () => {
    const ownerTagHex = deriveWalletConfidentialOwnerTagHex({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "5",
      ownerTagHex,
      createdAtMs: Date.now(),
    });
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    let rootsRequestCount = 0;
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "5",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          rootsRequestCount += 1;
          return jsonResponse({
            latest: "55".repeat(32),
            roots: ["44".repeat(32), "55".repeat(32)],
            height: 2,
          });
        }
        if (
          method === "POST" &&
          href.endsWith("/v1/confidential/relay/submit")
        ) {
          return jsonResponse({
            tx_hash_hex: RELAY_TX_HASH,
            relay_authority: "relay-1",
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    mocks.buildConfidentialTransferProofV2Mock
      .mockImplementationOnce(() => {
        throw new Error("tree commitments do not match the supplied root_hint");
      })
      .mockImplementation((input?: { rootHintHex?: string }) => ({
        nullifiers: [Buffer.from("11".repeat(32), "hex")],
        outputCommitments: [Buffer.from("22".repeat(32), "hex")],
        root: Buffer.from(String(input?.rootHintHex ?? "44".repeat(32)), "hex"),
        proof: Buffer.from("transfer-proof", "utf8"),
      }));
    const bridge = await loadBridge();
    const recipient = bridge.deriveConfidentialReceiveAddress("22".repeat(32));
    const recipientSignal = generateKaigiX25519KeyPair();

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
        shielded: true,
        shieldedReceiveKeyId: "recipient-receive-key",
        shieldedReceivePublicKeyBase64Url: recipientSignal.publicKeyBase64Url,
        shieldedOwnerTagHex: recipient.ownerTagHex,
        shieldedDiversifierHex: recipient.diversifierHex,
      }),
    ).resolves.toEqual({
      hash: RELAY_TX_HASH,
    });

    expect(mocks.buildZkTransferTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        }),
      }),
    );
    expect(mocks.buildConfidentialTransferProofV2Mock).toHaveBeenCalledTimes(2);
    expect(mocks.buildConfidentialTransferProofV2Mock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        rootHintHex: "55".repeat(32),
      }),
    );
    expect(mocks.buildConfidentialTransferProofV2Mock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rootHintHex: "44".repeat(32),
      }),
    );
    expect(rootsRequestCount).toBe(1);
  });

  it("retries recipient shielded sends after refreshing a stale confidential root hint", async () => {
    const ownerTagHex = deriveWalletConfidentialOwnerTagHex({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "5",
      ownerTagHex,
      createdAtMs: Date.now(),
    });
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    let rootsRequestCount = 0;
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "5",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          rootsRequestCount += 1;
          const latestRootHex =
            rootsRequestCount === 1 ? "44".repeat(32) : "55".repeat(32);
          return jsonResponse({
            latest: latestRootHex,
            roots: [latestRootHex],
            height: rootsRequestCount,
          });
        }
        if (
          method === "POST" &&
          href.endsWith("/v1/confidential/relay/submit")
        ) {
          return jsonResponse({
            tx_hash_hex: RELAY_TX_HASH,
            relay_authority: "relay-1",
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    mocks.buildConfidentialTransferProofV2Mock
      .mockImplementationOnce(() => {
        throw new Error("tree commitments do not match the supplied root_hint");
      })
      .mockImplementation((input?: { rootHintHex?: string }) => ({
        nullifiers: [Buffer.from("11".repeat(32), "hex")],
        outputCommitments: [Buffer.from("22".repeat(32), "hex")],
        root: Buffer.from(String(input?.rootHintHex ?? "44".repeat(32)), "hex"),
        proof: Buffer.from("transfer-proof", "utf8"),
      }));
    const bridge = await loadBridge();
    const recipient = bridge.deriveConfidentialReceiveAddress("22".repeat(32));
    const recipientSignal = generateKaigiX25519KeyPair();

    const transferPromise = bridge.transferAsset({
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      assetDefinitionId: "xor#universal",
      accountId: ALICE_ACCOUNT_ID,
      destinationAccountId: BOB_ACCOUNT_ID,
      quantity: "3",
      privateKeyHex: "11".repeat(32),
      shielded: true,
      shieldedReceiveKeyId: "recipient-receive-key",
      shieldedReceivePublicKeyBase64Url: recipientSignal.publicKeyBase64Url,
      shieldedOwnerTagHex: recipient.ownerTagHex,
      shieldedDiversifierHex: recipient.diversifierHex,
    });
    await vi.runAllTimersAsync();

    await expect(transferPromise).resolves.toEqual({
      hash: RELAY_TX_HASH,
    });
    expect(mocks.buildConfidentialTransferProofV2Mock).toHaveBeenCalledTimes(2);
    expect(mocks.buildConfidentialTransferProofV2Mock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        rootHintHex: "44".repeat(32),
      }),
    );
    expect(mocks.buildConfidentialTransferProofV2Mock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rootHintHex: "55".repeat(32),
      }),
    );
    expect(rootsRequestCount).toBe(2);
  });

  it("treats relay transfers as committed once the confidential note index includes the relay hash", async () => {
    const ownerTagHex = deriveWalletConfidentialOwnerTagHex({
      privateKeyHex: "11".repeat(32),
    });
    const note = createWalletConfidentialNote({
      assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      amount: "5",
      ownerTagHex,
      createdAtMs: Date.now(),
    });
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    let relaySubmitted = false;
    mocks.getTransactionStatusMock.mockResolvedValue({
      status: {
        kind: "Applied",
      },
    });
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes(
            "/v1/confidential/assets/xor%23universal/transitions",
          ) ||
            href.includes(
              `/v1/confidential/assets/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}/transitions`,
            ))
        ) {
          return jsonResponse({
            asset_id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            block_height: 1,
            current_mode: "Convertible",
            effective_mode: "Convertible",
            vk_set_hash: null,
            poseidon_params_id: null,
            pedersen_params_id: null,
            pending_transition: null,
          });
        }
        if (method === "GET" && href.includes("/v1/confidential/notes")) {
          return jsonResponse({
            items: [
              {
                entrypoint_hash: "aa".repeat(32),
                result_ok: true,
                authority: ALICE_ACCOUNT_ID,
                block: 1,
                metadata,
                instructions: [
                  {
                    zk: {
                      Shield: {
                        asset: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
                        from: ALICE_ACCOUNT_ID,
                        amount: "5",
                        note_commitment: note.commitment_hex,
                      },
                    },
                  },
                ],
              },
              ...(relaySubmitted
                ? [
                    {
                      entrypoint_hash: RELAY_TX_HASH,
                      result_ok: true,
                      authority: "relay-1",
                      block: 2,
                      metadata: {},
                      instructions: [],
                    },
                  ]
                : []),
            ],
            next_cursor: "",
          });
        }
        if (
          method === "GET" &&
          href.includes(
            `/v1/assets/definitions/${LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID}`,
          )
        ) {
          return jsonResponse({
            id: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
            metadata: {
              "zk.policy": {
                allow_unshield: true,
                vk_transfer: "halo2/ipa::vk_transfer",
                vk_unshield: "halo2/ipa::vk_unshield",
              },
            },
          });
        }
        if (method === "POST" && href.endsWith("/v1/zk/roots")) {
          return jsonResponse({
            latest: "44".repeat(32),
            roots: ["44".repeat(32)],
            height: 1,
          });
        }
        if (
          method === "POST" &&
          href.endsWith("/v1/confidential/relay/submit")
        ) {
          relaySubmitted = true;
          return jsonResponse({
            tx_hash_hex: RELAY_TX_HASH,
            relay_authority: "relay-1",
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
    const bridge = await loadBridge();
    const recipient = bridge.deriveConfidentialReceiveAddress("22".repeat(32));
    const recipientSignal = generateKaigiX25519KeyPair();

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        assetDefinitionId: "xor#universal",
        accountId: ALICE_ACCOUNT_ID,
        destinationAccountId: BOB_ACCOUNT_ID,
        quantity: "3",
        privateKeyHex: "11".repeat(32),
        shielded: true,
        shieldedReceiveKeyId: "recipient-receive-key",
        shieldedReceivePublicKeyBase64Url: recipientSignal.publicKeyBase64Url,
        shieldedOwnerTagHex: recipient.ownerTagHex,
        shieldedDiversifierHex: recipient.diversifierHex,
      }),
    ).resolves.toEqual({
      hash: RELAY_TX_HASH,
    });

    expect(mocks.getTransactionStatusMock).toHaveBeenCalledWith(RELAY_TX_HASH);
  });

  it("reports shielded XOR state and self-shields through the preload helper", async () => {
    const bridge = await loadBridge();

    await expect(
      bridge.getPrivateKaigiConfidentialXorState({
        toriiUrl: "https://taira.sora.org",
        accountId: ALICE_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({
      assetDefinitionId: "xor#universal",
      resolvedAssetId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
      policyMode: "Convertible",
      shieldedBalance: "5",
      shieldedBalanceExact: true,
      transparentBalance: "9",
      canSelfShield: true,
    });

    await expect(
      bridge.selfShieldPrivateKaigiXor({
        toriiUrl: "https://taira.sora.org",
        chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
        accountId: ALICE_ACCOUNT_ID,
        privateKeyHex: "11".repeat(32),
        amount: "1.2",
      }),
    ).resolves.toEqual({
      hash: "hash-shield-xor",
    });

    expect(mocks.buildShieldTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          gas_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        }),
        shield: expect.objectContaining({
          assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
          amount: "2",
        }),
      }),
    );
  });

  it("exports and restores encrypted confidential wallet backup state", async () => {
    mocks.listAccountTransactionsMock.mockResolvedValue({
      items: [
        {
          entrypoint_hash: "tx-shadow",
          result_ok: true,
          authority: ALICE_ACCOUNT_ID,
          block: 42,
          instructions: [],
        },
      ],
      total: 1,
    });
    const bridge = await loadBridge();
    const shadowKey =
      `iroha-demo:confidential-wallet:https://taira.sora.org` +
      ALICE_ACCOUNT_ID.toLowerCase();
    mocks.storedReceiveKeys.set("receive-key-1", {
      keyId: "receive-key-1",
      accountId: ALICE_ACCOUNT_ID,
      ownerTagHex: "11".repeat(32),
      diversifierHex: "22".repeat(32),
      publicKeyBase64Url: "receivePublicKey",
      privateKeyBase64Url: "receivePrivateKey",
      createdAtMs: 1,
    });
    globalThis.localStorage?.setItem(
      shadowKey,
      JSON.stringify({
        transactions: [
          {
            hash: "0xshadow",
            createdAtMs: 1,
            authority: ALICE_ACCOUNT_ID,
            metadata: {
              kept: true,
            },
            instructions: [],
          },
        ],
      }),
    );

    const exported = await bridge.exportConfidentialWalletBackup({
      toriiUrl: "https://taira.sora.org",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      accountId: ALICE_ACCOUNT_ID,
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    });

    expect(exported).toMatchObject({
      schema: "iroha-demo-confidential-wallet-backup/v2",
      accountId: ALICE_ACCOUNT_ID,
      scanWatermarkBlock: 42,
      stateBox: {
        kdf: "HKDF-SHA256",
        cipher: "AES-256-GCM",
      },
    });

    mocks.storedReceiveKeys = new Map<string, Record<string, unknown>>();
    globalThis.localStorage?.clear();

    await bridge.importConfidentialWalletBackup({
      toriiUrl: "https://taira.sora.org",
      accountId: ALICE_ACCOUNT_ID,
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      confidentialWallet: exported,
    });

    expect([...mocks.storedReceiveKeys.values()]).toHaveLength(1);
    expect(
      JSON.parse(globalThis.localStorage?.getItem(shadowKey) ?? "{}"),
    ).toMatchObject({
      transactions: [
        {
          hash: "0xshadow",
          authority: ALICE_ACCOUNT_ID,
        },
      ],
    });
  });
});
