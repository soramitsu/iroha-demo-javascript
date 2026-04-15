import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const mocks = vi.hoisted(() => ({
  exposedApi: null as any,
  normalizeCanonicalAccountIdLiteralMock: vi.fn(),
  normalizeCompatAccountIdLiteralMock: vi.fn(),
  requestFaucetFundsWithPuzzleMock: vi.fn(),
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
  buildZkTransferTransactionMock: vi.fn(() => ({
    signedTransaction: Buffer.from("zk-transfer", "utf8"),
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

vi.mock("@iroha/iroha-js", () => {
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
  }

  return {
    ToriiClient: MockToriiClient,
    AccountAddress: {
      parseEncoded: vi.fn(() => ({
        address: {
          _controller: {
            publicKey: Buffer.alloc(32, 0x21),
          },
          canonicalBytes: () => Buffer.alloc(0),
        },
      })),
    },
    buildShieldTransaction: mocks.buildShieldTransactionMock,
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

vi.mock("@iroha/iroha-js/crypto", () => ({
  buildKaigiRosterJoinProof: (input: unknown) =>
    mocks.buildKaigiRosterJoinProofMock(
      input as { rosterRootHex?: string | null } | undefined,
    ),
  generateKeyPair: vi.fn(() => ({
    publicKey: Buffer.alloc(32, 0x21),
    privateKey: Buffer.alloc(32, 0x34),
  })),
  publicKeyFromPrivate: vi.fn(() => Buffer.alloc(32, 0x56)),
}));

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
    mocks.normalizeCanonicalAccountIdLiteralMock.mockReset();
    mocks.normalizeCompatAccountIdLiteralMock.mockReset();
    mocks.requestFaucetFundsWithPuzzleMock.mockReset();
    mocks.listKaigiRelaysMock.mockReset();
    mocks.getKaigiRelayMock.mockReset();
    mocks.getKaigiCallMock.mockReset();
    mocks.listAccountTransactionsMock.mockReset();
    mocks.getConfigurationMock.mockReset();
    mocks.getVerifyingKeyTypedMock.mockReset();
    mocks.nodeFetchMock.mockReset();
    mocks.buildKaigiRosterJoinProofMock.mockClear();
    mocks.buildShieldTransactionMock.mockClear();
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
          authority: "sora:alice",
          instructions: [
            {
              zk: {
                Shield: {
                  asset: "xor#universal",
                  from: "sora:alice",
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
          href.includes("/v1/confidential/assets/xor%23universal/transitions")
        ) {
          return jsonResponse({
            asset_id: "xor#universal",
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
          href.includes("/v1/assets/definitions/xor%23universal")
        ) {
          return jsonResponse({
            id: "xor#universal",
            metadata: {
              "zk.policy": {
                vk_transfer: "halo2/ipa::vk_transfer",
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
          href.includes("/v1/accounts/") &&
          href.includes("/assets")
        ) {
          return jsonResponse({
            items: [
              {
                asset_id: "xor#universal##sora:alice",
                quantity: "9",
              },
            ],
            total: 1,
          });
        }
        throw new Error(`Unexpected nodeFetch request: ${method} ${href}`);
      },
    );
  });

  afterEach(() => {
    mocks.exposedApi = null;
    vi.useRealTimers();
    vi.resetModules();
  });

  it("routes faucet requests through canonical account-id normalization", async () => {
    const bridge = await loadBridge();
    const onStatus = vi.fn();
    mocks.normalizeCanonicalAccountIdLiteralMock.mockImplementation(
      (value: string) => `canonical:${String(value).trim()}`,
    );

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
        hostAccountId: "sora:alice",
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
        participantAccountId: "sora:alice",
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
        hostAccountId: "sora:alice",
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

  it("reports shielded XOR state and self-shields through the preload helper", async () => {
    const bridge = await loadBridge();

    await expect(
      bridge.getPrivateKaigiConfidentialXorState({
        toriiUrl: "https://taira.sora.org",
        accountId: "sora:alice",
      }),
    ).resolves.toMatchObject({
      assetDefinitionId: "xor#universal",
      resolvedAssetId: "xor#universal",
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
        accountId: "sora:alice",
        privateKeyHex: "11".repeat(32),
        amount: "1.2",
      }),
    ).resolves.toEqual({
      hash: "hash-shield-xor",
    });

    expect(mocks.buildShieldTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shield: expect.objectContaining({
          assetDefinitionId: "xor#universal",
          amount: "2",
        }),
      }),
    );
  });
});
