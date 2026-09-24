// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createConnectSessionPreview, NetworkId } from "@iroha/iroha-js";
import {
  IrohaConnectBoundary,
  type IrohaConnectBoundaryDependencies,
  type IrohaConnectWalletContext,
} from "../electron/irohaConnectBoundary";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectDirectionKeys,
  encodeCiphertextConnectFrame,
  encryptConnectEnvelope,
  generateConnectWalletKeyPair,
  hexToBytes,
  type ConnectEnvelopePayload,
  type ConnectPermissions,
  type ConnectPreview,
} from "@/utils/soraswapConnectWire";
import { TAIRA_NETWORK_ID } from "@/utils/firstReleaseNetworkIdentity";
import { deriveAccountAddressView } from "../electron/accountAddress";

const ACCOUNT_A = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: 369,
}).accountId;
const ACCOUNT_B = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "8E7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: 369,
}).accountId;

const CONTEXT_A: IrohaConnectWalletContext = {
  toriiUrl: "https://taira.sora.org",
  chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
  networkPrefix: 369,
  accountId: ACCOUNT_A,
};

const CONTEXT_B: IrohaConnectWalletContext = {
  ...CONTEXT_A,
  accountId: ACCOUNT_B,
};

const PERMISSIONS: ConnectPermissions = {
  methods: ["sign_raw", "sign_transaction"],
  events: [],
  resources: ["example.test"],
};

const NETWORK_ID = NetworkId.parse(TAIRA_NETWORK_ID);

const exactSessionInput = (
  appKeyPair: { publicKeyHex: string; privateKeyHex: string },
  nonceByte: number,
) => {
  const nonce = Uint8Array.from({ length: 16 }, () => nonceByte);
  const preview = createConnectSessionPreview({
    networkId: NETWORK_ID,
    nonce,
    appKeyPair: {
      publicKey: hexToBytes(appKeyPair.publicKeyHex),
      privateKey: hexToBytes(appKeyPair.privateKeyHex),
    },
  });
  return {
    preview,
    input: {
      sid: preview.sidBase64Url,
      appPublicKeyHex: appKeyPair.publicKeyHex,
      nonceBase64Url: Buffer.from(nonce).toString("base64url"),
      relayToken: "relay-secret",
      requestedNetworkId: TAIRA_NETWORK_ID,
    },
  };
};

const fakeSignature = {
  algorithmCode: 0,
  algorithmLabel: "Ed25519",
  signatureHex: bytesToHex(Uint8Array.from({ length: 64 }, () => 0x5a)),
  signatureBase64: bytesToBase64(Uint8Array.from({ length: 64 }, () => 0x5a)),
};

const createHarness = (input?: {
  authorize?: IrohaConnectBoundaryDependencies["authorize"];
  now?: () => number;
  randomToken?: () => string;
}) => {
  const assertContext = vi.fn(async (context: IrohaConnectWalletContext) => ({
    ...context,
  }));
  const authorize = vi.fn(input?.authorize ?? (async () => true));
  const sign = vi.fn(
    async (context: IrohaConnectWalletContext, message: Uint8Array) => {
      void context;
      void message;
      return { ...fakeSignature };
    },
  );
  const boundary = new IrohaConnectBoundary({
    assertContext,
    authorize,
    sign,
    ...(input?.now ? { now: input.now } : {}),
    ...(input?.randomToken ? { randomToken: input.randomToken } : {}),
  });
  return { boundary, assertContext, authorize, sign };
};

type ActiveHarnessSession = {
  sessionToken: string;
  sid: string;
  appKey: Uint8Array;
  walletKey: Uint8Array;
  nextAppSequence: number;
  nextWalletSequence: number;
};

const activateSession = async (
  boundary: IrohaConnectBoundary,
  input: {
    context?: IrohaConnectWalletContext;
    permissions?: ConnectPermissions | null;
    sidByte?: number;
  } = {},
): Promise<ActiveHarnessSession> => {
  const context = input.context ?? CONTEXT_A;
  const appKeyPair = generateConnectWalletKeyPair();
  const identity = exactSessionInput(appKeyPair, input.sidByte ?? 1);
  const sid = identity.input.sid;
  boundary.setContext(context);
  const prepared = await boundary.prepareSession({
    context,
    ...identity.input,
    permissions: input.permissions ?? PERMISSIONS,
  });
  const approved = await boundary.approveSession(prepared);
  const approvalFrame = decodeConnectFrame(base64ToBytes(approved.frameBase64));
  if (approvalFrame.control?.type !== "approve") {
    throw new Error("Expected an IrohaConnect approval frame.");
  }
  const preview: ConnectPreview = {
    sid,
    sidBytesHex: bytesToHex(identity.preview.sidBytes),
    nonceHex: bytesToHex(identity.preview.nonce),
    privateKeyHex: appKeyPair.privateKeyHex,
    publicKeyHex: appKeyPair.publicKeyHex,
    walletUri: "",
    appUri: "",
    wsUrl: "",
    createdAt: 0,
  };
  const keys = deriveConnectDirectionKeys(
    preview,
    approvalFrame.control.walletPublicKeyHex,
  );
  return {
    sessionToken: approved.sessionToken,
    sid,
    ...keys,
    nextAppSequence: 2,
    nextWalletSequence: 2,
  };
};

const sendPayload = (
  boundary: IrohaConnectBoundary,
  session: ActiveHarnessSession,
  payload: ConnectEnvelopePayload,
) => {
  const sequence = session.nextAppSequence;
  session.nextAppSequence += 1;
  const aead = encryptConnectEnvelope(
    session.appKey,
    session.sid,
    "app_to_wallet",
    sequence,
    payload,
  );
  return boundary.processFrame({
    sessionToken: session.sessionToken,
    frameBase64: bytesToBase64(
      encodeCiphertextConnectFrame({
        sid: session.sid,
        direction: "app_to_wallet",
        seq: sequence,
        aead,
      }),
    ),
  });
};

const decryptResponse = (
  session: ActiveHarnessSession,
  frameBase64: string,
) => {
  const frame = decodeConnectFrame(base64ToBytes(frameBase64));
  const sequence = session.nextWalletSequence;
  session.nextWalletSequence += 1;
  expect(frame.seq).toBe(sequence);
  if (!frame.ciphertext) {
    throw new Error("Expected an encrypted IrohaConnect response.");
  }
  return decryptConnectEnvelope(
    session.walletKey,
    session.sid,
    "wallet_to_app",
    sequence,
    hexToBytes(frame.ciphertext.aeadHex),
  ).payload;
};

describe("IrohaConnect preload-owned approval boundary", () => {
  it("requires generated boundary tokens to be canonical 32-byte base64url", async () => {
    const { boundary, assertContext, authorize, sign } = createHarness({
      randomToken: () => "renderer-shaped-token",
    });
    boundary.setContext(CONTEXT_A);
    const appKeyPair = generateConnectWalletKeyPair();
    const identity = exactSessionInput(appKeyPair, 40);

    await expect(
      boundary.prepareSession({
        context: CONTEXT_A,
        ...identity.input,
        permissions: PERMISSIONS,
      }),
    ).rejects.toThrow("exact 32-byte base64url token");

    expect(assertContext).toHaveBeenCalledTimes(1);
    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects noncanonical text and native confirmation controls", async () => {
    const { boundary, assertContext, authorize, sign } = createHarness();
    boundary.setContext(CONTEXT_A);
    const appKeyPair = generateConnectWalletKeyPair();
    const identity = exactSessionInput(appKeyPair, 42);

    await expect(
      boundary.prepareSession({
        context: CONTEXT_A,
        ...identity.input,
        relayToken: "relay\u202esecret",
        permissions: PERMISSIONS,
      }),
    ).rejects.toThrow("bounded canonical text");

    expect(assertContext).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("requires an origin-only endpoint before endpoint or vault access", async () => {
    const { boundary, assertContext, authorize, sign } = createHarness();
    const context = { ...CONTEXT_A, toriiUrl: "https://taira.sora.org/proxy" };
    expect(() => boundary.setContext(context)).toThrow(
      "canonical endpoint origin",
    );

    expect(assertContext).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects direct session approval calls before authorization or vault access", async () => {
    const { boundary, authorize, sign } = createHarness();
    boundary.setContext(CONTEXT_A);

    await expect(
      boundary.approveSession({ approvalToken: "renderer-invented" }),
    ).rejects.toThrow("invalid or already used");

    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects an unbound SID tuple before authorization or vault access", async () => {
    const { boundary, assertContext, authorize, sign } = createHarness();
    boundary.setContext(CONTEXT_A);
    const appKeyPair = generateConnectWalletKeyPair();
    const identity = exactSessionInput(appKeyPair, 2);

    await expect(
      boundary.prepareSession({
        context: CONTEXT_A,
        ...identity.input,
        nonceBase64Url: Buffer.alloc(16, 0x7f).toString("base64url"),
        permissions: PERMISSIONS,
      }),
    ).rejects.toThrow("does not bind the exact NetworkId");

    expect(assertContext).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects malformed permission manifests before endpoint or vault access", async () => {
    const sparseMethods = new Array<string>(2);
    sparseMethods[1] = "sign_raw";
    const malformed: unknown[] = [
      { methods: ["sign_raw", "sign_raw"], events: [], resources: null },
      { methods: new Array(17).fill("method"), events: [], resources: null },
      { methods: ["sign_raw"], events: [], resources: null, extra: true },
      {
        methods: Object.assign(["sign_raw"], { extra: true }),
        events: [],
        resources: null,
      },
      { methods: sparseMethods, events: [], resources: null },
      { methods: new Uint8Array([1]), events: [], resources: null },
    ];

    for (const permissions of malformed) {
      const { boundary, assertContext, authorize, sign } = createHarness();
      boundary.setContext(CONTEXT_A);
      const appKeyPair = generateConnectWalletKeyPair();
      const identity = exactSessionInput(appKeyPair, 41);

      await expect(
        boundary.prepareSession({
          context: CONTEXT_A,
          ...identity.input,
          permissions: permissions as ConnectPermissions,
        }),
      ).rejects.toThrow("exact bounded permission manifest");
      expect(assertContext).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    }
  });

  it("requires trusted native authorization before the pairing signature", async () => {
    const { boundary, authorize, sign } = createHarness({
      authorize: async () => false,
    });
    boundary.setContext(CONTEXT_A);
    const appKeyPair = generateConnectWalletKeyPair();
    const identity = exactSessionInput(appKeyPair, 2);
    const prepared = await boundary.prepareSession({
      context: CONTEXT_A,
      ...identity.input,
      permissions: PERMISSIONS,
    });

    await expect(boundary.approveSession(prepared)).rejects.toThrow(
      "approval was rejected",
    );

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled();
  });

  it("consumes pairing approval tokens before awaiting and rejects replay", async () => {
    let releaseAuthorization!: (value: boolean) => void;
    const { boundary, authorize, sign } = createHarness({
      authorize: () =>
        new Promise<boolean>((resolve) => {
          releaseAuthorization = resolve;
        }),
    });
    boundary.setContext(CONTEXT_A);
    const appKeyPair = generateConnectWalletKeyPair();
    const identity = exactSessionInput(appKeyPair, 3);
    const prepared = await boundary.prepareSession({
      context: CONTEXT_A,
      ...identity.input,
      permissions: PERMISSIONS,
    });

    const first = boundary.approveSession(prepared);
    await vi.waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
    await expect(boundary.approveSession(prepared)).rejects.toThrow(
      "invalid or already used",
    );
    releaseAuthorization(true);
    await first;

    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("invalidates pending pairing when its socket generation closes, even on the same wallet context", async () => {
    let releaseAuthorization!: (value: boolean) => void;
    const { boundary, authorize, sign } = createHarness({
      authorize: () =>
        new Promise<boolean>((resolve) => {
          releaseAuthorization = resolve;
        }),
    });
    boundary.setContext(CONTEXT_A);
    const appKeyPair = generateConnectWalletKeyPair();
    const identity = exactSessionInput(appKeyPair, 31);
    const prepared = await boundary.prepareSession({
      context: CONTEXT_A,
      ...identity.input,
      permissions: PERMISSIONS,
    });

    const approval = boundary.approveSession(prepared);
    await vi.waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
    boundary.reset();
    boundary.setContext(CONTEXT_A);
    releaseAuthorization(true);

    await expect(approval).rejects.toThrow("stale");
    expect(sign).not.toHaveBeenCalled();
  });

  it("enforces the exact retained Open permission manifest before prompting or signing", async () => {
    const { boundary, authorize, sign } = createHarness();
    const session = await activateSession(boundary, {
      permissions: {
        methods: ["sign_raw"],
        events: [],
        resources: ["allowed.domain"],
      },
    });
    authorize.mockClear();
    sign.mockClear();

    const processed = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "other.domain",
      bytesHex: "0102",
      bytesBase64: bytesToBase64(Uint8Array.of(1, 2)),
      bytesLength: 2,
    });

    expect(processed.kind).toBe("response");
    if (processed.kind !== "response") return;
    expect(decryptResponse(session, processed.frameBase64)).toMatchObject({
      type: "sign_result_err",
      code: "PERMISSION_DENIED",
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects renderer-invented and wrong-session request tokens before vault access", async () => {
    const { boundary, authorize, sign } = createHarness();
    const firstSession = await activateSession(boundary, { sidByte: 4 });
    authorize.mockClear();
    sign.mockClear();
    const processed = sendPayload(boundary, firstSession, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "010203",
      bytesBase64: bytesToBase64(Uint8Array.of(1, 2, 3)),
      bytesLength: 3,
    });
    if (processed.kind !== "request") {
      throw new Error("Expected an IrohaConnect signing request.");
    }

    await expect(
      boundary.approveRequest({
        sessionToken: firstSession.sessionToken,
        requestToken: "renderer-invented",
      }),
    ).rejects.toThrow("invalid, stale, or belongs to another session");
    await expect(
      boundary.approveRequest({
        sessionToken: "another-session",
        requestToken: processed.requestToken,
      }),
    ).rejects.toThrow("session token is invalid or stale");

    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("keeps the session request slot occupied while authorization is pending", async () => {
    let releaseAuthorization!: (value: boolean) => void;
    const { boundary, authorize, sign } = createHarness();
    const session = await activateSession(boundary);
    authorize.mockClear();
    authorize.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseAuthorization = resolve;
        }),
    );
    sign.mockClear();
    const exactBytes = Uint8Array.of(0, 255, 17, 93, 4);
    const processed = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: bytesToHex(exactBytes),
      bytesBase64: bytesToBase64(exactBytes),
      bytesLength: exactBytes.length,
    });
    if (processed.kind !== "request") {
      throw new Error("Expected an IrohaConnect signing request.");
    }

    const first = boundary.approveRequest({
      sessionToken: session.sessionToken,
      requestToken: processed.requestToken,
    });
    await vi.waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
    await expect(
      boundary.approveRequest({
        sessionToken: session.sessionToken,
        requestToken: processed.requestToken,
      }),
    ).rejects.toThrow("invalid, stale, or belongs to another session");

    const overlapping = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "09",
      bytesBase64: bytesToBase64(Uint8Array.of(9)),
      bytesLength: 1,
    });
    expect(overlapping.kind).toBe("response");
    if (overlapping.kind !== "response") return;
    expect(decryptResponse(session, overlapping.frameBase64)).toMatchObject({
      type: "sign_result_err",
      code: "REQUEST_IN_FLIGHT",
    });

    releaseAuthorization(true);
    const response = await first;

    expect(response.signed).toBe(true);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0]?.[0]).toEqual(CONTEXT_A);
    expect(Array.from(sign.mock.calls[0]?.[1] ?? [])).toEqual(
      Array.from(exactBytes),
    );
    expect(decryptResponse(session, response.frameBase64)).toMatchObject({
      type: "sign_result_ok",
    });

    const next = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "0a",
      bytesBase64: bytesToBase64(Uint8Array.of(10)),
      bytesLength: 1,
    });
    expect(next.kind).toBe("request");
    if (next.kind === "request") {
      const rejected = boundary.rejectRequest({
        sessionToken: session.sessionToken,
        requestToken: next.requestToken,
      });
      expect(decryptResponse(session, rejected.frameBase64)).toMatchObject({
        type: "sign_result_err",
        code: "USER_REJECTED",
      });
    }
  });

  it("keeps the slot occupied through signing and emits no stale result after close", async () => {
    let releaseSigning!: (
      value: Awaited<ReturnType<IrohaConnectBoundaryDependencies["sign"]>>,
    ) => void;
    const { boundary, authorize, sign } = createHarness();
    const session = await activateSession(boundary);
    authorize.mockClear();
    sign.mockClear();
    sign.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSigning = resolve;
        }),
    );
    const processed = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "0b",
      bytesBase64: bytesToBase64(Uint8Array.of(11)),
      bytesLength: 1,
    });
    if (processed.kind !== "request") {
      throw new Error("Expected an IrohaConnect signing request.");
    }

    const approval = boundary.approveRequest({
      sessionToken: session.sessionToken,
      requestToken: processed.requestToken,
    });
    await vi.waitFor(() => expect(sign).toHaveBeenCalledTimes(1));

    const overlapping = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "0c",
      bytesBase64: bytesToBase64(Uint8Array.of(12)),
      bytesLength: 1,
    });
    expect(overlapping.kind).toBe("response");
    if (overlapping.kind !== "response") return;
    expect(decryptResponse(session, overlapping.frameBase64)).toMatchObject({
      type: "sign_result_err",
      code: "REQUEST_IN_FLIGHT",
    });

    boundary.closeSession(session.sessionToken);
    releaseSigning({ ...fakeSignature });
    await expect(approval).rejects.toThrow(/closed or stale/u);
  });

  it("consumes an expired token with an encrypted error and reopens the slot", async () => {
    let now = 1_000;
    const { boundary, authorize, sign } = createHarness({ now: () => now });
    const session = await activateSession(boundary);
    authorize.mockClear();
    sign.mockClear();
    const processed = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "0d",
      bytesBase64: bytesToBase64(Uint8Array.of(13)),
      bytesLength: 1,
    });
    if (processed.kind !== "request") {
      throw new Error("Expected an IrohaConnect signing request.");
    }

    now += 2 * 60_000 + 1;
    const expired = await boundary.approveRequest({
      sessionToken: session.sessionToken,
      requestToken: processed.requestToken,
    });
    expect(expired.signed).toBe(false);
    expect(decryptResponse(session, expired.frameBase64)).toMatchObject({
      type: "sign_result_err",
      code: "REQUEST_EXPIRED",
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();

    const next = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "0e",
      bytesBase64: bytesToBase64(Uint8Array.of(14)),
      bytesLength: 1,
    });
    expect(next.kind).toBe("request");
  });

  it("fails stale wallet context after the prompt and before vault access", async () => {
    let releaseAuthorization!: (value: boolean) => void;
    const { boundary, authorize, sign } = createHarness();
    const session = await activateSession(boundary);
    authorize.mockClear();
    authorize.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseAuthorization = resolve;
        }),
    );
    sign.mockClear();
    const processed = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "09",
      bytesBase64: bytesToBase64(Uint8Array.of(9)),
      bytesLength: 1,
    });
    if (processed.kind !== "request") {
      throw new Error("Expected an IrohaConnect signing request.");
    }

    const approval = boundary.approveRequest({
      sessionToken: session.sessionToken,
      requestToken: processed.requestToken,
    });
    await vi.waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
    boundary.setContext(CONTEXT_B);
    releaseAuthorization(true);

    await expect(approval).rejects.toThrow(
      /active wallet context|closed or stale/u,
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it("turns native request rejection into an encrypted error without signing", async () => {
    const { boundary, authorize, sign } = createHarness();
    const session = await activateSession(boundary);
    authorize.mockClear();
    authorize.mockResolvedValueOnce(false);
    sign.mockClear();
    const processed = sendPayload(boundary, session, {
      type: "sign_request_raw",
      domainTag: "example.test",
      bytesHex: "07",
      bytesBase64: bytesToBase64(Uint8Array.of(7)),
      bytesLength: 1,
    });
    if (processed.kind !== "request") {
      throw new Error("Expected an IrohaConnect signing request.");
    }

    const response = await boundary.approveRequest({
      sessionToken: session.sessionToken,
      requestToken: processed.requestToken,
    });

    expect(response.signed).toBe(false);
    expect(decryptResponse(session, response.frameBase64)).toMatchObject({
      type: "sign_result_err",
      code: "USER_REJECTED",
    });
    expect(sign).not.toHaveBeenCalled();
  });
});
