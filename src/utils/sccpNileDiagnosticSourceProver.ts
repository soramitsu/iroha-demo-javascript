import {
  bindTairaXorTronBurnStartedEvent,
  buildTairaXorTronToTairaTransferPayload,
  canonicalSccpMessageProofBundleBytes,
  canonicalSccpPayloadEnvelopeBytes,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  sccpTransferMessageId,
} from "@iroha/iroha-js/sccp";
import type {
  SccpHubCommitment,
  SccpTransferPayload,
  TairaXorTronBoundBurnStartedEvent,
} from "@iroha/iroha-js/sccp";
import {
  bindTronSourceDataForProof,
  bridgeDecimalToBaseUnits,
  normalizeTairaAccountId,
  readSccpTronBridgeAddress,
  SCCP_SORA_DOMAIN,
  SCCP_XOR_ROUTE_ID,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";

const textEncoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const readEventCandidates = (events: unknown): Record<string, unknown>[] => {
  const candidates: Record<string, unknown>[] = [];
  const pushRecord = (value: unknown): void => {
    if (isRecord(value)) {
      candidates.push(value);
    }
  };
  const pushArrayRecords = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(pushRecord);
    }
  };
  if (Array.isArray(events)) {
    pushArrayRecords(events);
    return candidates;
  }
  if (!isRecord(events)) {
    return candidates;
  }
  pushRecord(events);
  for (const key of ["data", "events", "eventList", "event_list", "logs"]) {
    pushArrayRecords(events[key]);
  }
  return candidates;
};

const bindDiagnosticBurnEvent = (input: {
  events: unknown;
  bridgeAddress: string;
  tronSender: string;
  tairaRecipient: string;
  amountBaseUnits: string;
  sourceEventDigest: string;
}): Readonly<TairaXorTronBoundBurnStartedEvent> => {
  let lastError: unknown;
  for (const event of readEventCandidates(input.events)) {
    try {
      return bindTairaXorTronBurnStartedEvent({
        event,
        bridgeAddress: input.bridgeAddress,
        tronSender: input.tronSender,
        tairaRecipient: input.tairaRecipient,
        amount: input.amountBaseUnits,
        sourceEventDigest: input.sourceEventDigest,
      });
    } catch (error) {
      lastError = error;
    }
  }
  const reason =
    lastError instanceof Error && lastError.message
      ? ` ${lastError.message}`
      : "";
  throw new Error(
    `TRON burn event could not be rebound for Nile diagnostic SCCP source proof.${reason}`,
  );
};

const diagnosticFinalityProofHex = (input: {
  txId: string;
  sourceEventDigest: string;
  receiptBlockNumber: number;
  solidBlockNumber: number;
  solidBlockHash: string;
}): string => {
  const payload = JSON.stringify({
    version: 1,
    tx_id: input.txId,
    source_event_digest: input.sourceEventDigest,
    receipt_block_number: input.receiptBlockNumber,
    solid_block_number: input.solidBlockNumber,
    solid_block_hash: input.solidBlockHash,
  });
  return `0x${bytesToHex(textEncoder.encode(payload))}`;
};

export const proveTronSource = (
  input: TronToTairaSourceProofPackageInput,
): Record<string, unknown> => {
  const bridgeAddress = readSccpTronBridgeAddress(input.manifest);
  if (!bridgeAddress) {
    throw new Error(
      "TRON Nile diagnostic source prover requires a TRON bridge address in the SCCP manifest.",
    );
  }
  const amountBaseUnits = bridgeDecimalToBaseUnits(input.amountDecimal);
  const tairaRecipient = normalizeTairaAccountId(input.tairaRecipient);
  const source = bindTronSourceDataForProof({
    txId: input.txId,
    transaction: input.transaction,
    receipt: input.receipt,
    events: input.events,
    finality: input.finality,
    bridgeAddress,
    tronSender: input.tronSender,
    tairaRecipient,
    amountDecimal: input.amountDecimal,
  });
  const burnEvent = bindDiagnosticBurnEvent({
    events: input.events,
    bridgeAddress,
    tronSender: input.tronSender,
    tairaRecipient,
    amountBaseUnits,
    sourceEventDigest: source.sourceEventDigest,
  });
  const payload = buildTairaXorTronToTairaTransferPayload({
    tronSender: input.tronSender,
    tairaRecipient,
    amount: amountBaseUnits,
    nonce: burnEvent.nonce,
  }) as SccpTransferPayload;
  const payloadEnvelope = { kind: "Transfer" as const, value: payload };
  const payloadHash = sccpPayloadHash(
    canonicalSccpPayloadEnvelopeBytes(payloadEnvelope),
    {
      prefix: false,
    },
  );
  const messageId = sccpTransferMessageId(payload, { prefix: false });
  const commitment: SccpHubCommitment = {
    version: 1,
    kind: "Transfer",
    target_domain: SCCP_SORA_DOMAIN,
    message_id: messageId,
    payload_hash: payloadHash,
  };
  const merkleProof = { steps: [] };
  const commitmentRoot = sccpMerkleRootFromCommitment(commitment, merkleProof, {
    prefix: false,
  });
  const messageBundle = {
    version: 1,
    commitment_root: commitmentRoot,
    commitment,
    merkle_proof: merkleProof,
    payload: { Transfer: payload },
    finality_proof: diagnosticFinalityProofHex({
      txId: source.txId,
      sourceEventDigest: source.sourceEventDigest,
      receiptBlockNumber: source.receiptBlockNumber,
      solidBlockNumber: source.solidBlockNumber,
      solidBlockHash: source.solidBlockHash,
    }),
  };
  canonicalSccpMessageProofBundleBytes(messageBundle);
  return Object.freeze({
    messageBundle,
    settlement: Object.freeze({
      entrypoint: "finalize_inbound",
      route: SCCP_XOR_ROUTE_ID,
    }),
    sourceEventDigest: source.sourceEventDigest,
    txId: source.txId,
    messageId,
    commitmentRoot,
  });
};

export const irohaSccpTronSourceProve = proveTronSource;
export const tronSccpSourceProve = proveTronSource;

export default proveTronSource;
