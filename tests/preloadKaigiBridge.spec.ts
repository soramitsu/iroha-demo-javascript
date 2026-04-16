import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWalletConfidentialMetadata,
  createWalletConfidentialNote,
  deriveWalletConfidentialNullifierHex,
  deriveWalletConfidentialOwnerTagHex,
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
  "testuロ1PクCカrムhyワエトhウヤSqP2GFGラヱミケヌマzヘオミMヌヨトksJヱRRJXVB";
const BOB_ACCOUNT_ID =
  "testuロ1Prヌuノノ4メdロムイトn5tニメrsR9ヒ2Gキ7gWeFzyチヒチAHフTJQQ4L";
const LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID =
  "61CtjvNd9T3THAR65GsMVHr82Bjc";
const RELAY_TX_HASH = "ab".repeat(32);

const mocks = vi.hoisted(() => ({
  exposedApi: null as any,
  normalizeCanonicalAccountIdLiteralMock: vi.fn(),
  normalizeCompatAccountIdLiteralMock: vi.fn(),
  requestFaucetFundsWithPuzzleMock: vi.fn(),
  getTransactionStatusMock: vi.fn(),
  getStatusSnapshotMock: vi.fn(),
  listKaigiRelaysMock: vi.fn(),
  getKaigiRelayMock: vi.fn(),
  getKaigiCallMock: vi.fn(),
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
  buildConfidentialTransferProofV2Mock: vi.fn(() => ({
    nullifiers: [Buffer.from("11".repeat(32), "hex")],
    outputCommitments: [Buffer.from("22".repeat(32), "hex")],
    root: Buffer.from("44".repeat(32), "hex"),
    proof: Buffer.from("transfer-proof", "utf8"),
  })),
  buildConfidentialUnshieldProofV2Mock: vi.fn(() => ({
    nullifiers: [Buffer.from("11".repeat(32), "hex")],
    root: Buffer.from("44".repeat(32), "hex"),
    proof: Buffer.from("unshield-proof", "utf8"),
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
  buildPrivateKaigiFeeSpendMock: vi.fn(() => ({
    asset_definition_id: "xor#universal",
    anchor_root: Buffer.from("44".repeat(32), "hex"),
    nullifiers: [Buffer.from("11".repeat(32), "hex")],
    output_commitments: [Buffer.from("22".repeat(32), "hex")],
    encrypted_change_payloads: [Buffer.from([0xde, 0xad])],
    proof: Buffer.from("fee-proof", "utf8"),
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
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => {
      if (name === "iroha") {
        mocks.exposedApi = api;
      }
    },
  },
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("../electron/nodeFetch", () => ({
  nodeFetch: (input: unknown, init?: Record<string, unknown>) =>
    mocks.nodeFetchMock(input, init),
}));

vi.mock("../electron/accountAddress", () => ({
  deriveAccountAddressView: vi.fn(),
  normalizeCanonicalAccountIdLiteral: (
    value: string,
    label?: string,
    networkPrefix?: number,
  ) =>
    mocks.normalizeCanonicalAccountIdLiteralMock(value, label, networkPrefix),
  normalizeCompatAccountIdLiteral: (value: string, label?: string) =>
    mocks.normalizeCompatAccountIdLiteralMock(value, label),
}));

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
  }

  return {
    ...actual,
    ToriiClient: MockToriiClient,
    buildConfidentialTransferProofV2:
      mocks.buildConfidentialTransferProofV2Mock,
    buildConfidentialUnshieldProofV2:
      mocks.buildConfidentialUnshieldProofV2Mock,
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
    buildRegisterAccountAndTransferTransaction: vi.fn(),
    buildTransaction: vi.fn(),
    buildTransferAssetTransaction: vi.fn(),
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
  };
};

describe("preload Kaigi bridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00.000Z"));
    globalThis.localStorage?.clear();
    mocks.normalizeCanonicalAccountIdLiteralMock.mockReset();
    mocks.normalizeCompatAccountIdLiteralMock.mockReset();
    mocks.requestFaucetFundsWithPuzzleMock.mockReset();
    mocks.getTransactionStatusMock.mockReset();
    mocks.getStatusSnapshotMock.mockReset();
    mocks.listKaigiRelaysMock.mockReset();
    mocks.getKaigiRelayMock.mockReset();
    mocks.getKaigiCallMock.mockReset();
    mocks.listAccountTransactionsMock.mockReset();
    mocks.getConfigurationMock.mockReset();
    mocks.getVerifyingKeyTypedMock.mockReset();
    mocks.nodeFetchMock.mockReset();
    mocks.buildKaigiRosterJoinProofMock.mockClear();
    mocks.buildShieldTransactionMock.mockClear();
    mocks.buildUnshieldTransactionMock.mockClear();
    mocks.buildConfidentialTransferProofV2Mock.mockClear();
    mocks.buildConfidentialUnshieldProofV2Mock.mockClear();
    mocks.buildCreateKaigiTransactionMock.mockClear();
    mocks.buildJoinKaigiTransactionMock.mockClear();
    mocks.buildEndKaigiTransactionMock.mockClear();
    mocks.buildPrivateKaigiFeeSpendMock.mockClear();
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
        sumeragi: {
          tx_queue_saturated: false,
        },
      },
    });

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
    mocks.getVerifyingKeyTypedMock.mockResolvedValue({
      id: {
        backend: "halo2/ipa",
        name: "vk_transfer",
      },
      record: {
        circuit_id: "halo2/ipa:tiny-add",
        inline_key: {
          backend: "halo2/ipa",
          bytes_b64: Buffer.from("fixture-vk", "utf8").toString("base64"),
        },
      },
      inline_key: {
        backend: "halo2/ipa",
        bytes_b64: Buffer.from("fixture-vk", "utf8").toString("base64"),
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
      "Faucet claim 0xexpired-6 expired before TAIRA committed it. Please retry once the faucet queue clears.",
    );
    await vi.runAllTimersAsync();
    await rejection;
    expect(mocks.requestFaucetFundsWithPuzzleMock).toHaveBeenCalledTimes(6);
    expect(mocks.getTransactionStatusMock).toHaveBeenCalledTimes(6);
    expect(mocks.getStatusSnapshotMock).toHaveBeenCalledTimes(5);
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
        waitForCommit: true,
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
      callId: "wonderland:kaigi-private-room",
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
    expect(lastJoinInput.callId).toBe("wonderland:kaigi-private-room");
    expect(lastJoinInput.artifacts.roster_root).toMatch(/^hash:/);
    const decryptedAnswer = decryptKaigiPayload<{
      callId: string;
      participantId: string;
      participantName: string;
      roomId: string;
      description: { type: string; sdp: string };
    }>(lastJoinInput.metadata.kaigi_signal.encryptedSignal, hostKaigiKeys);
    expect(decryptedAnswer).toMatchObject({
      callId: "wonderland:kaigi-private-room",
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
    const metadata = buildWalletConfidentialMetadata({
      outputs: [{ note, recipientAccountId: ALICE_ACCOUNT_ID }],
    });
    mocks.nodeFetchMock.mockImplementation(
      async (input: unknown, init?: Record<string, unknown>) => {
        const href = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (
          method === "GET" &&
          (href.includes("/v1/confidential/assets/xor%23universal/transitions") ||
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
            leafIndex: 0,
          }),
        ],
      }),
    );
    expect(mocks.buildUnshieldTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
        shield: expect.objectContaining({
          assetDefinitionId: LIVE_CONFIDENTIAL_XOR_ASSET_DEFINITION_ID,
          amount: "2",
        }),
      }),
    );
  });
});
