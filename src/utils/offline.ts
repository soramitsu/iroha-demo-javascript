import { blake2b } from '@noble/hashes/blake2.js'
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js'
import type { OfflineAllowanceItem } from '@/types/iroha'

export type OfflineInvoice = {
  invoice_id: string
  receiver: string
  asset: string
  amount: string
  created_at_ms: number
  expires_at_ms: number
  memo?: string | null
}

export type OfflinePaymentPayload = {
  tx_id: string
  from: string
  to: string
  asset: string
  amount: string
  invoice_id: string
  counter: number
  timestamp_ms: number
  channel: string
  memo?: string | null
}

export type OfflineTransferRecord = {
  txId: string
  direction: 'incoming' | 'outgoing'
  counterLabel: string
  amount: string
  peer: string
  timestampMs: number
  memo?: string | null
}

export type OfflineStateSnapshot = {
  balance: string
  nextCounter: number
  replayLog: string[]
  history: OfflineTransferRecord[]
  syncedAtMs?: number | null
  nextPolicyExpiryMs?: number | null
  nextRefreshMs?: number | null
}

type ParsedDecimal = { value: bigint; scale: number }

const parseDecimal = (input: string): ParsedDecimal => {
  const trimmed = input.trim()
  if (!trimmed) {
    return { value: 0n, scale: 0 }
  }
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [intPartRaw, fracRaw = ''] = unsigned.split('.')
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '')
  const fracPart = fracRaw.replace(/0+$/, '')
  const scale = fracPart.length
  const numeric = `${intPart || '0'}${fracPart}`
  const value = BigInt(numeric || '0')
  return { value: negative ? -value : value, scale }
}

const pow10 = (exp: number) => 10n ** BigInt(exp)

const formatDecimal = (value: bigint, scale: number): string => {
  const negative = value < 0
  const abs = negative ? -value : value
  if (scale === 0) {
    return `${negative ? '-' : ''}${abs.toString()}`
  }
  const factor = pow10(scale)
  const intPart = abs / factor
  const fracPart = abs % factor
  const fracStr = fracPart.toString().padStart(scale, '0').replace(/0+$/, '')
  const intStr = intPart.toString()
  const body = fracStr ? `${intStr}.${fracStr}` : intStr
  return negative ? `-${body}` : body
}

const alignScales = (a: ParsedDecimal, b: ParsedDecimal) => {
  const scale = Math.max(a.scale, b.scale)
  const scaleA = scale - a.scale
  const scaleB = scale - b.scale
  return {
    a: a.value * pow10(scaleA),
    b: b.value * pow10(scaleB),
    scale
  }
}

export const addAmounts = (left: string, right: string) => {
  const a = parseDecimal(left)
  const b = parseDecimal(right)
  const { a: av, b: bv, scale } = alignScales(a, b)
  return formatDecimal(av + bv, scale)
}

export const subtractAmounts = (left: string, right: string) => {
  const a = parseDecimal(left)
  const b = parseDecimal(right)
  const { a: av, b: bv, scale } = alignScales(a, b)
  return formatDecimal(av - bv, scale)
}

export const compareAmounts = (left: string, right: string) => {
  const a = parseDecimal(left)
  const b = parseDecimal(right)
  const { a: av, b: bv } = alignScales(a, b)
  if (av === bv) return 0
  return av > bv ? 1 : -1
}

export const computeTxId = (sender: string, invoiceId: string, amount: string, counter: number) => {
  const preimage = `${sender}|${invoiceId}|${amount}|${counter}`
  return bytesToHex(blake2b(utf8ToBytes(preimage), { dkLen: 32 }))
}

export const createInvoice = (params: {
  receiver: string
  assetId: string
  amount: string
  validityMs: number
  memo?: string | null
}): OfflineInvoice => {
  const now = Date.now()
  const expiresAt = now + Math.max(params.validityMs, 0)
  const memo = params.memo?.trim() || undefined
  return {
    invoice_id: crypto.randomUUID(),
    receiver: params.receiver,
    asset: params.assetId,
    amount: params.amount,
    created_at_ms: now,
    expires_at_ms: expiresAt,
    memo
  }
}

export const encodeInvoice = (invoice: OfflineInvoice) => JSON.stringify(invoice)

export const parseInvoice = (payload: string): OfflineInvoice => {
  const parsed = JSON.parse(payload)
  if (!parsed.invoice_id || !parsed.receiver || !parsed.asset || !parsed.amount) {
    throw new Error('Invalid offline invoice payload')
  }
  return {
    invoice_id: String(parsed.invoice_id),
    receiver: String(parsed.receiver),
    asset: String(parsed.asset),
    amount: String(parsed.amount),
    created_at_ms: Number(parsed.created_at_ms ?? Date.now()),
    expires_at_ms: Number(parsed.expires_at_ms ?? Date.now()),
    memo: parsed.memo ? String(parsed.memo) : undefined
  }
}

export const createPaymentPayload = (params: {
  invoice: OfflineInvoice
  senderAccount: string
  counter: number
  channel?: string
  memo?: string | null
}): OfflinePaymentPayload => {
  const { invoice, senderAccount, counter } = params
  const memo = params.memo?.trim() || undefined
  const txId = computeTxId(senderAccount, invoice.invoice_id, invoice.amount, counter)
  return {
    tx_id: txId,
    from: senderAccount,
    to: invoice.receiver,
    asset: invoice.asset,
    amount: invoice.amount,
    invoice_id: invoice.invoice_id,
    counter,
    timestamp_ms: Date.now(),
    channel: params.channel ?? 'qr',
    memo
  }
}

export const parsePaymentPayload = (payload: string): OfflinePaymentPayload => {
  const parsed = JSON.parse(payload)
  if (!parsed.tx_id || !parsed.from || !parsed.to || !parsed.asset || !parsed.amount) {
    throw new Error('Invalid offline payment payload')
  }
  return {
    tx_id: String(parsed.tx_id),
    from: String(parsed.from),
    to: String(parsed.to),
    asset: String(parsed.asset),
    amount: String(parsed.amount),
    invoice_id: String(parsed.invoice_id),
    counter: Number(parsed.counter ?? 0),
    timestamp_ms: Number(parsed.timestamp_ms ?? Date.now()),
    channel: parsed.channel ? String(parsed.channel) : 'qr',
    memo: parsed.memo ? String(parsed.memo) : undefined
  }
}

export const sumAllowances = (allowances: OfflineAllowanceItem[]) =>
  allowances.reduce((sum, allowance) => addAmounts(sum, allowance.remaining_amount ?? '0'), '0')

export const applyOutgoingPayment = (
  state: OfflineStateSnapshot,
  payload: OfflinePaymentPayload
): OfflineStateSnapshot => {
  if (payload.counter !== state.nextCounter) {
    throw new Error('Offline counter is out of sync. Sync allowances or reset the offline wallet.')
  }
  if (compareAmounts(state.balance, payload.amount) < 0) {
    throw new Error('Insufficient offline balance for this payment.')
  }
  const updatedBalance = subtractAmounts(state.balance, payload.amount)
  const record: OfflineTransferRecord = {
    txId: payload.tx_id,
    direction: 'outgoing',
    counterLabel: `#${payload.counter}`,
    amount: payload.amount,
    peer: payload.to,
    timestampMs: payload.timestamp_ms,
    memo: payload.memo
  }
  return {
    ...state,
    balance: updatedBalance,
    nextCounter: payload.counter + 1,
    history: [...state.history, record]
  }
}

export const applyIncomingPayment = (
  state: OfflineStateSnapshot,
  payload: OfflinePaymentPayload
): OfflineStateSnapshot => {
  if (state.replayLog.includes(payload.tx_id)) {
    throw new Error('This payment has already been recorded.')
  }
  const updatedBalance = addAmounts(state.balance, payload.amount)
  const record: OfflineTransferRecord = {
    txId: payload.tx_id,
    direction: 'incoming',
    counterLabel: `#${payload.counter}`,
    amount: payload.amount,
    peer: payload.from,
    timestampMs: payload.timestamp_ms,
    memo: payload.memo
  }
  return {
    ...state,
    balance: updatedBalance,
    replayLog: [...state.replayLog, payload.tx_id],
    history: [...state.history, record]
  }
}

export const applyWithdrawToOnline = (
  state: OfflineStateSnapshot,
  params: { accountId: string; receiver: string; amount: string; memo?: string | null }
): { state: OfflineStateSnapshot; txId: string } => {
  if (compareAmounts(state.balance, params.amount) < 0) {
    throw new Error('Insufficient offline balance for this withdrawal.')
  }
  const txId = computeTxId(params.accountId, 'online-deposit', params.amount, state.nextCounter)
  const record: OfflineTransferRecord = {
    txId,
    direction: 'outgoing',
    counterLabel: `#${state.nextCounter}`,
    amount: params.amount,
    peer: params.receiver,
    timestampMs: Date.now(),
    memo: params.memo ?? undefined
  }
  const updatedBalance = subtractAmounts(state.balance, params.amount)
  return {
    state: {
      ...state,
      balance: updatedBalance,
      nextCounter: state.nextCounter + 1,
      history: [...state.history, record]
    },
    txId
  }
}

export const applyAllowanceSnapshot = (
  state: OfflineStateSnapshot,
  snapshot: { total: string; syncedAtMs: number; nextPolicyExpiryMs: number | null; nextRefreshMs?: number | null }
): OfflineStateSnapshot => ({
  ...state,
  balance: snapshot.total,
  syncedAtMs: snapshot.syncedAtMs,
  nextPolicyExpiryMs: snapshot.nextPolicyExpiryMs ?? null,
  nextRefreshMs: snapshot.nextRefreshMs ?? null
})

export const emptyOfflineState = (): OfflineStateSnapshot => ({
  balance: '0',
  nextCounter: 0,
  replayLog: [],
  history: [],
  syncedAtMs: null,
  nextPolicyExpiryMs: null,
  nextRefreshMs: null
})
