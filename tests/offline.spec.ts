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
      assetId: "rose#wonderland",
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
      assetId: "rose#wonderland",
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
});
