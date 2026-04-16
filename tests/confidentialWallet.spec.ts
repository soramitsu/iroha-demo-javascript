import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import { generateKeyPair } from "@iroha/iroha-js/crypto";
import {
  buildWalletConfidentialMetadata,
  collectWalletConfidentialLedger,
  createWalletConfidentialNote,
  deriveWalletConfidentialNullifierHex,
  selectWalletConfidentialNotes,
} from "../electron/confidentialWallet";

const CHAIN_ID = "chain";
const ASSET_ID = "xor#universal";

const makeAccount = () => {
  const keyPair = generateKeyPair();
  return {
    accountId: AccountAddress.fromAccount({
      publicKey: keyPair.publicKey,
    }).toI105(369),
    privateKeyHex: keyPair.privateKey.toString("hex"),
  };
};

describe("confidential wallet helpers", () => {
  it("decrypts self-shield notes into spendable wallet balance", () => {
    const alice = makeAccount();
    const note = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "5",
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
      createdAtMs: 1,
    });
    const bobNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "7",
      createdAtMs: 2,
    });
    const changeNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "3",
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
              },
            },
          },
        ],
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

    expect(bobLedger).toMatchObject({
      exact: true,
      spendableQuantity: "7",
    });
    expect(bobLedger.notes).toHaveLength(1);
    expect(bobLedger.notes[0]?.commitment_hex).toBe(bobNote.commitment_hex);
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
      createdAtMs: 1,
    });
    const secondNote = createWalletConfidentialNote({
      assetDefinitionId: ASSET_ID,
      amount: "6",
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
        },
      ],
      "5",
    );

    expect(selected.total).toBe("10");
    expect(selected.change).toBe("5");
    expect(selected.selected).toHaveLength(2);
  });
});
