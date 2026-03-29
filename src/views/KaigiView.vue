<template>
  <div class="kaigi-layout">
    <section class="card kaigi-overview-card">
      <header class="card-header kaigi-header">
        <div>
          <h2>{{ t("Kaigi Room") }}</h2>
          <p class="helper">
            {{ t("Direct browser audio and video between two wallet users.") }}
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
        </div>
      </header>

      <div class="kaigi-config-grid">
        <div class="kaigi-config-pane">
          <div class="actions-row kaigi-mode-toggle">
            <button
              class="secondary"
              :class="{ active: callMode === 'start' }"
              type="button"
              @click="callMode = 'start'"
            >
              {{ t("Start call") }}
            </button>
            <button
              class="secondary"
              :class="{ active: callMode === 'join' }"
              type="button"
              @click="callMode = 'join'"
            >
              {{ t("Join call") }}
            </button>
          </div>

          <div class="form-grid kaigi-config-form">
            <label>
              {{ t("Room ID") }}
              <input v-model="roomId" />
            </label>
            <label>
              {{ t("Participant name") }}
              <input v-model="participantName" />
            </label>
            <label>
              {{ t("Participant ID") }}
              <input :value="participantId" readonly />
            </label>
            <label>
              {{ t("Wallet identity") }}
              <input :value="walletIdentity || t('Not connected')" readonly />
            </label>
          </div>

          <p class="helper">{{ modeHelperText }}</p>
          <p class="helper">
            {{
              t(
                "This Kaigi page uses manual offer and answer packets today, aligned with the sibling Sora Kaigi transport work.",
              )
            }}
          </p>

          <div class="kaigi-help-box">
            <h3>{{ t("How to join a Kaigi call") }}</h3>
            <p class="helper">
              {{
                t(
                  "The caller invites you by sending an offer packet through chat, email, or any other channel.",
                )
              }}
            </p>
            <ol class="kaigi-help-steps">
              <li>{{ t("Choose Join call and prepare your local media.") }}</li>
              <li>
                {{ t("Paste the caller's offer packet into Remote packet.") }}
              </li>
              <li>
                {{
                  t(
                    "Create your answer packet and send it back to the caller.",
                  )
                }}
              </li>
              <li>
                {{
                  t(
                    "Wait for the caller to apply your answer so the call can connect.",
                  )
                }}
              </li>
            </ol>
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
              <span class="kv-label">{{ t("Remote participant") }}</span>
              <span class="kv-value">{{
                remoteParticipantName || t("Waiting for the other wallet user.")
              }}</span>
            </div>
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
          <button type="button" :disabled="busy" @click="prepareLocalMedia">
            {{
              mediaBusy ? t("Preparing local media…") : t("Prepare local media")
            }}
          </button>
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
                t("Open local media before creating or answering a Kaigi call.")
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
          <h2>{{ t("Signal exchange") }}</h2>
          <p class="helper">{{ modeHelperText }}</p>
        </div>
        <div class="actions-row kaigi-signal-actions">
          <button
            type="button"
            :disabled="busy"
            @click="handlePrimarySignalAction"
          >
            {{ primaryActionLabel }}
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
          <button type="button" class="warn" @click="hangUp">
            {{ t("Hang up") }}
          </button>
        </div>
      </header>

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
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import {
  buildKaigiSignalEnvelope,
  normalizeKaigiParticipantId,
  parseKaigiSignalInput,
  stringifyKaigiSignalEnvelope,
} from "@/utils/kaigi";

const DEFAULT_ROOM_ID = "sakura-room";
const ICE_GATHERING_TIMEOUT_MS = 7_000;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  },
];

const session = useSessionStore();
const { t } = useAppI18n();
const activeAccount = computed(() => session.activeAccount);
const activeAccountDisplayId = computed(
  () =>
    activeAccount.value?.i105AccountId || activeAccount.value?.accountId || "",
);

const callMode = ref<"start" | "join">("start");
const roomId = ref(DEFAULT_ROOM_ID);
const participantNameDraft = ref("");
const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);
const localStream = shallowRef<MediaStream | null>(null);
const remoteStream = shallowRef<MediaStream | null>(null);
const peerConnection = shallowRef<RTCPeerConnection | null>(null);
const outgoingPacket = ref("");
const incomingPacket = ref("");
const remoteParticipantName = ref("");
const statusMessage = ref(t("Ready to prepare a Kaigi call."));
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
const primaryActionLabel = computed(() =>
  callMode.value === "start"
    ? t("Create offer packet")
    : t("Create answer packet"),
);
const modeHelperText = computed(() =>
  callMode.value === "start"
    ? t(
        "Create an offer, send it to the other wallet user, then apply their answer.",
      )
    : t("Paste the caller offer packet, create an answer, and send it back."),
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

const closePeerConnection = () => {
  const peer = peerConnection.value;
  if (!peer) {
    return;
  }
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
  peerConnection.value = null;
  syncPeerStateRefs(null);
  clearRemoteStream();
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
  closePeerConnection();
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

const readIncomingPacket = (expectedKind: "offer" | "answer") => {
  if (!incomingPacket.value.trim()) {
    throw new Error(t("Paste a Kaigi packet first."));
  }
  let packet;
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
      roomId.value = packet.roomId;
    }
  } else if (packet.roomId && packet.roomId !== roomId.value.trim()) {
    throw new Error(t("Signal packet room ID does not match this Kaigi room."));
  }
  remoteParticipantName.value =
    packet.participantName ||
    packet.participantId ||
    packet.walletIdentity ||
    t("Remote participant");
  return packet;
};

const handlePrimarySignalAction = async () => {
  if (callMode.value === "start") {
    await createOfferPacket();
    return;
  }
  await createAnswerPacket();
};

const createOfferPacket = async () => {
  signalBusy.value = true;
  try {
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
    outgoingPacket.value = stringifyKaigiSignalEnvelope(
      buildKaigiSignalEnvelope({
        kind: "offer",
        roomId: roomId.value,
        participantId: participantId.value,
        participantName: participantName.value,
        walletIdentity: walletIdentity.value,
        description,
      }),
    );
    setStatus(t("Offer packet ready. Send it to the other wallet user."));
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Unable to create an offer."),
    );
  } finally {
    signalBusy.value = false;
  }
};

const createAnswerPacket = async () => {
  signalBusy.value = true;
  try {
    const remotePacket = readIncomingPacket("offer");
    const peer = await createPeerConnection();
    await peer.setRemoteDescription(remotePacket.description);
    syncPeerStateRefs(peer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    syncPeerStateRefs(peer);
    await waitForIceGatheringComplete(peer);
    const description = peer.localDescription;
    if (!description?.sdp) {
      throw new Error(t("Answer packet is missing session data."));
    }
    outgoingPacket.value = stringifyKaigiSignalEnvelope(
      buildKaigiSignalEnvelope({
        kind: "answer",
        roomId: remotePacket.roomId || roomId.value.trim() || DEFAULT_ROOM_ID,
        participantId: participantId.value,
        participantName: participantName.value,
        walletIdentity: walletIdentity.value,
        description,
      }),
    );
    setStatus(t("Answer packet ready. Send it back to the caller."));
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
    const peer = peerConnection.value;
    if (!peer || !peer.localDescription) {
      throw new Error(t("Create offer packet first."));
    }
    const remotePacket = readIncomingPacket("answer");
    await peer.setRemoteDescription(remotePacket.description);
    syncPeerStateRefs(peer);
    setStatus(t("Answer applied. The call can connect now."));
  } catch (error) {
    setError(
      error instanceof Error ? error.message : t("Unable to apply the answer."),
    );
  } finally {
    signalBusy.value = false;
  }
};

const copyOutgoingPacket = async () => {
  if (!outgoingPacket.value) {
    setError(t("Create a Kaigi packet first."));
    return;
  }
  try {
    await navigator.clipboard.writeText(outgoingPacket.value);
    setStatus(t("Kaigi packet copied to clipboard."));
  } catch (_error) {
    setError(t("Clipboard access failed. Copy the packet manually."));
  }
};

const pasteIncomingPacket = async () => {
  try {
    incomingPacket.value = await navigator.clipboard.readText();
    setStatus(t("Kaigi packet pasted from clipboard."));
  } catch (_error) {
    setError(t("Clipboard access failed. Paste the packet manually."));
  }
};

const clearPackets = () => {
  outgoingPacket.value = "";
  incomingPacket.value = "";
  setStatus(t("Ready to prepare a Kaigi call."));
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

const hangUp = () => {
  closePeerConnection();
  outgoingPacket.value = "";
  incomingPacket.value = "";
  remoteParticipantName.value = "";
  setStatus(t("Ready to prepare a Kaigi call."));
};

onBeforeUnmount(() => {
  closePeerConnection();
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

.kaigi-help-box {
  display: grid;
  gap: 0.65rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: linear-gradient(135deg, var(--surface-soft), transparent 130%);
}

.kaigi-help-box h3 {
  margin: 0;
  font-size: 0.96rem;
}

.kaigi-help-steps {
  margin: 0;
  padding-inline-start: 1.25rem;
  display: grid;
  gap: 0.45rem;
  color: var(--iroha-muted);
  font-size: 0.9rem;
}

.kaigi-mode-toggle .secondary.active {
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.16);
}

.kaigi-config-form input[readonly] {
  opacity: 0.88;
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

.kaigi-control-row,
.kaigi-signal-actions {
  flex-wrap: wrap;
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

.kaigi-packet-field {
  display: grid;
  gap: 0.55rem;
}

.kaigi-packet-field textarea {
  min-height: 18rem;
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

@media (max-width: 1120px) {
  .kaigi-config-grid,
  .kaigi-media-grid,
  .kaigi-packet-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .kaigi-kpis {
    grid-template-columns: 1fr;
  }

  .kaigi-video-shell,
  .kaigi-video-shell video {
    min-height: 14rem;
  }
}
</style>
