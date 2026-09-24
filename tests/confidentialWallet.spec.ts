import { describe, expect, it } from "vitest";
import { AccountAddress, NetworkId } from "@iroha/iroha-js";
import {
  deriveConfidentialNoteV2,
  generateKeyPair,
} from "@iroha/iroha-js/crypto";
import {
  CONFIDENTIAL_WALLET_METADATA_KEY,
  CONFIDENTIAL_WALLET_METADATA_SCHEMA,
  CONFIDENTIAL_WALLET_NOTE_SCHEMA,
  collectWalletConfidentialLedger,
  deriveWalletConfidentialOwnerTagHex,
  deriveWalletConfidentialNullifierHex,
  deriveWalletConfidentialReceiveAddress,
  type WalletConfidentialNote,
  type WalletConfidentialTransactionLike,
} from "../electron/confidentialWallet";
import {
  encryptKaigiPayload,
  generateKaigiX25519KeyPair,
} from "../electron/kaigiCrypto";
import type { ConfidentialReceiveKeyRecord } from "../electron/secureVault";

const NETWORK_ID = NetworkId.parse(
  "hash:77FB29D14745ADCCFDC14350E1A6FE6A10265798CC936A1DAFA7D2552AC3B9F7#EBDD",
);
const ASSET_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";
const transactionHash = (byteHex: string) => byteHex.repeat(32);
let receiveKeySequence = 0;

const makeAccount = () => {
  const keyPair = generateKeyPair();
  return {
    accountId: AccountAddress.fromAccount({
      publicKey: keyPair.publicKey,
    }).toI105(369),
    privateKeyHex: keyPair.privateKey.toString("hex"),
    receiveKeys: [] as ConfidentialReceiveKeyRecord[],
  };
};

const receiveAddressFor = (privateKeyHex: string, seed: string) =>
  deriveWalletConfidentialReceiveAddress({
    privateKeyHex,
    diversifierSeedHex: seed.repeat(32),
  });

const ownerTagHexFor = (privateKeyHex: string) => {
  const receiveAddress = receiveAddressFor(privateKeyHex, "01");
  return deriveWalletConfidentialOwnerTagHex({
    privateKeyHex,
    diversifierHex: receiveAddress.diversifierHex,
  });
};

const noteFor = (
  account: ReturnType<typeof makeAccount>,
  amount: string,
  createdAtMs: number,
  seed: string,
) => {
  const receiveAddress = receiveAddressFor(account.privateKeyHex, seed);
  const rhoHex = seed.repeat(32);
  const { commitmentHex } = deriveConfidentialNoteV2({
    assetDefinitionId: ASSET_ID,
    amount,
    rhoHex,
    ownerTagHex: receiveAddress.ownerTagHex,
  });
  return {
    schema: CONFIDENTIAL_WALLET_NOTE_SCHEMA,
    note_id: commitmentHex,
    asset_definition_id: ASSET_ID,
    amount,
    rho_hex: rhoHex,
    owner_tag_hex: receiveAddress.ownerTagHex,
    diversifier_hex: receiveAddress.diversifierHex,
    commitment_hex: commitmentHex,
    created_at_ms: createdAtMs,
  } satisfies WalletConfidentialNote;
};

type TestAccount = ReturnType<typeof makeAccount>;

const createReceiveKeyForNote = (
  account: TestAccount,
  note: WalletConfidentialNote,
) => {
  const keyPair = generateKaigiX25519KeyPair();
  const keyIdBytes = Buffer.alloc(18);
  keyIdBytes.writeUInt32BE(++receiveKeySequence, 14);
  const record: ConfidentialReceiveKeyRecord = {
    keyId: keyIdBytes.toString("base64url"),
    accountId: account.accountId,
    ownerTagHex: note.owner_tag_hex,
    diversifierHex: note.diversifier_hex,
    publicKeyBase64Url: keyPair.publicKeyBase64Url,
    privateKeyBase64Url: keyPair.privateKeyBase64Url,
    createdAtMs: note.created_at_ms,
  };
  account.receiveKeys.push(record);
  return record;
};

const metadataFor = (
  ...outputs: Array<{ note: WalletConfidentialNote; recipient: TestAccount }>
) => ({
  [CONFIDENTIAL_WALLET_METADATA_KEY]: {
    schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
    outputs: outputs.map(({ note, recipient }) => {
      const receiveKey = createReceiveKeyForNote(recipient, note);
      return {
        commitment_hex: note.commitment_hex,
        receive_key_id: receiveKey.keyId,
        envelope: encryptKaigiPayload(note, receiveKey.publicKeyBase64Url),
      };
    }),
  },
});

const collectShieldFor = (
  account: TestAccount,
  note: WalletConfidentialNote,
  transactionFields: Record<string, unknown>,
) =>
  collectWalletConfidentialLedger(
    [
      {
        entrypoint_hash: transactionHash("01"),
        result_ok: true,
        ...transactionFields,
        instructions: [
          {
            zk: {
              Shield: {
                asset: ASSET_ID,
                from: account.accountId,
                amount: note.amount,
                note_commitment: note.commitment_hex,
              },
            },
          },
        ],
      } as WalletConfidentialTransactionLike,
    ],
    {
      privateKeyHex: account.privateKeyHex,
      networkId: NETWORK_ID,
      assetDefinitionIds: [ASSET_ID],
      receiveKeys: account.receiveKeys,
    },
  );

describe("confidential wallet helpers", () => {
  it("derives a stable confidential owner tag from the wallet private key", () => {
    const alice = makeAccount();
    const ownerTagHex = ownerTagHexFor(alice.privateKeyHex);

    expect(ownerTagHex).toMatch(/^[0-9a-f]{64}$/);
    expect(ownerTagHexFor(alice.privateKeyHex)).toBe(ownerTagHex);
  }, 15_000);

  it("derives diversified receive addresses from the wallet private key", () => {
    const alice = makeAccount();
    const first = deriveWalletConfidentialReceiveAddress({
      privateKeyHex: alice.privateKeyHex,
      diversifierSeedHex: "01".repeat(32),
    });
    const second = deriveWalletConfidentialReceiveAddress({
      privateKeyHex: alice.privateKeyHex,
      diversifierSeedHex: "02".repeat(32),
    });

    expect(first.ownerTagHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.diversifierHex).toMatch(/^[0-9a-f]{64}$/);
    expect(second.ownerTagHex).toMatch(/^[0-9a-f]{64}$/);
    expect(second.diversifierHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.diversifierHex).not.toBe(second.diversifierHex);
    expect(first.ownerTagHex).not.toBe(second.ownerTagHex);
  });

  it("rejects owner-tag derivation without a diversifier", () => {
    const alice = makeAccount();
    expect(() =>
      deriveWalletConfidentialOwnerTagHex({
        privateKeyHex: alice.privateKeyHex,
        diversifierHex: "",
      }),
    ).toThrow(/diversifierHex must be a 32-byte hex string/u);
  });

  it("rejects normalized or noncanonical confidential key material", () => {
    const alice = makeAccount();
    expect(() =>
      deriveWalletConfidentialOwnerTagHex({
        privateKeyHex: ` ${alice.privateKeyHex}`,
        diversifierHex: "01".repeat(32),
      }),
    ).toThrow(/privateKeyHex must be a 32-byte hex string/u);
    expect(() =>
      deriveWalletConfidentialReceiveAddress({
        privateKeyHex: alice.privateKeyHex,
        diversifierSeedHex: "AB".repeat(32),
      }),
    ).toThrow(/diversifierSeedHex must be a 32-byte hex string/u);
    expect(() =>
      deriveWalletConfidentialNullifierHex({
        privateKeyHex: alice.privateKeyHex.toUpperCase(),
        assetDefinitionId: ASSET_ID,
        networkId: NETWORK_ID,
        rhoHex: "02".repeat(32),
      }),
    ).toThrow(/privateKeyHex must be a 32-byte hex string/u);
  });

  it("fails closed for legacy no-diversifier note envelopes", () => {
    const alice = makeAccount();
    const receiveAddress = receiveAddressFor(alice.privateKeyHex, "01");
    const currentNote = noteFor(alice, "5", 1, "02");
    expect(currentNote.schema).toBe(CONFIDENTIAL_WALLET_NOTE_SCHEMA);
    const legacyNote = {
      ...currentNote,
      schema: "iroha-demo-confidential-note/v2",
    };
    delete (legacyNote as Record<string, unknown>).diversifier_hex;
    const legacyReceiveKey = createReceiveKeyForNote(alice, currentNote);
    expect(() =>
      collectWalletConfidentialLedger(
        [
          {
            entrypoint_hash: transactionHash("02"),
            result_ok: true,
            metadata: {
              [CONFIDENTIAL_WALLET_METADATA_KEY]: {
                schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
                outputs: [
                  {
                    commitment_hex: currentNote.commitment_hex,
                    receive_key_id: legacyReceiveKey.keyId,
                    envelope: encryptKaigiPayload(
                      legacyNote,
                      legacyReceiveKey.publicKeyBase64Url,
                    ),
                  },
                ],
              },
            },
            instructions: [
              {
                zk: {
                  Shield: {
                    asset: ASSET_ID,
                    from: alice.accountId,
                    amount: "5",
                    note_commitment: currentNote.commitment_hex,
                  },
                },
              },
            ],
          },
        ],
        {
          privateKeyHex: alice.privateKeyHex,
          networkId: NETWORK_ID,
          assetDefinitionIds: [ASSET_ID],
          receiveKeys: alice.receiveKeys,
        },
      ),
    ).toThrow(/exact current contract/u);

    expect(receiveAddress.diversifierHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects v1 and v2 account-sealed wallet metadata", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "11");

    for (const schema of [
      "iroha-demo-confidential-wallet/v1",
      "iroha-demo-confidential-wallet/v2",
    ]) {
      expect(() =>
        collectShieldFor(alice, note, {
          metadata: {
            [CONFIDENTIAL_WALLET_METADATA_KEY]: {
              schema,
              outputs: [
                {
                  commitment_hex: note.commitment_hex,
                  envelope: { retired: true },
                },
              ],
            },
          },
        }),
      ).toThrow(/exact current contract/u);
    }
  });

  it("rejects unknown fields, camelCase aliases, and duplicate v3 outputs", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "11");
    const validMetadata = metadataFor({ note, recipient: alice });
    const validRecord = validMetadata[
      CONFIDENTIAL_WALLET_METADATA_KEY
    ] as Record<string, unknown>;
    const validOutput = (
      validRecord.outputs as Array<Record<string, unknown>>
    )[0];
    expect(validOutput).toBeDefined();
    if (!validOutput) {
      throw new Error("Expected one valid confidential metadata output.");
    }
    const envelope = validOutput.envelope as Record<string, unknown>;

    const invalidRecords = [
      { ...validRecord, unknown: true },
      {
        ...validRecord,
        schema: "iroha-demo-confidential-wallet/v4",
      },
      {
        ...validRecord,
        outputs: [{ ...validOutput, unknown: true }],
      },
      {
        ...validRecord,
        outputs: [
          {
            commitmentHex: validOutput.commitment_hex,
            receiveKeyId: validOutput.receive_key_id,
            envelope,
          },
        ],
      },
      {
        ...validRecord,
        outputs: [
          {
            ...validOutput,
            envelope: { ...envelope, unknown: true },
          },
        ],
      },
      { ...validRecord, outputs: [validOutput, validOutput] },
    ];

    for (const record of invalidRecords) {
      expect(() =>
        collectShieldFor(alice, note, {
          metadata: { [CONFIDENTIAL_WALLET_METADATA_KEY]: record },
        }),
      ).toThrow(/exact current contract/u);
    }
  });

  it("rejects camelCase aliases inside decrypted v3 notes", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "11");
    const receiveKey = createReceiveKeyForNote(alice, note);
    const camelCaseNote = {
      schema: note.schema,
      noteId: note.note_id,
      assetDefinitionId: note.asset_definition_id,
      amount: note.amount,
      rhoHex: note.rho_hex,
      ownerTagHex: note.owner_tag_hex,
      diversifierHex: note.diversifier_hex,
      commitmentHex: note.commitment_hex,
      createdAtMs: note.created_at_ms,
    };
    expect(() =>
      collectShieldFor(alice, note, {
        metadata: {
          [CONFIDENTIAL_WALLET_METADATA_KEY]: {
            schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
            outputs: [
              {
                commitment_hex: note.commitment_hex,
                receive_key_id: receiveKey.keyId,
                envelope: encryptKaigiPayload(
                  camelCaseNote,
                  receiveKey.publicKeyBase64Url,
                ),
              },
            ],
          },
        },
      }),
    ).toThrow(/exact current contract/u);
  });

  it("rejects string and nested metadata representations", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "11");
    const validMetadata = metadataFor({ note, recipient: alice });

    for (const transactionFields of [
      { metadata: JSON.stringify(validMetadata) },
      {
        metadata: {
          [CONFIDENTIAL_WALLET_METADATA_KEY]: JSON.stringify(
            validMetadata[CONFIDENTIAL_WALLET_METADATA_KEY],
          ),
        },
      },
      { transaction_metadata: validMetadata },
      { tx_metadata: validMetadata },
      { transaction: { metadata: validMetadata } },
      { payload: { metadata: validMetadata } },
    ]) {
      expect(() => collectShieldFor(alice, note, transactionFields)).toThrow();
    }
  });

  it("decrypts self-shield notes into spendable wallet balance", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "11");
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: transactionHash("03"),
          result_ok: true,
          metadata: metadataFor({ note, recipient: alice }),
          instructions: [
            {
              zk: {
                Shield: {
                  asset: ASSET_ID,
                  from: alice.accountId,
                  amount: "5",
                  note_commitment: note.commitment_hex,
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        networkId: NETWORK_ID,
        assetDefinitionIds: [ASSET_ID],
        receiveKeys: alice.receiveKeys,
      },
    );

    expect(ledger).toMatchObject({
      exact: true,
      spendableQuantity: "5",
    });
    expect(ledger.notes).toHaveLength(1);
    expect(ledger.notes[0]?.commitment_hex).toBe(note.commitment_hex);
  });

  it("recomputes each decrypted note commitment before counting its value", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "12");
    const receiveKey = createReceiveKeyForNote(alice, note);
    const forgedAmountNote = { ...note, amount: "5000000" };

    expect(() =>
      collectShieldFor(alice, note, {
        metadata: {
          [CONFIDENTIAL_WALLET_METADATA_KEY]: {
            schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
            outputs: [
              {
                commitment_hex: note.commitment_hex,
                receive_key_id: receiveKey.keyId,
                envelope: encryptKaigiPayload(
                  forgedAmountNote,
                  receiveKey.publicKeyBase64Url,
                ),
              },
            ],
          },
        },
      }),
    ).toThrow(/contents do not match the committed ledger output/u);
  });

  it("binds decrypted note ownership to both the receive key and wallet spend key", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "13");
    const receiveKey = createReceiveKeyForNote(alice, note);
    const unrelatedAddress = receiveAddressFor(alice.privateKeyHex, "14");
    const reboundNote = {
      ...note,
      owner_tag_hex: unrelatedAddress.ownerTagHex,
      diversifier_hex: unrelatedAddress.diversifierHex,
    };

    expect(() =>
      collectShieldFor(alice, note, {
        metadata: {
          [CONFIDENTIAL_WALLET_METADATA_KEY]: {
            schema: CONFIDENTIAL_WALLET_METADATA_SCHEMA,
            outputs: [
              {
                commitment_hex: note.commitment_hex,
                receive_key_id: receiveKey.keyId,
                envelope: encryptKaigiPayload(
                  reboundNote,
                  receiveKey.publicKeyBase64Url,
                ),
              },
            ],
          },
        },
      }),
    ).toThrow(/owner material is not bound/u);
  });

  it("rejects compatibility encodings and duplicate transaction identities", () => {
    const alice = makeAccount();
    const noncanonicalTransaction = {
      entrypoint_hash: transactionHash("15"),
      result_ok: true,
      metadata: {},
      instructions: [
        {
          zk: {
            ZkTransfer: {
              asset: ASSET_ID,
              inputs: [Array.from({ length: 32 }, () => 1)],
              outputs: ["22".repeat(32)],
            },
          },
        },
      ],
    };
    expect(() =>
      collectWalletConfidentialLedger([noncanonicalTransaction], {
        privateKeyHex: alice.privateKeyHex,
        networkId: NETWORK_ID,
        assetDefinitionIds: [ASSET_ID],
      }),
    ).toThrow(/exact bounded fixed-bytes array/u);

    const canonicalTransaction = {
      ...noncanonicalTransaction,
      instructions: [
        {
          zk: {
            ZkTransfer: {
              asset: ASSET_ID,
              inputs: ["11".repeat(32)],
              outputs: ["22".repeat(32)],
            },
          },
        },
      ],
    };
    expect(() =>
      collectWalletConfidentialLedger(
        [canonicalTransaction, canonicalTransaction],
        {
          privateKeyHex: alice.privateKeyHex,
          networkId: NETWORK_ID,
          assetDefinitionIds: [ASSET_ID],
        },
      ),
    ).toThrow(/unique canonical lowercase hex/u);
  });

  it("does not merge case-variant Base58 asset definitions", () => {
    const alice = makeAccount();
    const note = noteFor(alice, "5", 1, "11");
    expect(() =>
      collectWalletConfidentialLedger(
        [
          {
            entrypoint_hash: transactionHash("04"),
            result_ok: true,
            metadata: metadataFor({ note, recipient: alice }),
            instructions: [
              {
                zk: {
                  Shield: {
                    asset: ASSET_ID.toLowerCase(),
                    from: alice.accountId,
                    amount: "5",
                    note_commitment: note.commitment_hex,
                  },
                },
              },
            ],
          },
        ],
        {
          privateKeyHex: alice.privateKeyHex,
          networkId: NETWORK_ID,
          assetDefinitionIds: [ASSET_ID],
          receiveKeys: alice.receiveKeys,
        },
      ),
    ).toThrow(/noncanonical asset definition/u);
  });

  it("tracks spent notes, recipient notes, and change notes across shielded sends", () => {
    const alice = makeAccount();
    const bob = makeAccount();
    const shieldNote = noteFor(alice, "10", 1, "11");
    const bobNote = noteFor(bob, "7", 2, "22");
    const changeNote = noteFor(alice, "3", 3, "33");
    const inputNullifier = deriveWalletConfidentialNullifierHex({
      privateKeyHex: alice.privateKeyHex,
      assetDefinitionId: ASSET_ID,
      networkId: NETWORK_ID,
      rhoHex: shieldNote.rho_hex,
    });
    const transactions = [
      {
        entrypoint_hash: transactionHash("05"),
        result_ok: true,
        metadata: metadataFor({ note: shieldNote, recipient: alice }),
        instructions: [
          {
            zk: {
              Shield: {
                asset: ASSET_ID,
                from: alice.accountId,
                amount: "10",
                note_commitment: shieldNote.commitment_hex,
              },
            },
          },
        ],
        block: 1,
        note_index_order: 0,
      },
      {
        entrypoint_hash: transactionHash("06"),
        result_ok: true,
        metadata: metadataFor(
          { note: bobNote, recipient: bob },
          { note: changeNote, recipient: alice },
        ),
        instructions: [
          {
            zk: {
              ZkTransfer: {
                asset: ASSET_ID,
                inputs: [inputNullifier],
                outputs: [bobNote.commitment_hex, changeNote.commitment_hex],
              },
            },
          },
        ],
        block: 2,
        note_index_order: 1,
      },
    ];

    const aliceLedger = collectWalletConfidentialLedger(transactions, {
      privateKeyHex: alice.privateKeyHex,
      networkId: NETWORK_ID,
      assetDefinitionIds: [ASSET_ID],
      receiveKeys: alice.receiveKeys,
    });
    const bobLedger = collectWalletConfidentialLedger(transactions, {
      privateKeyHex: bob.privateKeyHex,
      networkId: NETWORK_ID,
      assetDefinitionIds: [ASSET_ID],
      receiveKeys: bob.receiveKeys,
    });

    expect(aliceLedger).toMatchObject({
      exact: true,
      spendableQuantity: "3",
    });
    expect(aliceLedger.notes).toHaveLength(1);
    expect(aliceLedger.notes[0]?.commitment_hex).toBe(
      changeNote.commitment_hex,
    );
    expect(aliceLedger.treeCommitmentsHex).toEqual([
      shieldNote.commitment_hex,
      bobNote.commitment_hex,
      changeNote.commitment_hex,
    ]);

    expect(bobLedger).toMatchObject({
      exact: true,
      spendableQuantity: "7",
    });
    expect(bobLedger.notes).toHaveLength(1);
    expect(bobLedger.notes[0]?.commitment_hex).toBe(bobNote.commitment_hex);
  });

  it("recovers private change notes from unshield outputs", () => {
    const alice = makeAccount();
    const shieldNote = noteFor(alice, "10", 1, "11");
    const changeNote = noteFor(alice, "4", 2, "22");
    const inputNullifier = deriveWalletConfidentialNullifierHex({
      privateKeyHex: alice.privateKeyHex,
      assetDefinitionId: ASSET_ID,
      networkId: NETWORK_ID,
      rhoHex: shieldNote.rho_hex,
    });
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: transactionHash("07"),
          result_ok: true,
          metadata: metadataFor({ note: shieldNote, recipient: alice }),
          instructions: [
            {
              zk: {
                Shield: {
                  asset: ASSET_ID,
                  from: alice.accountId,
                  amount: "10",
                  note_commitment: shieldNote.commitment_hex,
                },
              },
            },
          ],
        },
        {
          entrypoint_hash: transactionHash("08"),
          result_ok: true,
          metadata: metadataFor({ note: changeNote, recipient: alice }),
          instructions: [
            {
              zk: {
                Unshield: {
                  asset: ASSET_ID,
                  to: alice.accountId,
                  public_amount: "6",
                  inputs: [inputNullifier],
                  outputs: [changeNote.commitment_hex],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        networkId: NETWORK_ID,
        assetDefinitionIds: [ASSET_ID],
        receiveKeys: alice.receiveKeys,
      },
    );

    expect(ledger).toMatchObject({
      exact: true,
      spendableQuantity: "4",
      treeCommitmentsHex: [
        shieldNote.commitment_hex,
        changeNote.commitment_hex,
      ],
    });
    expect(ledger.notes).toHaveLength(1);
    expect(ledger.notes[0]?.commitment_hex).toBe(changeNote.commitment_hex);
  });

  it("preserves multi-output transfer commitments in serialized on-chain order", () => {
    const alice = makeAccount();
    const highCommitmentHex = "ff".repeat(32);
    const lowCommitmentHex = "00".repeat(32);
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: transactionHash("09"),
          result_ok: true,
          metadata: {},
          instructions: [
            {
              zk: {
                ZkTransfer: {
                  asset: ASSET_ID,
                  inputs: ["aa".repeat(32)],
                  outputs: [highCommitmentHex, lowCommitmentHex],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        networkId: NETWORK_ID,
        assetDefinitionIds: [ASSET_ID],
        markUnrecognizedTransfersInexact: false,
      },
    );

    expect(ledger.treeCommitmentsHex).toEqual([
      highCommitmentHex,
      lowCommitmentHex,
    ]);
  });

  it("marks the balance inexact when confidential activity cannot be decoded", () => {
    const alice = makeAccount();
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: transactionHash("0a"),
          result_ok: true,
          metadata: {},
          instructions: [
            {
              zk: {
                ZkTransfer: {
                  asset: ASSET_ID,
                  inputs: [
                    Buffer.from(
                      Array.from({ length: 32 }, (_entry, index) => index),
                    ).toString("hex"),
                  ],
                  outputs: [
                    Buffer.from(
                      Array.from(
                        { length: 32 },
                        (_entry, index) => 255 - index,
                      ),
                    ).toString("hex"),
                  ],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        networkId: NETWORK_ID,
        assetDefinitionIds: [ASSET_ID],
      },
    );

    expect(ledger).toMatchObject({
      exact: false,
      spendableQuantity: "0",
    });
  });

  it("can ignore unrelated global note-index transfers", () => {
    const alice = makeAccount();
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: transactionHash("0b"),
          result_ok: true,
          metadata: {},
          instructions: [
            {
              zk: {
                ZkTransfer: {
                  asset: ASSET_ID,
                  inputs: [
                    Buffer.from(
                      Array.from({ length: 32 }, (_entry, index) => index),
                    ).toString("hex"),
                  ],
                  outputs: [
                    Buffer.from(
                      Array.from(
                        { length: 32 },
                        (_entry, index) => 255 - index,
                      ),
                    ).toString("hex"),
                  ],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        networkId: NETWORK_ID,
        assetDefinitionIds: [ASSET_ID],
        markUnrecognizedTransfersInexact: false,
      },
    );

    expect(ledger).toMatchObject({
      exact: true,
      spendableQuantity: "0",
    });
  });
});
