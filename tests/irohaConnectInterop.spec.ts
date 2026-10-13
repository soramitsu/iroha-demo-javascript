import { describe, expect, it, vi } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { AccountAddress, NetworkId } from "@iroha/iroha-js";
import {
  createConnectAppSession,
  createConnectSessionPreview,
} from "@iroha/iroha-js/connect-browser";
import {
  assertConnectSigningPermission,
  base64ToBytes,
  buildApprovePreimage,
  bytesToBase64,
  bytesToHex,
  copyConnectPermissions,
  decodeConnectEnvelope,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectWalletDirectionKeys,
  encodeApproveConnectFrame,
  encodeCiphertextConnectFrame,
  encodeConnectEnvelope,
  encryptConnectEnvelope,
  generateConnectWalletKeyPair,
} from "@/utils/soraswapConnectWire";
import { withRelayFixedArrayLayout } from "./helpers/connectRelayFixedArrays";

type SocketHandler = (event: Event | MessageEvent) => void;

class RecordingWebSocket {
  static instances: RecordingWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly sent: Uint8Array[] = [];
  readonly listeners = new Map<string, SocketHandler[]>();
  readyState = 0;
  binaryType: BinaryType = "blob";

  constructor(
    readonly url: string | URL,
    readonly protocols?: string | string[],
  ) {
    RecordingWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const handler =
      typeof listener === "function"
        ? listener
        : (event: Event | MessageEvent) => listener.handleEvent(event);
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  send(data: ArrayBuffer | ArrayBufferView) {
    this.sent.push(
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }

  open() {
    this.readyState = RecordingWebSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  receive(data: Uint8Array) {
    this.emit("message", new MessageEvent("message", { data }));
  }

  close() {
    this.readyState = RecordingWebSocket.CLOSED;
    this.emit("close", new Event("close"));
  }

  private emit(type: string, event: Event | MessageEvent) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

describe("IrohaConnect linked SDK interoperability", () => {
  it("wipes the generated X25519 private-key bytes after exporting the pair", () => {
    const generatedPrivateKey = new Uint8Array(32).fill(0x5a);
    const randomPrivateKey = vi
      .spyOn(x25519.utils, "randomPrivateKey")
      .mockReturnValue(generatedPrivateKey);
    try {
      const pair = generateConnectWalletKeyPair();
      expect(pair.privateKeyHex).toBe("5a".repeat(32));
      expect(pair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/u);
      expect(generatedPrivateKey).toEqual(new Uint8Array(32));
    } finally {
      randomPrivateKey.mockRestore();
    }
  });

  it("enforces exact first-release Open signing grants", () => {
    const permissions = {
      methods: ["sign_raw", "sign_transaction"],
      events: [],
      resources: ["domain:allowed"],
    };
    const copied = copyConnectPermissions(permissions);
    permissions.methods.length = 0;
    permissions.resources.length = 0;
    expect(copied).toEqual({
      methods: ["sign_raw", "sign_transaction"],
      events: [],
      resources: ["domain:allowed"],
    });

    expect(() =>
      assertConnectSigningPermission(copied, {
        type: "sign_request_raw",
        domainTag: "domain:allowed",
      }),
    ).not.toThrow();
    expect(() =>
      assertConnectSigningPermission(copied, {
        type: "sign_request_raw",
        domainTag: "domain:other",
      }),
    ).toThrow("do not grant raw-signing domain");
    expect(() =>
      assertConnectSigningPermission(null, {
        type: "sign_request_raw",
        domainTag: "domain:allowed",
      }),
    ).toThrow("do not grant sign_raw");
    expect(() =>
      assertConnectSigningPermission(
        {
          methods: ["sign_transaction"],
          events: [],
          resources: null,
        },
        { type: "sign_request_tx" },
      ),
    ).not.toThrow();
    // A session granting both methods signs transactions while raw signing
    // stays limited to the exact requested domains.
    expect(() =>
      assertConnectSigningPermission(copied, {
        type: "sign_request_tx",
      }),
    ).not.toThrow();
    expect(() =>
      assertConnectSigningPermission(
        { methods: ["sign_raw"], events: [], resources: ["domain:allowed"] },
        { type: "sign_request_tx" },
      ),
    ).toThrow("do not grant sign_transaction");
    expect(() =>
      assertConnectSigningPermission(
        {
          methods: ["sign_raw", "sign_transaction"],
          events: [],
          resources: null,
        },
        { type: "sign_request_raw", domainTag: "domain:allowed" },
      ),
    ).toThrow("do not grant raw-signing domain");
  });

  it("rejects foreign Norito version, schema, and layout header bytes", () => {
    const valid = encodeConnectEnvelope(1, {
      type: "display_request",
      title: "Review",
      body: "Exact header",
    });
    expect(decodeConnectEnvelope(valid)).toMatchObject({
      seq: 1,
      payload: { type: "display_request" },
    });

    const mutations = [
      { index: 4, value: 1, message: "unsupported Norito version" },
      { index: 5, value: 1, message: "unsupported Norito version" },
      { index: 6, value: valid[6] ^ 0xff, message: "schema mismatch" },
      {
        index: 22,
        value: 1,
        message: "unsupported Norito layout flags",
      },
      {
        index: 39,
        value: 1,
        message: "unsupported Norito layout flags",
      },
    ];
    for (const mutation of mutations) {
      const foreign = Uint8Array.from(valid);
      foreign[mutation.index] = mutation.value;
      expect(() => decodeConnectEnvelope(foreign)).toThrow(mutation.message);
    }
  });

  it("establishes a current v1 SDK app session and completes a raw signature", async () => {
    RecordingWebSocket.instances = [];
    const networkId = NetworkId.fromBytes(
      Uint8Array.from({ length: 32 }, (_, index) =>
        index === 31 ? 0x13 : 0x11,
      ),
    );
    const relayToken = "relay-token-v1";
    const appPrivateKey = new Uint8Array(32).fill(0x31);
    const preview = createConnectSessionPreview({
      networkId,
      node: "https://taira.sora.org",
      nonce: new Uint8Array(16).fill(0x42),
      appKeyPair: {
        privateKey: appPrivateKey,
        publicKey: x25519.getPublicKey(appPrivateKey),
      },
    });
    const session = createConnectAppSession({
      baseUrl: "https://taira.sora.org",
      preview,
      session: {
        sid: preview.sidBase64Url,
        token_app: "app-token-v1",
        token_relay: relayToken,
      },
      permissions: {
        methods: ["sign_raw"],
        resources: ["interop:raw:v1"],
      },
      // The linked SDK still writes raw [u8; 32] arrays; the live relay
      // requires element-framed arrays (see connectRelayFixedArrays.ts).
      webSocketImpl: withRelayFixedArrayLayout(
        RecordingWebSocket,
      ) as unknown as typeof WebSocket,
    });
    const socket = RecordingWebSocket.instances[0];
    socket.open();

    const openFrame = decodeConnectFrame(socket.sent[0]);
    expect(openFrame).toMatchObject({
      sid: preview.sidBase64Url,
      direction: "app_to_wallet",
      seq: 1,
      kind: "control",
      control: {
        type: "open",
        appPublicKeyHex: bytesToHex(preview.appKeyPair.publicKey),
      },
    });

    const walletPrivateKey = new Uint8Array(32).fill(0x53);
    const walletPublicKey = x25519.getPublicKey(walletPrivateKey);
    const accountPrivateKey = new Uint8Array(32).fill(0x77);
    const accountPublicKey = ed25519.getPublicKey(accountPrivateKey);
    const accountId = AccountAddress.fromAccount({
      publicKey: accountPublicKey,
    }).toI105(369);
    const approvalPreimage = buildApprovePreimage({
      sid: preview.sidBase64Url,
      networkId: preview.networkId.toString(),
      appPublicKeyHex: bytesToHex(preview.appKeyPair.publicKey),
      walletPublicKeyHex: bytesToHex(walletPublicKey),
      accountId,
      relayToken,
      permissions: null,
      proof: null,
    });
    const approvalSignature = ed25519.sign(approvalPreimage, accountPrivateKey);
    const approvalPromise = session.waitForApproval();
    socket.receive(
      encodeApproveConnectFrame(preview.sidBase64Url, 1, {
        walletPublicKeyHex: bytesToHex(walletPublicKey),
        accountId,
        permissions: null,
        proof: null,
        signature: {
          algorithmCode: 0,
          algorithmLabel: "Ed25519",
          signatureHex: bytesToHex(approvalSignature),
          signatureBase64: bytesToBase64(approvalSignature),
        },
      }),
    );
    await expect(approvalPromise).resolves.toMatchObject({ accountId });

    const keys = deriveConnectWalletDirectionKeys({
      sid: preview.sidBase64Url,
      appPublicKeyHex: bytesToHex(preview.appKeyPair.publicKey),
      walletPrivateKeyHex: bytesToHex(walletPrivateKey),
    });
    const message = new TextEncoder().encode("current SDK interop request");
    const signaturePromise = session.signRaw("interop:raw:v1", message);
    await Promise.resolve();
    await Promise.resolve();

    const requestFrame = decodeConnectFrame(socket.sent[1]);
    expect(requestFrame).toMatchObject({
      direction: "app_to_wallet",
      seq: 2,
      kind: "ciphertext",
    });
    if (!requestFrame.ciphertext) {
      throw new Error("Expected an encrypted SDK signing request.");
    }
    const request = decryptConnectEnvelope(
      keys.appKey,
      preview.sidBase64Url,
      requestFrame.direction,
      requestFrame.seq,
      base64ToBytes(
        Buffer.from(requestFrame.ciphertext.aeadHex, "hex").toString("base64"),
      ),
    );
    expect(request.payload).toMatchObject({
      type: "sign_request_raw",
      domainTag: "interop:raw:v1",
      bytesBase64: bytesToBase64(message),
    });

    const rawSignature = ed25519.sign(message, accountPrivateKey);
    const responseSequence = 2;
    const responseAead = encryptConnectEnvelope(
      keys.walletKey,
      preview.sidBase64Url,
      "wallet_to_app",
      responseSequence,
      {
        type: "sign_result_ok",
        signature: {
          algorithmCode: 0,
          algorithmLabel: "Ed25519",
          signatureHex: bytesToHex(rawSignature),
          signatureBase64: bytesToBase64(rawSignature),
        },
      },
    );
    socket.receive(
      encodeCiphertextConnectFrame({
        sid: preview.sidBase64Url,
        direction: "wallet_to_app",
        seq: responseSequence,
        aead: responseAead,
      }),
    );
    await expect(signaturePromise).resolves.toEqual(rawSignature);
  }, 30_000);
});
