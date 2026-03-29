import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KaigiView from "@/views/KaigiView.vue";
import { useSessionStore } from "@/stores/session";
import {
  buildKaigiSignalEnvelope,
  stringifyKaigiSignalEnvelope,
} from "@/utils/kaigi";

const getUserMediaMock = vi.fn();
const writeTextMock = vi.fn();
const readTextMock = vi.fn();

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

describe("KaigiView", () => {
  beforeEach(() => {
    getUserMediaMock.mockReset();
    writeTextMock.mockReset();
    readTextMock.mockReset();
    FakePeerConnection.instances = [];

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

  const mountView = () => {
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
          domain: "default",
          accountId: "alice@default",
          i105AccountId: "sorauAlice",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
        },
      ],
      activeAccountId: "alice@default",
    });
    return mount(KaigiView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  it("creates an offer packet and copies it to the clipboard", async () => {
    const wrapper = mountView();

    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Create offer packet"))!
      .trigger("click");
    await flushPromises();

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: true,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
    expect(wrapper.text()).toContain(
      "Offer packet ready. Send it to the other wallet user.",
    );
    const outgoingPacket = (
      wrapper.findAll("textarea")[0].element as HTMLTextAreaElement
    ).value;
    expect(outgoingPacket).toContain('"kind": "offer"');
    expect(outgoingPacket).toContain('"roomId": "sakura-room"');

    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Copy packet"))!
      .trigger("click");

    expect(writeTextMock).toHaveBeenCalledWith(outgoingPacket);
  });

  it("creates an answer packet from a pasted offer and adopts the remote room id", async () => {
    const wrapper = mountView();
    const offerPacket = stringifyKaigiSignalEnvelope(
      buildKaigiSignalEnvelope({
        kind: "offer",
        roomId: "daily-standup",
        participantId: "bob",
        participantName: "Bob",
        walletIdentity: "sorauBob",
        description: {
          type: "offer",
          sdp: "offer-sdp",
        },
        createdAtMs: 99,
      }),
    );

    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Join call"))!
      .trigger("click");
    await wrapper.findAll("textarea")[1].setValue(offerPacket);
    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Create answer packet"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Answer packet ready. Send it back to the caller.",
    );
    expect(
      (wrapper.findAll("input")[0].element as HTMLInputElement).value,
    ).toBe("daily-standup");
    const outgoingPacket = (
      wrapper.findAll("textarea")[0].element as HTMLTextAreaElement
    ).value;
    expect(outgoingPacket).toContain('"kind": "answer"');
    expect(outgoingPacket).toContain('"participantName": "Alice"');
  });

  it("applies a remote answer packet and marks the call connected", async () => {
    const wrapper = mountView();

    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Create offer packet"))!
      .trigger("click");
    await flushPromises();

    const answerPacket = stringifyKaigiSignalEnvelope(
      buildKaigiSignalEnvelope({
        kind: "answer",
        roomId: "sakura-room",
        participantId: "bob",
        participantName: "Bob",
        walletIdentity: "sorauBob",
        description: {
          type: "answer",
          sdp: "answer-sdp",
        },
        createdAtMs: 101,
      }),
    );

    await wrapper.findAll("textarea")[1].setValue(answerPacket);
    await wrapper
      .findAll("button")
      .find((node) => node.text().includes("Apply answer packet"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Answer applied. The call can connect now.",
    );
    expect(wrapper.text()).toContain("Remote participant");
    expect(wrapper.text()).toContain("Bob");
    expect(wrapper.text()).toContain("connected");
  });
});
