import { describe, expect, it } from "vitest";
import {
  addAmounts,
  applyIncomingPayment,
  applyOutgoingPayment,
  applyWithdrawToOnline,
  computeTxId,
  createInvoice,
  createPaymentPayload,
  emptyOfflineState,
  parseInvoice,
  parsePaymentPayload,
  sumAllowances,
} from "@/utils/offline";

describe("offline utilities", () => {
  it("computes deterministic tx id", () => {
    const txId = computeTxId("alice@wonderland", "inv", "10", 0);
    expect(txId).toBe(
      "1c4977d36db9cf4b555096780bfa550a8d50c5aa0ab4738d7a4161597f2c1386",
    );
  });

  it("creates and parses invoices and payments", () => {
    const invoice = createInvoice({
      receiver: "alice@wonderland",
      assetId: "norito:abcdef0123456789",
      amount: "5.5",
      validityMs: 60_000,
      memo: "snacks",
    });
    const encoded = JSON.stringify(invoice);
    const decoded = parseInvoice(encoded);
    expect(decoded.receiver).toBe("alice@wonderland");
    const payment = createPaymentPayload({
      invoice: decoded,
      senderAccount: "bob@wonderland",
      counter: 0,
      channel: "qr",
    });
    const parsedPayment = parsePaymentPayload(JSON.stringify(payment));
    expect(parsedPayment.invoice_id).toBe(invoice.invoice_id);
    expect(parsedPayment.amount).toBe("5.5");
  });

  it("updates balances for outgoing and incoming payments", () => {
    const invoice = createInvoice({
      receiver: "alice@wonderland",
      assetId: "norito:abcdef0123456789",
      amount: "2",
      validityMs: 60_000,
    });
    const base = { ...emptyOfflineState(), balance: "5" };
    const payload = createPaymentPayload({
      invoice,
      senderAccount: "bob@wonderland",
      counter: base.nextCounter,
      channel: "qr",
    });
    const afterSend = applyOutgoingPayment(base, payload);
    expect(afterSend.balance).toBe("3");
    expect(afterSend.nextCounter).toBe(1);

    const afterReceive = applyIncomingPayment(afterSend, payload);
    expect(afterReceive.balance).toBe("5");
    expect(afterReceive.replayLog).toContain(payload.tx_id);
  });

  it("withdraws to online with counter increment and tx id", () => {
    const state = { ...emptyOfflineState(), balance: "10", nextCounter: 2 };
    const { state: updated, txId } = applyWithdrawToOnline(state, {
      accountId: "alice@wonderland",
      receiver: "hot@wonderland",
      amount: "4.5",
    });
    expect(txId).toHaveLength(64);
    expect(updated.balance).toBe("5.5");
    expect(updated.nextCounter).toBe(3);
  });

  it("sums allowances precisely", () => {
    const total = sumAllowances([
      { remaining_amount: "1.25" } as any,
      { remaining_amount: "2.75" } as any,
    ]);
    expect(total).toBe("4");
    expect(addAmounts(total, "0.5")).toBe("4.5");
  });

  it("rejects malformed decimal amount strings", () => {
    expect(() => addAmounts("1.2.3", "1")).toThrow("Invalid decimal amount.");
    expect(() =>
      parseInvoice(
        JSON.stringify({
          invoice_id: "inv-1",
          receiver: "alice@wonderland",
          asset: "norito:abcdef0123456789",
          amount: "1.2.3",
        }),
      ),
    ).toThrow("Offline amount must be a positive decimal value.");
  });

  it("rejects non-positive offline transfer amounts", () => {
    expect(() =>
      createInvoice({
        receiver: "alice@wonderland",
        assetId: "norito:abcdef0123456789",
        amount: "-5",
        validityMs: 60_000,
      }),
    ).toThrow("Offline amount must be a positive decimal value.");

    expect(() =>
      parsePaymentPayload(
        JSON.stringify({
          tx_id: "abc",
          from: "bob@wonderland",
          to: "alice@wonderland",
          asset: "norito:abcdef0123456789",
          amount: "0",
          invoice_id: "inv-2",
          counter: 0,
        }),
      ),
    ).toThrow("Offline amount must be a positive decimal value.");

    expect(() =>
      applyOutgoingPayment(
        { ...emptyOfflineState(), balance: "5" },
        {
          tx_id: "abc",
          from: "bob@wonderland",
          to: "alice@wonderland",
          asset: "norito:abcdef0123456789",
          amount: "-2",
          invoice_id: "inv-3",
          counter: 0,
          timestamp_ms: Date.now(),
          channel: "qr",
        },
      ),
    ).toThrow("Offline amount must be a positive decimal value.");

    expect(() =>
      applyWithdrawToOnline(
        { ...emptyOfflineState(), balance: "5" },
        {
          accountId: "alice@wonderland",
          receiver: "hot@wonderland",
          amount: "0",
        },
      ),
    ).toThrow("Offline amount must be a positive decimal value.");
  });
});
