import { describe, expect, it } from "vitest";
import {
  buildIrohaConnectTokenProtocol,
  buildIrohaConnectWebSocketUrl,
  encodeIrohaConnectApproveFrame,
  isIrohaConnectUri,
  parseIrohaConnectUri,
} from "@/utils/irohaConnect";

describe("irohaConnect URI parsing", () => {
  it("parses canonical wallet session URIs", () => {
    const parsed = parseIrohaConnectUri(
      "iroha://connect?sid=session-1&chain_id=chain-a&node=https%3A%2F%2Ftaira.sora.org&v=1&role=wallet&token=wallet-token",
    );

    expect(parsed.sid).toBe("session-1");
    expect(parsed.chainId).toBe("chain-a");
    expect(parsed.node).toBe("https://taira.sora.org");
    expect(parsed.role).toBe("wallet");
    expect(parsed.token).toBe("wallet-token");
    expect(parsed.version).toBe("1");
    expect(parsed.canonicalUri.startsWith("iroha://connect?")).toBe(true);
    expect(parsed.launchUri.startsWith("irohaconnect://connect?")).toBe(true);
  });

  it("accepts launch protocol URIs and normalizes them", () => {
    const parsed = parseIrohaConnectUri(
      "irohaconnect://connect?sid=session-2&role=app",
    );

    expect(parsed.sid).toBe("session-2");
    expect(parsed.role).toBe("app");
    expect(parsed.canonicalUri).toBe("iroha://connect?sid=session-2&role=app");
  });

  it("rejects unrelated QR payloads", () => {
    expect(isIrohaConnectUri("iroha://kaigi/join?call=abc")).toBe(false);
    expect(() => parseIrohaConnectUri("https://example.com")).toThrow(
      "QR is not an IrohaConnect session.",
    );
    expect(() => parseIrohaConnectUri("iroha://connect?role=wallet")).toThrow(
      "IrohaConnect URI is missing sid.",
    );
  });

  it("builds wallet WebSocket URLs and token subprotocols", () => {
    const parsed = parseIrohaConnectUri(
      "iroha://connect?sid=session-3&node=https%3A%2F%2Ftaira.sora.org&role=wallet&token=wallet-token",
    );

    expect(buildIrohaConnectWebSocketUrl(parsed, "https://fallback.test")).toBe(
      "wss://taira.sora.org/v1/connect/ws?sid=session-3&role=wallet",
    );
    expect(buildIrohaConnectTokenProtocol("wallet-token")).toMatch(
      /^iroha-connect\.token\.v1\.[A-Za-z0-9_-]+$/u,
    );
  });

  it("encodes wallet approval frames for Torii relay", () => {
    const sid = Buffer.from(new Uint8Array(32).fill(0xcd)).toString(
      "base64url",
    );
    const frame = encodeIrohaConnectApproveFrame({
      sid,
      accountId: "testu1connected",
      walletPublicKey: new Uint8Array(32).fill(0x07),
      walletSignature: new Uint8Array(64).fill(0x09),
    });

    expect(frame[0]).toBe(0x20);
    expect(frame[1]).toBe(0x01);
    expect(frame.length).toBeGreaterThan(400);
  });
});
