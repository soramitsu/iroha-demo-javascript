import { describe, expect, it } from "vitest";

import {
  decodeConnectFrame,
  encodeApproveConnectFrame,
  encodeCiphertextConnectFrame,
  encodeControlConnectFrame,
} from "@/utils/soraswapConnectWire";
import {
  relayLayoutFrameToSdk,
  sdkFrameToRelayLayout,
} from "./helpers/connectRelayFixedArrays";

/*
 * Frames captured from the live TAIRA Connect relay (https://taira.sora.org,
 * Torii 3ed2c80) on 2026-10-13. The relay decodes and re-encodes every frame,
 * so these bytes are its canonical layout: `[u8; 32]` is element-framed
 * (each byte a u64-length-prefixed element), while the Open constraints'
 * NetworkId stays a raw 32-byte payload.
 */
const LIVE_RELAYED_OPEN_HEX = [
  "200100000000000001000000000000006601000000000000009201000000000000004201",
  "000000000000007a01000000000000001e01000000000000005f01000000000000004001",
  "000000000000009f0100000000000000550100000000000000840100000000000000f901",
  "000000000000002301000000000000009f01000000000000007201000000000000001d01",
  "00000000000000f101000000000000001f01000000000000007c01000000000000001701",
  "00000000000000e601000000000000005e0100000000000000000100000000000000e701",
  "00000000000000a90100000000000000c40100000000000000bd01000000000000002801",
  "00000000000000b60100000000000000ea0100000000000000d001000000000000004701",
  "00000000000000a804000000000000000000000008000000000000000100000000000000",
  "8201000000000000000000007601000000000000000000006a0100000000000020010000",
  "000000000100000000000000db0100000000000000c80100000000000000160100000000",
  "0000000401000000000000003a01000000000000001a0100000000000000750100000000",
  "000000bf0100000000000000960100000000000000290100000000000000cc0100000000",
  "000000960100000000000000f60100000000000000430100000000000000bf0100000000",
  "000000c10100000000000000fc0100000000000000350100000000000000ab0100000000",
  "0000002b0100000000000000610100000000000000d70100000000000000610100000000",
  "0000009c0100000000000000970100000000000000290100000000000000430100000000",
  "000000470100000000000000900100000000000000420100000000000000ac0100000000",
  "0000003c010000000000000000280000000000000020000000000000005c3e66c94e0790",
  "79ff4fc46f59810b9c4ec7b2646dd45ce937831c0fdce20c9b010000000000000000",
].join("");
const LIVE_RELAY_CLOSE_HEX = [
  "20010000000000000100000000000000af01000000000000008101000000000000006201",
  "00000000000000a80100000000000000a70100000000000000b20100000000000000d001",
  "00000000000000ec01000000000000004301000000000000008301000000000000007501",
  "000000000000008c0100000000000000c90100000000000000e701000000000000008e01",
  "00000000000000dc0100000000000000080100000000000000e50100000000000000b901",
  "000000000000005901000000000000002001000000000000007e01000000000000000501",
  "000000000000000801000000000000007c01000000000000008c01000000000000000201",
  "00000000000000b001000000000000009d0100000000000000730100000000000000ae01",
  "00000000000000df04000000000000000000000008000000000000000100000000000000",
  "5f0000000000000000000000530000000000000003000000470000000000000004000000",
  "00000000000000000200000000000000a20f20000000000000001800000000000000636f",
  "6e6e6563745f7472616e73706f72745f636c6f736564010000000000000000",
].join("");
/** A wallet Approve the live relay verified and relayed to the app. */
const LIVE_RELAYED_APPROVE_HEX = [
  "200100000000000001000000000000009e0100000000000000ec01000000000000002801",
  "000000000000004401000000000000003301000000000000006101000000000000004601",
  "000000000000007c0100000000000000250100000000000000de01000000000000002401",
  "000000000000006e01000000000000009a0100000000000000e701000000000000001e01",
  "00000000000000450100000000000000620100000000000000ad0100000000000000c201",
  "00000000000000e70100000000000000220100000000000000de0100000000000000a601",
  "00000000000000990100000000000000cd01000000000000008901000000000000001d01",
  "000000000000003a01000000000000001b01000000000000002701000000000000004601",
  "000000000000000004000000000000000100000008000000000000000100000000000000",
  "1e0400000000000000000000120400000000000001000000060400000000000020010000",
  "000000000100000000000000a20100000000000000a101000000000000007d0100000000",
  "000000a30100000000000000090100000000000000690100000000000000fa0100000000",
  "0000003a0100000000000000640100000000000000080100000000000000c00100000000",
  "000000d40100000000000000dd01000000000000005a0100000000000000bd0100000000",
  "0000003e0100000000000000ef0100000000000000450100000000000000a80100000000",
  "0000008d0100000000000000ea0100000000000000080100000000000000e70100000000",
  "000000cb01000000000000004001000000000000003f0100000000000000820100000000",
  "000000cc0100000000000000490100000000000000530100000000000000de0100000000",
  "00000032600000000000000058000000000000007465737475efbe9b314eefbe9347efbe",
  "8aefbe975135efbe9457efbe986654efbe9cefbdb7efbe8f5a66efbe83efbe883337efbe",
  "8e7345efbe8d59efbe886b5a514aefbe9870efbe956eefbdbf6fefbe9c72515856464531",
  "0100000000000000000100000000000000005c0200000000000004000000000000000000",
  "000048020000000000004000000000000000010000000000000091010000000000000007",
  "0100000000000000120100000000000000af0100000000000000a001000000000000003b",
  "0100000000000000a50100000000000000000100000000000000b60100000000000000be",
  "01000000000000006101000000000000003a0100000000000000660100000000000000d4",
  "0100000000000000bb01000000000000000f0100000000000000ad0100000000000000b0",
  "01000000000000008a0100000000000000580100000000000000a90100000000000000bf",
  "0100000000000000390100000000000000ef01000000000000003b010000000000000031",
  "0100000000000000c701000000000000005301000000000000001b01000000000000006d",
  "01000000000000001301000000000000002701000000000000008401000000000000005b",
  "0100000000000000f20100000000000000290100000000000000820100000000000000f8",
  "01000000000000009c0100000000000000700100000000000000c201000000000000009e",
  "01000000000000000b01000000000000003b010000000000000080010000000000000070",
  "0100000000000000fe0100000000000000ee01000000000000002e010000000000000044",
  "01000000000000002a01000000000000009c010000000000000076010000000000000041",
  "010000000000000043010000000000000002010000000000000019010000000000000091",
  "0100000000000000bc01000000000000008701000000000000009d01000000000000006f",
  "0100000000000000f501000000000000000a",
].join("");
const LIVE_OPEN_SID_HEX =
  "6692427a1e5f409f5584f9239f721df11f7c17e65e00e7a9c4bd28b6ead047a8";
const LIVE_OPEN_APP_PK_HEX =
  "dbc816043a1a75bf9629cc96f643bfc1fc35ab2b61d7619c972943479042ac3c";
const LIVE_NETWORK_ID =
  "hash:5C3E66C94E079079FF4FC46F59810B9C4EC7B2646DD45CE937831C0FDCE20C9B#44D9";

const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const sidBase64Url = (hex: string) =>
  Buffer.from(hex, "hex").toString("base64url");

/** `u64 len` + element-framed 32-byte array, as the relay requires. */
const elementFramed = (hex: string) =>
  Buffer.concat(
    Array.from(Buffer.from(hex, "hex"), (byte) =>
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, byte]),
    ),
  ).toString("hex");

describe("IrohaConnect live relay frame layout", () => {
  it("decodes and byte-identically re-encodes a live relayed Open frame", () => {
    const bytes = fromHex(LIVE_RELAYED_OPEN_HEX);
    const frame = decodeConnectFrame(bytes);
    expect(frame).toEqual({
      sid: sidBase64Url(LIVE_OPEN_SID_HEX),
      sidHex: LIVE_OPEN_SID_HEX,
      direction: "app_to_wallet",
      seq: 1,
      kind: "control",
      control: {
        type: "open",
        appPublicKeyHex: LIVE_OPEN_APP_PK_HEX,
        constraints: { networkId: LIVE_NETWORK_ID },
        appMeta: null,
        permissions: null,
      },
      ciphertext: null,
    });
    if (frame.control?.type !== "open") throw new Error("expected Open");
    const reencoded = encodeControlConnectFrame({
      sid: frame.sid,
      direction: frame.direction,
      seq: frame.seq,
      control: frame.control,
    });
    expect(toHex(reencoded)).toBe(LIVE_RELAYED_OPEN_HEX);
    // frame.sid occupies 8 + 32 * 9 bytes, followed by the direction field.
    expect(LIVE_RELAYED_OPEN_HEX.slice(0, 16)).toBe("2001000000000000");
    expect(LIVE_RELAYED_OPEN_HEX.slice(16, 16 + 576)).toBe(
      elementFramed(LIVE_OPEN_SID_HEX),
    );
  });

  it("decodes and byte-identically re-encodes a live relay Close frame", () => {
    const frame = decodeConnectFrame(fromHex(LIVE_RELAY_CLOSE_HEX));
    expect(frame).toMatchObject({
      direction: "app_to_wallet",
      seq: 1,
      kind: "control",
      control: {
        type: "close",
        who: "app",
        code: 4002,
        reason: "connect_transport_closed",
        retryable: false,
      },
    });
    if (frame.control?.type !== "close") throw new Error("expected Close");
    expect(
      toHex(
        encodeControlConnectFrame({
          sid: frame.sid,
          direction: frame.direction,
          seq: frame.seq,
          control: frame.control,
        }),
      ),
    ).toBe(LIVE_RELAY_CLOSE_HEX);
  });

  it("decodes and byte-identically re-encodes a live relayed Approve frame", () => {
    const frame = decodeConnectFrame(fromHex(LIVE_RELAYED_APPROVE_HEX));
    expect(frame).toMatchObject({
      sidHex:
        "9eec28443361467c25de246e9ae71e4562adc2e722dea699cd891d3a1b274600",
      direction: "wallet_to_app",
      seq: 1,
      kind: "control",
      control: {
        type: "approve",
        walletPublicKeyHex:
          "a2a17da30969fa3a6408c0d4dd5abd3eef45a88dea08e7cb403f82cc4953de32",
        permissions: null,
        proof: null,
        signature: {
          algorithmCode: 0,
          algorithmLabel: "Ed25519",
          signatureHex:
            "910712afa03ba500b6be613a66d4bb0fadb08a58a9bf39ef3b31c7531b6d1327" +
            "845bf22982f89c70c29e0b3b8070feee2e442a9c764143021991bc879d6ff50a",
        },
      },
    });
    if (frame.control?.type !== "approve") throw new Error("expected Approve");
    const reencoded = encodeApproveConnectFrame(frame.sid, frame.seq, {
      walletPublicKeyHex: frame.control.walletPublicKeyHex,
      accountId: frame.control.accountId,
      signature: frame.control.signature,
    });
    expect(toHex(reencoded)).toBe(LIVE_RELAYED_APPROVE_HEX);
    // sig_wallet: u32 Ed25519 discriminant, then u64 64 + element-framed bytes.
    expect(LIVE_RELAYED_APPROVE_HEX).toContain(
      "0400000000000000" +
        "00000000" +
        "4802000000000000" +
        "4000000000000000" +
        elementFramed(frame.control.signature.signatureHex),
    );
  });

  it("rejects the pre-relay raw [u8; 32] layout", () => {
    const raw = relayLayoutFrameToSdk(fromHex(LIVE_RELAYED_OPEN_HEX));
    expect(raw.length).toBe(718 - 2 * (288 - 32));
    expect(() => decodeConnectFrame(raw)).toThrow(/frame\.sid/u);
    expect(toHex(sdkFrameToRelayLayout(raw))).toBe(LIVE_RELAYED_OPEN_HEX);
  });

  it("element-frames Approve wallet keys and ciphertext frame sids", () => {
    const sid = sidBase64Url(LIVE_OPEN_SID_HEX);
    const walletPublicKeyHex = "11".repeat(31) + "22";
    const approve = encodeApproveConnectFrame(sid, 1, {
      walletPublicKeyHex,
      accountId: "account",
      signature: {
        algorithmCode: 0,
        signatureHex: "33".repeat(64),
        signatureBase64: Buffer.from("33".repeat(64), "hex").toString("base64"),
      },
    });
    expect(toHex(approve)).toContain(elementFramed(walletPublicKeyHex));
    expect(decodeConnectFrame(approve).control).toMatchObject({
      type: "approve",
      walletPublicKeyHex,
      accountId: "account",
    });
    const ciphertext = encodeCiphertextConnectFrame({
      sid,
      direction: "wallet_to_app",
      seq: 2,
      aead: new Uint8Array([1, 2, 3]),
    });
    expect(toHex(ciphertext).slice(16, 16 + 576)).toBe(
      elementFramed(LIVE_OPEN_SID_HEX),
    );
    expect(decodeConnectFrame(ciphertext)).toMatchObject({
      sid,
      kind: "ciphertext",
      ciphertext: { aeadHex: "010203" },
    });
    // A relay-layout array whose element is not exactly one byte is rejected.
    const corrupted = Uint8Array.from(approve);
    const firstElement =
      toHex(approve).indexOf(elementFramed(walletPublicKeyHex)) / 2;
    corrupted[firstElement] = 2;
    expect(() => decodeConnectFrame(corrupted)).toThrow();
  });
});
