import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { generateKeyPair } from "@iroha/iroha-js/crypto";
import {
  buildWalletConfidentialMetadata,
  collectWalletConfidentialLedger,
  createWalletConfidentialNote,
  deriveWalletConfidentialOwnerTagHex,
  deriveWalletConfidentialNullifierHex,
  deriveWalletConfidentialReceiveAddress,
  selectWalletConfidentialNotes,
  selectWalletConfidentialNotesForExactAmount,
} from "../electron/confidentialWallet";

const CHAIN_ID = "chain";
const ASSET_ID = "61CtjvNd9T3THAR65GsMVHr82Bjc";

const makeAccount = () => {
  const keyPair = generateKeyPair();
  return {
    accountId: AccountAddress.fromAccount({
      publicKey: keyPair.publicKey,
    }).toI105(369),
    privateKeyHex: keyPair.privateKey.toString("hex"),
  };
};

const ownerTagHexFor = (privateKeyHex: string) =>
  deriveWalletConfidentialOwnerTagHex({ privateKeyHex });

describe("confidential wallet helpers", () => {
  it("derives a stable confidential owner tag from the wallet private key", () => {
    const alice = makeAccount();
    const ownerTagHex = ownerTagHexFor(alice.privateKeyHex);

    expect(ownerTagHex).toMatch(/^[0-9a-f]{64}$/);
    expect(ownerTagHexFor(alice.privateKeyHex)).toBe(ownerTagHex);
  });

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

  it("decrypts self-shield notes into spendable wallet balance", () => {
    const alice = makeAccount();
    const note = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "5",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 1,
    });
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: "0xshield",
          result_ok: true,
          metadata: buildWalletConfidentialMetadata({
            outputs: [{ note, recipientAccountId: alice.accountId }],
          }),
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
        chainId: CHAIN_ID,
        assetDefinitionIds: [ASSET_ID],
      },
    );

    expect(ledger).toMatchObject({
      exact: true,
      spendableQuantity: "5",
    });
    expect(ledger.notes).toHaveLength(1);
    expect(ledger.notes[0]?.commitment_hex).toBe(note.commitment_hex);
  });

  it("tracks spent notes, recipient notes, and change notes across shielded sends", () => {
    const alice = makeAccount();
    const bob = makeAccount();
    const shieldNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "10",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 1,
    });
    const bobNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "7",
      ownerTagHex: ownerTagHexFor(bob.privateKeyHex),
      createdAtMs: 2,
    });
    const changeNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "3",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 3,
    });
    const inputNullifier = deriveWalletConfidentialNullifierHex({
      privateKeyHex: alice.privateKeyHex,
      assetDefinitionId: ASSET_ID,
      chainId: CHAIN_ID,
      rhoHex: shieldNote.rho_hex,
    });
    const transactions = [
      {
        entrypoint_hash: "0xshield",
        result_ok: true,
        metadata: buildWalletConfidentialMetadata({
          outputs: [{ note: shieldNote, recipientAccountId: alice.accountId }],
        }),
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
        entrypoint_hash: "0xtransfer",
        result_ok: true,
        metadata: buildWalletConfidentialMetadata({
          outputs: [
            { note: bobNote, recipientAccountId: bob.accountId },
            { note: changeNote, recipientAccountId: alice.accountId },
          ],
        }),
        instructions: [
          {
            zk: {
              ZkTransfer: {
                asset: ASSET_ID,
                inputs: [Array.from(Buffer.from(inputNullifier, "hex"))],
                outputs: [
                  Array.from(Buffer.from(bobNote.commitment_hex, "hex")),
                  Array.from(Buffer.from(changeNote.commitment_hex, "hex")),
                ],
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
      chainId: CHAIN_ID,
      assetDefinitionIds: [ASSET_ID],
    });
    const bobLedger = collectWalletConfidentialLedger(transactions, {
      privateKeyHex: bob.privateKeyHex,
      chainId: CHAIN_ID,
      assetDefinitionIds: [ASSET_ID],
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
    const shieldNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "10",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 1,
    });
    const changeNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "4",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 2,
    });
    const inputNullifier = deriveWalletConfidentialNullifierHex({
      privateKeyHex: alice.privateKeyHex,
      assetDefinitionId: ASSET_ID,
      chainId: CHAIN_ID,
      rhoHex: shieldNote.rho_hex,
    });
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: "0xshield",
          result_ok: true,
          metadata: buildWalletConfidentialMetadata({
            outputs: [
              { note: shieldNote, recipientAccountId: alice.accountId },
            ],
          }),
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
          entrypoint_hash: "0xunshield",
          result_ok: true,
          metadata: buildWalletConfidentialMetadata({
            outputs: [
              { note: changeNote, recipientAccountId: alice.accountId },
            ],
          }),
          instructions: [
            {
              zk: {
                Unshield: {
                  asset: ASSET_ID,
                  to: alice.accountId,
                  public_amount: "6",
                  inputs: [Array.from(Buffer.from(inputNullifier, "hex"))],
                  outputs: [
                    Array.from(Buffer.from(changeNote.commitment_hex, "hex")),
                  ],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        chainId: CHAIN_ID,
        assetDefinitionIds: [ASSET_ID],
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

  it("marks the balance inexact when confidential activity cannot be decoded", () => {
    const alice = makeAccount();
    const ledger = collectWalletConfidentialLedger(
      [
        {
          entrypoint_hash: "0xunknown",
          result_ok: true,
          metadata: {},
          instructions: [
            {
              zk: {
                ZkTransfer: {
                  asset: ASSET_ID,
                  inputs: [
                    Array.from({ length: 32 }, (_entry, index) => index),
                  ],
                  outputs: [
                    Array.from({ length: 32 }, (_entry, index) => 255 - index),
                  ],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        chainId: CHAIN_ID,
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
          entrypoint_hash: "0xother",
          result_ok: true,
          metadata: {},
          instructions: [
            {
              zk: {
                ZkTransfer: {
                  asset: ASSET_ID,
                  inputs: [
                    Array.from({ length: 32 }, (_entry, index) => index),
                  ],
                  outputs: [
                    Array.from({ length: 32 }, (_entry, index) => 255 - index),
                  ],
                },
              },
            },
          ],
        },
      ],
      {
        privateKeyHex: alice.privateKeyHex,
        chainId: CHAIN_ID,
        assetDefinitionIds: [ASSET_ID],
        markUnrecognizedTransfersInexact: false,
      },
    );

    expect(ledger).toMatchObject({
      exact: true,
      spendableQuantity: "0",
    });
  });

  it("selects enough notes and returns the expected change", () => {
    const alice = makeAccount();
    const firstNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "4",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 1,
    });
    const secondNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "6",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 2,
    });
    const selected = selectWalletConfidentialNotes(
      [
        {
          ...firstNote,
          nullifier_hex: deriveWalletConfidentialNullifierHex({
            privateKeyHex: alice.privateKeyHex,
            assetDefinitionId: ASSET_ID,
            chainId: CHAIN_ID,
            rhoHex: firstNote.rho_hex,
          }),
          source_tx_hash: "0x1",
          leaf_index: 0,
        },
        {
          ...secondNote,
          nullifier_hex: deriveWalletConfidentialNullifierHex({
            privateKeyHex: alice.privateKeyHex,
            assetDefinitionId: ASSET_ID,
            chainId: CHAIN_ID,
            rhoHex: secondNote.rho_hex,
          }),
          source_tx_hash: "0x2",
          leaf_index: 1,
        },
      ],
      "5",
    );

    expect(selected.total).toBe("6");
    expect(selected.change).toBe("1");
    expect(selected.selected).toHaveLength(1);
  });

  it("finds an exact one- or two-note match for unshield amounts", () => {
    const alice = makeAccount();
    const firstNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "4",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 1,
    });
    const secondNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "6",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 2,
    });
    const thirdNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "3",
      ownerTagHex: ownerTagHexFor(alice.privateKeyHex),
      createdAtMs: 3,
    });
    const selected = selectWalletConfidentialNotesForExactAmount(
      [
        {
          ...firstNote,
          nullifier_hex: deriveWalletConfidentialNullifierHex({
            privateKeyHex: alice.privateKeyHex,
            assetDefinitionId: ASSET_ID,
            chainId: CHAIN_ID,
            rhoHex: firstNote.rho_hex,
          }),
          source_tx_hash: "0x1",
          leaf_index: 0,
        },
        {
          ...secondNote,
          nullifier_hex: deriveWalletConfidentialNullifierHex({
            privateKeyHex: alice.privateKeyHex,
            assetDefinitionId: ASSET_ID,
            chainId: CHAIN_ID,
            rhoHex: secondNote.rho_hex,
          }),
          source_tx_hash: "0x2",
          leaf_index: 1,
        },
        {
          ...thirdNote,
          nullifier_hex: deriveWalletConfidentialNullifierHex({
            privateKeyHex: alice.privateKeyHex,
            assetDefinitionId: ASSET_ID,
            chainId: CHAIN_ID,
            rhoHex: thirdNote.rho_hex,
          }),
          source_tx_hash: "0x3",
          leaf_index: 2,
        },
      ],
      "7",
    );

    expect(selected.total).toBe("7");
    expect(selected.change).toBe("0");
    expect(selected.selected).toHaveLength(2);
    expect(selected.selected.map((note) => note.amount)).toEqual(["4", "3"]);
  });
});
