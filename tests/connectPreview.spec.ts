// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  createConnectSessionPreview,
  NetworkId,
} from "@iroha/iroha-js/connect-browser";
import {
  bootstrapPortableConnectPreviewSession,
  createPortableConnectSessionPreview,
  resolvePortableConnectLaunchUri,
  rewriteConnectUriProtocol,
} from "../electron/connectPreview";

describe("connectPreview", () => {
  const networkId = NetworkId.fromBytes(
    Buffer.from(`${"11".repeat(31)}13`, "hex"),
  );

  it("matches the SDK preview session id and URIs for fixed inputs", () => {
    const appKeyPair = {
      publicKey: Buffer.alloc(32, 0x11),
      privateKey: Buffer.alloc(32, 0x22),
    };
    const nonce = Buffer.alloc(16, 0x33);
    const options = {
      networkId,
      node: "https://taira.sora.org",
      nonce,
      appKeyPair,
    };

    const portable = createPortableConnectSessionPreview(options);
    const sdk = createConnectSessionPreview(options);

    expect(Buffer.from(portable.sidBytes).toString("hex")).toBe(
      Buffer.from(sdk.sidBytes).toString("hex"),
    );
    expect(portable.sidBase64Url).toBe(sdk.sidBase64Url);
    expect(portable.walletUri).toBe(sdk.walletUri);
    expect(portable.appUri).toBe(sdk.appUri);
  });

  it("registers the preview session and returns tokens", async () => {
    const createConnectSession = vi.fn().mockResolvedValue({
      token_wallet: "wallet-token",
      token_app: "app-token",
      token_management: "management-token",
      token_relay: "relay-token",
      wallet_uri: "iroha://connect?...",
      app_uri: "iroha://connect/app?...",
    });

    const result = await bootstrapPortableConnectPreviewSession(
      { createConnectSession } as never,
      {
        networkId,
        node: "https://taira.sora.org",
        nonce: Buffer.alloc(16, 0x03),
        appKeyPair: {
          publicKey: Buffer.alloc(32, 0x01),
          privateKey: Buffer.alloc(32, 0x02),
        },
      },
    );

    expect(createConnectSession).toHaveBeenCalledWith({
      sid: result.preview.sidBase64Url,
      networkId,
      appPublicKey: Uint8Array.from(Buffer.alloc(32, 0x01)),
      nonce: Uint8Array.from(Buffer.alloc(16, 0x03)),
      node: "https://taira.sora.org",
    });
    expect(result.tokens).toEqual({
      wallet: "wallet-token",
      app: "app-token",
      management: "management-token",
      relay: "relay-token",
    });
  });

  it("omits node when registering if no node hint was supplied", async () => {
    const createConnectSession = vi.fn().mockResolvedValue({
      token_wallet: "wallet-token",
      token_app: "app-token",
      token_management: "management-token",
      token_relay: "relay-token",
    });

    const result = await bootstrapPortableConnectPreviewSession(
      { createConnectSession } as never,
      {
        networkId,
        nonce: Buffer.alloc(16, 0x04),
        appKeyPair: {
          publicKey: Buffer.alloc(32, 0x05),
          privateKey: Buffer.alloc(32, 0x06),
        },
      },
    );

    expect(createConnectSession).toHaveBeenCalledWith({
      sid: result.preview.sidBase64Url,
      networkId,
      appPublicKey: Uint8Array.from(Buffer.alloc(32, 0x05)),
      nonce: Uint8Array.from(Buffer.alloc(16, 0x04)),
    });
  });

  it("rejects a human-facing chain id in place of the exact NetworkId", () => {
    expect(() =>
      createPortableConnectSessionPreview({
        networkId: "fc56984b-2be7-431d-840e-21514d1883f0",
      } as never),
    ).toThrow("networkId must be a NetworkId");
  });

  it("rejects invalid nonce lengths", () => {
    expect(() =>
      createPortableConnectSessionPreview({
        networkId,
        nonce: Buffer.alloc(15, 0x01),
        appKeyPair: {
          publicKey: Buffer.alloc(32, 0x07),
          privateKey: Buffer.alloc(32, 0x08),
        },
      }),
    ).toThrow("nonce must be 16 bytes");
  });

  it("rewrites canonical connect URIs to the irohaconnect launch protocol", () => {
    expect(
      rewriteConnectUriProtocol(
        "iroha://connect?sid=session&role=wallet&token=wallet-token",
      ),
    ).toBe("irohaconnect://connect?sid=session&role=wallet&token=wallet-token");
  });

  it("prefers the registered session URI when resolving renderer launch links", () => {
    expect(
      resolvePortableConnectLaunchUri(
        "iroha://connect?sid=session&role=wallet&token=wallet-token",
        "iroha://connect?sid=preview&role=wallet",
      ),
    ).toBe("irohaconnect://connect?sid=session&role=wallet&token=wallet-token");
    expect(
      resolvePortableConnectLaunchUri(
        null,
        "iroha://connect?sid=preview&role=wallet",
        "irohaconnect",
      ),
    ).toBe("irohaconnect://connect?sid=preview&role=wallet");
  });
});
