import { createHash, randomBytes } from "node:crypto";
import {
  assertConnectSigningPermission,
  base64ToBytes,
  buildApprovePreimage,
  bytesToBase64,
  bytesToHex,
  copyConnectPermissions,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveWalletConnectDirectionKeys,
  encodeApproveConnectFrame,
  encodeCiphertextConnectFrame,
  encodeControlConnectFrame,
  encryptConnectEnvelope,
  generateWalletConnectKeyPair,
  hexToBytes,
  type ConnectEnvelopePayload,
  type ConnectPermissions,
  type ConnectWalletSignature,
} from "../src/utils/soraswapConnectWire";

export const IROHA_CONNECT_CONFIRMATION_CHANNEL =
  "iroha-connect:confirm-current-v1";

export type IrohaConnectWalletContext = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
};

export type IrohaConnectConfirmation =
  | {
      kind: "session";
      sid: string;
      accountId: string;
      toriiUrl: string;
      chainId: string;
      permissions: ConnectPermissions | null;
    }
  | {
      kind: "sign_request_raw" | "sign_request_tx";
      sid: string;
      accountId: string;
      toriiUrl: string;
      chainId: string;
      domainTag: string | null;
      byteLength: number;
      payloadPreviewHex: string;
    };

export type IrohaConnectBoundaryDependencies = {
  assertContext(
    context: IrohaConnectWalletContext,
  ): Promise<IrohaConnectWalletContext>;
  authorize(confirmation: IrohaConnectConfirmation): Promise<boolean>;
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
  message: Uint8Array;
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
    }
  | { kind: "ignored" };

const SESSION_APPROVAL_TTL_MS = 2 * 60_000;
const REQUEST_APPROVAL_TTL_MS = 2 * 60_000;

const normalizeText = (value: unknown, label: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
};

const normalizeContext = (
  context: IrohaConnectWalletContext,
): IrohaConnectWalletContext => {
  const toriiUrl = normalizeText(context.toriiUrl, "toriiUrl").replace(
    /\/+$/u,
    "",
  );
  const chainId = normalizeText(context.chainId, "chainId");
  const accountId = normalizeText(context.accountId, "accountId");
  if (
    !Number.isInteger(context.networkPrefix) ||
    context.networkPrefix < 0 ||
    context.networkPrefix > 16_383
  ) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  return {
    toriiUrl,
    chainId,
    networkPrefix: context.networkPrefix,
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
    relayToken: string;
    requestedChainId: string;
    permissions: ConnectPermissions | null;
  }): Promise<{ approvalToken: string }> {
    const requestedContext = normalizeContext(input.context);
    this.#requireCurrentContext(requestedContext);
    const generation = this.#generation;
    this.#requireSessionSlotAvailable();
    const verifiedContext = normalizeContext(
      await this.#dependencies.assertContext(requestedContext),
    );
    this.#requireGeneration(generation);
    this.#requireCurrentContext(verifiedContext);
    this.#requireSessionSlotAvailable();
    if (input.requestedChainId.trim() !== verifiedContext.chainId) {
      throw new Error("The IrohaConnect Open frame is for a different chain.");
    }
    const sid = normalizeText(input.sid, "sid");
    const relayToken = normalizeText(input.relayToken, "relayToken");
    const appPublicKeyHex = normalizeText(
      input.appPublicKeyHex,
      "appPublicKeyHex",
    );
    const walletKeyPair = generateWalletConnectKeyPair();
    const directionKeys = deriveWalletConnectDirectionKeys({
      sid,
      appPublicKeyHex,
      walletPrivateKeyHex: walletKeyPair.privateKeyHex,
    });
    const approvalPreimage = buildApprovePreimage({
      sid,
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
      permissions: copyConnectPermissions(input.permissions),
      approvalPreimage,
      expiresAtMs: this.#dependencies.now() + SESSION_APPROVAL_TTL_MS,
    });
    return { approvalToken };
  }

  async approveSession(input: { approvalToken: string }): Promise<{
    sessionToken: string;
    frameBase64: string;
  }> {
    const approvalToken = normalizeText(input.approvalToken, "approvalToken");
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
    const frame = decodeConnectFrame(base64ToBytes(input.frameBase64));
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
      const confirmation: IrohaConnectConfirmation = {
        kind: request.requestType,
        sid: session.sid,
        accountId: session.context.accountId,
        toriiUrl: session.context.toriiUrl,
        chainId: session.context.chainId,
        domainTag: request.domainTag,
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
      const signature = copySignature(
        await this.#dependencies.sign(
          verifiedContext,
          Uint8Array.from(request.message),
        ),
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
    const normalized = String(sessionToken ?? "").trim();
    const session = this.#sessions.get(normalized);
    if (!session) {
      return;
    }
    this.#sessions.delete(normalized);
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
    const requestToken = normalizeText(input.requestToken, "requestToken");
    const slot = session.requestSlot;
    const request = slot?.request;
    if (
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
    const normalized = normalizeText(sessionToken, "sessionToken");
    const session = this.#sessions.get(normalized);
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
      const token = normalizeText(
        this.#dependencies.randomToken(),
        "generated token",
      );
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
