import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KaigiView from "@/views/KaigiView.vue";
import { useSessionStore } from "@/stores/session";
import {
  buildKaigiInviteHashRoute,
  encodeKaigiInvitePayload,
  KAIGI_INVITE_SCHEMA,
  type KaigiInvitePayload,
} from "@/utils/kaigiInvite";

const createKaigiMeetingMock = vi.fn();
const joinKaigiMeetingMock = vi.fn();
const pollKaigiMeetingSignalsMock = vi.fn();
const generateKaigiSignalKeyPairMock = vi.fn();
const endKaigiMeetingMock = vi.fn();
const getUserMediaMock = vi.fn();
const writeTextMock = vi.fn();
const readTextMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  createKaigiMeeting: (input: unknown) => createKaigiMeetingMock(input),
  joinKaigiMeeting: (input: unknown) => joinKaigiMeetingMock(input),
  pollKaigiMeetingSignals: (input: unknown) => pollKaigiMeetingSignalsMock(input),
  generateKaigiSignalKeyPair: () => generateKaigiSignalKeyPairMock(),
  endKaigiMeeting: (input: unknown) => endKaigiMeetingMock(input),
}));

class FakeMediaTrack {
  kind: "audio" | "video";
  enabled = true;
  stopped = false;
  id: string;

  constructor(kind: "audio" | "video", id: string) {
    this.kind = kind;
    this.id = id;
  }

  stop() {
    this.stopped = true;
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

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  addTrack(track: FakeMediaTrack) {
    this.tracks.push(track);
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "new";
  signalingState: RTCSignalingState = "stable";
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  private senders: Array<{ replaceTrack: ReturnType<typeof vi.fn> }> = [];
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: FakeMediaTrack, stream: FakeMediaStream) {
    void track;
    void stream;
    const sender = { replaceTrack: vi.fn() };
    this.senders.push(sender);
    return sender;
  }

  getSenders() {
    return this.senders;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "offer-sdp" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "answer-sdp" };
  }

  async setLocalDescription(
    description: RTCSessionDescriptionInit | null,
  ): Promise<void> {
    this.localDescription = description;
    this.iceGatheringState = "complete";
    this.signalingState =
      description?.type === "offer" ? "have-local-offer" : "stable";
    this.dispatch("icegatheringstatechange");
    this.onsignalingstatechange?.();
  }

  async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.remoteDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-remote-offer" : "stable";
    this.onsignalingstatechange?.();

    if (description.type === "answer") {
      this.connectionState = "connected";
      this.iceConnectionState = "connected";
      const stream = new FakeMediaStream([
        new FakeMediaTrack("audio", "remote-audio"),
        new FakeMediaTrack("video", "remote-video"),
      ]);
      const trackEvent = {
        streams: [stream],
      } as unknown as RTCTrackEvent;
      this.ontrack?.(trackEvent);
      this.onconnectionstatechange?.();
      this.oniceconnectionstatechange?.();
    }
  }

  addEventListener(type: string, handler: () => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(handler);
  }

  removeEventListener(type: string, handler: () => void) {
    this.listeners.get(type)?.delete(handler);
  }

  close() {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  }

  private dispatch(type: string) {
    this.listeners.get(type)?.forEach((handler) => handler());
    if (type === "icegatheringstatechange") {
      this.onicegatheringstatechange?.();
    }
  }
}

const getButtonByText = (
  wrapper: ReturnType<typeof mount>,
  text: string,
) => {
  const matches = wrapper
    .findAll("button")
    .filter((node) => node.text().includes(text));
  const button = matches[matches.length - 1];
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
};

const buildInviteHash = (options?: { live?: boolean }) => {
  const nowMs = Date.now();
  const invite: KaigiInvitePayload = {
    schema: KAIGI_INVITE_SCHEMA,
    callId: "wonderland:kaigi-testroom",
    meetingCode: "testroom",
    title: "Demo Call",
    hostAccountId: "alice@wonderland",
    hostDisplayName: "Alice",
    hostParticipantId: "alice",
    hostKaigiPublicKeyBase64Url: "host-public",
    scheduledStartMs: nowMs + 60_000,
    expiresAtMs: nowMs + 24 * 60 * 60 * 1000,
    createdAtMs: nowMs,
    live: options?.live ?? true,
    offerDescription: {
      type: "offer",
      sdp: "offer-sdp",
    },
  };
  const token = encodeKaigiInvitePayload(invite);
  return `#${buildKaigiInviteHashRoute(token)}`;
};

describe("KaigiView", () => {
  let activeWrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    createKaigiMeetingMock.mockReset();
    joinKaigiMeetingMock.mockReset();
    pollKaigiMeetingSignalsMock.mockReset();
    generateKaigiSignalKeyPairMock.mockReset();
    endKaigiMeetingMock.mockReset();
    getUserMediaMock.mockReset();
    writeTextMock.mockReset();
    readTextMock.mockReset();
    FakePeerConnection.instances = [];
    window.location.hash = "";

    generateKaigiSignalKeyPairMock.mockReturnValue({
      publicKeyBase64Url: "host-public",
      privateKeyBase64Url: "host-private",
    });
    createKaigiMeetingMock.mockResolvedValue({ hash: "create-hash" });
    joinKaigiMeetingMock.mockResolvedValue({ hash: "join-hash" });
    pollKaigiMeetingSignalsMock.mockResolvedValue([]);
    endKaigiMeetingMock.mockResolvedValue({ hash: "end-hash" });

    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
        readText: readTextMock,
      },
    });

    getUserMediaMock.mockResolvedValue(
      new FakeMediaStream([
        new FakeMediaTrack("audio", "local-audio"),
        new FakeMediaTrack("video", "local-video"),
      ]),
    );

    setActivePinia(createPinia());
  });

  afterEach(() => {
    activeWrapper?.unmount();
    activeWrapper = null;
    window.location.hash = "";
    vi.restoreAllMocks();
  });

  const mountView = (options?: { localOnly?: boolean }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "norito:abcdef0123456789",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          i105AccountId: "sorauAlice",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
          localOnly: Boolean(options?.localOnly),
        },
      ],
      activeAccountId: "alice@wonderland",
    });
    activeWrapper = mount(KaigiView, {
      global: {
        plugins: [pinia],
      },
    });
    return activeWrapper;
  };

  it("creates a live meeting link and copies the invite", async () => {
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: true,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
    expect(createKaigiMeetingMock).toHaveBeenCalledTimes(1);
    expect(createKaigiMeetingMock.mock.calls[0]?.[0]).toMatchObject({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      hostAccountId: "alice@wonderland",
      privateKeyHex: "cd".repeat(32),
    });
    expect(
      String(createKaigiMeetingMock.mock.calls[0]?.[0]?.callId ?? ""),
    ).toMatch(/^wonderland:kaigi-[a-z0-9-]+$/);
    expect(wrapper.text()).toContain("Meeting link ready");
    expect(wrapper.text()).toContain("Automatic join");

    await getButtonByText(wrapper, "Copy invite link").trigger("click");

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("iroha://kaigi/join?invite="),
    );
  });

  it("loads an invite from the hash route and joins through the live path", async () => {
    window.location.hash = buildInviteHash({ live: true });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Meeting summary");
    expect(wrapper.text()).toContain("Demo Call");
    expect(wrapper.text()).toContain("Alice");

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(joinKaigiMeetingMock).toHaveBeenCalledTimes(1);
    expect(joinKaigiMeetingMock.mock.calls[0]?.[0]).toMatchObject({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      participantAccountId: "alice@wonderland",
      hostAccountId: "alice@wonderland",
      hostKaigiPublicKeyBase64Url: "host-public",
      roomId: "wonderland:kaigi-testroom",
      answerDescription: {
        type: "answer",
        sdp: "answer-sdp",
      },
    });
    expect(wrapper.text()).toContain(
      "Your encrypted answer was posted on-chain for the host to apply automatically.",
    );
  });

  it("falls back to the manual answer path for local-only wallets", async () => {
    window.location.hash = buildInviteHash({ live: true });
    const wrapper = mountView({ localOnly: true });
    await flushPromises();

    expect(wrapper.text()).toContain("Manual fallback");

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(joinKaigiMeetingMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Answer packet ready. Send it to the host manually.",
    );
  });

  it("auto-applies a polled participant answer after host meeting creation", async () => {
    pollKaigiMeetingSignalsMock.mockImplementation(async (input: {
      callId: string;
    }) => [
      {
        entrypointHash: "0xanswer",
        authority: "bob@wonderland",
        callId: input.callId,
        participantAccountId: "bob@wonderland",
        participantId: "bob",
        participantName: "Bob",
        createdAtMs: 1_700_000_010_000,
        answerDescription: {
          type: "answer",
          sdp: "remote-answer-sdp",
        },
      },
    ]);

    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(pollKaigiMeetingSignalsMock).toHaveBeenCalledTimes(1);
    expect(FakePeerConnection.instances[0]?.remoteDescription).toEqual({
      type: "answer",
      sdp: "remote-answer-sdp",
    });
    expect(wrapper.text()).toContain(
      "Participant answer detected and applied automatically.",
    );
    expect(wrapper.text()).toContain("Bob");
  });
});
