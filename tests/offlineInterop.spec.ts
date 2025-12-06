import { describe, expect, it } from 'vitest'
import {
  computeTxId,
  createInvoice,
  createPaymentPayload,
  encodeInvoice,
  parseInvoice,
  parsePaymentPayload,
  applyIncomingPayment,
  emptyOfflineState
} from '@/utils/offline'

describe('offline protocol interoperability', () => {
  it('parses Android-style invoice and matches JS-generated payload', () => {
    const androidInvoiceJson = JSON.stringify({
      invoice_id: 'inv-android-001',
      receiver: 'alice@wonderland',
      asset: 'rose#wonderland',
      amount: '3.50',
      created_at_ms: 1_700_000_000_000,
      expires_at_ms: 1_700_000_100_000,
      memo: 'latte'
    })

    const parsed = parseInvoice(androidInvoiceJson)
    expect(parsed.invoice_id).toBe('inv-android-001')
    expect(parsed.receiver).toBe('alice@wonderland')
    expect(parsed.amount).toBe('3.50')

    const jsInvoice = createInvoice({
      receiver: parsed.receiver,
      assetId: parsed.asset,
      amount: parsed.amount,
      validityMs: parsed.expires_at_ms - parsed.created_at_ms,
      memo: parsed.memo ?? undefined
    })
    const roundTrip = parseInvoice(encodeInvoice(jsInvoice))
    expect(roundTrip.receiver).toBe(parsed.receiver)
    expect(roundTrip.asset).toBe(parsed.asset)
    expect(roundTrip.amount).toBe(parsed.amount)
  })

  it('parses Android/iOS payment JSON and matches JS tx id computation', () => {
    const invoiceId = 'inv-android-002'
    const sender = 'bob@wonderland'
    const receiver = 'alice@wonderland'
    const amount = '10.00'
    const counter = 7
    const expectedTxId = computeTxId(sender, invoiceId, amount, counter)

    const androidPaymentJson = JSON.stringify({
      tx_id: expectedTxId,
      from: sender,
      to: receiver,
      asset: 'rose#wonderland',
      amount,
      invoice_id: invoiceId,
      counter,
      timestamp_ms: 1_700_000_200_000,
      channel: 'qr',
      memo: 'thanks'
    })

    const parsedPayment = parsePaymentPayload(androidPaymentJson)
    expect(parsedPayment.tx_id).toBe(expectedTxId)
    expect(parsedPayment.counter).toBe(counter)
    expect(parsedPayment.memo).toBe('thanks')

    const paymentFromJs = createPaymentPayload({
      invoice: {
        invoice_id: invoiceId,
        receiver,
        asset: 'rose#wonderland',
        amount,
        created_at_ms: parsedPayment.timestamp_ms,
        expires_at_ms: parsedPayment.timestamp_ms + 60_000,
        memo: 'thanks'
      },
      senderAccount: sender,
      counter,
      channel: 'qr',
      memo: 'thanks'
    })
    expect(paymentFromJs.tx_id).toBe(parsedPayment.tx_id)
  })

  it('records incoming payloads from mobile clients without replay', () => {
    const state = emptyOfflineState()
    const payload = parsePaymentPayload(
      JSON.stringify({
        tx_id: computeTxId('bob@wonderland', 'inv-android-003', '1.25', 0),
        from: 'bob@wonderland',
        to: 'alice@wonderland',
        asset: 'rose#wonderland',
        amount: '1.25',
        invoice_id: 'inv-android-003',
        counter: 0,
        timestamp_ms: Date.now(),
        channel: 'qr'
      })
    )
    const updated = applyIncomingPayment(state, payload)
    expect(updated.balance).toBe('1.25')
    expect(updated.replayLog).toContain(payload.tx_id)
    expect(() => applyIncomingPayment(updated, payload)).toThrow()
  })
})
