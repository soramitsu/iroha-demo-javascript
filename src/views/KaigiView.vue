<template>
  <div class="kaigi-layout">
    <section class="card kaigi-overview-card">
      <header class="card-header kaigi-header">
        <div>
          <h2>{{ t("Kaigi Room") }}</h2>
          <p class="helper">
            {{
              t(
                "Share a Kaigi meeting link, then connect browser audio and video between two wallet users.",
              )
            }}
          </p>
        </div>
        <div class="kaigi-summary-pills">
          <span class="pill" :class="{ positive: localStreamReady }">
            {{ localStreamReady ? t("Live") : t("Idle") }}
          </span>
          <span
            class="pill"
            :class="{ positive: peerConnectionState === 'connected' }"
          >
            {{
              peerConnectionState === "connected"
                ? t("Connected")
                : t("Not connected")
            }}
          </span>
          <span class="pill" :class="{ positive: signalModeLabel !== t('Idle') }">
            {{ signalModeLabel }}
          </span>
        </div>
      </header>

      <div class="kaigi-config-grid">
        <div class="kaigi-config-pane">
          <div class="actions-row kaigi-mode-toggle">
            <button
              class="secondary"
              :class="{ active: callMode === 'start' }"
              type="button"
              @click="switchMode('start')"
            >
              {{ t("Start meeting") }}
            </button>
            <button
              class="secondary"
              :class="{ active: callMode === 'join' }"
              type="button"
              @click="switchMode('join')"
            >
              {{ t("Join meeting") }}
            </button>
          </div>

          <div v-if="callMode === 'start'" class="form-grid kaigi-config-form">
            <label>
              {{ t("Meeting title") }}
              <input v-model="meetingTitle" :placeholder="t('Optional')" />
            </label>
            <label>
              {{ t("Participant name") }}
              <input v-model="participantName" />
            </label>
            <label>
              {{ t("Scheduled start") }}
              <div class="kaigi-input-with-action">
                <input
                  v-model="scheduledStartInput"
                  type="datetime-local"
                  step="60"
                />
                <button
                  type="button"
                  class="secondary"
                  :disabled="busy"
                  @click="setScheduledStartToNow"
                >
                  {{ t("Start now") }}
                </button>
              </div>
            </label>
            <label>
              {{ t("Wallet identity") }}
              <input :value="walletIdentity || t('Not connected')" readonly />
            </label>
          </div>

          <div v-else class="form-grid kaigi-config-form">
            <label class="kaigi-wide-field">
              {{ t("Meeting invite") }}
              <textarea
                v-model="inviteInput"
                rows="5"
                spellcheck="false"
                :placeholder="
                  t(
                    'Paste an iroha:// invite link, a #/kaigi invite route, or the raw invite token.',
                  )
                "
              ></textarea>
            </label>
            <label>
              {{ t("Participant name") }}
              <input v-model="participantName" />
            </label>
            <label>
              {{ t("Wallet identity") }}
              <input :value="walletIdentity || t('Not connected')" readonly />
            </label>
            <div class="actions-row kaigi-inline-actions">
              <button type="button" :disabled="busy" @click="loadInviteFromInput">
                {{ t("Load invite") }}
              </button>
              <button
                type="button"
                class="secondary"
                :disabled="busy"
                @click="pasteInviteFromClipboard"
              >
                {{ t("Paste from clipboard") }}
              </button>
            </div>
          </div>

          <p class="helper">{{ modeHelperText }}</p>
          <p class="helper">
            {{
              isLiveWallet
                ? t(
                    "Live wallets can create and join Kaigi meetings through on-chain signaling metadata. Local-only wallets fall back to manual packets.",
                  )
                : t(
                    "This wallet is local only, so Kaigi keeps the invite-link flow but falls back to a manual answer packet.",
                  )
            }}
          </p>

          <div
            v-if="callMode === 'start' && hostInviteDeepLink"
            class="kaigi-link-box"
          >
            <div class="kaigi-link-box-header">
              <div>
                <h3>{{ t("Meeting link ready") }}</h3>
                <p class="helper">
                  {{
                    hostMeetingLive
                      ? t(
                          "Share the deep link. The guest can answer without pasting SDP when both wallets are live on-chain.",
                        )
                      : t(
                          "Share the invite link. The guest can still open the meeting directly, but answer delivery falls back to the Advanced signaling section.",
                        )
                  }}
                </p>
              </div>
              <span class="pill" :class="{ positive: hostMeetingLive }">
                {{
                  hostMeetingLive ? t("Automatic join") : t("Manual fallback")
                }}
              </span>
            </div>

            <div class="kaigi-link-field">
              <span class="helper">{{ t("Meeting code") }}</span>
              <strong class="mono">{{ hostMeetingCode }}</strong>
            </div>
            <div class="kaigi-link-field">
              <span class="helper">{{ t("Invite link") }}</span>
              <textarea :value="hostInviteDeepLink" rows="3" readonly></textarea>
            </div>
            <div class="actions-row kaigi-inline-actions">
              <button
                type="button"
                class="secondary"
                :disabled="busy"
                @click="copyInviteLink"
              >
                {{ t("Copy invite link") }}
              </button>
            </div>
            <div class="kaigi-link-field">
              <span class="helper">{{ t("Fallback route") }}</span>
              <textarea :value="hostInviteHashRouteDisplay" rows="2" readonly></textarea>
            </div>
            <div class="actions-row kaigi-inline-actions">
              <button
                type="button"
                class="secondary"
                :disabled="busy"
                @click="copyFallbackLink"
              >
                {{ t("Copy fallback route") }}
              </button>
            </div>
          </div>

          <div
            v-if="callMode === 'join' && parsedInvite"
            class="kaigi-link-box kaigi-invite-summary"
          >
            <div class="kaigi-link-box-header">
              <div>
                <h3>{{ t("Meeting summary") }}</h3>
                <p class="helper">
                  {{
                    inviteExpired
                      ? t("This meeting invite has expired.")
                      : t("Open local media, then join the loaded meeting.")
                  }}
                </p>
              </div>
              <span class="pill" :class="{ positive: inviteCanUseAutomaticJoin }">
                {{
                  inviteCanUseAutomaticJoin
                    ? t("Automatic join")
                    : t("Manual fallback")
                }}
              </span>
            </div>
            <div class="kaigi-kpis">
              <div class="kv">
                <span class="kv-label">{{ t("Meeting code") }}</span>
                <span class="kv-value mono">{{ parsedInvite.meetingCode }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Host") }}</span>
                <span class="kv-value">{{ parsedInvite.hostDisplayName }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Host wallet") }}</span>
                <span class="kv-value mono">{{ parsedInvite.hostAccountId }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Scheduled start") }}</span>
                <span class="kv-value">{{ parsedInviteStartLabel }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Expires") }}</span>
                <span class="kv-value">{{ parsedInviteExpiryLabel }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Meeting title") }}</span>
                <span class="kv-value">{{
                  parsedInvite.title || t("Untitled meeting")
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="kaigi-status-pane">
          <div class="kaigi-kpis">
            <div class="kv">
              <span class="kv-label">{{ t("Active account") }}</span>
              <span class="kv-value">{{
                walletIdentity || t("Not connected")
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Meeting code") }}</span>
              <span class="kv-value mono">{{
                currentMeetingCode || t("Waiting")
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Peer connection") }}</span>
              <span class="kv-value mono">{{ peerConnectionState }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("ICE connection") }}</span>
              <span class="kv-value mono">{{ iceConnectionState }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("ICE gathering") }}</span>
              <span class="kv-value mono">{{ iceGatheringState }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Signaling") }}</span>
              <span class="kv-value mono">{{ signalingState }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Join path") }}</span>
              <span class="kv-value">{{ signalModeLabel }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Remote participant") }}</span>
              <span class="kv-value">{{
                remoteParticipantName || t("Waiting for the other wallet user.")
              }}</span>
            </div>
          </div>

          <div class="actions-row kaigi-primary-actions">
            <button
              v-if="callMode === 'start'"
              type="button"
              :disabled="busy"
              @click="createMeetingLink"
            >
              {{
                signalBusy ? t("Creating meeting link…") : t("Create meeting link")
              }}
            </button>
            <button
              v-else
              type="button"
              :disabled="busy || !parsedInvite || inviteExpired"
              @click="joinLoadedMeeting"
            >
              {{ signalBusy ? t("Joining meeting…") : t("Join meeting") }}
            </button>
            <button type="button" class="secondary" :disabled="busy" @click="prepareLocalMedia">
              {{
                mediaBusy ? t("Preparing local media…") : t("Prepare local media")
              }}
            </button>
          </div>

          <p class="helper kaigi-status-copy">{{ statusMessage }}</p>
          <p v-if="errorMessage" class="helper kaigi-error">
            {{ errorMessage }}
          </p>
        </div>
      </div>
    </section>

    <section class="card kaigi-media-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Call controls") }}</h2>
          <p class="helper">{{ t("Local media") }} · {{ t("Remote media") }}</p>
        </div>
        <div class="actions-row kaigi-control-row">
          <button
            type="button"
            class="secondary"
            :disabled="!localStream"
            @click="toggleAudio"
          >
            {{ audioEnabled ? t("Mute mic") : t("Unmute mic") }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="!localStream"
            @click="toggleVideo"
          >
            {{ videoEnabled ? t("Stop camera") : t("Start camera") }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="!localStream"
            @click="stopPreview"
          >
            {{ t("Stop preview") }}
          </button>
          <button type="button" class="warn" :disabled="busy" @click="hangUp">
            {{ t("Hang up") }}
          </button>
        </div>
      </header>

      <div class="kaigi-media-grid">
        <div class="kaigi-video-shell">
          <div class="kaigi-video-meta">
            <span>{{ t("Local media") }}</span>
            <span class="helper"
              >{{ audioEnabled ? t("Microphone on") : t("Microphone off") }} ·
              {{ videoEnabled ? t("Camera on") : t("Camera off") }}</span
            >
          </div>
          <video ref="localVideoRef" autoplay muted playsinline></video>
          <div v-if="!localStream" class="kaigi-video-empty">
            <p>{{ t("Camera + microphone preview") }}</p>
            <p class="helper">
              {{
                t("Open local media before creating or joining a Kaigi meeting.")
              }}
            </p>
          </div>
        </div>

        <div class="kaigi-video-shell">
          <div class="kaigi-video-meta">
            <span>{{ t("Remote media") }}</span>
            <span class="helper">{{
              remoteParticipantName || t("Waiting for the other wallet user.")
            }}</span>
          </div>
          <video ref="remoteVideoRef" autoplay playsinline></video>
          <div v-if="!remoteStream" class="kaigi-video-empty">
            <p>{{ t("Remote media") }}</p>
            <p class="helper">
              {{
                t(
                  "No remote media yet. The other user will appear here after the answer is applied and media starts flowing.",
                )
              }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="card kaigi-signal-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Advanced signaling") }}</h2>
          <p class="helper">
            {{
              t(
                "Use this only when a wallet is local-only or automatic Kaigi signaling is unavailable.",
              )
            }}
          </p>
        </div>
      </header>

      <details class="kaigi-advanced">
        <summary>{{ t("Show raw packets") }}</summary>
        <div class="actions-row kaigi-signal-actions">
          <button
            v-if="callMode === 'join'"
            type="button"
            :disabled="busy"
            @click="createManualAnswerPacket"
          >
            {{
              signalBusy
                ? t("Creating manual answer…")
                : t("Create manual answer packet")
            }}
          </button>
          <button
            v-if="callMode === 'start'"
            type="button"
            class="secondary"
            :disabled="busy"
            @click="applyAnswerPacket"
          >
            {{
              signalBusy
                ? t("Applying remote answer…")
                : t("Apply answer packet")
            }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="!outgoingPacket"
            @click="copyOutgoingPacket"
          >
            {{ t("Copy packet") }}
          </button>
          <button type="button" class="secondary" @click="pasteIncomingPacket">
            {{ t("Paste from clipboard") }}
          </button>
          <button type="button" class="secondary" @click="clearPackets">
            {{ t("Clear packets") }}
          </button>
        </div>

        <div class="kaigi-packet-grid">
          <label class="kaigi-packet-field">
            {{ t("Outgoing packet") }}
            <textarea
              :value="outgoingPacket"
              readonly
              rows="14"
              spellcheck="false"
            ></textarea>
          </label>
          <label class="kaigi-packet-field">
            {{ t("Remote packet") }}
            <textarea
              v-model="incomingPacket"
              rows="14"
              spellcheck="false"
            ></textarea>
          </label>
        </div>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  createKaigiMeeting,
  endKaigiMeeting,
  generateKaigiSignalKeyPair,
  joinKaigiMeeting,
  pollKaigiMeetingSignals,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import type { KaigiMeetingSignalRecord, KaigiSignalKeyPair } from "@/types/iroha";
import {
  buildKaigiSignalEnvelope,
  normalizeKaigiParticipantId,
  parseKaigiSignalInput,
  stringifyKaigiSignalEnvelope,
  type ParsedKaigiSignalInput,
} from "@/utils/kaigi";
import {
  KAIGI_INVITE_SCHEMA,
  buildKaigiCallId,
  buildKaigiInviteDeepLink,
  buildKaigiInviteHashRoute,
  computeKaigiMeetingExpiryMs,
  encodeKaigiInvitePayload,
  isKaigiInviteExpired,
  parseKaigiInviteInput,
  type KaigiInvitePayload,
} from "@/utils/kaigiInvite";

const DEFAULT_ROOM_ID = "sakura-room";
const ICE_GATHERING_TIMEOUT_MS = 7_000;
const HOST_SIGNAL_POLL_INTERVAL_MS = 4_000;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  },
];

const padDateTimePart = (value: number) => String(value).padStart(2, "0");

const formatDateTimeLocalInput = (value: number) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    padDateTimePart(date.getMonth() + 1),
    padDateTimePart(date.getDate()),
  ].join("-") +
    `T${padDateTimePart(date.getHours())}:${padDateTimePart(date.getMinutes())}`;
};

const createMeetingCode = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid.replace(/-/g, "").slice(0, 8).toLowerCase();
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0").slice(0, 8);
};

const session = useSessionStore();
const { d, t } = useAppI18n();
const activeAccount = computed(() => session.activeAccount);
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value),
);

const callMode = ref<"start" | "join">("start");
const meetingTitle = ref("");
const inviteInput = ref("");
const participantNameDraft = ref("");
const scheduledStartInput = ref(formatDateTimeLocalInput(Date.now()));
const hostMeetingCallId = ref("");
const hostMeetingCode = ref("");
const hostMeetingLive = ref(false);
const hostInviteDeepLink = ref("");
const hostInviteHashRoute = ref("");
const hostMeetingKeys = shallowRef<KaigiSignalKeyPair | null>(null);
const hostMeetingCreatedAtMs = ref(0);
const hostLastSignalAtMs = ref(0);
const manualRoomId = ref(DEFAULT_ROOM_ID);
const parsedInvite = shallowRef<KaigiInvitePayload | null>(null);

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);
const localStream = shallowRef<MediaStream | null>(null);
const remoteStream = shallowRef<MediaStream | null>(null);
const peerConnection = shallowRef<RTCPeerConnection | null>(null);

const outgoingPacket = ref("");
const incomingPacket = ref("");
const remoteParticipantName = ref("");
const statusMessage = ref(t("Create a meeting link to invite another wallet user."));
const errorMessage = ref("");
const audioEnabled = ref(true);
const videoEnabled = ref(true);
const mediaBusy = ref(false);
const signalBusy = ref(false);
const signalingState = ref<RTCSignalingState | "idle" | "closed">("idle");
const iceGatheringState = ref<RTCIceGatheringState | "idle">("idle");
const iceConnectionState = ref<RTCIceConnectionState | "idle">("idle");
const peerConnectionState = ref<RTCPeerConnectionState | "idle" | "closed">(
  "idle",
);

let hostSignalPollTimer: number | null = null;
let hostSignalPollBusy = false;
const seenHostSignalHashes = new Set<string>();

const participantName = computed({
  get: () =>
    participantNameDraft.value.trim() ||
    activeAccount.value?.displayName ||
    activeAccountDisplayId.value ||
    t("Guest"),
  set: (value: string) => {
    participantNameDraft.value = value;
  },
});

const participantId = computed(() =>
  normalizeKaigiParticipantId(participantName.value),
);
const walletIdentity = computed(() => activeAccountDisplayId.value);
const busy = computed(() => mediaBusy.value || signalBusy.value);
const localStreamReady = computed(() => Boolean(localStream.value));
const isLiveWallet = computed(() => Boolean(activeAccount.value && !activeAccount.value.localOnly));
const inviteExpired = computed(() =>
  parsedInvite.value ? isKaigiInviteExpired(parsedInvite.value) : false,
);
const inviteCanUseAutomaticJoin = computed(
  () => Boolean(parsedInvite.value?.live) && isLiveWallet.value,
);
const currentMeetingCode = computed(
  () => hostMeetingCode.value || parsedInvite.value?.meetingCode || "",
);
const currentRoomId = computed(
  () =>
    hostMeetingCallId.value ||
    parsedInvite.value?.callId ||
    manualRoomId.value ||
    DEFAULT_ROOM_ID,
);
const signalModeLabel = computed(() => {
  if (hostMeetingLive.value) {
    return t("Automatic join");
  }
  if (parsedInvite.value) {
    return inviteCanUseAutomaticJoin.value
      ? t("Automatic join")
      : t("Manual fallback");
  }
  if (hostInviteDeepLink.value) {
    return t("Manual fallback");
  }
  return t("Idle");
});
const hostInviteHashRouteDisplay = computed(() =>
  hostInviteHashRoute.value ? `#${hostInviteHashRoute.value}` : "",
);
const parsedInviteStartLabel = computed(() =>
  parsedInvite.value
    ? d(parsedInvite.value.scheduledStartMs, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "",
);
const parsedInviteExpiryLabel = computed(() =>
  parsedInvite.value
    ? d(parsedInvite.value.expiresAtMs, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "",
);
const modeHelperText = computed(() =>
  callMode.value === "start"
    ? t(
        "Create a Kaigi meeting link, share it, then wait for the participant answer to arrive automatically or through the Advanced signaling fallback.",
      )
    : t(
        "Open or paste a Kaigi invite, create your answer locally, and let the app deliver it automatically when possible.",
      ),
);

watch([localVideoRef, localStream], ([videoElement, stream]) => {
  if (!videoElement) {
    return;
  }
  videoElement.srcObject = stream;
  if (stream) {
    void videoElement.play().catch(() => {});
  }
});

watch([remoteVideoRef, remoteStream], ([videoElement, stream]) => {
  if (!videoElement) {
    return;
  }
  videoElement.srcObject = stream;
  if (stream) {
    void videoElement.play().catch(() => {});
  }
});

const setStatus = (message: string) => {
  statusMessage.value = message;
  errorMessage.value = "";
};

const setError = (message: string) => {
  statusMessage.value = "";
  errorMessage.value = message;
};

const syncPeerStateRefs = (peer: RTCPeerConnection | null) => {
  if (!peer) {
    signalingState.value = "closed";
    iceGatheringState.value = "idle";
    iceConnectionState.value = "idle";
    peerConnectionState.value = "closed";
    return;
  }
  signalingState.value = peer.signalingState;
  iceGatheringState.value = peer.iceGatheringState;
  iceConnectionState.value = peer.iceConnectionState;
  peerConnectionState.value = peer.connectionState;
};

const stopStreamTracks = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop());
};

const clearRemoteStream = () => {
  stopStreamTracks(remoteStream.value);
  remoteStream.value = null;
};

const clearHostSignalPolling = () => {
  if (hostSignalPollTimer !== null) {
    window.clearInterval(hostSignalPollTimer);
    hostSignalPollTimer = null;
  }
  hostSignalPollBusy = false;
};

const clearHostMeetingState = () => {
  clearHostSignalPolling();
  seenHostSignalHashes.clear();
  hostMeetingCallId.value = "";
  hostMeetingCode.value = "";
  hostMeetingLive.value = false;
  hostInviteDeepLink.value = "";
  hostInviteHashRoute.value = "";
  hostMeetingKeys.value = null;
  hostMeetingCreatedAtMs.value = 0;
  hostLastSignalAtMs.value = 0;
};

const resetSignalState = () => {
  const peer = peerConnection.value;
  if (peer) {
    peer.onicecandidate = null;
    peer.oniceconnectionstatechange = null;
    peer.onicegatheringstatechange = null;
    peer.onsignalingstatechange = null;
    peer.onconnectionstatechange = null;
    peer.ontrack = null;
    peer.getSenders().forEach((sender) => {
      try {
        sender.replaceTrack(null);
      } catch (_error) {
        // Ignore teardown races while closing the connection.
      }
    });
    peer.close();
  }
  peerConnection.value = null;
  syncPeerStateRefs(null);
  clearRemoteStream();
  outgoingPacket.value = "";
  incomingPacket.value = "";
  remoteParticipantName.value = "";
};

const attachLocalTrackStates = () => {
  localStream.value?.getAudioTracks().forEach((track) => {
    track.enabled = audioEnabled.value;
  });
  localStream.value?.getVideoTracks().forEach((track) => {
    track.enabled = videoEnabled.value;
  });
};

const ensureLocalMedia = async () => {
  if (localStream.value) {
    attachLocalTrackStates();
    return localStream.value;
  }
  if (!audioEnabled.value && !videoEnabled.value) {
    throw new Error(t("Enable at least audio or video before starting Kaigi."));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t("Kaigi media is unavailable in this environment."));
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioEnabled.value,
      video: videoEnabled.value
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false,
    });
    localStream.value = stream;
    attachLocalTrackStates();
    return stream;
  } catch (error) {
    const mediaError = error as DOMException | Error;
    if (mediaError?.name === "NotAllowedError") {
      throw new Error(t("Camera or microphone permission was denied."));
    }
    if (mediaError?.name === "NotFoundError") {
      throw new Error(t("No camera or microphone device is available."));
    }
    throw new Error(
      t("Unable to start Kaigi media: {message}", {
        message: mediaError?.message || "unknown",
      }),
    );
  }
};

const waitForIceGatheringComplete = async (peer: RTCPeerConnection) => {
  if (peer.iceGatheringState === "complete") {
    return;
  }
  await new Promise<void>((resolve) => {
    const handleChange = () => {
      syncPeerStateRefs(peer);
      if (peer.iceGatheringState === "complete") {
        cleanup();
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      peer.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    const timeoutId = window.setTimeout(cleanup, ICE_GATHERING_TIMEOUT_MS);
    peer.addEventListener("icegatheringstatechange", handleChange);
  });
};

const createPeerConnection = async () => {
  resetSignalState();
  const peer = new RTCPeerConnection({
    iceServers: DEFAULT_ICE_SERVERS,
  });
  const stream = await ensureLocalMedia();

  stream.getTracks().forEach((track) => {
    peer.addTrack(track, stream);
  });

  peer.oniceconnectionstatechange = () => {
    syncPeerStateRefs(peer);
  };
  peer.onicegatheringstatechange = () => {
    syncPeerStateRefs(peer);
  };
  peer.onsignalingstatechange = () => {
    syncPeerStateRefs(peer);
  };
  peer.onconnectionstatechange = () => {
    syncPeerStateRefs(peer);
    if (peer.connectionState === "connected") {
      setStatus(
        t("Connected to {name}.", {
          name: remoteParticipantName.value || t("Remote participant"),
        }),
      );
    }
  };
  peer.ontrack = (event) => {
    if (!remoteStream.value) {
      remoteStream.value = new MediaStream();
    }
    event.streams.forEach((streamValue) => {
      streamValue.getTracks().forEach((track) => {
        if (
          !remoteStream.value?.getTracks().some((item) => item.id === track.id)
        ) {
          remoteStream.value?.addTrack(track);
        }
      });
    });
  };

  peerConnection.value = peer;
  syncPeerStateRefs(peer);
  return peer;
};

const prepareLocalMedia = async () => {
  mediaBusy.value = true;
  try {
    await ensureLocalMedia();
    setStatus(t("Local media is ready."));
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : t("Kaigi media is unavailable in this environment."),
    );
  } finally {
    mediaBusy.value = false;
  }
};

const buildOutgoingPacket = (input: {
  kind: "offer" | "answer";
  roomId: string;
  description: RTCSessionDescriptionInit;
  createdAtMs?: number;
}) =>
  stringifyKaigiSignalEnvelope(
    buildKaigiSignalEnvelope({
      kind: input.kind,
      roomId: input.roomId,
      participantId: participantId.value,
      participantName: participantName.value,
      walletIdentity: walletIdentity.value,
      description: input.description,
      createdAtMs: input.createdAtMs,
    }),
  );

const readIncomingPacket = (expectedKind: "offer" | "answer") => {
  if (!incomingPacket.value.trim()) {
    throw new Error(t("Paste a Kaigi packet first."));
  }
  let packet: ParsedKaigiSignalInput;
  try {
    packet = parseKaigiSignalInput(incomingPacket.value, expectedKind);
  } catch (_error) {
    throw new Error(t("Kaigi packet is invalid."));
  }
  if (packet.kind !== expectedKind) {
    throw new Error(
      t("Signal packet kind must be {kind}.", { kind: expectedKind }),
    );
  }
  if (callMode.value === "join") {
    if (packet.roomId) {
      manualRoomId.value = packet.roomId;
    }
  } else if (
    packet.roomId &&
    currentRoomId.value.trim() &&
    packet.roomId !== currentRoomId.value.trim()
  ) {
    throw new Error(t("Signal packet room ID does not match this Kaigi room."));
  }
  remoteParticipantName.value =
    packet.participantName ||
    packet.participantId ||
    packet.walletIdentity ||
    t("Remote participant");
  return packet;
};

const createOfferPacket = async (roomId: string) => {
  const peer = await createPeerConnection();
  const offer = await peer.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });
  await peer.setLocalDescription(offer);
  syncPeerStateRefs(peer);
  await waitForIceGatheringComplete(peer);
  const description = peer.localDescription;
  if (!description?.sdp) {
    throw new Error(t("Offer packet is missing session data."));
  }
  const normalizedDescription = {
    type: "offer" as const,
    sdp: description.sdp,
  };
  outgoingPacket.value = buildOutgoingPacket({
    kind: "offer",
    roomId,
    description: normalizedDescription,
  });
  return normalizedDescription;
};

const createAnswerPacketFromOffer = async (
  offerPacket: Pick<
    ParsedKaigiSignalInput,
    "roomId" | "participantId" | "participantName" | "walletIdentity"
  > & {
    description: {
      type: "offer";
      sdp: string;
    };
    createdAtMs?: number;
  },
) => {
  const peer = await createPeerConnection();
  await peer.setRemoteDescription(offerPacket.description);
  syncPeerStateRefs(peer);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  syncPeerStateRefs(peer);
  await waitForIceGatheringComplete(peer);
  const description = peer.localDescription;
  if (!description?.sdp) {
    throw new Error(t("Answer packet is missing session data."));
  }
  remoteParticipantName.value =
    offerPacket.participantName ||
    offerPacket.participantId ||
    offerPacket.walletIdentity ||
    t("Remote participant");
  const normalizedDescription = {
    type: "answer" as const,
    sdp: description.sdp,
  };
  outgoingPacket.value = buildOutgoingPacket({
    kind: "answer",
    roomId: offerPacket.roomId || currentRoomId.value || DEFAULT_ROOM_ID,
    description: normalizedDescription,
  });
  return normalizedDescription;
};

const applyRemoteAnswerDescription = async (
  description: { type: "answer"; sdp: string },
  options?: {
    participantName?: string;
    participantId?: string;
    walletIdentity?: string;
    packet?: string;
    statusMessage?: string;
  },
) => {
  const peer = peerConnection.value;
  if (!peer || !peer.localDescription) {
    throw new Error(t("Create a meeting link first."));
  }
  await peer.setRemoteDescription(description);
  syncPeerStateRefs(peer);
  if (options?.participantName || options?.participantId || options?.walletIdentity) {
    remoteParticipantName.value =
      options.participantName ||
      options.participantId ||
      options.walletIdentity ||
      remoteParticipantName.value;
  }
  if (options?.packet) {
    incomingPacket.value = options.packet;
  }
  setStatus(options?.statusMessage || t("Answer applied. The call can connect now."));
};

const applyPolledAnswerSignal = async (signal: KaigiMeetingSignalRecord) => {
  const packet = stringifyKaigiSignalEnvelope(
    buildKaigiSignalEnvelope({
      kind: "answer",
      roomId: signal.roomId || signal.callId,
      participantId: signal.participantId,
      participantName: signal.participantName,
      walletIdentity: signal.walletIdentity || signal.participantAccountId,
      description: signal.answerDescription,
      createdAtMs: signal.createdAtMs,
    }),
  );
  await applyRemoteAnswerDescription(signal.answerDescription, {
    participantName: signal.participantName,
    participantId: signal.participantId,
    walletIdentity: signal.walletIdentity || signal.participantAccountId,
    packet,
    statusMessage: t("Participant answer detected and applied automatically."),
  });
};

const startHostSignalPolling = () => {
  clearHostSignalPolling();
  if (
    !hostMeetingLive.value ||
    !hostMeetingCallId.value ||
    !hostMeetingKeys.value ||
    !activeAccount.value
  ) {
    return;
  }
  const hostAccountId = activeAccount.value.accountId;
  const hostKaigiKeys = hostMeetingKeys.value;

  const pollSignals = async () => {
    if (hostSignalPollBusy) {
      return;
    }
    hostSignalPollBusy = true;
    try {
      const signals = await pollKaigiMeetingSignals({
        toriiUrl: session.connection.toriiUrl,
        accountId: hostAccountId,
        callId: hostMeetingCallId.value,
        hostKaigiKeys,
        afterTimestampMs:
          hostLastSignalAtMs.value || hostMeetingCreatedAtMs.value || undefined,
      });
      const nextSignal = signals.find(
        (signal) => !seenHostSignalHashes.has(signal.entrypointHash),
      );
      if (!nextSignal) {
        return;
      }
      seenHostSignalHashes.add(nextSignal.entrypointHash);
      hostLastSignalAtMs.value = Math.max(
        hostLastSignalAtMs.value,
        nextSignal.createdAtMs,
      );
      await applyPolledAnswerSignal(nextSignal);
      clearHostSignalPolling();
    } catch (_error) {
      // Keep polling silent so temporary Torii lag does not block the manual fallback.
    } finally {
      hostSignalPollBusy = false;
    }
  };

  void pollSignals();
  hostSignalPollTimer = window.setInterval(
    () => void pollSignals(),
    HOST_SIGNAL_POLL_INTERVAL_MS,
  );
};

const copyText = async (value: string, successMessage: string) => {
  if (!value.trim()) {
    setError(t("Nothing to copy yet."));
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage);
  } catch (_error) {
    setError(t("Clipboard access failed. Copy the packet manually."));
  }
};

const copyInviteLink = async () => {
  await copyText(hostInviteDeepLink.value, t("Meeting invite copied to clipboard."));
};

const copyFallbackLink = async () => {
  await copyText(
    hostInviteHashRouteDisplay.value,
    t("Fallback route copied to clipboard."),
  );
};

const copyOutgoingPacket = async () => {
  await copyText(outgoingPacket.value, t("Kaigi packet copied to clipboard."));
};

const pasteIncomingPacket = async () => {
  try {
    incomingPacket.value = await navigator.clipboard.readText();
    setStatus(t("Kaigi packet pasted from clipboard."));
  } catch (_error) {
    setError(t("Clipboard access failed. Paste the packet manually."));
  }
};

const pasteInviteFromClipboard = async () => {
  try {
    inviteInput.value = await navigator.clipboard.readText();
    setStatus(t("Meeting invite pasted from clipboard."));
  } catch (_error) {
    setError(t("Clipboard access failed. Paste the packet manually."));
  }
};

const clearPackets = () => {
  outgoingPacket.value = "";
  incomingPacket.value = "";
  setStatus(t("Packet buffers cleared."));
};

const parseScheduledStartMs = () => {
  const timestampMs = Date.parse(scheduledStartInput.value);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    throw new Error(t("Scheduled start is invalid."));
  }
  return timestampMs;
};

const setScheduledStartToNow = () => {
  scheduledStartInput.value = formatDateTimeLocalInput(Date.now());
};

const hydrateInvite = (invite: KaigiInvitePayload, rawInput: string) => {
  if (isKaigiInviteExpired(invite)) {
    throw new Error(t("This meeting invite has expired."));
  }
  clearHostMeetingState();
  resetSignalState();
  callMode.value = "join";
  parsedInvite.value = invite;
  inviteInput.value = rawInput.trim();
  manualRoomId.value = invite.callId;
  incomingPacket.value = stringifyKaigiSignalEnvelope(
    buildKaigiSignalEnvelope({
      kind: "offer",
      roomId: invite.callId,
      participantId: invite.hostParticipantId,
      participantName: invite.hostDisplayName,
      walletIdentity: invite.hostAccountId,
      description: invite.offerDescription,
      createdAtMs: invite.createdAtMs,
    }),
  );
  remoteParticipantName.value = invite.hostDisplayName;
  setStatus(
    invite.live
      ? t("Meeting invite loaded. Join when your media is ready.")
      : t("Meeting invite loaded. This meeting will use a manual answer fallback."),
  );
};

const loadInviteFromInput = () => {
  try {
    const invite = parseKaigiInviteInput(inviteInput.value);
    hydrateInvite(invite, inviteInput.value);
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Meeting invite link is invalid."),
    );
  }
};

const loadInviteFromLocationHash = () => {
  if (typeof window === "undefined" || !window.location.hash.includes("invite=")) {
    return;
  }
  try {
    const invite = parseKaigiInviteInput(window.location.href);
    if (
      parsedInvite.value?.callId === invite.callId &&
      parsedInvite.value.offerDescription.sdp === invite.offerDescription.sdp
    ) {
      return;
    }
    hydrateInvite(invite, window.location.hash.slice(1));
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Meeting invite link is invalid."),
    );
  }
};

const switchMode = (mode: "start" | "join") => {
  callMode.value = mode;
  if (mode === "start") {
    parsedInvite.value = null;
    inviteInput.value = "";
    manualRoomId.value = hostMeetingCallId.value || DEFAULT_ROOM_ID;
    setStatus(t("Create a meeting link to invite another wallet user."));
    return;
  }
  clearHostSignalPolling();
  setStatus(t("Paste or open a meeting invite to join."));
};

const createMeetingLink = async () => {
  if (!activeAccount.value) {
    setError(t("Save a wallet before using Kaigi."));
    return;
  }

  signalBusy.value = true;
  try {
    clearHostMeetingState();
    parsedInvite.value = null;
    resetSignalState();
    callMode.value = "start";

    const scheduledStartMs = parseScheduledStartMs();
    const createdAtMs = Date.now();
    const meetingCode = createMeetingCode();
    const callId = buildKaigiCallId(
      activeAccount.value.domain || "default",
      meetingCode,
    );
    manualRoomId.value = callId;
    hostMeetingCallId.value = callId;
    hostMeetingCode.value = meetingCode;
    hostMeetingCreatedAtMs.value = createdAtMs;
    hostLastSignalAtMs.value = createdAtMs;
    hostMeetingKeys.value = generateKaigiSignalKeyPair();

    const offerDescription = await createOfferPacket(callId);
    const invite: KaigiInvitePayload = {
      schema: KAIGI_INVITE_SCHEMA,
      callId,
      meetingCode,
      ...(meetingTitle.value.trim() ? { title: meetingTitle.value.trim() } : {}),
      hostAccountId: activeAccount.value.accountId,
      hostDisplayName: participantName.value,
      hostParticipantId: participantId.value,
      hostKaigiPublicKeyBase64Url: hostMeetingKeys.value.publicKeyBase64Url,
      scheduledStartMs,
      expiresAtMs: computeKaigiMeetingExpiryMs(scheduledStartMs),
      createdAtMs,
      live: false,
      offerDescription,
    };

    let liveMeeting = false;
    let automaticError = "";
    if (isLiveWallet.value) {
      try {
        await createKaigiMeeting({
          toriiUrl: session.connection.toriiUrl,
          chainId: session.connection.chainId,
          hostAccountId: activeAccount.value.accountId,
          privateKeyHex: activeAccount.value.privateKeyHex,
          callId,
          title: meetingTitle.value.trim() || undefined,
          scheduledStartMs,
        });
        liveMeeting = true;
      } catch (error) {
        automaticError =
          error instanceof Error
            ? error.message
            : t("Unable to create a live Kaigi meeting.");
      }
    }

    invite.live = liveMeeting;
    hostMeetingLive.value = liveMeeting;
    const inviteToken = encodeKaigiInvitePayload(invite);
    hostInviteDeepLink.value = buildKaigiInviteDeepLink(inviteToken);
    hostInviteHashRoute.value = buildKaigiInviteHashRoute(inviteToken);

    if (liveMeeting) {
      seenHostSignalHashes.clear();
      startHostSignalPolling();
      setStatus(t("Meeting link ready. Share it with the other participant."));
    } else {
      clearHostSignalPolling();
      setStatus(
        isLiveWallet.value
          ? t(
              "Meeting link ready. Automatic on-chain signaling is unavailable, so this meeting will use a manual answer fallback.",
            )
          : t(
              "Meeting link ready. This wallet is local only, so joining will use a manual answer fallback.",
            ),
      );
      if (automaticError) {
        errorMessage.value = t("Automatic meeting registration failed: {message}", {
          message: automaticError,
        });
      }
    }
  } catch (error) {
    clearHostMeetingState();
    setError(
      error instanceof Error
        ? error.message
        : t("Unable to create a Kaigi meeting link."),
    );
  } finally {
    signalBusy.value = false;
  }
};

const joinLoadedMeeting = async () => {
  const invite = parsedInvite.value;
  if (!invite) {
    setError(t("Load a meeting invite first."));
    return;
  }
  if (inviteExpired.value) {
    setError(t("This meeting invite has expired."));
    return;
  }

  signalBusy.value = true;
  try {
    manualRoomId.value = invite.callId;
    const answerDescription = await createAnswerPacketFromOffer({
      roomId: invite.callId,
      participantId: invite.hostParticipantId,
      participantName: invite.hostDisplayName,
      walletIdentity: invite.hostAccountId,
      createdAtMs: invite.createdAtMs,
      description: invite.offerDescription,
    });

    if (invite.live && isLiveWallet.value && activeAccount.value) {
      try {
        await joinKaigiMeeting({
          toriiUrl: session.connection.toriiUrl,
          chainId: session.connection.chainId,
          participantAccountId: activeAccount.value.accountId,
          privateKeyHex: activeAccount.value.privateKeyHex,
          callId: invite.callId,
          hostAccountId: invite.hostAccountId,
          hostKaigiPublicKeyBase64Url: invite.hostKaigiPublicKeyBase64Url,
          participantId: participantId.value,
          participantName: participantName.value,
          walletIdentity: walletIdentity.value || undefined,
          roomId: invite.callId,
          answerDescription,
        });
        setStatus(
          t(
            "Joined the meeting. Your encrypted answer was posted on-chain for the host to apply automatically.",
          ),
        );
      } catch (error) {
        setStatus(
          t(
            "Answer packet ready. Automatic join failed, so send the manual answer packet to the host.",
          ),
        );
        errorMessage.value = t("Automatic join failed: {message}", {
          message:
            error instanceof Error
              ? error.message
              : t("Unable to join the live Kaigi meeting."),
        });
      }
      return;
    }

    setStatus(t("Answer packet ready. Send it to the host manually."));
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Unable to create an answer."),
    );
  } finally {
    signalBusy.value = false;
  }
};

const createManualAnswerPacket = async () => {
  signalBusy.value = true;
  try {
    const remotePacket = readIncomingPacket("offer");
    await createAnswerPacketFromOffer({
      roomId: remotePacket.roomId,
      participantId: remotePacket.participantId,
      participantName: remotePacket.participantName,
      walletIdentity: remotePacket.walletIdentity,
      createdAtMs: remotePacket.createdAtMs,
      description: remotePacket.description as { type: "offer"; sdp: string },
    });
    setStatus(t("Manual answer packet ready. Send it to the host."));
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Unable to create an answer."),
    );
  } finally {
    signalBusy.value = false;
  }
};

const applyAnswerPacket = async () => {
  signalBusy.value = true;
  try {
    const remotePacket = readIncomingPacket("answer");
    await applyRemoteAnswerDescription(
      remotePacket.description as { type: "answer"; sdp: string },
      {
        participantName: remotePacket.participantName,
        participantId: remotePacket.participantId,
        walletIdentity: remotePacket.walletIdentity,
      },
    );
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Unable to apply the answer."),
    );
  } finally {
    signalBusy.value = false;
  }
};

const toggleAudio = () => {
  audioEnabled.value = !audioEnabled.value;
  attachLocalTrackStates();
};

const toggleVideo = () => {
  videoEnabled.value = !videoEnabled.value;
  attachLocalTrackStates();
};

const stopPreview = () => {
  stopStreamTracks(localStream.value);
  localStream.value = null;
  setStatus(t("Local preview stopped."));
};

const hangUp = async () => {
  const shouldEndLiveMeeting =
    callMode.value === "start" &&
    hostMeetingLive.value &&
    Boolean(activeAccount.value) &&
    Boolean(hostMeetingCallId.value);

  clearHostSignalPolling();
  resetSignalState();
  manualRoomId.value = parsedInvite.value?.callId || DEFAULT_ROOM_ID;

  if (shouldEndLiveMeeting && activeAccount.value) {
    try {
      await endKaigiMeeting({
        toriiUrl: session.connection.toriiUrl,
        chainId: session.connection.chainId,
        hostAccountId: activeAccount.value.accountId,
        privateKeyHex: activeAccount.value.privateKeyHex,
        callId: hostMeetingCallId.value,
      });
      setStatus(t("Meeting ended."));
    } catch (error) {
      setStatus(t("Meeting ended locally."));
      errorMessage.value = t("Unable to publish the meeting end signal: {message}", {
        message:
          error instanceof Error
            ? error.message
            : t("Unknown Kaigi end error"),
      });
    }
  } else {
    setStatus(t("Ready to prepare a Kaigi call."));
  }

  if (callMode.value === "start") {
    clearHostMeetingState();
  }
};

watch(
  () => activeAccount.value?.accountId,
  () => {
    clearHostSignalPolling();
  },
);

onMounted(() => {
  loadInviteFromLocationHash();
  window.addEventListener("hashchange", loadInviteFromLocationHash);
});

onBeforeUnmount(() => {
  window.removeEventListener("hashchange", loadInviteFromLocationHash);
  clearHostSignalPolling();
  resetSignalState();
  stopStreamTracks(localStream.value);
});
</script>

<style scoped>
.kaigi-layout {
  display: grid;
  gap: 1.4rem;
}

.kaigi-header {
  align-items: flex-start;
  gap: 1rem;
}

.kaigi-summary-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.kaigi-config-grid {
  display: grid;
  gap: 1.2rem;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.95fr);
}

.kaigi-config-pane,
.kaigi-status-pane {
  display: grid;
  gap: 1rem;
}

.kaigi-mode-toggle .secondary.active {
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.16);
}

.kaigi-config-form input[readonly],
.kaigi-config-form textarea[readonly] {
  opacity: 0.88;
}

.kaigi-wide-field,
.kaigi-link-field,
.kaigi-packet-field {
  display: grid;
  gap: 0.55rem;
}

.kaigi-wide-field {
  grid-column: 1 / -1;
}

.kaigi-input-with-action {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.kaigi-inline-actions,
.kaigi-primary-actions,
.kaigi-control-row,
.kaigi-signal-actions {
  flex-wrap: wrap;
}

.kaigi-link-box {
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: linear-gradient(135deg, var(--surface-soft), transparent 140%);
}

.kaigi-link-box-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.kaigi-link-box h3 {
  margin: 0;
}

.kaigi-link-box p {
  margin: 0.35rem 0 0;
}

.kaigi-link-field textarea,
.kaigi-config-form textarea,
.kaigi-packet-field textarea {
  width: 100%;
  resize: vertical;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(9, 13, 22, 0.7);
  color: inherit;
  padding: 0.9rem 1rem;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.45;
}

.kaigi-kpis {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kaigi-status-copy,
.kaigi-error {
  margin: 0;
}

.kaigi-error {
  color: var(--accent-danger, #ff8a80);
}

.kaigi-media-grid,
.kaigi-packet-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kaigi-video-shell {
  position: relative;
  overflow: hidden;
  min-height: 18rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1.25rem;
  background:
    radial-gradient(
      circle at top right,
      rgba(255, 190, 217, 0.2),
      transparent 36%
    ),
    linear-gradient(180deg, rgba(14, 18, 28, 0.72), rgba(7, 10, 16, 0.92));
}

.kaigi-video-meta {
  position: absolute;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;
}

.kaigi-video-shell video {
  width: 100%;
  min-height: 18rem;
  height: 100%;
  object-fit: cover;
  display: block;
  background: rgba(4, 6, 12, 0.82);
}

.kaigi-video-empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.45rem;
  padding: 1.5rem;
  text-align: center;
  background:
    radial-gradient(
      circle at center,
      rgba(255, 255, 255, 0.08),
      transparent 52%
    ),
    linear-gradient(180deg, rgba(14, 18, 28, 0.88), rgba(7, 10, 16, 0.94));
}

.kaigi-video-empty p {
  margin: 0;
}

.kaigi-advanced {
  display: grid;
  gap: 1rem;
}

.kaigi-advanced summary {
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  color: var(--iroha-muted);
}

.kaigi-advanced[open] {
  padding-top: 0.5rem;
}

@media (max-width: 1120px) {
  .kaigi-config-grid,
  .kaigi-media-grid,
  .kaigi-packet-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .kaigi-kpis,
  .kaigi-input-with-action {
    grid-template-columns: 1fr;
  }

  .kaigi-link-box-header,
  .kaigi-video-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .kaigi-video-shell,
  .kaigi-video-shell video {
    min-height: 14rem;
  }
}
</style>
