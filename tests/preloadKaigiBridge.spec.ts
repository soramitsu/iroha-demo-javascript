import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const ALICE_ACCOUNT_ID =
  "testuﾛ1PｸCｶrﾑhyﾜｴﾄhｳﾔSqP2GFGﾗヱﾐｹﾇﾏzﾍｵﾐMﾇﾖﾄksJヱRRJXVB";
const BOB_ACCOUNT_ID = "testuﾛ1Prﾇuﾉﾉ4ﾒdﾛﾑｲﾄn5tﾆﾒrsR9ﾋ2Gｷ7gWeFzyﾁﾋﾁAHﾌTJQQ4L";
const LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID =
  "61CtjvNd9T3THAR65GsMVHr82Bjc";
const RELAY_TX_HASH = "ab".repeat(32);

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
  listKaigiRelaysMock: vi.fn(),
  getKaigiRelayMock: vi.fn(),
  getKaigiCallMock: vi.fn(),
  resolveAliasMock: vi.fn(),
  getExplorerAccountQrMock: vi.fn(),
  listAccountAssetsMock: vi.fn(),
  listAccountTransactionsMock: vi.fn(),
  getConfigurationMock: vi.fn(),
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
  submitTransactionEntrypointMock: vi.fn(
    async (
      _client: unknown,
      transactionEntrypoint: Buffer,
      options: { hashHex: string },
    ) => ({
      hash: options.hashHex,
      submission: {
        entrypoint: transactionEntrypoint.toString("utf8"),
      },
      status: {
        status: "Committed",
      },
    }),
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
    normalizeCompatAccountIdLiteral: (value: string, label?: string) =>
      mocks.normalizeCompatAccountIdLiteralMock(value, label),
  };
});

vi.mock("../electron/faucetApi", () => ({
  requestFaucetFundsWithPuzzle: (input: unknown, onStatus?: unknown) =>
    mocks.requestFaucetFundsWithPuzzleMock(input, onStatus),
}));

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

    getVerifyingKeyTyped(...args: unknown[]) {
      return mocks.getVerifyingKeyTypedMock(...args);
    }

    getTransactionStatus(...args: unknown[]) {
      return mocks.getTransactionStatusMock(...args);
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
    buildSoraCloudHfDeployRequest: mocks.buildSoraCloudHfDeployRequestMock,
    buildPrivateCreateKaigiTransaction:
      mocks.buildPrivateCreateKaigiTransactionMock,
    buildPrivateJoinKaigiTransaction:
      mocks.buildPrivateJoinKaigiTransactionMock,
    buildPrivateEndKaigiTransaction: mocks.buildPrivateEndKaigiTransactionMock,
    buildRegisterAccountAndTransferTransaction:
      mocks.buildRegisterAccountAndTransferTransactionMock,
    buildTransaction: mocks.buildTransactionMock,
    buildTransferAssetTransaction: mocks.buildTransferAssetTransactionMock,
    submitSignedTransaction: mocks.submitSignedTransactionMock,
    submitTransactionEntrypoint: mocks.submitTransactionEntrypointMock,
    normalizeAssetId: (value: string) => String(value).trim(),
    normalizeAccountId: (value: string) => String(value).trim(),
  };
});

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
    requestFaucetFunds: (
      input: Record<string, unknown>,
      onStatus?: (progress: unknown) => void,
    ) => Promise<Record<string, unknown>>;
    getNetworkStats: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    getChainMetadata: (
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    deploySoraCloudHf: (
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
    mocks.listKaigiRelaysMock.mockReset();
    mocks.getKaigiRelayMock.mockReset();
    mocks.getKaigiCallMock.mockReset();
    mocks.resolveAliasMock.mockReset();
    mocks.getExplorerAccountQrMock.mockReset();
    mocks.listAccountAssetsMock.mockReset();
    mocks.listAccountTransactionsMock.mockReset();
    mocks.getConfigurationMock.mockReset();
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
    mocks.buildTransferAssetTransactionMock.mockClear();
    mocks.buildRegisterAccountAndTransferTransactionMock.mockClear();
    mocks.buildPrivateKaigiFeeSpendMock.mockClear();
    mocks.buildSoraCloudHfDeployRequestMock.mockClear();
    mocks.buildPrivateCreateKaigiTransactionMock.mockClear();
    mocks.buildPrivateJoinKaigiTransactionMock.mockClear();
    mocks.buildPrivateEndKaigiTransactionMock.mockClear();
    mocks.submitSignedTransactionMock.mockClear();
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

  it("uses a full Minamoto source asset holding id for public transfers", async () => {
    const bridge = await loadBridge();
    const sourceAccountId =
      "sorauロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY";
    const destinationAccountId =
      "sorauロ1Prヌuノノ4メdロムイトn5tニメrsR9ヒ2Gキ7gWeFzyチヒチAHフTJQQ4L";

    await expect(
      bridge.transferAsset({
        toriiUrl: "https://minamoto.sora.org",
        chainId: "sora nexus main net",
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
      }),
    );
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
        chainId: "sora nexus main net",
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
