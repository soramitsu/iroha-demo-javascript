import { createHash, randomBytes } from "node:crypto";
import {
  assertConnectSigningPermission,
  assertConnectSessionCommitment,
  base64ToBytes,
  buildApprovePreimage,
  bytesToBase64,
  bytesToHex,
  copyConnectPermissions,
  decodeIrohaConnectFrameBase64,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectWalletDirectionKeys,
  encodeApproveConnectFrame,
  encodeCiphertextConnectFrame,
  encodeControlConnectFrame,
  encryptConnectEnvelope,
  generateConnectWalletKeyPair,
  hexToBytes,
  IROHA_CONNECT_MAX_FRAME_BYTES,
  type ConnectEnvelopePayload,
  type ConnectPermissions,
  type ConnectWalletSignature,
} from "../src/utils/soraswapConnectWire";
import { parseNetworkIdLiteral } from "../src/utils/networkIdentity";
import { isConnectTransactionReview } from "../src/utils/connectTransactionReview";
import type { ConnectTransactionReview } from "../src/types/connectTransactionReview";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";

export const IROHA_CONNECT_CONFIRMATION_CHANNEL =
  "iroha-connect:confirm-current-v1";

export type IrohaConnectWalletContext = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  /** Endpoint-derived, pinned NetworkId (verified again by `assertContext`). */
  networkId: string;
  accountId: string;
};

type IrohaConnectConfirmationContext = {
  sid: string;
  accountId: string;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  networkId: string;
};

export type IrohaConnectConfirmation =
  | (IrohaConnectConfirmationContext & {
      kind: "session";
      permissions: ConnectPermissions | null;
    })
  | (IrohaConnectConfirmationContext & {
      kind: "sign_request_raw";
      domainTag: string;
      byteLength: number;
      payloadPreviewHex: string;
    })
  | (IrohaConnectConfirmationContext & {
      kind: "sign_request_tx";
      /** Decoded payload; the wallet signs exactly `review.payloadHashHex`. */
      review: ConnectTransactionReview;
    });

const snapshotExactOwnDataFields = (
  value: object,
  expected: readonly string[],
): Readonly<Record<string, unknown>> | undefined => {
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return undefined;
  }
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const allowed = new Set(expected);
  let enumerableOwnKeyCount = 0;
  try {
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      enumerableOwnKeyCount += 1;
      if (enumerableOwnKeyCount > expected.length || !allowed.has(key)) {
        return undefined;
      }
    }
    if (enumerableOwnKeyCount !== expected.length) return undefined;
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        return undefined;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
};

const isCanonicalConfirmationText = (
  value: unknown,
  maximumLength: number,
): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  Buffer.byteLength(value, "utf8") <= maximumLength &&
  value.trim() === value &&
  value.normalize("NFC") === value &&
  !/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value);

const isCanonicalConfirmationContext = (
  value: Record<string, unknown>,
): boolean => {
  if (
    typeof value.accountId !== "string" ||
    typeof value.chainId !== "string" ||
    typeof value.sid !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      value.chainId,
    ) ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(value.sid) ||
    !Number.isSafeInteger(value.networkPrefix) ||
    Object.is(value.networkPrefix, -0) ||
    (value.networkPrefix as number) < 0 ||
    (value.networkPrefix as number) > 16_383 ||
    !isCanonicalConfirmationText(value.toriiUrl, 2048) ||
    !isCanonicalConfirmationText(value.networkId, 128)
  ) {
    return false;
  }
  try {
    if (parseNetworkIdLiteral(value.networkId) !== value.networkId) {
      return false;
    }
    const endpoint = normalizeEndpointUrl(value.toriiUrl);
    if (new URL(endpoint).pathname !== "/") return false;
    const accountId = normalizeCanonicalAccountIdLiteral(
      value.accountId,
      "accountId",
      value.networkPrefix as number,
    );
    return endpoint === value.toriiUrl && accountId === value.accountId;
  } catch {
    return false;
  }
};

const snapshotCanonicalPermissionList = (
  value: unknown,
  maximumEntries: number,
): string[] | undefined => {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maximumEntries
    ) {
      return undefined;
    }
    let enumerableOwnItemCount = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
        return undefined;
      }
      enumerableOwnItemCount += 1;
      if (enumerableOwnItemCount > value.length) return undefined;
    }
    if (enumerableOwnItemCount !== value.length) return undefined;
    const snapshot: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor?.enumerable ||
        !("value" in descriptor) ||
        !isCanonicalConfirmationText(descriptor.value, 256) ||
        seen.has(descriptor.value)
      ) {
        return undefined;
      }
      seen.add(descriptor.value);
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return undefined;
  }
};

const snapshotCanonicalConnectPermissions = (
  value: unknown,
): ConnectPermissions | null | undefined => {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const permissions = snapshotExactOwnDataFields(value, [
    "methods",
    "events",
    "resources",
  ]);
  if (!permissions) return undefined;
  const methods = snapshotCanonicalPermissionList(permissions.methods, 16);
  const events = snapshotCanonicalPermissionList(permissions.events, 16);
  const resources =
    permissions.resources === null
      ? null
      : snapshotCanonicalPermissionList(permissions.resources, 64);
  if (!methods || !events || resources === undefined) return undefined;
  return { methods, events, resources };
};

const isCanonicalConnectPermissions = (
  value: unknown,
): value is ConnectPermissions | null =>
  snapshotCanonicalConnectPermissions(value) !== undefined;

const requireCanonicalConnectPermissions = (
  value: unknown,
): ConnectPermissions | null => {
  const permissions = snapshotCanonicalConnectPermissions(value);
  if (permissions === undefined) {
    throw new Error(
      "IrohaConnect permissions must be an exact bounded permission manifest.",
    );
  }
  return permissions;
};

export const isIrohaConnectConfirmation = (
  value: unknown,
): value is IrohaConnectConfirmation => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  let kind: unknown;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
    if (!descriptor?.enumerable || !("value" in descriptor)) return false;
    kind = descriptor.value;
  } catch {
    return false;
  }
  if (kind === "session") {
    const record = snapshotExactOwnDataFields(value, [
      "kind",
      "sid",
      "accountId",
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "networkId",
      "permissions",
    ]);
    return Boolean(
      record &&
        isCanonicalConfirmationContext(record) &&
        isCanonicalConnectPermissions(record.permissions),
    );
  }
  if (kind === "sign_request_tx") {
    const record = snapshotExactOwnDataFields(value, [
      "kind",
      "sid",
      "accountId",
      "toriiUrl",
      "chainId",
      "networkPrefix",
      "networkId",
      "review",
    ]);
    return Boolean(
      record &&
        isCanonicalConfirmationContext(record) &&
        isConnectTransactionReview(record.review) &&
        record.review.authority === record.accountId &&
        record.review.networkId === record.networkId,
    );
  }
  if (kind !== "sign_request_raw") {
    return false;
  }
  const record = snapshotExactOwnDataFields(value, [
    "kind",
    "sid",
    "accountId",
    "toriiUrl",
    "chainId",
    "networkPrefix",
    "networkId",
    "domainTag",
    "byteLength",
    "payloadPreviewHex",
  ]);
  if (!record || !isCanonicalConfirmationContext(record)) return false;
  return (
    isCanonicalConfirmationText(record.domainTag, 256) &&
    Number.isSafeInteger(record.byteLength) &&
    (record.byteLength as number) >= 1 &&
    (record.byteLength as number) <= IROHA_CONNECT_MAX_FRAME_BYTES &&
    typeof record.payloadPreviewHex === "string" &&
    /^(?:[0-9a-f]{2}){1,96}$/u.test(record.payloadPreviewHex) &&
    record.payloadPreviewHex.length ===
      Math.min(record.byteLength as number, 96) * 2
  );
};

export type IrohaConnectBoundaryDependencies = {
  assertContext(
    context: IrohaConnectWalletContext,
  ): Promise<IrohaConnectWalletContext>;
  authorize(confirmation: IrohaConnectConfirmation): Promise<boolean>;
  /**
   * Decode `SignRequestTx` payload bytes, bind them to the paired account and
   * session NetworkId, and return the review plus the exact payload hash.
   * Throws for any payload the wallet must not sign.
   */
  reviewTransaction(
    context: IrohaConnectWalletContext,
    payloadBytes: Uint8Array,
  ): { review: ConnectTransactionReview; payloadHash: Uint8Array };
  /** Ed25519-sign `message` with the vault key; called only after approval. */
  sign(
    context: IrohaConnectWalletContext,
    message: Uint8Array,
  ): Promise<ConnectWalletSignature>;
  randomToken?: () => string;
  now?: () => number;
};

type PendingSession = {
  approvalToken: string;
  contextKey: string;
  generation: number;
  context: IrohaConnectWalletContext;
  sid: string;
  walletPublicKeyHex: string;
  appKey: Uint8Array;
  walletKey: Uint8Array;
  permissions: ConnectPermissions | null;
  approvalPreimage: Uint8Array;
  expiresAtMs: number;
};

type ActiveSession = {
  sessionToken: string;
  contextKey: string;
  context: IrohaConnectWalletContext;
  sid: string;
  appKey: Uint8Array;
  walletKey: Uint8Array;
  permissions: ConnectPermissions | null;
  nextAppSequence: number;
  nextServerSequence: number;
  nextWalletSequence: number;
  requestSlot: ActiveRequestSlot | null;
};

type PendingRequest = {
  requestToken: string;
  sessionToken: string;
  contextKey: string;
  requestType: "sign_request_raw" | "sign_request_tx";
  domainTag: string | null;
  /** Raw message bytes, or the exact unsigned transaction payload bytes. */
  message: Uint8Array;
  /** Present for `sign_request_tx` only. */
  review: ConnectTransactionReview | null;
  expiresAtMs: number;
};

type ActiveRequestSlot = {
  phase: "awaiting_confirmation" | "executing";
  request: PendingRequest;
};

export type IrohaConnectProcessedFrame =
  | { kind: "server_event" }
  | { kind: "closed"; reason: string }
  | { kind: "response"; frameBase64: string; error: string }
  | {
      kind: "request";
      requestToken: string;
      requestType: "sign_request_raw" | "sign_request_tx";
      domainTag: string | null;
      byteLength: number;
      payloadPreviewHex: string;
      review: ConnectTransactionReview | null;
    }
  | { kind: "ignored" };

const SESSION_APPROVAL_TTL_MS = 2 * 60_000;
const REQUEST_APPROVAL_TTL_MS = 2 * 60_000;
const EXACT_BOUNDARY_TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

const normalizeText = (value: unknown, label: string, maximumBytes = 4_096) => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical text.`);
  }
  return value;
};

const isBoundaryToken = (value: unknown): value is string =>
  typeof value === "string" && EXACT_BOUNDARY_TOKEN.test(value);

const normalizeContext = (
  context: IrohaConnectWalletContext,
): IrohaConnectWalletContext => {
  const toriiUrl = normalizeText(context.toriiUrl, "toriiUrl", 2_048);
  if (
    normalizeEndpointUrl(toriiUrl) !== toriiUrl ||
    new URL(toriiUrl).pathname !== "/"
  ) {
    throw new Error("toriiUrl must be a canonical endpoint origin.");
  }
  const chainId = normalizeText(context.chainId, "chainId", 64);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      chainId,
    )
  ) {
    throw new Error("chainId must be an exact lowercase UUID.");
  }
  if (
    !Number.isSafeInteger(context.networkPrefix) ||
    Object.is(context.networkPrefix, -0) ||
    context.networkPrefix < 0 ||
    context.networkPrefix > 16_383
  ) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  const accountId = normalizeCanonicalAccountIdLiteral(
    normalizeText(context.accountId, "accountId", 1_024),
    "accountId",
    context.networkPrefix,
  );
  const networkId = normalizeText(context.networkId, "networkId", 128);
  if (parseNetworkIdLiteral(networkId, "networkId") !== networkId) {
    throw new Error("networkId must be a canonical NetworkId literal.");
  }
  return {
    toriiUrl,
    chainId,
    networkPrefix: context.networkPrefix,
    networkId,
    accountId,
  };
};

const contextKey = (context: IrohaConnectWalletContext) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        context.toriiUrl,
        context.chainId,
        context.networkPrefix,
        context.networkId,
        context.accountId,
      ]),
    )
    .digest("hex");

const defaultRandomToken = () => randomBytes(32).toString("base64url");

const copySignature = (
  signature: ConnectWalletSignature,
): ConnectWalletSignature => ({
  algorithmCode: signature.algorithmCode,
  algorithmLabel: signature.algorithmLabel,
  signatureHex: signature.signatureHex,
  signatureBase64: signature.signatureBase64,
});

export class IrohaConnectBoundary {
  readonly #dependencies: Required<
    Pick<IrohaConnectBoundaryDependencies, "randomToken" | "now">
  > &
    Omit<IrohaConnectBoundaryDependencies, "randomToken" | "now">;
  #currentContextKey = "";
  #generation = 0;
  #pendingSessions = new Map<string, PendingSession>();
  #authorizingSessions = new Map<string, PendingSession>();
  #sessions = new Map<string, ActiveSession>();

  constructor(dependencies: IrohaConnectBoundaryDependencies) {
    this.#dependencies = {
      ...dependencies,
      randomToken: dependencies.randomToken ?? defaultRandomToken,
      now: dependencies.now ?? Date.now,
    };
  }

  setContext(context: IrohaConnectWalletContext) {
    const normalized = normalizeContext(context);
    const nextKey = contextKey(normalized);
    if (nextKey === this.#currentContextKey) {
      return;
    }
    this.#generation += 1;
    this.#disposeAll();
    this.#currentContextKey = nextKey;
  }

  reset() {
    this.#generation += 1;
    this.#disposeAll();
    this.#currentContextKey = "";
  }

  async prepareSession(input: {
    context: IrohaConnectWalletContext;
    sid: string;
    appPublicKeyHex: string;
    nonceBase64Url: string;
    relayToken: string;
    requestedNetworkId: string;
    permissions: ConnectPermissions | null;
  }): Promise<{ approvalToken: string }> {
    const permissions = requireCanonicalConnectPermissions(input.permissions);
    const requestedContext = normalizeContext(input.context);
    this.#requireCurrentContext(requestedContext);
    const generation = this.#generation;
    this.#requireSessionSlotAvailable();
    const expectedNetworkId = requestedContext.networkId;
    if (
      normalizeText(input.requestedNetworkId, "requestedNetworkId", 128) !==
      expectedNetworkId
    ) {
      throw new Error(
        "The IrohaConnect Open frame is for a different NetworkId.",
      );
    }
    const sid = normalizeText(input.sid, "sid", 128);
    const relayToken = normalizeText(input.relayToken, "relayToken", 4_096);
    const appPublicKeyHex = normalizeText(
      input.appPublicKeyHex,
      "appPublicKeyHex",
      128,
    );
    const nonceBase64Url = normalizeText(
      input.nonceBase64Url,
      "nonceBase64Url",
      128,
    );
    assertConnectSessionCommitment({
      sid,
      networkId: expectedNetworkId,
      appPublicKeyHex,
      nonceBase64Url,
    });
    const verifiedContext = normalizeContext(
      await this.#dependencies.assertContext(requestedContext),
    );
    this.#requireGeneration(generation);
    this.#requireCurrentContext(verifiedContext);
    this.#requireSessionSlotAvailable();
    if (verifiedContext.networkId !== expectedNetworkId) {
      throw new Error(
        "The verified IrohaConnect context changed the requested NetworkId.",
      );
    }
    const walletKeyPair = generateConnectWalletKeyPair();
    const directionKeys = deriveConnectWalletDirectionKeys({
      sid,
      appPublicKeyHex,
      walletPrivateKeyHex: walletKeyPair.privateKeyHex,
    });
    let approvalPreimage: Uint8Array | null = null;
    let transferred = false;
    try {
      approvalPreimage = buildApprovePreimage({
        sid,
        networkId: expectedNetworkId,
        appPublicKeyHex,
        walletPublicKeyHex: walletKeyPair.publicKeyHex,
        accountId: verifiedContext.accountId,
        relayToken,
        permissions: null,
        proof: null,
      });
      const approvalToken = this.#uniqueToken();
      this.#pendingSessions.set(approvalToken, {
        approvalToken,
        contextKey: contextKey(verifiedContext),
        generation,
        context: verifiedContext,
        sid,
        walletPublicKeyHex: walletKeyPair.publicKeyHex,
        appKey: directionKeys.appKey,
        walletKey: directionKeys.walletKey,
        permissions,
        approvalPreimage,
        expiresAtMs: this.#dependencies.now() + SESSION_APPROVAL_TTL_MS,
      });
      transferred = true;
      return { approvalToken };
    } finally {
      if (!transferred) {
        directionKeys.appKey.fill(0);
        directionKeys.walletKey.fill(0);
        approvalPreimage?.fill(0);
      }
    }
  }

  async approveSession(input: { approvalToken: string }): Promise<{
    sessionToken: string;
    frameBase64: string;
  }> {
    const approvalToken = input.approvalToken;
    if (!isBoundaryToken(approvalToken)) {
      throw new Error(
        "IrohaConnect session approval token is invalid or already used.",
      );
    }
    const pending = this.#pendingSessions.get(approvalToken);
    if (!pending) {
      throw new Error(
        "IrohaConnect session approval token is invalid or already used.",
      );
    }
    this.#pendingSessions.delete(approvalToken);
    this.#authorizingSessions.set(approvalToken, pending);
    let promoted = false;
    try {
      this.#requireNotExpired(
        pending.expiresAtMs,
        "IrohaConnect session approval",
      );
      this.#requireGeneration(pending.generation);
      this.#requireContextKey(pending.contextKey);
      const authorized = await this.#dependencies.authorize({
        kind: "session",
        sid: pending.sid,
        accountId: pending.context.accountId,
        toriiUrl: pending.context.toriiUrl,
        chainId: pending.context.chainId,
        networkPrefix: pending.context.networkPrefix,
        networkId: pending.context.networkId,
        permissions: copyConnectPermissions(pending.permissions),
      });
      if (!authorized) {
        throw new Error("IrohaConnect connection approval was rejected.");
      }
      this.#requireGeneration(pending.generation);
      this.#requireContextKey(pending.contextKey);
      const verifiedContext = normalizeContext(
        await this.#dependencies.assertContext(pending.context),
      );
      this.#requireContextKey(contextKey(verifiedContext));
      const signature = copySignature(
        await this.#dependencies.sign(
          verifiedContext,
          Uint8Array.from(pending.approvalPreimage),
        ),
      );
      this.#requireGeneration(pending.generation);
      this.#requireContextKey(pending.contextKey);
      const frame = encodeApproveConnectFrame(pending.sid, 1, {
        walletPublicKeyHex: pending.walletPublicKeyHex,
        accountId: verifiedContext.accountId,
        permissions: null,
        proof: null,
        signature,
      });
      const sessionToken = this.#uniqueToken();
      this.#sessions.set(sessionToken, {
        sessionToken,
        contextKey: pending.contextKey,
        context: verifiedContext,
        sid: pending.sid,
        appKey: pending.appKey,
        walletKey: pending.walletKey,
        permissions: copyConnectPermissions(pending.permissions),
        nextAppSequence: 2,
        nextServerSequence: 1,
        nextWalletSequence: 2,
        requestSlot: null,
      });
      promoted = true;
      return {
        sessionToken,
        frameBase64: bytesToBase64(frame),
      };
    } finally {
      if (this.#authorizingSessions.get(approvalToken) === pending) {
        this.#authorizingSessions.delete(approvalToken);
      }
      pending.approvalPreimage.fill(0);
      if (!promoted) {
        pending.appKey.fill(0);
        pending.walletKey.fill(0);
      }
    }
  }

  processFrame(input: {
    sessionToken: string;
    frameBase64: string;
  }): IrohaConnectProcessedFrame {
    const session = this.#requireSession(input.sessionToken);
    const frame = decodeConnectFrame(
      decodeIrohaConnectFrameBase64(input.frameBase64),
    );
    if (frame.sid !== session.sid || frame.direction !== "app_to_wallet") {
      throw new Error(
        "IrohaConnect frame does not match the approved session.",
      );
    }
    if (frame.control?.type === "server_event") {
      if (frame.seq !== session.nextServerSequence) {
        throw new Error(
          `IrohaConnect server event sequence ${frame.seq} does not match expected ${session.nextServerSequence}.`,
        );
      }
      session.nextServerSequence += 1;
      return { kind: "server_event" };
    }
    if (frame.seq !== session.nextAppSequence) {
      throw new Error(
        `IrohaConnect app sent sequence ${frame.seq}; expected ${session.nextAppSequence}.`,
      );
    }
    session.nextAppSequence += 1;
    if (frame.kind === "control") {
      if (frame.control?.type === "ping") {
        const frameBase64 = bytesToBase64(
          encodeControlConnectFrame({
            sid: session.sid,
            direction: "wallet_to_app",
            seq: session.nextWalletSequence,
            control: {
              type: "pong",
              nonce: frame.control.nonce,
            },
          }),
        );
        session.nextWalletSequence += 1;
        return { kind: "response", frameBase64, error: "" };
      }
      if (frame.control?.type === "close") {
        this.closeSession(session.sessionToken);
        return { kind: "closed", reason: frame.control.reason };
      }
      throw new Error(
        `Unexpected IrohaConnect control frame after approval: ${frame.control?.type ?? "unknown"}.`,
      );
    }
    if (!frame.ciphertext || frame.ciphertext.direction !== "app_to_wallet") {
      throw new Error("IrohaConnect ciphertext direction is invalid.");
    }
    const envelope = decryptConnectEnvelope(
      session.appKey,
      session.sid,
      frame.direction,
      frame.seq,
      hexToBytes(frame.ciphertext.aeadHex),
    );
    if (
      envelope.payload.type !== "sign_request_raw" &&
      envelope.payload.type !== "sign_request_tx"
    ) {
      if (envelope.payload.type === "control_close") {
        this.closeSession(session.sessionToken);
        return { kind: "closed", reason: envelope.payload.reason };
      }
      return { kind: "ignored" };
    }
    if (session.requestSlot) {
      const reason =
        "Finish the current IrohaConnect approval before sending another request.";
      return {
        kind: "response",
        frameBase64: this.#encryptResult(session, {
          type: "sign_result_err",
          code: "REQUEST_IN_FLIGHT",
          message: reason,
        }),
        error: reason,
      };
    }
    try {
      assertConnectSigningPermission(session.permissions, {
        type: envelope.payload.type,
        domainTag:
          envelope.payload.type === "sign_request_raw"
            ? envelope.payload.domainTag
            : undefined,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        kind: "response",
        frameBase64: this.#encryptResult(session, {
          type: "sign_result_err",
          code: "PERMISSION_DENIED",
          message: reason,
        }),
        error: reason,
      };
    }
    const message =
      envelope.payload.type === "sign_request_raw"
        ? base64ToBytes(envelope.payload.bytesBase64)
        : base64ToBytes(envelope.payload.txBytesBase64);
    if (message.length === 0) {
      const reason = "IrohaConnect signing request is empty.";
      return {
        kind: "response",
        frameBase64: this.#encryptResult(session, {
          type: "sign_result_err",
          code: "INVALID_REQUEST",
          message: reason,
        }),
        error: reason,
      };
    }
    let review: ConnectTransactionReview | null = null;
    if (envelope.payload.type === "sign_request_tx") {
      try {
        review = this.#dependencies.reviewTransaction(
          session.context,
          Uint8Array.from(message),
        ).review;
      } catch (error) {
        const reason = `The wallet refused this transaction: ${
          error instanceof Error ? error.message : String(error)
        }`;
        return {
          kind: "response",
          frameBase64: this.#encryptResult(session, {
            type: "sign_result_err",
            code: "INVALID_TRANSACTION",
            message: reason,
          }),
          error: reason,
        };
      }
    }
    const requestToken = this.#uniqueToken();
    const request: PendingRequest = {
      requestToken,
      sessionToken: session.sessionToken,
      contextKey: session.contextKey,
      requestType: envelope.payload.type,
      domainTag:
        envelope.payload.type === "sign_request_raw"
          ? envelope.payload.domainTag
          : null,
      message: Uint8Array.from(message),
      review,
      expiresAtMs: this.#dependencies.now() + REQUEST_APPROVAL_TTL_MS,
    };
    session.requestSlot = {
      phase: "awaiting_confirmation",
      request,
    };
    return {
      kind: "request",
      requestToken,
      requestType: request.requestType,
      domainTag: request.domainTag,
      byteLength: request.message.length,
      payloadPreviewHex: bytesToHex(request.message.slice(0, 96)),
      review,
    };
  }

  async approveRequest(input: {
    sessionToken: string;
    requestToken: string;
  }): Promise<{ frameBase64: string; signed: boolean }> {
    const { session, request, expired } = this.#beginRequestExecution(input);
    try {
      if (expired) {
        return {
          frameBase64: this.#encryptResult(session, {
            type: "sign_result_err",
            code: "REQUEST_EXPIRED",
            message: "IrohaConnect request approval token has expired.",
          }),
          signed: false,
        };
      }
      const confirmationContext = {
        sid: session.sid,
        accountId: session.context.accountId,
        toriiUrl: session.context.toriiUrl,
        chainId: session.context.chainId,
        networkPrefix: session.context.networkPrefix,
        networkId: session.context.networkId,
      };
      const confirmation: IrohaConnectConfirmation =
        request.requestType === "sign_request_tx" && request.review
          ? {
              kind: "sign_request_tx",
              ...confirmationContext,
              review: request.review,
            }
          : {
              kind: "sign_request_raw",
              ...confirmationContext,
              domainTag: request.domainTag ?? "",
              byteLength: request.message.length,
              payloadPreviewHex: bytesToHex(request.message.slice(0, 96)),
            };
      const authorized = await this.#dependencies.authorize(confirmation);
      this.#requireSessionMatches(session);
      if (!authorized) {
        return {
          frameBase64: this.#encryptResult(session, {
            type: "sign_result_err",
            code: "USER_REJECTED",
            message: "Rejected by user.",
          }),
          signed: false,
        };
      }
      const verifiedContext = normalizeContext(
        await this.#dependencies.assertContext(session.context),
      );
      this.#requireSessionMatches(session);
      if (contextKey(verifiedContext) !== session.contextKey) {
        throw new Error(
          "The active wallet context changed before IrohaConnect signing.",
        );
      }
      let signingMessage = Uint8Array.from(request.message);
      if (request.requestType === "sign_request_tx") {
        // Re-derive the hash from the exact bytes under the re-verified
        // context; it must equal the hash the user approved.
        const reviewed = this.#dependencies.reviewTransaction(
          verifiedContext,
          Uint8Array.from(request.message),
        );
        if (
          !request.review ||
          reviewed.review.payloadHashHex !== request.review.payloadHashHex ||
          bytesToHex(reviewed.payloadHash) !== request.review.payloadHashHex
        ) {
          throw new Error(
            "The transaction payload hash changed after it was reviewed.",
          );
        }
        signingMessage = Uint8Array.from(reviewed.payloadHash);
      }
      const signature = copySignature(
        await this.#dependencies.sign(verifiedContext, signingMessage),
      );
      this.#requireSessionMatches(session);
      return {
        frameBase64: this.#encryptResult(session, {
          type: "sign_result_ok",
          signature,
        }),
        signed: true,
      };
    } catch (error) {
      this.#requireSessionMatches(session);
      const reason = error instanceof Error ? error.message : String(error);
      return {
        frameBase64: this.#encryptResult(session, {
          type: "sign_result_err",
          code: "SIGNING_FAILED",
          message: reason,
        }),
        signed: false,
      };
    } finally {
      this.#finishRequest(session, request);
    }
  }

  rejectRequest(input: { sessionToken: string; requestToken: string }): {
    frameBase64: string;
  } {
    const { session, request, expired } = this.#beginRequestExecution(input);
    try {
      return {
        frameBase64: this.#encryptResult(session, {
          type: "sign_result_err",
          code: expired ? "REQUEST_EXPIRED" : "USER_REJECTED",
          message: expired
            ? "IrohaConnect request approval token has expired."
            : "Rejected by user.",
        }),
      };
    } finally {
      this.#finishRequest(session, request);
    }
  }

  closeSession(sessionToken: string) {
    if (!isBoundaryToken(sessionToken)) return;
    const session = this.#sessions.get(sessionToken);
    if (!session) {
      return;
    }
    this.#sessions.delete(sessionToken);
    if (session.requestSlot) {
      const request = session.requestSlot.request;
      request.message.fill(0);
      session.requestSlot = null;
    }
    session.appKey.fill(0);
    session.walletKey.fill(0);
  }

  #beginRequestExecution(input: {
    sessionToken: string;
    requestToken: string;
  }): {
    session: ActiveSession;
    request: PendingRequest;
    expired: boolean;
  } {
    const session = this.#requireSession(input.sessionToken);
    const requestToken = input.requestToken;
    const slot = session.requestSlot;
    const request = slot?.request;
    if (
      !isBoundaryToken(requestToken) ||
      !request ||
      request.requestToken !== requestToken ||
      request.sessionToken !== session.sessionToken ||
      request.contextKey !== session.contextKey ||
      slot.phase !== "awaiting_confirmation" ||
      slot.request !== request
    ) {
      throw new Error(
        "IrohaConnect request approval token is invalid, stale, or belongs to another session.",
      );
    }
    slot.phase = "executing";
    return {
      session,
      request,
      expired: this.#dependencies.now() > request.expiresAtMs,
    };
  }

  #finishRequest(session: ActiveSession, request: PendingRequest): void {
    if (session.requestSlot?.request === request) {
      session.requestSlot = null;
    }
    request.message.fill(0);
  }

  #encryptResult(
    session: ActiveSession,
    payload: Extract<
      ConnectEnvelopePayload,
      { type: "sign_result_ok" | "sign_result_err" }
    >,
  ) {
    this.#requireSessionMatches(session);
    const sequence = session.nextWalletSequence;
    const aead = encryptConnectEnvelope(
      session.walletKey,
      session.sid,
      "wallet_to_app",
      sequence,
      payload,
    );
    const frame = encodeCiphertextConnectFrame({
      sid: session.sid,
      direction: "wallet_to_app",
      seq: sequence,
      aead,
    });
    session.nextWalletSequence += 1;
    return bytesToBase64(frame);
  }

  #requireSession(sessionToken: string) {
    const session = isBoundaryToken(sessionToken)
      ? this.#sessions.get(sessionToken)
      : undefined;
    if (!session) {
      throw new Error("IrohaConnect session token is invalid or stale.");
    }
    this.#requireSessionMatches(session);
    return session;
  }

  #requireSessionMatches(session: ActiveSession) {
    this.#requireContextKey(session.contextKey);
    if (this.#sessions.get(session.sessionToken) !== session) {
      throw new Error("IrohaConnect session is closed or stale.");
    }
  }

  #requireCurrentContext(context: IrohaConnectWalletContext) {
    this.#requireContextKey(contextKey(normalizeContext(context)));
  }

  #requireContextKey(expected: string) {
    if (!this.#currentContextKey || this.#currentContextKey !== expected) {
      throw new Error(
        "The active wallet context does not match this IrohaConnect approval.",
      );
    }
  }

  #requireGeneration(expected: number) {
    if (expected !== this.#generation) {
      throw new Error("IrohaConnect approval is stale.");
    }
  }

  #requireSessionSlotAvailable() {
    if (
      this.#pendingSessions.size > 0 ||
      this.#authorizingSessions.size > 0 ||
      this.#sessions.size > 0
    ) {
      throw new Error(
        "Close the current IrohaConnect session before preparing another.",
      );
    }
  }

  #requireNotExpired(expiresAtMs: number, label: string) {
    if (this.#dependencies.now() > expiresAtMs) {
      throw new Error(`${label} token has expired.`);
    }
  }

  #uniqueToken() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const token = this.#dependencies.randomToken();
      if (!isBoundaryToken(token)) {
        throw new Error(
          "IrohaConnect token generator must return an exact 32-byte base64url token.",
        );
      }
      if (
        !this.#pendingSessions.has(token) &&
        !this.#authorizingSessions.has(token) &&
        !this.#sessions.has(token) &&
        ![...this.#sessions.values()].some(
          (session) => session.requestSlot?.request.requestToken === token,
        )
      ) {
        return token;
      }
    }
    throw new Error("Unable to allocate a unique IrohaConnect token.");
  }

  #disposeAll() {
    this.#pendingSessions.forEach((pending) => {
      pending.appKey.fill(0);
      pending.walletKey.fill(0);
      pending.approvalPreimage.fill(0);
    });
    this.#authorizingSessions.forEach((pending) => {
      pending.appKey.fill(0);
      pending.walletKey.fill(0);
      pending.approvalPreimage.fill(0);
    });
    this.#sessions.forEach((session) => {
      session.requestSlot?.request.message.fill(0);
      session.requestSlot = null;
      session.appKey.fill(0);
      session.walletKey.fill(0);
    });
    this.#pendingSessions.clear();
    this.#authorizingSessions.clear();
    this.#sessions.clear();
  }
}
