import { describe, expect, it, vi } from "vitest";

import {
  IROHA_CONNECT_MAX_FRAME_BYTES,
  bytesToBase64,
  decodeIrohaConnectFrameBase64,
  readIrohaConnectRelayFrame,
} from "@/utils/soraswapConnectWire";

describe("IrohaConnect frame boundary", () => {
  it("accepts only canonical bounded frame base64", () => {
    const encoded = bytesToBase64(Uint8Array.of(1, 2, 3, 4));

    expect(decodeIrohaConnectFrameBase64(encoded)).toEqual(
      Uint8Array.of(1, 2, 3, 4),
    );
    expect(() =>
      decodeIrohaConnectFrameBase64(encoded.trimEnd() + "\n"),
    ).toThrow(/invalid or oversized/u);
    expect(() =>
      decodeIrohaConnectFrameBase64(encoded.replace(/=+$/u, "")),
    ).toThrow(/not canonical/u);
    expect(() =>
      decodeIrohaConnectFrameBase64(
        "A".repeat(Math.ceil(IROHA_CONNECT_MAX_FRAME_BYTES / 3) * 4 + 1),
      ),
    ).toThrow(/invalid or oversized/u);
  });

  it("rejects an oversized Blob before materializing it", async () => {
    const blob = new Blob([new Uint8Array(IROHA_CONNECT_MAX_FRAME_BYTES + 1)]);
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    Object.defineProperty(blob, "arrayBuffer", { value: arrayBuffer });

    await expect(readIrohaConnectRelayFrame(blob)).rejects.toThrow(
      /must contain/u,
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized materialized relay frames", async () => {
    await expect(readIrohaConnectRelayFrame(new Uint8Array())).rejects.toThrow(
      /must contain/u,
    );
    await expect(
      readIrohaConnectRelayFrame(
        new Uint8Array(IROHA_CONNECT_MAX_FRAME_BYTES + 1),
      ),
    ).rejects.toThrow(/must contain/u);
  });
});
