// @vitest-environment node

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  AccountAddress,
  NetworkId,
  buildGrantAccountPermissionInstruction,
  buildMintAssetInstruction,
  buildTransactionPayload,
  buildTransferAssetInstruction,
  noritoEncodeInstructionBoxArchive,
} from "@iroha/iroha-js";
import { browserTransactionPayloadHashHex } from "@iroha/iroha-js/transaction-codec";
import {
  defaultConnectTransactionDecoder,
  irohaTransactionPayloadHash,
  readInstructionWireId,
  reviewConnectTransactionPayload,
  type ConnectTransactionDecoder,
} from "../electron/connectTransactionReview";
import type { IrohaConnectWalletContext } from "../electron/irohaConnectBoundary";
import {
  isConnectTransactionReview,
  formatConnectTransactionReviewLines,
} from "@/utils/connectTransactionReview";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_NETWORK_ID,
} from "./helpers/networkIdentityFixture";

type NativeBinding = {
  noritoDecodeInstructionBoxArchive(
    bytes: Uint8Array,
    networkPrefix: number,
  ): string;
  finalizeSignedTransaction(input: {
    authority: string;
    networkId: Uint8Array;
    payloadBytes: Uint8Array;
    payloadHashHex?: string;
    publicKey: Uint8Array;
    signature: Uint8Array;
  }): { signedTransaction: Uint8Array; hash: Uint8Array };
};

// Load the native addon of the SDK selected by iroha-sdk-compat directly, so
// the test exercises the same finalizer the dApp uses after signing.
const native = createRequire(import.meta.url)(
  resolve(
    "node_modules/.cache/iroha-sdk-compat/active/native/iroha_js_host.node",
  ),
) as NativeBinding;

const PREFIX = 369;
const XOR = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const investorKey = new Uint8Array(32).fill(7);
const issuerKey = new Uint8Array(32).fill(9);
const accountFor = (privateKey: Uint8Array) =>
  AccountAddress.fromAccount({
    publicKey: ed25519.getPublicKey(privateKey),
    algorithm: "ed25519",
  }).toI105(PREFIX);
const INVESTOR = accountFor(investorKey);
const ISSUER = accountFor(issuerKey);
const NETWORK = NetworkId.parse(TEST_TAIRA_NETWORK_ID);

// Production payload inspection (SDK codec) plus the SDK's native decoder.
const realDecoder = (): ConnectTransactionDecoder => ({
  inspectPayload: defaultConnectTransactionDecoder().inspectPayload,
  decodeInstructionArchive: (archive, prefix) =>
    native.noritoDecodeInstructionBoxArchive(archive, prefix),
});

const bondPurchaseInstructions = () => [
  buildTransferAssetInstruction({
    sourceAssetHoldingId: `${XOR}#${INVESTOR}`,
    quantity: "12.5",
    destinationAccountId: ISSUER,
  }),
  buildMintAssetInstruction({ assetId: `${XOR}#${INVESTOR}`, quantity: "3" }),
  buildGrantAccountPermissionInstruction({
    destinationAccountId: ISSUER,
    permission: {
      name: "CanExecuteSettlement",
      payload: {
        debited_asset: `${XOR}#${INVESTOR}`,
        settlement_id: "bond_buy_1",
        intent_hash: `hash:${"AB".repeat(32)}#0000`,
      },
    },
  }),
  {
    Settlement: {
      Atomic: {
        network_id: TEST_TAIRA_NETWORK_ID,
        settlement_id: "bond_buy_1",
        movements: [
          { source: `${XOR}#${INVESTOR}`, recipient: ISSUER, quantity: "10" },
          { source: `${XOR}#${ISSUER}`, recipient: INVESTOR, quantity: "3" },
        ],
        expires_at_height: 500,
        metadata: {},
      },
    },
  },
];

const buildPayload = (
  authority = INVESTOR,
  instructions: object[] = bondPurchaseInstructions(),
  networkId = NETWORK,
) =>
  buildTransactionPayload({
    networkId,
    authority,
    instructions,
    feePayment: { payer: "authority", chargeLimits: [], gasLimit: null },
    ttlMs: 60_000,
  });

describe("IrohaConnect transaction payload review", () => {
  it("renders every SDK-built instruction and the exact payload hash", () => {
    const draft = buildPayload();
    const { review, payloadHash } = reviewConnectTransactionPayload({
      payloadBytes: draft.payloadBytes,
      expectedAuthority: INVESTOR,
      expectedNetworkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: PREFIX,
      decoder: realDecoder(),
    });

    expect(Buffer.from(payloadHash).toString("hex")).toBe(
      draft.payloadHash.toString("hex"),
    );
    expect(review.payloadHashHex).toBe(
      browserTransactionPayloadHashHex(draft.payloadBytes, PREFIX),
    );
    expect(isConnectTransactionReview(review)).toBe(true);
    expect(review).toMatchObject({
      networkId: TEST_TAIRA_NETWORK_ID,
      authority: INVESTOR,
      ttlMs: "60000",
      executable: "instructions",
      warnings: [],
    });
    expect(
      review.instructions.map((entry) => [entry.wireId, entry.kind]),
    ).toEqual([
      ["iroha.transfer", "transfer"],
      ["iroha.mint", "mint"],
      ["iroha.grant", "grant_permission"],
      ["iroha.settlement", "settlement_atomic"],
    ]);
    expect(review.instructions[0]!.fields).toEqual([
      { label: "Amount", value: "12.5" },
      { label: "Asset", value: XOR },
      { label: "From", value: INVESTOR },
      { label: "To", value: ISSUER },
    ]);
    expect(review.instructions[2]).toMatchObject({
      title: "Grant settlement consent (CanExecuteSettlement)",
      fields: expect.arrayContaining([
        { label: "Settlement ID", value: "bond_buy_1" },
        { label: "Intent hash", value: `hash:${"AB".repeat(32)}#0000` },
        { label: "Debited asset", value: `${XOR}#${INVESTOR}` },
      ]),
    });
    expect(review.instructions[3]).toMatchObject({
      title: "Atomic settlement (2 movements)",
      fields: expect.arrayContaining([
        { label: "Settlement ID", value: "bond_buy_1" },
        {
          label: "Movement 1",
          value: `10 of ${XOR} from ${INVESTOR} to ${ISSUER}`,
        },
        {
          label: "Movement 2",
          value: `3 of ${XOR} from ${ISSUER} to ${INVESTOR}`,
        },
      ]),
    });
    const lines = formatConnectTransactionReviewLines(review);
    expect(lines).toContain(
      "4. Atomic settlement (2 movements) [iroha.settlement]",
    );
    expect(lines).toContain(`Payload hash to sign: ${review.payloadHashHex}`);
  });

  it("refuses a payload whose authority is not the paired account", () => {
    const draft = buildPayload(ISSUER, [
      buildMintAssetInstruction({ assetId: `${XOR}#${ISSUER}`, quantity: "1" }),
    ]);
    expect(() =>
      reviewConnectTransactionPayload({
        payloadBytes: draft.payloadBytes,
        expectedAuthority: INVESTOR,
        expectedNetworkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: PREFIX,
        decoder: realDecoder(),
      }),
    ).toThrow("not the paired account");
  });

  it("refuses a payload for a different network", () => {
    const draft = buildPayload(
      INVESTOR,
      [
        buildMintAssetInstruction({
          assetId: `${XOR}#${INVESTOR}`,
          quantity: "1",
        }),
      ],
      NetworkId.parse(TEST_PREVIOUS_TAIRA_NETWORK_ID),
    );
    expect(() =>
      reviewConnectTransactionPayload({
        payloadBytes: draft.payloadBytes,
        expectedAuthority: INVESTOR,
        expectedNetworkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: PREFIX,
        decoder: realDecoder(),
      }),
    ).toThrow("not this session's");
  });

  it("refuses bytes that are not a canonical payload", () => {
    expect(() =>
      reviewConnectTransactionPayload({
        payloadBytes: Buffer.from("transfer 10 XOR"),
        expectedAuthority: INVESTOR,
        expectedNetworkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: PREFIX,
        decoder: realDecoder(),
      }),
    ).toThrow("not a canonical Iroha payload");
  });

  it("renders escrow legs, escrow and repo instructions, and unknown JSON", () => {
    const draft = buildPayload(INVESTOR, [
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "1",
      }),
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "2",
      }),
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "3",
      }),
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "4",
      }),
    ]);
    const decoded = [
      {
        Settlement: {
          Atomic: {
            network_id: TEST_TAIRA_NETWORK_ID,
            settlement_id: "bond_buy_2",
            movements: [
              {
                source: `${XOR}#${INVESTOR}`,
                recipient: ISSUER,
                quantity: "10",
              },
              { source: `BOND#${ISSUER}`, recipient: INVESTOR, quantity: "1" },
            ],
            escrows: [
              {
                source: `${XOR}#${INVESTOR}`,
                escrow_id: "hash:01#0000",
                beneficiary: ISSUER,
                amount: "5",
                conditions: [{ kind: "Oracle", value: { id: "coupon" } }],
                expires_at_ms: 1_800_000_000_000,
                evidence_hashes: [],
              },
            ],
            expires_at_height: 900,
            metadata: {},
          },
        },
      },
      {
        OpenConditionalEscrow: {
          escrow_id: "hash:02#0000",
          asset_definition: XOR,
          beneficiary: ISSUER,
          amount: "7",
        },
      },
      { Repo: { Initiate: { agreement_id: "repo_1", rate_bps: 250 } } },
      { BrandNewInstruction: { value: 1 } },
    ];
    let call = 0;
    const decoder: ConnectTransactionDecoder = {
      ...realDecoder(),
      decodeInstructionArchive: () => JSON.stringify(decoded[call++]),
    };
    const { review } = reviewConnectTransactionPayload({
      payloadBytes: draft.payloadBytes,
      expectedAuthority: INVESTOR,
      expectedNetworkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: PREFIX,
      decoder,
    });
    expect(review.instructions.map((entry) => entry.kind)).toEqual([
      "settlement_atomic",
      "escrow",
      "repo",
      "unknown",
    ]);
    expect(review.instructions[0]!.title).toBe(
      "Atomic settlement (2 movements, 1 escrow legs)",
    );
    expect(review.instructions[0]!.fields).toEqual(
      expect.arrayContaining([
        {
          label: "Escrow leg 1",
          value: `5 of ${XOR} from ${INVESTOR} held for ${ISSUER} (escrow hash:01#0000, expires 1800000000000 ms)`,
        },
        {
          label: "Escrow leg 1 condition 1",
          value: '{"kind":"Oracle","value":{"id":"coupon"}}',
        },
      ]),
    );
    expect(review.instructions[1]).toMatchObject({
      title: "Open conditional escrow",
      fields: expect.arrayContaining([{ label: "amount", value: "7" }]),
    });
    expect(review.instructions[2]!.title).toBe("Initiate repo");
    expect(review.instructions[3]).toMatchObject({
      title: "Unrecognized instruction BrandNewInstruction",
      json: '{"BrandNewInstruction":{"value":1}}',
    });
    expect(review.warnings).toHaveLength(1);
    expect(formatConnectTransactionReviewLines(review)).toContain(
      '   JSON: {"BrandNewInstruction":{"value":1}}',
    );
  });

  it("shows undecodable instructions by wire ID instead of hiding them", () => {
    const draft = buildPayload(INVESTOR, [
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "1",
      }),
    ]);
    const { review } = reviewConnectTransactionPayload({
      payloadBytes: draft.payloadBytes,
      expectedAuthority: INVESTOR,
      expectedNetworkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: PREFIX,
      decoder: {
        ...realDecoder(),
        decodeInstructionArchive: () => {
          throw new Error("unsupported instruction variant");
        },
      },
    });
    expect(review.instructions[0]).toMatchObject({
      kind: "undecoded",
      wireId: "iroha.mint",
      json: null,
      warning: expect.stringContaining("could not decode"),
    });
  });

  it("reads wire IDs from compact archives and neutralizes unsafe display text", () => {
    const archive = noritoEncodeInstructionBoxArchive(
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "1",
      }),
      PREFIX,
    );
    expect(readInstructionWireId(archive)).toBe("iroha.mint");
    expect(readInstructionWireId(new Uint8Array([0xff]))).toBe("unknown");

    const draft = buildPayload(INVESTOR, [
      buildMintAssetInstruction({
        assetId: `${XOR}#${INVESTOR}`,
        quantity: "1",
      }),
    ]);
    const { review } = reviewConnectTransactionPayload({
      payloadBytes: draft.payloadBytes,
      expectedAuthority: INVESTOR,
      expectedNetworkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: PREFIX,
      decoder: {
        ...realDecoder(),
        decodeInstructionArchive: () =>
          JSON.stringify({
            Settlement: {
              Atomic: {
                settlement_id: "evil‮reversed",
                movements: [],
              },
            },
          }),
      },
    });
    expect(review.instructions[0]!.fields[0]).toEqual({
      label: "Settlement ID",
      value: "evil�reversed",
    });
  });

  it("matches the SDK payload hash definition", () => {
    const bytes = Buffer.from("payload");
    const hash = irohaTransactionPayloadHash(bytes);
    expect(hash).toHaveLength(32);
    expect(hash[31]! & 1).toBe(1);
  });
});

describe("IrohaConnect transaction signing", () => {
  const context: IrohaConnectWalletContext = {
    toriiUrl: "https://taira.sora.org",
    chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
    networkPrefix: PREFIX,
    networkId: TEST_TAIRA_NETWORK_ID,
    accountId: INVESTOR,
  };

  it("produces a signature the native finalizer accepts", async () => {
    const draft = buildPayload();
    const signedMessages: Uint8Array[] = [];
    const sign = vi.fn(
      async (_: IrohaConnectWalletContext, message: Uint8Array) => {
        signedMessages.push(Uint8Array.from(message));
        const signature = ed25519.sign(message, investorKey);
        return {
          algorithmCode: 0,
          algorithmLabel: "Ed25519",
          signatureHex: Buffer.from(signature).toString("hex"),
          signatureBase64: Buffer.from(signature).toString("base64"),
        };
      },
    );
    const review = (
      reviewContext: IrohaConnectWalletContext,
      payloadBytes: Uint8Array,
    ) =>
      reviewConnectTransactionPayload({
        payloadBytes,
        expectedAuthority: reviewContext.accountId,
        expectedNetworkId: reviewContext.networkId,
        networkPrefix: reviewContext.networkPrefix,
        decoder: realDecoder(),
      });
    const { review: reviewed, payloadHash } = review(
      context,
      draft.payloadBytes,
    );
    expect(sign).not.toHaveBeenCalled();

    // The boundary signs the reviewed payload hash; emulate that contract.
    const signature = await sign(context, payloadHash);
    expect(signedMessages[0]).toEqual(Uint8Array.from(draft.payloadHash));

    const finalized = native.finalizeSignedTransaction({
      authority: INVESTOR,
      networkId: NETWORK.toBytes(),
      payloadBytes: draft.payloadBytes,
      payloadHashHex: reviewed.payloadHashHex,
      publicKey: ed25519.getPublicKey(investorKey),
      signature: Buffer.from(signature.signatureHex, "hex"),
    });
    expect(finalized.signedTransaction.length).toBeGreaterThan(
      draft.payloadBytes.length,
    );
    expect(finalized.hash).toHaveLength(32);

    // The former behavior (signing the raw payload bytes) is not a valid
    // Iroha transaction signature.
    expect(() =>
      native.finalizeSignedTransaction({
        authority: INVESTOR,
        networkId: NETWORK.toBytes(),
        payloadBytes: draft.payloadBytes,
        publicKey: ed25519.getPublicKey(investorKey),
        signature: ed25519.sign(draft.payloadBytes, investorKey),
      }),
    ).toThrow();
  });
});
