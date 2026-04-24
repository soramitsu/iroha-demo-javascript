import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KaigiView from "@/views/KaigiView.vue";
import { KAIGI_STORAGE_KEY } from "@/stores/kaigi";
import { useSessionStore } from "@/stores/session";
import {
  buildKaigiSignalEnvelope,
  stringifyKaigiSignalEnvelope,
} from "@/utils/kaigi";
import {
  buildKaigiCompactInviteHashRoute,
  buildKaigiCompactInvitePayload,
  buildKaigiInviteHashRoute,
  encodeKaigiInvitePayload,
  KAIGI_INVITE_SCHEMA,
  type KaigiInvitePayload,
} from "@/utils/kaigiInvite";

const createKaigiMeetingMock = vi.fn();
const getKaigiCallMock = vi.fn();
const joinKaigiMeetingMock = vi.fn();
const pollKaigiMeetingSignalsMock = vi.fn();
const watchKaigiCallEventsMock = vi.fn();
const stopWatchingKaigiCallEventsMock = vi.fn();
const generateKaigiSignalKeyPairMock = vi.fn();
const endKaigiMeetingMock = vi.fn();
const getPrivateKaigiConfidentialXorStateMock = vi.fn();
const selfShieldPrivateKaigiXorMock = vi.fn();
const getUserMediaMock = vi.fn();
const writeTextMock = vi.fn();
const readTextMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  createKaigiMeeting: (input: unknown) => createKaigiMeetingMock(input),
  getKaigiCall: (input: unknown) => getKaigiCallMock(input),
  joinKaigiMeeting: (input: unknown) => joinKaigiMeetingMock(input),
  watchKaigiCallEvents: (input: unknown, onEvent: unknown) =>
    watchKaigiCallEventsMock(input, onEvent),
  stopWatchingKaigiCallEvents: (subscriptionId: unknown) =>
    stopWatchingKaigiCallEventsMock(subscriptionId),
  pollKaigiMeetingSignals: (input: unknown) =>
    pollKaigiMeetingSignalsMock(input),
  generateKaigiSignalKeyPair: () => generateKaigiSignalKeyPairMock(),
  endKaigiMeeting: (input: unknown) => endKaigiMeetingMock(input),
  getPrivateKaigiConfidentialXorState: (input: unknown) =>
    getPrivateKaigiConfidentialXorStateMock(input),
  selfShieldPrivateKaigiXor: (input: unknown) =>
    selfShieldPrivateKaigiXorMock(input),
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
  static emitStreamlessTrackEvents = false;

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
      const remoteAudioTrack = new FakeMediaTrack("audio", "remote-audio");
      const remoteVideoTrack = new FakeMediaTrack("video", "remote-video");
      if (FakePeerConnection.emitStreamlessTrackEvents) {
        this.ontrack?.({
          streams: [],
          track: remoteAudioTrack,
        } as unknown as RTCTrackEvent);
        this.ontrack?.({
          streams: [],
          track: remoteVideoTrack,
        } as unknown as RTCTrackEvent);
      } else {
        const stream = new FakeMediaStream([
          remoteAudioTrack,
          remoteVideoTrack,
        ]);
        this.ontrack?.({
          streams: [stream],
          track: remoteVideoTrack,
        } as unknown as RTCTrackEvent);
      }
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

const getButtonByText = (wrapper: ReturnType<typeof mount>, text: string) => {
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
    callId: "kaigi:kaigi-testroom",
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

const buildCompactInviteHash = () => {
  const compact = buildKaigiCompactInvitePayload(
    "kaigi:kaigi-testroom",
    "bXktc2VjcmV0",
  );
  return `#${buildKaigiCompactInviteHashRoute(compact)}`;
};

const buildAnswerPacket = (roomId: string) =>
  stringifyKaigiSignalEnvelope(
    buildKaigiSignalEnvelope({
      kind: "answer",
      roomId,
      participantId: "Bob",
      participantName: "Bob",
      walletIdentity: "bob@wonderland",
      createdAtMs: Date.now(),
      description: {
        type: "answer",
        sdp: "manual-answer-sdp",
      },
    }),
  );

describe("KaigiView", () => {
  let activeWrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    createKaigiMeetingMock.mockReset();
    getKaigiCallMock.mockReset();
    joinKaigiMeetingMock.mockReset();
    pollKaigiMeetingSignalsMock.mockReset();
    watchKaigiCallEventsMock.mockReset();
    stopWatchingKaigiCallEventsMock.mockReset();
    generateKaigiSignalKeyPairMock.mockReset();
    endKaigiMeetingMock.mockReset();
    getPrivateKaigiConfidentialXorStateMock.mockReset();
    selfShieldPrivateKaigiXorMock.mockReset();
    getUserMediaMock.mockReset();
    writeTextMock.mockReset();
    readTextMock.mockReset();
    FakePeerConnection.instances = [];
    FakePeerConnection.emitStreamlessTrackEvents = false;
    window.location.hash = "";

    generateKaigiSignalKeyPairMock.mockReturnValue({
      publicKeyBase64Url: "host-public",
      privateKeyBase64Url: "host-private",
    });
    createKaigiMeetingMock.mockResolvedValue({ hash: "create-hash" });
    getKaigiCallMock.mockResolvedValue({
      callId: "kaigi:kaigi-testroom",
      meetingCode: "testroom",
      title: "Demo Call",
      hostDisplayName: "Alice",
      hostParticipantId: "alice",
      hostKaigiPublicKeyBase64Url: "host-public",
      scheduledStartMs: Date.now() + 60_000,
      expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
      createdAtMs: Date.now(),
      live: true,
      ended: false,
      privacyMode: "private",
      peerIdentityReveal: "Hidden",
      rosterRootHex: "00".repeat(32),
      offerDescription: {
        type: "offer",
        sdp: "offer-sdp",
      },
    });
    joinKaigiMeetingMock.mockResolvedValue({ hash: "join-hash" });
    pollKaigiMeetingSignalsMock.mockResolvedValue([]);
    watchKaigiCallEventsMock.mockResolvedValue("watch-1");
    endKaigiMeetingMock.mockResolvedValue({ hash: "end-hash" });
    getPrivateKaigiConfidentialXorStateMock.mockResolvedValue({
      assetDefinitionId: "xor#universal",
      resolvedAssetId: "xor#universal",
      policyMode: "Convertible",
      shieldedBalance: "0",
      shieldedBalanceExact: true,
      transparentBalance: "9",
      canSelfShield: true,
    });
    selfShieldPrivateKaigiXorMock.mockResolvedValue({ hash: "shield-hash" });

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
    document.body.innerHTML = "";
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
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    return activeWrapper;
  };

  it("keeps advanced signaling collapsed by default", () => {
    const wrapper = mountView();
    const advancedDetails = wrapper.get(".kaigi-advanced")
      .element as HTMLDetailsElement;

    expect(advancedDetails.open).toBe(false);
    expect(wrapper.text()).toContain("Advanced signaling");
    expect(wrapper.text()).toContain("Show raw packets");
  });

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
      hostDisplayName: "Alice",
      hostParticipantId: "alice",
      hostKaigiPublicKeyBase64Url: "host-public",
      meetingCode: expect.any(String),
      inviteSecretBase64Url: expect.any(String),
      offerDescription: {
        type: "offer",
        sdp: "offer-sdp",
      },
    });
    expect(
      String(createKaigiMeetingMock.mock.calls[0]?.[0]?.callId ?? ""),
    ).toMatch(/^kaigi:kaigi-[a-z0-9-]+$/);
    expect(wrapper.text()).toContain("Meeting link ready");
    expect(wrapper.text()).toContain("Automatic join");

    await getButtonByText(wrapper, "Copy invite link").trigger("click");

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^iroha:\/\/kaigi\/join\?call=.*&secret=[A-Za-z0-9_-]+$/,
      ),
    );
  });

  it("shows a host checklist dialog after creating a meeting link", async () => {
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(wrapper.find(".kaigi-host-modal-backdrop").exists()).toBe(true);
    expect(wrapper.text()).toContain("Host checklist");
    expect(wrapper.text()).toContain("Keep this host window open");
    expect(
      (wrapper.get(".kaigi-advanced").element as HTMLDetailsElement).open,
    ).toBe(false);

    await getButtonByText(wrapper, "Show Advanced signaling").trigger("click");
    await flushPromises();

    expect(wrapper.find(".kaigi-host-modal-backdrop").exists()).toBe(false);
    expect(
      (wrapper.get(".kaigi-advanced").element as HTMLDetailsElement).open,
    ).toBe(true);
  });

  it("focuses the host prompt primary action and restores focus on Escape", async () => {
    const wrapper = mountView();
    const createButton = getButtonByText(wrapper, "Create meeting link");

    (createButton.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(createButton.element);

    await createButton.trigger("click");
    await flushPromises();

    const primaryAction = getButtonByText(
      wrapper,
      "I will keep this window open",
    );
    expect(document.activeElement).toBe(primaryAction.element);

    await wrapper
      .get(".kaigi-host-modal-backdrop")
      .trigger("keydown", { key: "Escape" });
    await flushPromises();

    expect(wrapper.find(".kaigi-host-modal-backdrop").exists()).toBe(false);
    expect(document.activeElement).toBe(createButton.element);
  });

  it("falls back to a transparent manual invite when private live registration fails", async () => {
    createKaigiMeetingMock.mockRejectedValueOnce(
      new Error("proof helper unavailable"),
    );
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Meeting link ready. Private automatic signaling is unavailable, so this meeting will use a transparent manual answer fallback.",
    );
    expect(wrapper.text()).toContain(
      "Automatic private meeting registration failed: proof helper unavailable. Share the manual invite instead. This fallback does not preserve private on-chain signaling.",
    );
    expect(wrapper.text()).toContain("Manual fallback");
  });

  it("prompts for self-shielding and retries private meeting creation", async () => {
    createKaigiMeetingMock.mockRejectedValueOnce(
      new Error(
        "Private Kaigi needs 2 shielded XOR in xor#universal, but only 0 is available. Self-shield XOR first.",
      ),
    );
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(getPrivateKaigiConfidentialXorStateMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
    });
    expect(wrapper.text()).toContain(
      "Private Kaigi needs shielded XOR before it can submit this action.",
    );
    expect(wrapper.text()).toContain("Transparent XOR balance");
    expect(wrapper.text()).toContain("Self-shield 2 XOR and retry");

    await getButtonByText(wrapper, "Self-shield 2 XOR and retry").trigger(
      "click",
    );
    await flushPromises();

    expect(selfShieldPrivateKaigiXorMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      accountId: "alice@wonderland",
      privateKeyHex: "cd".repeat(32),
      amount: "2",
    });
    expect(createKaigiMeetingMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Meeting link ready");
  });

  it("still loads legacy invite tokens for manual fallback", async () => {
    window.location.hash = buildInviteHash({ live: false });
    const wrapper = mountView();
    await flushPromises();

    expect(getKaigiCallMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Meeting summary");
    expect(wrapper.text()).toContain("Manual fallback");
    expect(wrapper.text()).toContain("Host wallet");
  });

  it("loads an invite from the hash route and joins through the live path", async () => {
    window.location.hash = buildCompactInviteHash();
    const wrapper = mountView();
    await flushPromises();

    expect(getKaigiCallMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      callId: "kaigi:kaigi-testroom",
      inviteSecretBase64Url: "bXktc2VjcmV0",
    });
    expect(wrapper.text()).toContain("Meeting summary");
    expect(wrapper.text()).toContain("Demo Call");
    expect(wrapper.text()).toContain("Alice");
    expect(wrapper.text()).not.toContain("Host wallet");

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(joinKaigiMeetingMock).toHaveBeenCalledTimes(1);
    expect(joinKaigiMeetingMock.mock.calls[0]?.[0]).toMatchObject({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      participantAccountId: "alice@wonderland",
      hostKaigiPublicKeyBase64Url: "host-public",
      roomId: "kaigi:kaigi-testroom",
      privacyMode: "private",
      rosterRootHex: "00".repeat(32),
      walletIdentity: undefined,
      answerDescription: {
        type: "answer",
        sdp: "answer-sdp",
      },
    });
    expect(wrapper.text()).toContain(
      "Your encrypted answer was posted on-chain for the host to apply automatically.",
    );
  });

  it("falls back to a manual answer when private automatic join fails", async () => {
    window.location.hash = buildCompactInviteHash();
    joinKaigiMeetingMock.mockRejectedValueOnce(
      new Error("join proof rejected"),
    );
    const wrapper = mountView();
    await flushPromises();

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Answer packet ready. Private automatic join failed, so send the manual answer packet to the host. This fallback does not preserve private on-chain signaling.",
    );
    expect(wrapper.text()).toContain(
      "Automatic private join failed: join proof rejected. Send the manual answer packet instead; this fallback does not preserve private on-chain signaling.",
    );
  });

  it("prompts for self-shielding and retries private join", async () => {
    window.location.hash = buildCompactInviteHash();
    joinKaigiMeetingMock.mockRejectedValueOnce(
      new Error(
        "Private Kaigi needs 2.1 shielded XOR in xor#universal, but only 0 is available. Self-shield XOR first.",
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(getPrivateKaigiConfidentialXorStateMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
    });
    expect(wrapper.text()).toContain(
      "Private Kaigi needs shielded XOR before it can submit this action.",
    );
    expect(wrapper.text()).toContain("Self-shield 3 XOR and retry");

    await getButtonByText(wrapper, "Self-shield 3 XOR and retry").trigger(
      "click",
    );
    await flushPromises();

    expect(selfShieldPrivateKaigiXorMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      accountId: "alice@wonderland",
      privateKeyHex: "cd".repeat(32),
      amount: "3",
    });
    expect(joinKaigiMeetingMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(
      "Your encrypted answer was posted on-chain for the host to apply automatically.",
    );
  });

  it("falls back to the manual answer path for local-only wallets", async () => {
    window.location.hash = buildCompactInviteHash();
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
    pollKaigiMeetingSignalsMock.mockImplementation(
      async (input: { callId: string }) => [
        {
          entrypointHash: "0xanswer",
          callId: input.callId,
          participantId: "bob",
          participantName: "Bob",
          createdAtMs: 1_700_000_010_000,
          answerDescription: {
            type: "answer",
            sdp: "remote-answer-sdp",
          },
        },
      ],
    );

    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(pollKaigiMeetingSignalsMock).toHaveBeenCalledTimes(1);
    expect(watchKaigiCallEventsMock).toHaveBeenCalledTimes(1);
    expect(watchKaigiCallEventsMock.mock.calls[0]?.[0]).toMatchObject({
      toriiUrl: "http://localhost:8080",
      callId: expect.any(String),
    });
    expect(FakePeerConnection.instances[0]?.remoteDescription).toEqual({
      type: "answer",
      sdp: "remote-answer-sdp",
    });
    expect(wrapper.text()).toContain(
      "Participant answer detected and applied automatically.",
    );
    expect(wrapper.text()).toContain("Bob");
  });

  it("checks for signals again when the Kaigi call stream reports a roster update", async () => {
    let signalPollCount = 0;
    pollKaigiMeetingSignalsMock.mockImplementation(
      async (input: { callId: string }) => {
        signalPollCount += 1;
        if (signalPollCount === 1) {
          return [];
        }
        return [
          {
            entrypointHash: "0xanswer-2",
            callId: input.callId,
            participantId: "bob",
            participantName: "Bob",
            createdAtMs: 1_700_000_020_000,
            answerDescription: {
              type: "answer",
              sdp: "stream-answer-sdp",
            },
          },
        ];
      },
    );
    watchKaigiCallEventsMock.mockImplementation(
      async (
        _input: unknown,
        onEvent: (event: { kind: string; callId: string }) => Promise<void>,
      ) => {
        await onEvent({
          kind: "roster_updated",
          callId: "kaigi:kaigi-testroom",
        });
        return "watch-2";
      },
    );

    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(pollKaigiMeetingSignalsMock).toHaveBeenCalledTimes(2);
    expect(FakePeerConnection.instances[0]?.remoteDescription).toEqual({
      type: "answer",
      sdp: "stream-answer-sdp",
    });
    expect(wrapper.text()).toContain(
      "Participant answer detected and applied automatically.",
    );
  });

  it("restores the latest live host meeting from persisted state", async () => {
    const nowMs = Date.now();
    localStorage.setItem(
      KAIGI_STORAGE_KEY,
      JSON.stringify({
        hydrated: true,
        hostSessions: [
          {
            accountId: "alice@wonderland",
            callId: "kaigi:kaigi-testroom",
            meetingCode: "testroom",
            inviteSecretBase64Url: "bXktc2VjcmV0",
            hostKaigiKeys: {
              publicKeyBase64Url: "host-public",
              privateKeyBase64Url: "host-private",
            },
            createdAtMs: nowMs,
            scheduledStartMs: nowMs + 60_000,
            expiresAtMs: nowMs + 24 * 60 * 60 * 1000,
            live: true,
            privacyMode: "private",
            peerIdentityReveal: "Hidden",
          },
        ],
      }),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(getKaigiCallMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      callId: "kaigi:kaigi-testroom",
      inviteSecretBase64Url: "bXktc2VjcmV0",
    });
    expect(wrapper.text()).toContain("Resumed active meeting link.");
  });

  it("renders remote media when the browser emits streamless track events", async () => {
    FakePeerConnection.emitStreamlessTrackEvents = true;
    pollKaigiMeetingSignalsMock.mockImplementation(
      async (input: { callId: string }) => [
        {
          entrypointHash: "0xanswer",
          callId: input.callId,
          participantId: "bob",
          participantName: "Bob",
          createdAtMs: 1_700_000_010_000,
          answerDescription: {
            type: "answer",
            sdp: "remote-answer-sdp",
          },
        },
      ],
    );

    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain(
      "No remote media yet. The other user will appear here after the answer is applied and media starts flowing.",
    );
    expect(FakePeerConnection.instances[0]?.connectionState).toBe("connected");
  });

  it("prompts the host to apply a pasted answer packet", async () => {
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    const roomId = String(
      createKaigiMeetingMock.mock.calls[0]?.[0]?.callId ?? "",
    );
    readTextMock.mockResolvedValueOnce(buildAnswerPacket(roomId));

    await getButtonByText(wrapper, "Paste from clipboard").trigger("click");
    await flushPromises();

    expect(wrapper.find(".kaigi-host-modal-backdrop").exists()).toBe(true);
    expect(wrapper.text()).toContain("Participant answer ready");
    expect(wrapper.text()).toContain(
      "The guest answer packet is ready. Apply it now so audio and video can start.",
    );

    await getButtonByText(wrapper, "Apply answer packet").trigger("click");
    await flushPromises();

    expect(FakePeerConnection.instances[0]?.remoteDescription).toEqual({
      type: "answer",
      sdp: "manual-answer-sdp",
    });
    expect(wrapper.find(".kaigi-host-modal-backdrop").exists()).toBe(false);
  });
});
