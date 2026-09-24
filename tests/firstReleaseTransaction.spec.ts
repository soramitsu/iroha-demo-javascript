import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBinding = {
  buildTransactionPayload: vi.fn(),
  signQuotedTransactionPayload: vi.fn(),
  encodeSignedTransactionVersioned: vi.fn(),
  hashSignedTransaction: vi.fn(),
};

vi.mock("../electron/irohaJsNativeDir", () => ({
  getInstalledIrohaJsNativeBinding: () => nativeBinding,
  installGlobalIrohaJsNativeBinding: () => nativeBinding,
}));

vi.mock("../electron/accountAddress", () => ({
  normalizeCanonicalAccountIdLiteral: (value: string) => value,
}));

import { NetworkId } from "@iroha/iroha-js/canonical-request";
import {
  buildFirstReleaseAuthorityTransactionDraft,
  encodeFirstReleaseVersionedSignedTransaction,
  signFirstReleaseAuthorityTransaction,
  submitFirstReleaseTransaction,
} from "../electron/firstReleaseTransaction";

const networkId = NetworkId.fromBytes(
  Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 1 : 0)),
);
const authority = "testuCanonicalAccount";

const authorityQuote = () => ({
  intent: {
    payer: "authority" as const,
    value: { charge_limits: [], gas_limit: null },
  },
  observation: {
    ledger_time_ms: 1,
    next_block_height: 2,
    route_dataspace_id: 0,
  },
  components: [],
  capacities: [],
  decision: {
    status: "accepted" as const,
    value: {
      debit_source: { kind: "account" as const, value: authority },
      program_revision: null,
    },
  },
});

describe("first-release transaction boundary", () => {
  beforeEach(() => {
    nativeBinding.buildTransactionPayload.mockReset().mockReturnValue({
      payloadJson: JSON.stringify({ authority }),
      payloadBytes: Buffer.from([7]),
      payloadHash: Buffer.alloc(32, 3),
    });
    nativeBinding.signQuotedTransactionPayload.mockReset().mockReturnValue({
      signedTransaction: Buffer.from([1, 9, 8]),
      hash: Buffer.alloc(32, 5),
    });
    nativeBinding.encodeSignedTransactionVersioned
      .mockReset()
      .mockImplementation((bytes: Buffer) => Buffer.from(bytes));
    nativeBinding.hashSignedTransaction
      .mockReset()
      .mockReturnValue(Buffer.alloc(32, 5));
  });

  it("builds and signs only a fixed authority-payer native draft", () => {
    let nativePrivateKey: Buffer | null = null;
    let signingPrivateKeySnapshot: Buffer | null = null;
    nativeBinding.signQuotedTransactionPayload.mockImplementationOnce(
      (
        _networkId: Uint8Array,
        _payloadJson: string,
        _quotedFeePaymentJson: string,
        privateKey: Buffer,
      ) => {
        nativePrivateKey = privateKey;
        signingPrivateKeySnapshot = Buffer.from(privateKey);
        return {
          signedTransaction: Buffer.from([1, 9, 8]),
          hash: Buffer.alloc(32, 5),
        };
      },
    );
    const draft = buildFirstReleaseAuthorityTransactionDraft({
      networkId,
      networkPrefix: 369,
      authority,
      instructions: [{ wire_id: "OpenVpnLeaseEscrow", payload_hex: "abcd" }],
    });

    expect(nativeBinding.buildTransactionPayload).toHaveBeenCalledWith(
      networkId.toBytes(),
      authority,
      ['{"wire_id":"OpenVpnLeaseEscrow","payload_hex":"abcd"}'],
      '{"payer":"authority","value":{"charge_limits":[],"gas_limit":null}}',
      null,
      null,
      null,
      null,
    );

    const callerPrivateKey = Buffer.alloc(32, 4);
    const signed = signFirstReleaseAuthorityTransaction({
      networkId,
      draft,
      quote: authorityQuote(),
      privateKey: callerPrivateKey,
      privateKeyAlgorithm: "ed25519",
    });
    expect(signed.signedTransaction).toEqual(Buffer.from([1, 9, 8]));
    expect(signingPrivateKeySnapshot).toEqual(Buffer.alloc(32, 4));
    expect(nativePrivateKey).toEqual(Buffer.alloc(32));
    expect(callerPrivateKey).toEqual(Buffer.alloc(32, 4));
    expect(nativeBinding.signQuotedTransactionPayload).toHaveBeenCalledTimes(1);
  });

  it("rejects compatibility-shaped native results and foreign quote authority", () => {
    nativeBinding.buildTransactionPayload.mockReturnValueOnce({
      payload_json: "{}",
      payload_bytes: Buffer.from([7]),
      payload_hash: Buffer.alloc(32, 3),
    });
    expect(() =>
      buildFirstReleaseAuthorityTransactionDraft({
        networkId,
        networkPrefix: 369,
        authority,
        instructions: [{}],
      }),
    ).toThrow(/unexpected response shape/u);

    const draft = buildFirstReleaseAuthorityTransactionDraft({
      networkId,
      networkPrefix: 369,
      authority,
      instructions: [{}],
    });
    const quote = authorityQuote();
    quote.decision.value.debit_source.value = "testuForeignAccount";
    expect(() =>
      signFirstReleaseAuthorityTransaction({
        networkId,
        draft,
        quote,
        privateKey: Buffer.alloc(32, 4),
      }),
    ).toThrow(/exact first-release transaction authority/u);
  });

  it("rejects ambiguous instruction JSON and freezes the quoted payload", () => {
    expect(() =>
      buildFirstReleaseAuthorityTransactionDraft({
        networkId,
        networkPrefix: 369,
        authority,
        instructions: ['{"Transfer":{},"Transfer":{}}'],
      }),
    ).toThrow(/strict JSON/u);

    nativeBinding.buildTransactionPayload.mockReturnValueOnce({
      payloadJson: JSON.stringify({
        authority,
        nested: { instructions: [{}] },
      }),
      payloadBytes: Buffer.from([7]),
      payloadHash: Buffer.alloc(32, 3),
    });
    const draft = buildFirstReleaseAuthorityTransactionDraft({
      networkId,
      networkPrefix: 369,
      authority,
      instructions: [{}],
    });
    expect(Object.isFrozen(draft.payload)).toBe(true);
    expect(Object.isFrozen(draft.payload.nested)).toBe(true);
  });

  it("rejects structurally expensive instruction inputs before serialization", () => {
    const tooMany = Array.from({ length: 65 }, () => ({}));
    expect(() =>
      buildFirstReleaseAuthorityTransactionDraft({
        networkId,
        networkPrefix: 369,
        authority,
        instructions: tooMany,
      }),
    ).toThrow(/item limit/u);

    const expando = [{}] as Array<Record<string, unknown>> & {
      extra?: boolean;
    };
    expando.extra = true;
    expect(() =>
      buildFirstReleaseAuthorityTransactionDraft({
        networkId,
        networkPrefix: 369,
        authority,
        instructions: expando,
      }),
    ).toThrow(/named fields/u);

    expect(() =>
      buildFirstReleaseAuthorityTransactionDraft({
        networkId,
        networkPrefix: 369,
        authority,
        instructions: [{ nested: { value: "x".repeat(16 * 1024 + 1) } }],
      }),
    ).toThrow(/oversized text/u);
  });

  it("requires native canonical VersionedSignedTransaction V1 equality", () => {
    expect(
      encodeFirstReleaseVersionedSignedTransaction(Buffer.from([1, 2, 3])),
    ).toEqual(Buffer.from([1, 2, 3]));

    nativeBinding.encodeSignedTransactionVersioned.mockReturnValueOnce(
      Buffer.from([1, 2, 4]),
    );
    expect(() =>
      encodeFirstReleaseVersionedSignedTransaction(Buffer.from([1, 2, 3])),
    ).toThrow(/exact canonical/u);
  });

  it("rejects a signer hash that does not match the canonical wire", () => {
    const draft = buildFirstReleaseAuthorityTransactionDraft({
      networkId,
      networkPrefix: 369,
      authority,
      instructions: [{}],
    });
    nativeBinding.hashSignedTransaction.mockReturnValueOnce(
      Buffer.alloc(32, 6),
    );

    expect(() =>
      signFirstReleaseAuthorityTransaction({
        networkId,
        draft,
        quote: authorityQuote(),
        privateKey: Buffer.alloc(32, 4),
      }),
    ).toThrow(/does not match the signed transaction/u);
  });

  it("wipes its isolated private-key copy when native signing fails", () => {
    const draft = buildFirstReleaseAuthorityTransactionDraft({
      networkId,
      networkPrefix: 369,
      authority,
      instructions: [{}],
    });
    const callerPrivateKey = Buffer.alloc(32, 7);
    let nativePrivateKey: Buffer | null = null;
    nativeBinding.signQuotedTransactionPayload.mockImplementationOnce(
      (
        _networkId: Uint8Array,
        _payloadJson: string,
        _quotedFeePaymentJson: string,
        privateKey: Buffer,
      ) => {
        nativePrivateKey = privateKey;
        throw new Error("native signer failed");
      },
    );

    expect(() =>
      signFirstReleaseAuthorityTransaction({
        networkId,
        draft,
        quote: authorityQuote(),
        privateKey: callerPrivateKey,
      }),
    ).toThrow("native signer failed");
    expect(nativePrivateKey).toEqual(Buffer.alloc(32));
    expect(callerPrivateKey).toEqual(Buffer.alloc(32, 7));
  });

  it("submits once over HTTPS with redirects disabled", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      submitFirstReleaseTransaction({
        toriiUrl: "https://taira.sora.org",
        signedTransaction: Buffer.from([1, 2, 3]),
        fetchImpl,
      }),
    ).resolves.toEqual({ status: 204, receiptBytes: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://taira.sora.org/v1/pipeline/transactions"),
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );

    await expect(
      submitFirstReleaseTransaction({
        toriiUrl: "http://127.0.0.1:8080",
        signedTransaction: Buffer.from([1, 2, 3]),
        fetchImpl,
      }),
    ).rejects.toThrow(/requires HTTPS/u);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never follows an ingress redirect", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("moved", { status: 302 }));
    await expect(
      submitFirstReleaseTransaction({
        toriiUrl: "https://taira.sora.org",
        signedTransaction: Buffer.from([1, 2, 3]),
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 302/u);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
