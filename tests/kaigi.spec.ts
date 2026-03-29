import { describe, expect, it } from "vitest";
import {
  buildKaigiSignalEnvelope,
  normalizeKaigiParticipantId,
  parseKaigiSignalEnvelope,
  parseKaigiSignalInput,
  stringifyKaigiSignalEnvelope,
} from "@/utils/kaigi";

describe("Kaigi helpers", () => {
  it("normalizes participant ids to a transport-safe shape", () => {
    expect(normalizeKaigiParticipantId(" Alice Example ")).toBe(
      "alice-example",
    );
    expect(normalizeKaigiParticipantId("SORA_日本 42")).toBe("sora-42");
    expect(normalizeKaigiParticipantId("")).toBe("participant");
  });

  it("builds and parses manual Kaigi signal packets", () => {
    const packet = buildKaigiSignalEnvelope({
      kind: "offer",
      roomId: "sakura-room",
      participantId: "Alice Example",
      participantName: "Alice Example",
      walletIdentity: "sorauAlice",
      description: {
        type: "offer",
        sdp: "v=0\r\na=group:BUNDLE 0\r\n",
      },
      createdAtMs: 1234,
    });

    const parsed = parseKaigiSignalEnvelope(
      stringifyKaigiSignalEnvelope(packet),
    );

    expect(parsed).toEqual({
      schema: "kaigi-manual-signal/v1",
      kind: "offer",
      roomId: "sakura-room",
      participantId: "alice-example",
      participantName: "Alice Example",
      walletIdentity: "sorauAlice",
      description: {
        type: "offer",
        sdp: "v=0\r\na=group:BUNDLE 0\r\n",
      },
      createdAtMs: 1234,
    });
  });

  it("rejects mismatched packet and session description kinds", () => {
    expect(() =>
      buildKaigiSignalEnvelope({
        kind: "offer",
        roomId: "sakura-room",
        participantId: "alice",
        participantName: "Alice",
        description: {
          type: "answer",
          sdp: "v=0\r\n",
        },
      }),
    ).toThrow("Kaigi packet kind must match the session description.");
  });

  it("rejects malformed manual Kaigi packets", () => {
    expect(() => parseKaigiSignalEnvelope("not-json")).toThrow(
      "Kaigi packet is invalid.",
    );
    expect(() =>
      parseKaigiSignalEnvelope(
        JSON.stringify({
          schema: "kaigi-manual-signal/v1",
          kind: "answer",
          roomId: "sakura-room",
          participantId: "bob",
          participantName: "Bob",
          createdAtMs: 10,
          description: {
            type: "offer",
            sdp: "v=0\r\n",
          },
        }),
      ),
    ).toThrow("Kaigi packet kind must match the session description.");
  });

  it("accepts a raw session description object when the expected kind is known", () => {
    expect(
      parseKaigiSignalInput(
        JSON.stringify({
          type: "offer",
          sdp: "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
        }),
        "offer",
      ),
    ).toEqual({
      kind: "offer",
      description: {
        type: "offer",
        sdp: "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      },
    });
  });

  it("accepts an sdp fragment without the outer envelope", () => {
    expect(
      parseKaigiSignalInput(
        [
          '"sdp": "v=0\\r\\na=ice-ufrag:test\\r\\nm=audio 9 UDP/TLS/RTP/SAVPF 111\\r\\n",',
          '"roomId": "daily-standup",',
          '"participantName": "Bob"',
        ].join("\n"),
        "offer",
      ),
    ).toEqual({
      kind: "offer",
      roomId: "daily-standup",
      participantName: "Bob",
      description: {
        type: "offer",
        sdp: "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      },
    });
  });

  it("accepts plain sdp text when the caller already knows the signal kind", () => {
    expect(
      parseKaigiSignalInput(
        "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
        "answer",
      ),
    ).toEqual({
      kind: "answer",
      description: {
        type: "answer",
        sdp: "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      },
    });
  });
});
