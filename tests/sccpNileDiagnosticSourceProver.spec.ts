import { keccak_256 } from "@noble/hashes/sha3";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  bindTairaXorTronToTairaSourceProofPackage,
  canonicalSccpMessageProofBundleBytes,
  sccpMerkleRootFromCommitment,
  tairaXorAssetKeyHash,
  tairaXorBurnSourceEventDigest,
  tairaXorRouteIdHash,
} from "@iroha/iroha-js/sccp";
import type { SccpHubCommitment } from "@iroha/iroha-js/sccp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bindSourceData: vi.fn(),
}));

vi.mock("@/utils/sccp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/sccp")>();
  return {
    ...actual,
    bindTronSourceDataForProof: mocks.bindSourceData,
  };
});

const TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const TAIRA_RECIPIENT = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(369);
const TX_ID = "11".repeat(32);
const AMOUNT_DECIMAL = "0.0001";
const AMOUNT_BASE_UNITS = "100000000000000";
const NONCE = "9";
const textEncoder = new TextEncoder();
const recipientHash = `0x${Array.from(
  keccak_256(textEncoder.encode(TAIRA_RECIPIENT)),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("")}`;
const SOURCE_EVENT_DIGEST = tairaXorBurnSourceEventDigest({
  bridgeAddress: TRON_ADDRESS,
  burnerAddress: TRON_ADDRESS,
  tairaRecipient: TAIRA_RECIPIENT,
  amount: AMOUNT_BASE_UNITS,
  nonce: NONCE,
});

const sourceInput = () => ({
  manifest: {
    bridge_address: TRON_ADDRESS,
  },
  txId: TX_ID,
  transaction: { txID: TX_ID },
  receipt: { id: TX_ID },
  events: {
    data: [
      {
        transaction_id: TX_ID,
        event_name: "TairaXorBurnStarted",
        contract_address: TRON_ADDRESS,
        result: {
          sourceEventDigest: SOURCE_EVENT_DIGEST,
          burner: TRON_ADDRESS,
          tairaRecipientHash: recipientHash,
          amount: AMOUNT_BASE_UNITS,
          nonce: NONCE,
          routeIdHash: tairaXorRouteIdHash(),
          assetKeyHash: tairaXorAssetKeyHash(),
          tairaRecipient: `0x${Array.from(
            textEncoder.encode(TAIRA_RECIPIENT),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join("")}`,
        },
      },
    ],
  },
  finality: { solidBlock: { blockID: "22".repeat(32) } },
  tronSender: TRON_ADDRESS,
  tairaRecipient: TAIRA_RECIPIENT,
  amountDecimal: AMOUNT_DECIMAL,
});

describe("Nile diagnostic TRON source prover", () => {
  beforeEach(() => {
    mocks.bindSourceData.mockReset();
    mocks.bindSourceData.mockReturnValue({
      txId: TX_ID,
      transaction: {},
      receipt: {},
      events: {},
      finality: {},
      sourceEventDigest: SOURCE_EVENT_DIGEST,
      receiptBlockNumber: 10,
      solidBlockNumber: 12,
      solidBlockHash: "22".repeat(32),
    });
  });

  it("builds a canonical TAIRA/TRON XOR source package from a rebound burn event", async () => {
    const module = await import("@/utils/sccpNileDiagnosticSourceProver");
    const result = module.proveTronSource(sourceInput());

    expect(module.irohaSccpTronSourceProve).toBe(module.proveTronSource);
    expect(module.tronSccpSourceProve).toBe(module.proveTronSource);
    expect(mocks.bindSourceData).toHaveBeenCalledWith(
      expect.objectContaining({
        bridgeAddress: TRON_ADDRESS,
        tronSender: TRON_ADDRESS,
        tairaRecipient: TAIRA_RECIPIENT,
        amountDecimal: AMOUNT_DECIMAL,
      }),
    );
    expect(result).toMatchObject({
      txId: TX_ID,
      sourceEventDigest: SOURCE_EVENT_DIGEST,
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_tron_xor",
      },
    });

    const messageBundle = result.messageBundle as Record<string, unknown>;
    canonicalSccpMessageProofBundleBytes(messageBundle);
    const commitment = messageBundle.commitment as Record<string, unknown>;
    expect(messageBundle.commitment_root).toBe(
      sccpMerkleRootFromCommitment(
        commitment as unknown as SccpHubCommitment,
        { steps: [] },
        { prefix: false },
      ),
    );
    expect(commitment).toMatchObject({
      version: 1,
      kind: "Transfer",
      target_domain: 0,
    });
    expect(messageBundle.finality_proof).toEqual(
      expect.stringMatching(/^0x[0-9a-f]+$/u),
    );
    expect(messageBundle.payload).toMatchObject({
      Transfer: {
        source_domain: 5,
        dest_domain: 0,
        nonce: NONCE,
        asset_home_domain: 0,
        asset_id: "xor",
        amount: AMOUNT_BASE_UNITS,
        sender: TRON_ADDRESS,
        recipient: TAIRA_RECIPIENT,
        route_id: "taira_tron_xor",
      },
    });
    expect(
      bindTairaXorTronToTairaSourceProofPackage({
        proofPackage: result,
        txId: TX_ID,
        tronSender: TRON_ADDRESS,
        tairaRecipient: TAIRA_RECIPIENT,
        amount: AMOUNT_BASE_UNITS,
        bridgeAddress: TRON_ADDRESS,
      }),
    ).toMatchObject({
      txId: TX_ID,
      sourceEventDigest: SOURCE_EVENT_DIGEST,
      amount: AMOUNT_BASE_UNITS,
    });
  });

  it("requires the SCCP manifest to include the TRON bridge address", async () => {
    const module = await import("@/utils/sccpNileDiagnosticSourceProver");
    expect(() =>
      module.proveTronSource({
        ...sourceInput(),
        manifest: {},
      }),
    ).toThrow(/requires a TRON bridge address/);
    expect(mocks.bindSourceData).not.toHaveBeenCalled();
  });

  it("rejects packages when the burn event cannot be rebound to the source digest", async () => {
    const module = await import("@/utils/sccpNileDiagnosticSourceProver");
    const input = sourceInput();
    (
      (input.events.data as Array<Record<string, unknown>>)[0].result as Record<
        string,
        unknown
      >
    ).nonce = "10";
    expect(() => module.proveTronSource(input)).toThrow(/could not be rebound/);
  });
});
