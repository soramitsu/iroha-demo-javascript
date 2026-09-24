import { describe, expect, it } from "vitest";
import {
  buildKaigiSignalEnvelope,
  mergeKaigiRemoteTrackIntoStream,
  normalizeKaigiParticipantId,
  parseKaigiSignalEnvelope,
  parseKaigiSignalInput,
  stringifyKaigiSignalEnvelope,
} from "@/utils/kaigi";

class FakeMediaTrack {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}

class FakeMediaStream {
  private tracks: FakeMediaTrack[];

  constructor(tracks: FakeMediaTrack[] = []) {
    this.tracks = [...tracks];
  }

  getTracks() {
    return [...this.tracks];
  }

  addTrack(track: FakeMediaTrack) {
    this.tracks.push(track);
  }
}

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

  it("accepts only the exact versioned manual signal envelope", () => {
    const exactPacket = JSON.stringify({
      schema: "kaigi-manual-signal/v1",
      kind: "offer",
      roomId: "daily-standup",
      participantId: "bob",
      participantName: "Bob",
      description: {
        type: "offer",
        sdp: "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      },
      createdAtMs: 1234,
    });

    expect(parseKaigiSignalInput(exactPacket, "offer")).toEqual({
      schema: "kaigi-manual-signal/v1",
      kind: "offer",
      roomId: "daily-standup",
      participantId: "bob",
      participantName: "Bob",
      description: {
        type: "offer",
        sdp: "v=0\r\na=ice-ufrag:test\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
      },
      createdAtMs: 1234,
    });

    expect(() =>
      parseKaigiSignalInput(
        JSON.stringify({ type: "offer", sdp: "v=0\r\n" }),
        "offer",
      ),
    ).toThrow();
    expect(() =>
      parseKaigiSignalInput(
        '"sdp": "v=0\\r\\na=ice-ufrag:test\\r\\n"',
        "offer",
      ),
    ).toThrow();
    expect(() =>
      parseKaigiSignalInput("v=0\r\na=ice-ufrag:test\r\n", "offer"),
    ).toThrow();
  });

  it("rejects ambiguous, coerced, and non-canonical envelope fields", () => {
    const base = {
      schema: "kaigi-manual-signal/v1",
      kind: "answer",
      roomId: "daily-standup",
      participantId: "bob",
      participantName: "Bob",
      description: { type: "answer", sdp: "v=0\r\n" },
      createdAtMs: 1234,
    };

    expect(() =>
      parseKaigiSignalInput(
        JSON.stringify({ ...base, legacy: true }),
        "answer",
      ),
    ).toThrow("Kaigi packet has an invalid shape.");
    expect(() =>
      parseKaigiSignalInput(
        JSON.stringify({ ...base, createdAtMs: "1234" }),
        "answer",
      ),
    ).toThrow("Kaigi packet creation time is invalid.");
    expect(() =>
      parseKaigiSignalInput(
        JSON.stringify({ ...base, participantId: "Bob" }),
        "answer",
      ),
    ).toThrow("Kaigi packet participant ID is invalid.");
    expect(() =>
      parseKaigiSignalInput(
        JSON.stringify({
          ...base,
          description: { ...base.description, candidate: "legacy" },
        }),
        "answer",
      ),
    ).toThrow("Kaigi packet description has an invalid shape.");
    expect(() =>
      parseKaigiSignalInput(
        '{"schema":"kaigi-manual-signal/v1","kind":"answer","kind":"offer","roomId":"daily-standup","participantId":"bob","participantName":"Bob","description":{"type":"answer","sdp":"v=0\\r\\n"},"createdAtMs":1234}',
        "answer",
      ),
    ).toThrow("Kaigi packet is invalid.");
  });

  it("requires the packet kind expected by the current signaling step", () => {
    const packet = buildKaigiSignalEnvelope({
      kind: "offer",
      roomId: "daily-standup",
      participantId: "bob",
      participantName: "Bob",
      description: { type: "offer", sdp: "v=0\r\n" },
      createdAtMs: 1234,
    });
    expect(() =>
      parseKaigiSignalInput(stringifyKaigiSignalEnvelope(packet), "answer"),
    ).toThrow("Kaigi packet kind must be answer.");
  });

  it("merges remote tracks even when the track event omits streams", () => {
    const currentStream = new FakeMediaStream([
      new FakeMediaTrack("remote-audio"),
    ]) as unknown as MediaStream;
    const remoteTrack = new FakeMediaTrack(
      "remote-video",
    ) as unknown as MediaStreamTrack;

    const merged = mergeKaigiRemoteTrackIntoStream(currentStream, {
      streams: [],
      track: remoteTrack,
    } as Pick<RTCTrackEvent, "streams" | "track">);

    expect(merged?.getTracks().map((track) => track.id)).toEqual([
      "remote-audio",
      "remote-video",
    ]);
  });

  it("does not duplicate remote tracks when the stream and event carry the same track", () => {
    const existingTrack = new FakeMediaTrack("remote-video");
    const currentStream = new FakeMediaStream([
      existingTrack,
    ]) as unknown as MediaStream;
    const incomingStream = new FakeMediaStream([
      existingTrack,
    ]) as unknown as MediaStream;

    const merged = mergeKaigiRemoteTrackIntoStream(currentStream, {
      streams: [incomingStream],
      track: existingTrack as unknown as MediaStreamTrack,
    } as Pick<RTCTrackEvent, "streams" | "track">);

    expect(merged?.getTracks().map((track) => track.id)).toEqual([
      "remote-video",
    ]);
  });
});
