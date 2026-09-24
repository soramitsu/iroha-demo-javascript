import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KaigiView from "@/views/KaigiView.vue";
import { useEndpointStore } from "@/stores/endpoint";
import { KAIGI_STORAGE_KEY } from "@/stores/kaigi";
import { useSessionStore } from "@/stores/session";
import {
  buildKaigiSignalEnvelope,
  stringifyKaigiSignalEnvelope,
} from "@/utils/kaigi";
import {
  buildKaigiInvite,
  buildKaigiInviteHashRoute,
} from "@/utils/kaigiInvite";

const KAIGI_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const KAIGI_INVITE_SECRET = "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u";
const KAIGI_HOST_PRIVATE_KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const KAIGI_HOST_PUBLIC_KEY = "B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw";
const createKaigiMeetingMock = vi.fn();
const getKaigiCallMock = vi.fn();
const joinKaigiMeetingMock = vi.fn();
const pollKaigiMeetingSignalsMock = vi.fn();
const watchKaigiCallEventsMock = vi.fn();
const stopWatchingKaigiCallEventsMock = vi.fn();
const generateKaigiSignalKeyPairMock = vi.fn();
const endKaigiMeetingMock = vi.fn();
const finalizedTransaction = (hashCharacter: string) => {
  const hash = hashCharacter.repeat(64);
  return {
    hash,
    finality: {
      status: "finalized" as const,
      transactionHash: hash,
      blockHeight: 17,
      blockHash: "f".repeat(64),
      finalizedBlockHeight: 19,
    },
  };
};
const getUserMediaMock = vi.fn();
const enumerateDevicesMock = vi.fn();
const writeTextMock = vi.fn();
const readTextMock = vi.fn();
const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "readyState",
);
const originalVideoWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  "videoWidth",
);
const originalVideoHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  "videoHeight",
);

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

const getTeleportedButtonByText = (text: string) => {
  const matches = Array.from(document.body.querySelectorAll("button")).filter(
    (button) => button.textContent?.includes(text),
  );
  const button = matches[matches.length - 1];
  if (!button) {
    throw new Error(`Teleported button not found: ${text}`);
  }
  return button;
};

const buildInviteHash = () => {
  const invite = buildKaigiInvite(
    "kaigi.universal:kaigi-testroom",
    KAIGI_INVITE_SECRET,
  );
  return `#${buildKaigiInviteHashRoute(invite)}`;
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
    getUserMediaMock.mockReset();
    enumerateDevicesMock.mockReset();
    writeTextMock.mockReset();
    readTextMock.mockReset();
    FakePeerConnection.instances = [];
    FakePeerConnection.emitStreamlessTrackEvents = false;
    window.location.hash = "";
    localStorage.clear();

    generateKaigiSignalKeyPairMock.mockReturnValue({
      publicKeyBase64Url: KAIGI_HOST_PUBLIC_KEY,
      privateKeyBase64Url: KAIGI_HOST_PRIVATE_KEY,
    });
    createKaigiMeetingMock.mockResolvedValue(finalizedTransaction("a"));
    getKaigiCallMock.mockResolvedValue({
      callId: "kaigi.universal:kaigi-testroom",
      meetingCode: "testroom",
      title: "Demo Call",
      hostAccountId: "testuHost",
      hostDisplayName: "Alice",
      hostParticipantId: "alice",
      hostKaigiPublicKeyBase64Url: KAIGI_HOST_PUBLIC_KEY,
      scheduledStartMs: Date.now() + 60_000,
      expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
      createdAtMs: Date.now(),
      live: true,
      ended: false,
      privacyMode: "transparent",
      offerDescription: {
        type: "offer",
        sdp: "offer-sdp",
      },
    });
    joinKaigiMeetingMock.mockResolvedValue(finalizedTransaction("b"));
    pollKaigiMeetingSignalsMock.mockResolvedValue([]);
    watchKaigiCallEventsMock.mockResolvedValue("watch-1");
    endKaigiMeetingMock.mockResolvedValue(finalizedTransaction("c"));

    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get: () => HTMLMediaElement.HAVE_ENOUGH_DATA,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 360,
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
        enumerateDevices: enumerateDevicesMock,
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
    enumerateDevicesMock.mockResolvedValue([
      {
        kind: "videoinput",
        deviceId: "camera-1",
        label: "FaceTime HD Camera",
      },
      {
        kind: "audioinput",
        deviceId: "mic-1",
        label: "Built-in Microphone",
      },
    ]);

    setActivePinia(createPinia());
  });

  afterEach(() => {
    activeWrapper?.unmount();
    vi.useRealTimers();
    activeWrapper = null;
    document.body.innerHTML = "";
    window.location.hash = "";
    vi.restoreAllMocks();
    if (originalReadyStateDescriptor) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        "readyState",
        originalReadyStateDescriptor,
      );
    } else {
      delete (HTMLMediaElement.prototype as { readyState?: number }).readyState;
    }
    if (originalVideoWidthDescriptor) {
      Object.defineProperty(
        HTMLVideoElement.prototype,
        "videoWidth",
        originalVideoWidthDescriptor,
      );
    } else {
      delete (HTMLVideoElement.prototype as { videoWidth?: number }).videoWidth;
    }
    if (originalVideoHeightDescriptor) {
      Object.defineProperty(
        HTMLVideoElement.prototype,
        "videoHeight",
        originalVideoHeightDescriptor,
      );
    } else {
      delete (HTMLVideoElement.prototype as { videoHeight?: number })
        .videoHeight;
    }
  });

  const mountView = (options?: {
    localOnly?: boolean;
    kaigiSupported?: boolean;
    writeAllowed?: boolean;
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: KAIGI_ASSET_DEFINITION_ID,
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "testuAlice",
          i105AccountId: "testuAlice",
          publicKeyHex: "ab".repeat(32),
          localOnly: Boolean(options?.localOnly),
        },
      ],
      activeAccountId: "testuAlice",
    });
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: "http://localhost:8080",
        expected: { chainId: "chain", networkPrefix: 369 },
        observed: { chainId: "chain", networkPrefix: 369 },
        identityStatus:
          options?.writeAllowed === false ? "unverified" : "matched",
        accessMode:
          options?.writeAllowed === false ? "read-only" : "read-write",
        checkedAtMs: 1,
        evidence:
          options?.writeAllowed === false
            ? []
            : [
                {
                  source: "chain-metadata",
                  identity: { chainId: "chain", networkPrefix: 369 },
                  observedAtMs: 1,
                },
              ],
        diagnostic: {
          code:
            options?.writeAllowed === false
              ? "endpoint_identity_unverified"
              : "endpoint_identity_matched",
          message:
            options?.writeAllowed === false
              ? "Endpoint identity is not verified."
              : "Endpoint identity matched.",
        },
        features: {
          kaigiMeetings: {
            supported: options?.kaigiSupported ?? true,
            source: "openapi",
            requiredOperations: [
              "POST /v1/pipeline/transactions",
              "POST /v1/pipeline/transaction-entrypoints",
            ],
            missingOperations:
              options?.kaigiSupported === false
                ? ["POST /v1/pipeline/transaction-entrypoints"]
                : [],
          },
        },
      },
    } as any);
    activeWrapper = mount(KaigiView, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    return activeWrapper;
  };

  it("does not expose manual signaling to live wallets", () => {
    const wrapper = mountView();

    expect(wrapper.find(".kaigi-advanced").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Show raw packets");
    expect(wrapper.text()).not.toContain("Create manual offer packet");
    const privacyOptions = wrapper
      .findAll("select option")
      .map((option) => option.attributes("value"));
    expect(privacyOptions).not.toContain("private");
    expect(privacyOptions).not.toContain("transparent");
    expect(wrapper.text()).not.toContain("Meeting privacy");
  });

  it("keeps manual signaling available only to local-only wallets", () => {
    const wrapper = mountView({ localOnly: true });
    const advancedDetails = wrapper.get(".kaigi-advanced")
      .element as HTMLDetailsElement;

    expect(advancedDetails.open).toBe(false);
    expect(wrapper.text()).toContain("Advanced signaling");
    expect(wrapper.text()).toContain("Show raw packets");
    expect(wrapper.text()).not.toContain("Private invite");
  });

  it("keeps the empty call stage out of the pre-call setup", () => {
    const wrapper = mountView();
    const layout = wrapper.get(".kaigi-layout").element;
    const firstSection = layout.firstElementChild;

    expect(firstSection?.classList.contains("kaigi-overview-card")).toBe(true);
    expect(wrapper.find(".kaigi-stage").exists()).toBe(false);
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
      hostAccountId: "testuAlice",
      hostDisplayName: "Alice",
      hostParticipantId: "alice",
      hostKaigiPublicKeyBase64Url: KAIGI_HOST_PUBLIC_KEY,
      privacyMode: "transparent",
      meetingCode: expect.any(String),
      inviteSecretBase64Url: expect.any(String),
      offerDescription: {
        type: "offer",
        sdp: "offer-sdp",
      },
    });
    expect(createKaigiMeetingMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "privateKeyHex",
    );
    expect(createKaigiMeetingMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "peerIdentityReveal",
    );
    expect(createKaigiMeetingMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "assetDefinitionId",
    );
    expect(
      String(createKaigiMeetingMock.mock.calls[0]?.[0]?.callId ?? ""),
    ).toMatch(/^kaigi\.universal:kaigi-[a-z0-9-]+$/);
    expect(wrapper.text()).toContain("Meeting link ready");
    expect(wrapper.text()).toContain("Automatic join");
    expect(localStorage.length).toBe(0);

    await getButtonByText(wrapper, "Copy invite link").trigger("click");

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^iroha:\/\/kaigi\/join\?call=.*&secret=[A-Za-z0-9_-]+$/,
      ),
    );
  });

  it("blocks unsupported live meeting creation without exposing a manual downgrade", async () => {
    const wrapper = mountView({ kaigiSupported: false });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "This endpoint does not advertise the Kaigi meeting write operations.",
    );

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(createKaigiMeetingMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "This endpoint does not advertise the Kaigi meeting write operations.",
    );
    expect(wrapper.find(".kaigi-link-box").exists()).toBe(false);
    expect(wrapper.find(".kaigi-advanced").exists()).toBe(false);
    expect(wrapper.find('textarea[name="kaigiOutgoingPacket"]').exists()).toBe(
      false,
    );
  });

  it("lets users choose camera and microphone devices before opening media", async () => {
    enumerateDevicesMock.mockResolvedValue([
      {
        kind: "videoinput",
        deviceId: "camera-default",
        label: "Default Camera",
      },
      {
        kind: "videoinput",
        deviceId: "camera-facetime",
        label: "FaceTime HD Camera",
      },
      {
        kind: "audioinput",
        deviceId: "mic-default",
        label: "Default Microphone",
      },
      {
        kind: "audioinput",
        deviceId: "mic-built-in",
        label: "Built-in Microphone",
      },
    ]);
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("FaceTime HD Camera");
    expect(wrapper.text()).toContain("Built-in Microphone");

    const [cameraSelect, microphoneSelect] = wrapper
      .find(".kaigi-device-grid")
      .findAll("select");
    if (!cameraSelect || !microphoneSelect) {
      throw new Error("Kaigi device selectors were not rendered.");
    }
    await cameraSelect.setValue("camera-facetime");
    await microphoneSelect.setValue("mic-built-in");
    await getButtonByText(wrapper, "Turn on camera and mic").trigger("click");
    await flushPromises();

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: "mic-built-in" },
      },
      video: {
        deviceId: { exact: "camera-facetime" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
    expect(wrapper.text()).toContain("Preview live");
    expect(wrapper.find(".kaigi-media-setup").text()).toContain(
      "Using FaceTime HD Camera.",
    );
    expect(wrapper.find(".kaigi-status-copy").text()).toBe(
      "Local media is ready.",
    );
  });

  it("shows direct recovery guidance when camera permission is denied", async () => {
    getUserMediaMock.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    const wrapper = mountView();

    await getButtonByText(wrapper, "Turn on camera and mic").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Permission needed");
    expect(wrapper.text()).toContain(
      "Allow Camera and Microphone for this app in System Settings, then retry.",
    );
    expect(wrapper.text()).toContain(
      "Camera or microphone permission was denied. If no prompt appears, grant Camera and Microphone for this app in System Settings, then restart the app and retry.",
    );
  });

  it("warns when a camera opens but the preview never receives frames", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
      () => new Promise(() => {}) as Promise<void>,
    );
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 0,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 0,
    });
    vi.useFakeTimers();
    const wrapper = mountView();

    try {
      const mediaPromise = getButtonByText(
        wrapper,
        "Turn on camera and mic",
      ).trigger("click");
      await vi.advanceTimersByTimeAsync(4_900);
      await mediaPromise;
      await flushPromises();
    } finally {
      vi.useRealTimers();
    }

    expect(wrapper.text()).toContain("No video frames");
    expect(wrapper.text()).toContain(
      "No working camera produced video. Close apps using the camera, then find a working camera again.",
    );
    expect(wrapper.text()).toContain(
      "Camera opened but no video frames arrived. Choose another camera, close apps using the camera, then retry.",
    );
  });

  it("automatically tries the next camera when the default camera has no frames", async () => {
    enumerateDevicesMock.mockResolvedValue([
      {
        kind: "videoinput",
        deviceId: "camera-eos",
        label: "EOS Webcam Utility",
      },
      {
        kind: "videoinput",
        deviceId: "camera-facetime",
        label: "FaceTime HD Camera",
      },
      {
        kind: "audioinput",
        deviceId: "mic-built-in",
        label: "Built-in Microphone",
      },
    ]);
    let previewReady = false;
    getUserMediaMock.mockImplementation(async () => {
      if (getUserMediaMock.mock.calls.length >= 2) {
        previewReady = true;
      }
      return new FakeMediaStream([
        new FakeMediaTrack("audio", "local-audio"),
        new FakeMediaTrack("video", "local-video"),
      ]);
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => (previewReady ? 640 : 0),
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => (previewReady ? 360 : 0),
    });
    vi.useFakeTimers();
    const wrapper = mountView();

    try {
      const mediaPromise = getButtonByText(
        wrapper,
        "Turn on camera and mic",
      ).trigger("click");
      await vi.advanceTimersByTimeAsync(4_100);
      await mediaPromise;
      await flushPromises();
    } finally {
      vi.useRealTimers();
    }

    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    expect(getUserMediaMock.mock.calls[0]?.[0]).toMatchObject({
      video: expect.not.objectContaining({
        deviceId: expect.anything(),
      }),
    });
    expect(getUserMediaMock.mock.calls[1]?.[0]).toMatchObject({
      video: {
        deviceId: { exact: "camera-facetime" },
      },
    });
    const cameraSelect = wrapper.find(".kaigi-device-grid").find("select");
    expect((cameraSelect.element as HTMLSelectElement).value).toBe(
      "camera-facetime",
    );
    expect(wrapper.text()).toContain("Preview live");
  });

  it("shows a host checklist dialog after creating a meeting link", async () => {
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(document.body.querySelector(".ui-dialog[open]")).toBeTruthy();
    expect(document.body.textContent).toContain("Host checklist");
    expect(document.body.textContent).toContain("Keep this host window open");
    expect(wrapper.find(".kaigi-advanced").exists()).toBe(false);
    expect(document.body.textContent).not.toContain("Show Advanced signaling");

    getTeleportedButtonByText("I will keep this window open").click();
    await flushPromises();

    expect(document.body.querySelector(".ui-dialog[open]")).toBeFalsy();
  });

  it("focuses the host prompt primary action and restores focus on Escape", async () => {
    const wrapper = mountView();
    const createButton = getButtonByText(wrapper, "Create meeting link");

    (createButton.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(createButton.element);

    await createButton.trigger("click");
    await flushPromises();

    const primaryAction = getTeleportedButtonByText(
      "I will keep this window open",
    );
    expect(document.activeElement).toBe(primaryAction);

    document.body
      .querySelector(".ui-dialog[open]")
      ?.dispatchEvent(new Event("cancel", { cancelable: true }));
    await flushPromises();

    expect(document.body.querySelector(".ui-dialog[open]")).toBeFalsy();
    expect(document.activeElement).toBe(createButton.element);
  });

  it("never creates a share link when live registration fails", async () => {
    createKaigiMeetingMock.mockRejectedValueOnce(
      new Error("proof helper unavailable"),
    );
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("proof helper unavailable");
    expect(wrapper.find(".kaigi-link-box").exists()).toBe(false);
    expect(wrapper.find(".kaigi-advanced").exists()).toBe(false);
    expect(wrapper.find('textarea[name="kaigiOutgoingPacket"]').exists()).toBe(
      false,
    );
  });

  it("rejects legacy invite tokens instead of loading embedded session data", async () => {
    window.location.hash = "#/kaigi?invite=legacy-sdp-bearing-token";
    const wrapper = mountView();
    await flushPromises();

    expect(getKaigiCallMock).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Meeting summary");
    expect(wrapper.text()).not.toContain("legacy-sdp-bearing-token");
  });

  it("loads an invite from the hash route and joins through the live path", async () => {
    window.location.hash = buildInviteHash();
    const wrapper = mountView();
    await flushPromises();

    expect(getKaigiCallMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      callId: "kaigi.universal:kaigi-testroom",
      inviteSecretBase64Url: KAIGI_INVITE_SECRET,
      networkPrefix: 369,
    });
    expect(wrapper.text()).toContain("Meeting summary");
    expect(wrapper.text()).toContain("Demo Call");
    expect(wrapper.text()).toContain("Alice");
    expect(wrapper.text()).toContain("Host wallet");
    expect(wrapper.text()).toContain("testuHost");

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(joinKaigiMeetingMock).toHaveBeenCalledTimes(1);
    expect(joinKaigiMeetingMock.mock.calls[0]?.[0]).toMatchObject({
      toriiUrl: "http://localhost:8080",
      chainId: "chain",
      participantAccountId: "testuAlice",
      inviteSecretBase64Url: KAIGI_INVITE_SECRET,
      answerDescription: {
        type: "answer",
        sdp: "answer-sdp",
      },
    });
    expect(joinKaigiMeetingMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "assetDefinitionId",
    );
    expect(wrapper.text()).toContain(
      "Your encrypted answer was posted on-chain for the host to apply automatically.",
    );
    expect(wrapper.find(".kaigi-stage").exists()).toBe(true);
    expect(wrapper.find(".kaigi-signal-card").exists()).toBe(false);
  });

  it("blocks a live invite when endpoint identity is read-only without a manual downgrade", async () => {
    window.location.hash = buildInviteHash();
    const wrapper = mountView({ writeAllowed: false });
    await flushPromises();

    expect(wrapper.text()).toContain("Endpoint identity is not verified.");
    expect(wrapper.text()).toContain("Unavailable");

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(joinKaigiMeetingMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Endpoint identity is not verified.");
    expect(wrapper.find(".kaigi-advanced").exists()).toBe(false);
    expect(wrapper.find('textarea[name="kaigiOutgoingPacket"]').exists()).toBe(
      false,
    );
  });

  it("fails a live join closed without retaining or exposing a manual answer", async () => {
    window.location.hash = buildInviteHash();
    joinKaigiMeetingMock.mockRejectedValueOnce(
      new Error("join proof rejected"),
    );
    const wrapper = mountView();
    await flushPromises();

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("join proof rejected");
    expect(wrapper.find(".kaigi-stage").exists()).toBe(false);
    expect(wrapper.find(".kaigi-overview-card").exists()).toBe(true);
    expect(wrapper.find(".kaigi-advanced").exists()).toBe(false);
    expect(wrapper.find('textarea[name="kaigiOutgoingPacket"]').exists()).toBe(
      false,
    );
  });

  it("falls back to the manual answer path for local-only wallets", async () => {
    window.location.hash = buildInviteHash();
    const wrapper = mountView({ localOnly: true });
    await flushPromises();

    expect(wrapper.text()).toContain("Manual fallback");

    await getButtonByText(wrapper, "Join meeting").trigger("click");
    await flushPromises();

    expect(joinKaigiMeetingMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Create a manual answer packet in Advanced signaling instead.",
    );
    expect(wrapper.find(".kaigi-stage").exists()).toBe(false);
    expect(wrapper.find(".kaigi-overview-card").exists()).toBe(true);
    expect(
      (wrapper.get(".kaigi-advanced").element as HTMLDetailsElement).open,
    ).toBe(true);
    expect(
      (
        wrapper.get('textarea[name="kaigiOutgoingPacket"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe("");
    await getButtonByText(wrapper, "Create manual answer packet").trigger(
      "click",
    );
    await flushPromises();
    expect(
      (
        wrapper.get('textarea[name="kaigiOutgoingPacket"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toContain("answer-sdp");
    expect(
      getButtonByText(wrapper, "Copy packet").attributes("disabled"),
    ).toBeUndefined();
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
    expect(watchKaigiCallEventsMock).not.toHaveBeenCalled();
    expect(FakePeerConnection.instances[0]?.remoteDescription).toEqual({
      type: "answer",
      sdp: "remote-answer-sdp",
    });
    expect(wrapper.text()).toContain(
      "Participant answer detected and applied automatically.",
    );
    expect(wrapper.text()).toContain("Bob");
  });

  it("retains a live host meeting when the on-chain end fails", async () => {
    pollKaigiMeetingSignalsMock.mockImplementation(
      async (input: { callId: string }) => [
        {
          entrypointHash: "0xanswer-end",
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
    endKaigiMeetingMock.mockRejectedValueOnce(new Error("end rejected"));
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();
    expect(wrapper.find(".kaigi-stage").exists()).toBe(true);

    await getButtonByText(wrapper, "Hang up").trigger("click");
    await flushPromises();

    expect(endKaigiMeetingMock).toHaveBeenCalledTimes(1);
    expect(endKaigiMeetingMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "assetDefinitionId",
    );
    expect(wrapper.text()).toContain("end rejected");
    expect(wrapper.text()).not.toContain("Meeting ended locally.");
    expect(wrapper.find(".kaigi-stage").exists()).toBe(true);

    await getButtonByText(wrapper, "Hang up").trigger("click");
    await flushPromises();

    expect(endKaigiMeetingMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Meeting ended.");
    expect(wrapper.find(".kaigi-stage").exists()).toBe(false);
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
        input: { callId: string },
        onEvent: (event: { kind: string; callId: string }) => Promise<void>,
      ) => {
        await onEvent({
          kind: "roster_updated",
          callId: input.callId,
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

  it("polls periodically while the host context is active and stops after a wallet context change", async () => {
    vi.useFakeTimers();
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();
    expect(pollKaigiMeetingSignalsMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(pollKaigiMeetingSignalsMock).toHaveBeenCalledTimes(2);

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "testuBob",
          i105AccountId: "sorauBob",
          publicKeyHex: "ef".repeat(32),
          localOnly: false,
        },
      ],
      activeAccountId: "testuBob",
    });
    await flushPromises();

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();
    expect(pollKaigiMeetingSignalsMock).toHaveBeenCalledTimes(2);
    expect(stopWatchingKaigiCallEventsMock).toHaveBeenCalledWith({
      subscriptionId: "watch-1",
    });
  });

  it("reconnects a closed Kaigi event stream with bounded backoff", async () => {
    vi.useFakeTimers();
    const wrapper = mountView();

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();
    expect(watchKaigiCallEventsMock).toHaveBeenCalledTimes(1);

    const firstWatchInput = watchKaigiCallEventsMock.mock.calls[0]?.[0] as {
      callId: string;
    };
    const firstWatchCallback = watchKaigiCallEventsMock.mock
      .calls[0]?.[1] as (event: {
      kind: "stream_closed";
      callId: string;
    }) => Promise<void>;
    await firstWatchCallback({
      kind: "stream_closed",
      callId: firstWatchInput.callId,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(watchKaigiCallEventsMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(watchKaigiCallEventsMock).toHaveBeenCalledTimes(2);
  });

  it("deletes insecure persisted host secrets instead of resuming them", async () => {
    localStorage.setItem(
      KAIGI_STORAGE_KEY,
      JSON.stringify({
        hostSessions: [
          {
            inviteSecretBase64Url: KAIGI_INVITE_SECRET,
            hostKaigiKeys: {
              publicKeyBase64Url: KAIGI_HOST_PUBLIC_KEY,
              privateKeyBase64Url: KAIGI_HOST_PRIVATE_KEY,
            },
          },
        ],
      }),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(getKaigiCallMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(KAIGI_STORAGE_KEY)).toBeNull();
    expect(wrapper.text()).not.toContain("Resumed active meeting link.");
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

  it("allows only a local-only host to apply a pasted manual answer", async () => {
    const wrapper = mountView({ localOnly: true });

    await getButtonByText(wrapper, "Create meeting link").trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, "Create manual offer packet").trigger(
      "click",
    );
    await flushPromises();

    const outgoing = (
      wrapper.get('textarea[name="kaigiOutgoingPacket"]')
        .element as HTMLTextAreaElement
    ).value;
    const roomId = String(
      (JSON.parse(outgoing) as { roomId?: unknown }).roomId ?? "",
    );
    expect(JSON.parse(outgoing)).not.toHaveProperty("walletIdentity");
    readTextMock.mockResolvedValueOnce(buildAnswerPacket(roomId));

    await getButtonByText(wrapper, "Paste from clipboard").trigger("click");
    await flushPromises();

    expect(document.body.querySelector(".ui-dialog[open]")).toBeTruthy();
    expect(document.body.textContent).toContain("Participant answer ready");
    expect(document.body.textContent).toContain(
      "The guest answer packet is ready. Apply it now so audio and video can start.",
    );

    getTeleportedButtonByText("Apply answer packet").click();
    await flushPromises();

    expect(FakePeerConnection.instances[0]?.remoteDescription).toEqual({
      type: "answer",
      sdp: "manual-answer-sdp",
    });
    expect(document.body.querySelector(".ui-dialog[open]")).toBeFalsy();
  });
});
