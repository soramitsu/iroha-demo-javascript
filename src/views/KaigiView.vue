<template>
  <div class="kaigi-layout">
    <section class="card kaigi-call-card">
      <header class="card-header kaigi-call-header">
        <div>
          <h2>{{ t("Kaigi") }}</h2>
          <p class="helper kaigi-call-status">{{ statusMessage }}</p>
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
          <span
            class="pill"
            :class="{ positive: signalModeLabel !== t('Idle') }"
          >
            {{ signalModeLabel }}
          </span>
        </div>
      </header>

      <div class="kaigi-stage">
        <div class="kaigi-video-shell kaigi-remote-video">
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

        <div class="kaigi-video-shell kaigi-local-video">
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
                t(
                  "Open local media before creating or joining a Kaigi meeting.",
                )
              }}
            </p>
          </div>
        </div>
      </div>

      <div class="kaigi-call-control-bar">
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
      </div>

      <p v-if="errorMessage" class="helper kaigi-error">
        {{ errorMessage }}
      </p>
    </section>

    <section class="card kaigi-overview-card">
      <header class="card-header kaigi-header">
        <div>
          <h2>
            {{ callMode === "start" ? t("Start meeting") : t("Join meeting") }}
          </h2>
          <p class="helper">
            {{ t("Start or join a wallet-based meeting link.") }}
          </p>
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
              <input v-model="meetingTitle" />
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
            <label>
              {{ t("Meeting privacy") }}
              <select v-model="meetingPrivacyMode">
                <option value="private">{{ t("Private invite") }}</option>
                <option value="transparent">
                  {{ t("Transparent invite") }}
                </option>
              </select>
            </label>
            <label>
              {{ t("Peer identity reveal") }}
              <select v-model="peerIdentityReveal">
                <option value="Hidden">{{ t("Hidden") }}</option>
                <option value="RevealAfterJoin">
                  {{ t("Reveal after join") }}
                </option>
              </select>
            </label>
          </div>

          <div v-else class="form-grid kaigi-config-form">
            <label class="kaigi-wide-field">
              {{ t("Meeting invite") }}
              <textarea
                v-model="inviteInput"
                rows="5"
                spellcheck="false"
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
              <button
                type="button"
                :disabled="busy"
                @click="loadInviteFromInput"
              >
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
              <textarea
                :value="hostInviteDeepLink"
                rows="3"
                readonly
              ></textarea>
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
              <textarea
                :value="hostInviteHashRouteDisplay"
                rows="2"
                readonly
              ></textarea>
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
              <span
                class="pill"
                :class="{ positive: inviteCanUseAutomaticJoin }"
              >
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
                <span class="kv-value mono">{{
                  parsedInvite.meetingCode
                }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Host") }}</span>
                <span class="kv-value">{{
                  parsedInvite.hostDisplayName || t("Hidden")
                }}</span>
              </div>
              <div
                v-if="
                  parsedInvite.privacyMode === 'transparent' &&
                  parsedInvite.hostAccountId
                "
                class="kv"
              >
                <span class="kv-label">{{ t("Host wallet") }}</span>
                <span class="kv-value mono">{{
                  parsedInvite.hostAccountId
                }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Meeting privacy") }}</span>
                <span class="kv-value">{{
                  parsedInvite.privacyMode === "private"
                    ? t("Private invite")
                    : t("Transparent invite")
                }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ t("Peer identity reveal") }}</span>
                <span class="kv-value">{{
                  parsedInvite.peerIdentityReveal === "RevealAfterJoin"
                    ? t("Reveal after join")
                    : t("Hidden")
                }}</span>
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
          <details class="technical-details compact">
            <summary>{{ t("Connection details") }}</summary>
            <div class="kaigi-kpis">
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
            </div>
          </details>

          <div class="kaigi-media-setup">
            <div class="kaigi-link-box-header">
              <div>
                <h3>{{ t("Camera and mic") }}</h3>
                <p class="helper">{{ mediaSetupHint }}</p>
              </div>
              <span
                class="pill"
                :class="{ positive: localStreamReady && !mediaPreviewWarning }"
              >
                {{ mediaSetupStatusLabel }}
              </span>
            </div>
            <div class="kaigi-device-grid">
              <label>
                {{ t("Camera") }}
                <select
                  v-model="selectedVideoDeviceId"
                  :disabled="busy"
                  @change="handleMediaDeviceSelectionChange"
                >
                  <option :value="AUTO_VIDEO_DEVICE_ID">
                    {{ t("Auto-select camera") }}
                  </option>
                  <option value="">{{ t("Default camera") }}</option>
                  <option
                    v-for="device in videoInputDevices"
                    :key="device.deviceId || device.label"
                    :value="device.deviceId"
                  >
                    {{ device.label }}
                  </option>
                </select>
              </label>
              <label>
                {{ t("Microphone") }}
                <select
                  v-model="selectedAudioDeviceId"
                  :disabled="busy"
                  @change="handleMediaDeviceSelectionChange"
                >
                  <option value="">{{ t("Default microphone") }}</option>
                  <option
                    v-for="device in audioInputDevices"
                    :key="device.deviceId || device.label"
                    :value="device.deviceId"
                  >
                    {{ device.label }}
                  </option>
                </select>
              </label>
            </div>
            <div class="actions-row kaigi-inline-actions">
              <button
                type="button"
                class="secondary"
                :disabled="busy"
                @click="refreshMediaDevicesWithStatus"
              >
                {{ t("Refresh devices") }}
              </button>
              <button
                type="button"
                class="secondary"
                :disabled="busy"
                @click="findWorkingCamera"
              >
                {{ t("Find working camera") }}
              </button>
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
                signalBusy
                  ? t("Creating meeting link…")
                  : t("Create meeting link")
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
            <button
              type="button"
              class="secondary"
              :disabled="busy"
              @click="prepareLocalMedia"
            >
              {{
                mediaBusy
                  ? t("Preparing local media…")
                  : t("Turn on camera and mic")
              }}
            </button>
          </div>

          <p v-if="isLiveWallet" class="transaction-fee-note">
            <span>{{ t("Fee") }}</span>
            <strong>{{
              formatTransactionFee(
                transactionFeeHintForEndpoint(session.connection.toriiUrl),
                t,
              )
            }}</strong>
          </p>
          <div
            v-if="privateKaigiFundingPromptVisible"
            class="kaigi-private-funding-box"
          >
            <p class="helper">
              {{
                t(
                  "Private Kaigi needs shielded XOR before it can submit this action.",
                )
              }}
            </p>
            <p class="helper">
              {{ t("Shielded balance") }}:
              {{ privateKaigiFundingState?.shieldedBalance ?? t("—") }}
              ·
              {{ t("Transparent XOR balance") }}:
              {{ privateKaigiFundingState?.transparentBalance ?? t("0") }}
            </p>
            <p
              v-if="privateKaigiFundingState?.message"
              class="helper kaigi-error"
            >
              {{ privateKaigiFundingState.message }}
            </p>
            <p class="transaction-fee-note">
              <span>{{ t("Fee") }}</span>
              <strong>{{
                formatTransactionFee(
                  transactionFeeHintForEndpoint(session.connection.toriiUrl),
                  t,
                )
              }}</strong>
            </p>
            <div class="actions-row kaigi-inline-actions">
              <button
                v-if="privateKaigiFundingState?.canSelfShield"
                type="button"
                :disabled="busy"
                @click="selfShieldPrivateKaigiAndRetry"
              >
                {{
                  privateKaigiShieldBusy
                    ? t("Self-shielding XOR for private Kaigi…")
                    : t("Self-shield {amount} XOR and retry", {
                        amount: privateKaigiRetryShieldAmount,
                      })
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="card kaigi-signal-card">
      <details
        class="kaigi-advanced"
        :open="advancedSignalsOpen"
        @toggle="handleAdvancedSignalsToggle"
      >
        <summary class="kaigi-advanced-summary">
          <span class="kaigi-advanced-copy">
            <span class="section-label">{{ t("Advanced signaling") }}</span>
            <span class="kaigi-advanced-title">{{
              t("Show raw packets")
            }}</span>
            <span class="helper">
              {{
                t(
                  "Use this only when a wallet is local-only or automatic Kaigi signaling is unavailable.",
                )
              }}
            </span>
          </span>
          <span class="kaigi-advanced-caret" aria-hidden="true"></span>
        </summary>
        <div class="kaigi-advanced-body">
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
            <button
              type="button"
              class="secondary"
              @click="pasteIncomingPacket"
            >
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
                name="kaigiOutgoingPacket"
                autocomplete="off"
                readonly
                rows="14"
                spellcheck="false"
                translate="no"
              ></textarea>
            </label>
            <label class="kaigi-packet-field">
              {{ t("Remote packet") }}
              <textarea
                v-model="incomingPacket"
                name="kaigiIncomingPacket"
                autocomplete="off"
                rows="14"
                spellcheck="false"
                translate="no"
              ></textarea>
            </label>
          </div>
        </div>
      </details>
    </section>

    <div
      v-if="hostPromptVisible"
      class="kaigi-host-modal-backdrop"
      @click.self="dismissHostPrompt"
      @keydown.esc.stop.prevent="dismissHostPrompt"
    >
      <div
        class="card kaigi-host-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kaigi-host-modal-title"
        aria-describedby="kaigi-host-modal-detail"
        tabindex="-1"
      >
        <p class="kaigi-host-modal-label">{{ t("Host prompt") }}</p>
        <h2 id="kaigi-host-modal-title" class="kaigi-host-modal-title">
          {{ hostPromptTitle }}
        </h2>
        <p id="kaigi-host-modal-detail" class="helper kaigi-host-modal-detail">
          {{ hostPromptDetail }}
        </p>
        <div class="actions-row kaigi-host-modal-actions">
          <button
            v-if="hostPromptKind === 'answerReady'"
            ref="hostPromptPrimaryButton"
            type="button"
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
            v-else
            ref="hostPromptPrimaryButton"
            type="button"
            :disabled="busy"
            @click="dismissHostPrompt"
          >
            {{ t("I will keep this window open") }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="openAdvancedSignaling"
          >
            {{
              hostPromptKind === "answerReady"
                ? t("Later")
                : t("Show Advanced signaling")
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  createKaigiMeeting,
  endKaigiMeeting,
  generateKaigiSignalKeyPair,
  getPrivateKaigiConfidentialXorState,
  getKaigiCall,
  joinKaigiMeeting,
  pollKaigiMeetingSignals,
  selfShieldPrivateKaigiXor,
  stopWatchingKaigiCallEvents,
  watchKaigiCallEvents,
} from "@/services/iroha";
import { useKaigiStore } from "@/stores/kaigi";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import type {
  KaigiCallEvent,
  KaigiMeetingPrivacy,
  KaigiMeetingView,
  KaigiPeerIdentityReveal,
  KaigiMeetingSignalRecord,
  KaigiSignalKeyPair,
  PrivateKaigiConfidentialXorState,
} from "@/types/iroha";
import {
  buildKaigiSignalEnvelope,
  mergeKaigiRemoteTrackIntoStream,
  normalizeKaigiParticipantId,
  parseKaigiSignalInput,
  stringifyKaigiSignalEnvelope,
  type ParsedKaigiSignalInput,
} from "@/utils/kaigi";
import {
  KAIGI_INVITE_SCHEMA,
  buildKaigiCompactInviteDeepLink,
  buildKaigiCompactInviteHashRoute,
  buildKaigiCompactInvitePayload,
  buildKaigiCallId,
  buildKaigiInviteDeepLink,
  buildKaigiInviteHashRoute,
  computeKaigiMeetingExpiryMs,
  createKaigiInviteSecretBase64Url,
  encodeKaigiInvitePayload,
  isKaigiInviteExpired,
  parseKaigiInviteInput,
  type KaigiInvitePayload,
  type ParsedKaigiInviteInput,
} from "@/utils/kaigiInvite";
import {
  sanitizeErrorMessage,
  toUserFacingErrorMessage,
} from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";

const DEFAULT_ROOM_ID = "sakura-room";
const ICE_GATHERING_TIMEOUT_MS = 7_000;
const DEFAULT_KAIGI_CALL_DOMAIN = "kaigi.universal";
type HostPromptKind = "meetingReady" | "answerReady";
type LoadedKaigiInvite = {
  source: "legacy" | "compact";
  callId: string;
  meetingCode: string;
  title?: string;
  hostAccountId?: string;
  hostDisplayName?: string;
  hostParticipantId?: string;
  hostKaigiPublicKeyBase64Url: string;
  scheduledStartMs: number;
  expiresAtMs: number;
  createdAtMs: number;
  live: boolean;
  ended?: boolean;
  endedAtMs?: number;
  privacyMode: KaigiMeetingPrivacy;
  peerIdentityReveal: KaigiPeerIdentityReveal;
  rosterRootHex?: string;
  offerDescription: {
    type: "offer";
    sdp: string;
  };
};
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  },
];
const LOCAL_PREVIEW_READY_TIMEOUT_MS = 4_000;
const LOCAL_PREVIEW_PLAY_ATTEMPT_TIMEOUT_MS = 750;
const AUTO_VIDEO_DEVICE_ID = "__kaigi_auto_camera__";
const PREVIEW_NOT_READY_ERROR_NAME = "PreviewNotReadyError";

type MediaDeviceChoice = {
  deviceId: string;
  label: string;
};
type MediaErrorKind =
  | "permission"
  | "no-device"
  | "preview"
  | "unavailable"
  | "unknown";

const padDateTimePart = (value: number) => String(value).padStart(2, "0");

const formatDateTimeLocalInput = (value: number) => {
  const date = new Date(value);
  return (
    [
      date.getFullYear(),
      padDateTimePart(date.getMonth() + 1),
      padDateTimePart(date.getDate()),
    ].join("-") +
    `T${padDateTimePart(date.getHours())}:${padDateTimePart(date.getMinutes())}`
  );
};

const createMeetingCode = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid.replace(/-/g, "").slice(0, 8).toLowerCase();
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0").slice(0, 8);
};

const session = useSessionStore();
const kaigiStore = useKaigiStore();
if (!kaigiStore.hydrated) {
  kaigiStore.hydrate();
}
const { d, t } = useAppI18n();
const activeAccount = computed(() => session.activeAccount);
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);

const callMode = ref<"start" | "join">("start");
const meetingTitle = ref("");
const meetingPrivacyMode = ref<KaigiMeetingPrivacy>("private");
const peerIdentityReveal = ref<KaigiPeerIdentityReveal>("Hidden");
const inviteInput = ref("");
const participantNameDraft = ref("");
const scheduledStartInput = ref(formatDateTimeLocalInput(Date.now()));
const hostMeetingCallId = ref("");
const hostMeetingCode = ref("");
const hostMeetingLive = ref(false);
const hostInviteDeepLink = ref("");
const hostInviteHashRoute = ref("");
const hostInviteSecretBase64Url = ref("");
const hostMeetingKeys = shallowRef<KaigiSignalKeyPair | null>(null);
const hostMeetingCreatedAtMs = ref(0);
const hostLastSignalAtMs = ref(0);
const manualRoomId = ref(DEFAULT_ROOM_ID);
const parsedInvite = shallowRef<LoadedKaigiInvite | null>(null);
const advancedSignalsOpen = ref(false);
const hostPromptKind = ref<HostPromptKind | null>(null);
const lastHostPromptedAnswerPacket = ref("");
const hostPromptPrimaryButton = ref<HTMLButtonElement | null>(null);

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);
const localStream = shallowRef<MediaStream | null>(null);
const remoteStream = shallowRef<MediaStream | null>(null);
const peerConnection = shallowRef<RTCPeerConnection | null>(null);

const outgoingPacket = ref("");
const incomingPacket = ref("");
const remoteParticipantName = ref("");
const statusMessage = ref(
  t("Create a meeting link to invite another wallet user."),
);
const errorMessage = ref("");
const audioEnabled = ref(true);
const videoEnabled = ref(true);
const mediaBusy = ref(false);
const mediaDeviceRefreshBusy = ref(false);
const signalBusy = ref(false);
const privateKaigiShieldBusy = ref(false);
const videoInputDevices = ref<MediaDeviceChoice[]>([]);
const audioInputDevices = ref<MediaDeviceChoice[]>([]);
const selectedVideoDeviceId = ref(AUTO_VIDEO_DEVICE_ID);
const selectedAudioDeviceId = ref("");
const lastMediaErrorKind = ref<MediaErrorKind | null>(null);
const activeMediaVideoLabel = ref("");
const activeMediaAudioLabel = ref("");
const privateKaigiFundingState =
  shallowRef<PrivateKaigiConfidentialXorState | null>(null);
const privateKaigiPendingAction = ref<"create" | "join" | null>(null);
const privateKaigiRetryShieldAmount = ref("");
const signalingState = ref<RTCSignalingState | "idle" | "closed">("idle");
const iceGatheringState = ref<RTCIceGatheringState | "idle">("idle");
const iceConnectionState = ref<RTCIceConnectionState | "idle">("idle");
const peerConnectionState = ref<RTCPeerConnectionState | "idle" | "closed">(
  "idle",
);

let hostSignalPollBusy = false;
let hostSignalWatchId: string | null = null;
let hostPromptPreviousFocus: HTMLElement | null = null;
const seenHostSignalHashes = new Set<string>();

const participantName = computed({
  get: () =>
    participantNameDraft.value.trim() ||
    activeAccount.value?.displayName ||
    activeAccount.value?.accountId ||
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
const busy = computed(
  () =>
    mediaBusy.value ||
    mediaDeviceRefreshBusy.value ||
    signalBusy.value ||
    privateKaigiShieldBusy.value,
);
const localStreamReady = computed(() => Boolean(localStream.value));
const mediaPreviewWarning = computed(
  () => lastMediaErrorKind.value === "preview",
);
const isLiveWallet = computed(() =>
  Boolean(activeAccount.value && !activeAccount.value.localOnly),
);
const privateKaigiFundingPromptVisible = computed(() =>
  Boolean(privateKaigiPendingAction.value && privateKaigiFundingState.value),
);
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
const mediaSetupStatusLabel = computed(() => {
  if (mediaBusy.value) {
    return t("Finding camera");
  }
  if (localStreamReady.value && !mediaPreviewWarning.value) {
    return t("Preview live");
  }
  if (lastMediaErrorKind.value === "permission") {
    return t("Permission needed");
  }
  if (lastMediaErrorKind.value === "preview") {
    return t("No video frames");
  }
  if (lastMediaErrorKind.value === "no-device") {
    return t("No devices");
  }
  if (videoInputDevices.value.length || audioInputDevices.value.length) {
    return t("Devices found");
  }
  return t("Not checked");
});
const mediaSetupHint = computed(() => {
  if (mediaBusy.value) {
    return t("Checking cameras and microphones.");
  }
  if (lastMediaErrorKind.value === "permission") {
    return t(
      "Allow Camera and Microphone for this app in System Settings, then retry.",
    );
  }
  if (lastMediaErrorKind.value === "preview") {
    return t(
      "No working camera produced video. Close apps using the camera, then find a working camera again.",
    );
  }
  if (lastMediaErrorKind.value === "no-device") {
    return t("No camera or microphone device was found.");
  }
  if (localStreamReady.value) {
    return activeMediaVideoLabel.value
      ? t("Using {camera}. Create or join when ready.", {
          camera: activeMediaVideoLabel.value,
        })
      : t("Preview is live. Create or join when ready.");
  }
  return t("Kaigi will try each camera and use the first one with video.");
});
const hostPromptVisible = computed(() => hostPromptKind.value !== null);
const hostPromptTitle = computed(() =>
  hostPromptKind.value === "answerReady"
    ? t("Participant answer ready")
    : t("Host checklist"),
);
const hostPromptDetail = computed(() => {
  if (hostPromptKind.value === "answerReady") {
    return t(
      "The guest answer packet is ready. Apply it now so audio and video can start.",
    );
  }
  return hostMeetingLive.value
    ? t(
        "Keep this host window open after sharing the invite. If the guest joins but remote media does not appear, open Advanced signaling and apply the answer packet.",
      )
    : t(
        "Keep this host window open after sharing the invite. When the guest joins, open Advanced signaling and apply the answer packet they send you.",
      );
});

watch(hostPromptVisible, async (visible) => {
  if (visible) {
    hostPromptPreviousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    await nextTick();
    hostPromptPrimaryButton.value?.focus();
    return;
  }

  const previousFocus = hostPromptPreviousFocus;
  hostPromptPreviousFocus = null;
  await nextTick();
  previousFocus?.focus();
});

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

const clearPrivateKaigiFundingPrompt = () => {
  privateKaigiFundingState.value = null;
  privateKaigiPendingAction.value = null;
  privateKaigiRetryShieldAmount.value = "";
};

const isPrivateKaigiFundingError = (message: string) =>
  /shielded xor/i.test(message);

const parsePrivateKaigiRequiredShieldAmount = (message: string) => {
  const match = /needs\s+([0-9]+(?:\.[0-9]+)?)\s+shielded xor/i.exec(message);
  if (!match) {
    return "1";
  }
  const [, rawAmount] = match;
  const [whole, fractional = ""] = rawAmount.split(".");
  if (!fractional || /^0+$/.test(fractional)) {
    return whole;
  }
  return String(BigInt(whole || "0") + 1n);
};

const preparePrivateKaigiFundingPrompt = async (
  action: "create" | "join",
  message: string,
) => {
  if (!activeAccount.value || !isLiveWallet.value) {
    return false;
  }
  if (!isPrivateKaigiFundingError(message)) {
    return false;
  }
  privateKaigiPendingAction.value = action;
  privateKaigiRetryShieldAmount.value =
    parsePrivateKaigiRequiredShieldAmount(message);
  try {
    privateKaigiFundingState.value = await getPrivateKaigiConfidentialXorState({
      toriiUrl: session.connection.toriiUrl,
      accountId: activeAccount.value.accountId,
    });
  } catch {
    privateKaigiFundingState.value = null;
  }
  return true;
};

const setStatus = (message: string) => {
  statusMessage.value = message;
  errorMessage.value = "";
};

const setError = (message: string) => {
  statusMessage.value = "";
  errorMessage.value = sanitizeErrorMessage(message);
};

const dismissHostPrompt = () => {
  hostPromptKind.value = null;
};

const openAdvancedSignaling = () => {
  advancedSignalsOpen.value = true;
  dismissHostPrompt();
};

const handleAdvancedSignalsToggle = (event: Event) => {
  advancedSignalsOpen.value = (event.currentTarget as HTMLDetailsElement).open;
};

const maybePromptHostForAnswerPacket = () => {
  if (callMode.value !== "start") {
    return;
  }
  if (
    !peerConnection.value?.localDescription ||
    peerConnection.value?.remoteDescription
  ) {
    return;
  }
  const packet = incomingPacket.value.trim();
  if (!packet || packet === lastHostPromptedAnswerPacket.value) {
    return;
  }
  try {
    const parsed = parseKaigiSignalInput(packet, "answer");
    if (parsed.kind !== "answer") {
      return;
    }
  } catch (_error) {
    return;
  }
  lastHostPromptedAnswerPacket.value = packet;
  hostPromptKind.value = "answerReady";
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

const toMediaDeviceChoice = (
  device: MediaDeviceInfo,
  index: number,
  fallbackLabel: string,
): MediaDeviceChoice => ({
  deviceId: device.deviceId,
  label: device.label || fallbackLabel,
});

const pruneSelectedMediaDevice = (
  selectedDeviceId: typeof selectedVideoDeviceId,
  devices: MediaDeviceChoice[],
  fallbackValue = "",
) => {
  if (
    selectedDeviceId.value !== AUTO_VIDEO_DEVICE_ID &&
    selectedDeviceId.value &&
    !devices.some((device) => device.deviceId === selectedDeviceId.value)
  ) {
    selectedDeviceId.value = fallbackValue;
  }
};

const refreshMediaDevices = async (announce = false) => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    if (announce) {
      setError(t("Kaigi media is unavailable in this environment."));
    }
    return;
  }

  mediaDeviceRefreshBusy.value = true;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoInputDevices.value = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) =>
        toMediaDeviceChoice(
          device,
          index,
          t("Camera {number}", { number: index + 1 }),
        ),
      );
    audioInputDevices.value = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) =>
        toMediaDeviceChoice(
          device,
          index,
          t("Microphone {number}", { number: index + 1 }),
        ),
      );
    pruneSelectedMediaDevice(
      selectedVideoDeviceId,
      videoInputDevices.value,
      AUTO_VIDEO_DEVICE_ID,
    );
    pruneSelectedMediaDevice(selectedAudioDeviceId, audioInputDevices.value);
    if (announce) {
      setStatus(t("Media devices refreshed."));
    }
  } catch (error) {
    if (announce) {
      setError(
        t("Unable to refresh media devices: {message}", {
          message:
            error instanceof Error && error.message
              ? error.message
              : t("unknown"),
        }),
      );
    }
  } finally {
    mediaDeviceRefreshBusy.value = false;
  }
};

const refreshMediaDevicesWithStatus = async () => {
  await refreshMediaDevices(true);
};

const buildAudioMediaConstraint = (): boolean | MediaTrackConstraints => {
  if (!audioEnabled.value) {
    return false;
  }
  return selectedAudioDeviceId.value
    ? { deviceId: { exact: selectedAudioDeviceId.value } }
    : true;
};

const normalizeVideoDeviceId = (deviceId: string) =>
  deviceId === AUTO_VIDEO_DEVICE_ID ? "" : deviceId;

const buildVideoMediaConstraint = (
  deviceId = selectedVideoDeviceId.value,
): false | MediaTrackConstraints => {
  if (!videoEnabled.value) {
    return false;
  }
  const normalizedDeviceId = normalizeVideoDeviceId(deviceId);
  return {
    ...(normalizedDeviceId ? { deviceId: { exact: normalizedDeviceId } } : {}),
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
  };
};

const isLocalVideoPreviewReady = (videoElement: HTMLVideoElement) =>
  videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
  videoElement.videoWidth > 0 &&
  videoElement.videoHeight > 0;

const waitForLocalVideoPreview = async () => {
  if (!videoEnabled.value) {
    return true;
  }
  await nextTick();
  const videoElement = localVideoRef.value;
  if (!videoElement) {
    return true;
  }
  if (isLocalVideoPreviewReady(videoElement)) {
    return true;
  }

  await Promise.race([
    videoElement.play().catch(() => {}),
    new Promise<void>((resolve) =>
      window.setTimeout(resolve, LOCAL_PREVIEW_PLAY_ATTEMPT_TIMEOUT_MS),
    ),
  ]);
  if (isLocalVideoPreviewReady(videoElement)) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      eventNames.forEach((eventName) =>
        videoElement.removeEventListener(eventName, checkReady),
      );
    };
    const finish = (ready: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(ready);
    };
    const checkReady = () => {
      if (isLocalVideoPreviewReady(videoElement)) {
        finish(true);
      }
    };
    const eventNames = [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "playing",
      "resize",
    ];
    const timeoutId = window.setTimeout(
      () => finish(isLocalVideoPreviewReady(videoElement)),
      LOCAL_PREVIEW_READY_TIMEOUT_MS,
    );
    eventNames.forEach((eventName) =>
      videoElement.addEventListener(eventName, checkReady),
    );
    videoElement.requestVideoFrameCallback?.(() => checkReady());
    checkReady();
  });
};

const createPreviewNotReadyError = () => {
  const error = new Error(
    t(
      "Camera opened but no video frames arrived. Choose another camera, close apps using the camera, then retry.",
    ),
  );
  error.name = PREVIEW_NOT_READY_ERROR_NAME;
  return error;
};

const isRecoverableCameraFailure = (error: unknown) => {
  const mediaError = error as DOMException | Error | undefined;
  return (
    mediaError?.name === PREVIEW_NOT_READY_ERROR_NAME ||
    mediaError?.name === "NotFoundError" ||
    mediaError?.name === "OverconstrainedError"
  );
};

const getMediaTrackLabel = (stream: MediaStream, kind: "audio" | "video") => {
  const track =
    kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
  return String(track?.label ?? "").trim();
};

const getVideoDeviceLabel = (deviceId: string) =>
  videoInputDevices.value.find((device) => device.deviceId === deviceId)
    ?.label || "";

const getAudioDeviceLabel = (deviceId: string) =>
  audioInputDevices.value.find((device) => device.deviceId === deviceId)
    ?.label || "";

const getCameraFallbackPriority = (device: MediaDeviceChoice) => {
  const label = device.label.toLowerCase();
  if (/facetime|built-?in|integrated/.test(label)) {
    return 0;
  }
  if (/virtual|webcam utility|obs|continuity|snap camera/.test(label)) {
    return 2;
  }
  return 1;
};

const buildAutoVideoDeviceCandidates = () => {
  const candidates = [""];
  if (videoInputDevices.value.length > 1) {
    [...videoInputDevices.value]
      .sort((left, right) => {
        const priorityDelta =
          getCameraFallbackPriority(left) - getCameraFallbackPriority(right);
        return priorityDelta || left.label.localeCompare(right.label);
      })
      .forEach((device) => {
        if (device.deviceId && !candidates.includes(device.deviceId)) {
          candidates.push(device.deviceId);
        }
      });
  }
  return candidates;
};

const openLocalMediaAttempt = async (videoDeviceId: string) => {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioMediaConstraint(),
      video: buildVideoMediaConstraint(videoDeviceId),
    });
    localStream.value = stream;
    attachLocalTrackStates();
    await refreshMediaDevices();
    const videoPreviewReady = await waitForLocalVideoPreview();
    if (!videoPreviewReady) {
      throw createPreviewNotReadyError();
    }
    activeMediaVideoLabel.value =
      getVideoDeviceLabel(videoDeviceId) ||
      getMediaTrackLabel(stream, "video") ||
      t("Camera");
    activeMediaAudioLabel.value =
      getAudioDeviceLabel(selectedAudioDeviceId.value) ||
      getMediaTrackLabel(stream, "audio") ||
      t("Microphone");
    return stream;
  } catch (error) {
    stopStreamTracks(stream);
    if (localStream.value === stream) {
      localStream.value = null;
    }
    throw error;
  }
};

const openLocalMediaWithAutoCamera = async () => {
  const candidates = buildAutoVideoDeviceCandidates();
  let lastRecoverableError: unknown = null;
  for (const candidate of candidates) {
    try {
      const stream = await openLocalMediaAttempt(candidate);
      selectedVideoDeviceId.value = candidate || AUTO_VIDEO_DEVICE_ID;
      return stream;
    } catch (error) {
      if (!isRecoverableCameraFailure(error)) {
        throw error;
      }
      lastRecoverableError = error;
    }
  }

  lastMediaErrorKind.value = "preview";
  throw (
    lastRecoverableError ??
    new Error(
      t(
        "No working camera produced video frames. Close other camera apps, then retry.",
      ),
    )
  );
};

const clearRemoteStream = () => {
  stopStreamTracks(remoteStream.value);
  remoteStream.value = null;
};

const clearHostSignalPolling = () => {
  if (hostSignalWatchId) {
    stopWatchingKaigiCallEvents(hostSignalWatchId);
    hostSignalWatchId = null;
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
  hostInviteSecretBase64Url.value = "";
  hostMeetingKeys.value = null;
  hostMeetingCreatedAtMs.value = 0;
  hostLastSignalAtMs.value = 0;
  dismissHostPrompt();
};

const removePersistedHostSession = (callId = hostMeetingCallId.value) => {
  if (!activeAccount.value || !callId) {
    return;
  }
  kaigiStore.removeHostSession(activeAccount.value.accountId, callId);
};

const savePersistedHostSession = (input: {
  callId: string;
  meetingCode: string;
  inviteSecretBase64Url: string;
  hostKaigiKeys: KaigiSignalKeyPair;
  createdAtMs: number;
  scheduledStartMs: number;
  expiresAtMs: number;
  title?: string;
  live: boolean;
  privacyMode: KaigiMeetingPrivacy;
  peerIdentityReveal: KaigiPeerIdentityReveal;
}) => {
  if (!activeAccount.value) {
    return;
  }
  kaigiStore.saveHostSession({
    accountId: activeAccount.value.accountId,
    callId: input.callId,
    meetingCode: input.meetingCode,
    inviteSecretBase64Url: input.inviteSecretBase64Url,
    hostKaigiKeys: input.hostKaigiKeys,
    createdAtMs: input.createdAtMs,
    scheduledStartMs: input.scheduledStartMs,
    expiresAtMs: input.expiresAtMs,
    ...(input.title ? { title: input.title } : {}),
    live: input.live,
    privacyMode: input.privacyMode,
    peerIdentityReveal: input.peerIdentityReveal,
  });
};

const toLoadedInviteFromLegacyPayload = (
  invite: KaigiInvitePayload,
): LoadedKaigiInvite => ({
  source: "legacy",
  callId: invite.callId,
  meetingCode: invite.meetingCode,
  ...(invite.title ? { title: invite.title } : {}),
  hostAccountId: invite.hostAccountId,
  hostDisplayName: invite.hostDisplayName,
  hostParticipantId: invite.hostParticipantId,
  hostKaigiPublicKeyBase64Url: invite.hostKaigiPublicKeyBase64Url,
  scheduledStartMs: invite.scheduledStartMs,
  expiresAtMs: invite.expiresAtMs,
  createdAtMs: invite.createdAtMs,
  live: invite.live,
  privacyMode: "transparent",
  peerIdentityReveal: "RevealAfterJoin",
  offerDescription: invite.offerDescription,
});

const toLoadedInviteFromMeetingView = (
  invite: KaigiMeetingView,
): LoadedKaigiInvite => ({
  source: "compact",
  callId: invite.callId,
  meetingCode: invite.meetingCode,
  ...(invite.title ? { title: invite.title } : {}),
  ...(invite.hostAccountId ? { hostAccountId: invite.hostAccountId } : {}),
  ...(invite.hostDisplayName
    ? { hostDisplayName: invite.hostDisplayName }
    : {}),
  ...(invite.hostParticipantId
    ? { hostParticipantId: invite.hostParticipantId }
    : {}),
  hostKaigiPublicKeyBase64Url: invite.hostKaigiPublicKeyBase64Url,
  scheduledStartMs: invite.scheduledStartMs,
  expiresAtMs: invite.expiresAtMs,
  createdAtMs: invite.createdAtMs,
  live: invite.live,
  ...(invite.ended ? { ended: invite.ended } : {}),
  ...(invite.endedAtMs ? { endedAtMs: invite.endedAtMs } : {}),
  privacyMode: invite.privacyMode,
  peerIdentityReveal: invite.peerIdentityReveal,
  rosterRootHex: invite.rosterRootHex,
  offerDescription: invite.offerDescription,
});

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
  lastHostPromptedAnswerPacket.value = "";
  dismissHostPrompt();
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
    lastMediaErrorKind.value = "unavailable";
    throw new Error(t("Kaigi media is unavailable in this environment."));
  }
  lastMediaErrorKind.value = null;
  activeMediaVideoLabel.value = "";
  activeMediaAudioLabel.value = "";
  await refreshMediaDevices();
  try {
    return selectedVideoDeviceId.value === AUTO_VIDEO_DEVICE_ID &&
      videoEnabled.value
      ? await openLocalMediaWithAutoCamera()
      : await openLocalMediaAttempt(selectedVideoDeviceId.value);
  } catch (error) {
    const mediaError = error as DOMException | Error;
    if (mediaError?.name === "NotAllowedError") {
      lastMediaErrorKind.value = "permission";
      throw new Error(
        t(
          "Camera or microphone permission was denied. Allow Camera and Microphone for this app in System Settings, then retry.",
        ),
      );
    }
    if (mediaError?.name === "NotFoundError") {
      lastMediaErrorKind.value = "no-device";
      throw new Error(t("No camera or microphone device is available."));
    }
    if (mediaError?.name === "OverconstrainedError") {
      lastMediaErrorKind.value = "no-device";
      throw new Error(
        t(
          "Selected camera or microphone is unavailable. Choose another device.",
        ),
      );
    }
    if (mediaError?.name === PREVIEW_NOT_READY_ERROR_NAME) {
      lastMediaErrorKind.value = "preview";
    } else if (lastMediaErrorKind.value !== "preview") {
      lastMediaErrorKind.value = "unknown";
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
    remoteStream.value = mergeKaigiRemoteTrackIntoStream(
      remoteStream.value,
      event,
    );
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
      toUserFacingErrorMessage(
        error,
        t("Kaigi media is unavailable in this environment."),
      ),
    );
  } finally {
    mediaBusy.value = false;
  }
};

const retryLocalMedia = async () => {
  stopStreamTracks(localStream.value);
  localStream.value = null;
  await prepareLocalMedia();
};

const findWorkingCamera = async () => {
  selectedVideoDeviceId.value = AUTO_VIDEO_DEVICE_ID;
  await retryLocalMedia();
};

const handleMediaDeviceSelectionChange = async () => {
  if (!localStream.value) {
    lastMediaErrorKind.value = null;
    setStatus(t("Media device selection updated."));
    return;
  }
  await retryLocalMedia();
};

const buildOutgoingPacket = (input: {
  kind: "offer" | "answer";
  roomId: string;
  description: RTCSessionDescriptionInit;
  createdAtMs?: number;
  walletIdentity?: string;
}) =>
  stringifyKaigiSignalEnvelope(
    buildKaigiSignalEnvelope({
      kind: input.kind,
      roomId: input.roomId,
      participantId: participantId.value,
      participantName: participantName.value,
      walletIdentity: input.walletIdentity ?? walletIdentity.value,
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

const createOfferPacket = async (
  roomId: string,
  options?: { localWalletIdentity?: string },
) => {
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
    walletIdentity: options?.localWalletIdentity,
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
    localWalletIdentity?: string;
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
    walletIdentity: offerPacket.localWalletIdentity,
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
  if (
    options?.participantName ||
    options?.participantId ||
    options?.walletIdentity
  ) {
    remoteParticipantName.value =
      options.participantName ||
      options.participantId ||
      options.walletIdentity ||
      remoteParticipantName.value;
  }
  if (options?.packet) {
    incomingPacket.value = options.packet;
  }
  dismissHostPrompt();
  setStatus(
    options?.statusMessage || t("Answer applied. The call can connect now."),
  );
};

const applyPolledAnswerSignal = async (signal: KaigiMeetingSignalRecord) => {
  const packet = stringifyKaigiSignalEnvelope(
    buildKaigiSignalEnvelope({
      kind: "answer",
      roomId: signal.roomId || signal.callId,
      participantId: signal.participantId,
      participantName: signal.participantName,
      walletIdentity: signal.walletIdentity,
      description: signal.answerDescription,
      createdAtMs: signal.createdAtMs,
    }),
  );
  await applyRemoteAnswerDescription(signal.answerDescription, {
    participantName: signal.participantName,
    participantId: signal.participantId,
    walletIdentity: signal.walletIdentity,
    packet,
    statusMessage: t("Participant answer detected and applied automatically."),
  });
};

const startHostSignalWatch = async () => {
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
  const callId = hostMeetingCallId.value;
  const hostKaigiKeys = hostMeetingKeys.value;

  const checkSignals = async () => {
    if (hostSignalPollBusy) {
      return;
    }
    hostSignalPollBusy = true;
    try {
      const signals = await pollKaigiMeetingSignals({
        toriiUrl: session.connection.toriiUrl,
        accountId: hostAccountId,
        callId,
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
      // Keep automatic watch silent so temporary Torii lag does not block the manual fallback.
    } finally {
      hostSignalPollBusy = false;
    }
  };

  await checkSignals();
  if (!hostMeetingLive.value || !hostMeetingCallId.value) {
    return;
  }

  hostSignalWatchId = await watchKaigiCallEvents(
    {
      toriiUrl: session.connection.toriiUrl,
      callId,
    },
    async (event: KaigiCallEvent) => {
      if (event.kind === "ended") {
        clearHostSignalPolling();
        return;
      }
      await checkSignals();
    },
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
  await copyText(
    hostInviteDeepLink.value,
    t("Meeting invite copied to clipboard."),
  );
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
  lastHostPromptedAnswerPacket.value = "";
  if (hostPromptKind.value === "answerReady") {
    dismissHostPrompt();
  }
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

const hydrateInvite = (invite: LoadedKaigiInvite, rawInput: string) => {
  if (isKaigiInviteExpired(invite)) {
    throw new Error(t("This meeting invite has expired."));
  }
  if (invite.ended) {
    throw new Error(t("This meeting has already ended."));
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
      participantId: invite.hostParticipantId || "host",
      participantName: invite.hostDisplayName || t("Host"),
      walletIdentity:
        invite.privacyMode === "transparent" ? invite.hostAccountId : undefined,
      description: invite.offerDescription,
      createdAtMs: invite.createdAtMs,
    }),
  );
  remoteParticipantName.value = invite.hostDisplayName || t("Host");
  setStatus(
    invite.live
      ? t("Meeting invite loaded. Join when your media is ready.")
      : t(
          "Meeting invite loaded. This meeting will use a manual answer fallback.",
        ),
  );
};

const resolveParsedInviteInput = async (
  parsed: ParsedKaigiInviteInput,
): Promise<LoadedKaigiInvite> => {
  if (parsed.kind === "legacy") {
    return toLoadedInviteFromLegacyPayload(parsed.payload);
  }
  const meeting = await getKaigiCall({
    toriiUrl: session.connection.toriiUrl,
    callId: parsed.payload.callId,
    inviteSecretBase64Url: parsed.payload.inviteSecretBase64Url,
  });
  return toLoadedInviteFromMeetingView(meeting);
};

const loadInviteFromInput = async () => {
  signalBusy.value = true;
  try {
    const parsed = parseKaigiInviteInput(inviteInput.value);
    const invite = await resolveParsedInviteInput(parsed);
    hydrateInvite(invite, inviteInput.value);
  } catch (error) {
    setError(
      toUserFacingErrorMessage(error, t("Meeting invite link is invalid.")),
    );
  } finally {
    signalBusy.value = false;
  }
};

const loadInviteFromLocationHash = () => {
  if (
    typeof window === "undefined" ||
    (!window.location.hash.includes("invite=") &&
      !window.location.hash.includes("call="))
  ) {
    return;
  }
  signalBusy.value = true;
  void (async () => {
    try {
      const parsed = parseKaigiInviteInput(window.location.href);
      const invite = await resolveParsedInviteInput(parsed);
      if (
        parsedInvite.value?.callId === invite.callId &&
        parsedInvite.value.offerDescription.sdp === invite.offerDescription.sdp
      ) {
        return;
      }
      hydrateInvite(invite, window.location.hash.slice(1));
    } catch (error) {
      setError(
        toUserFacingErrorMessage(error, t("Meeting invite link is invalid.")),
      );
    } finally {
      signalBusy.value = false;
    }
  })();
};

const switchMode = (mode: "start" | "join") => {
  callMode.value = mode;
  advancedSignalsOpen.value = false;
  clearPrivateKaigiFundingPrompt();
  dismissHostPrompt();
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

const restoreHostOfferFromMeeting = async (invite: KaigiMeetingView) => {
  const peer = await createPeerConnection();
  await peer.setLocalDescription(invite.offerDescription);
  syncPeerStateRefs(peer);
  outgoingPacket.value = buildOutgoingPacket({
    kind: "offer",
    roomId: invite.callId,
    description: invite.offerDescription,
    createdAtMs: invite.createdAtMs,
    walletIdentity:
      invite.privacyMode === "transparent"
        ? walletIdentity.value || undefined
        : undefined,
  });
};

const restoreLatestHostMeetingSession = async () => {
  if (
    !activeAccount.value ||
    parsedInvite.value ||
    hostMeetingCallId.value ||
    callMode.value === "join"
  ) {
    return;
  }
  kaigiStore.pruneExpired();
  const sessionRecord = kaigiStore.findLatestActiveHostSession(
    activeAccount.value.accountId,
  );
  if (!sessionRecord?.live) {
    return;
  }

  signalBusy.value = true;
  try {
    const meeting = await getKaigiCall({
      toriiUrl: session.connection.toriiUrl,
      callId: sessionRecord.callId,
      inviteSecretBase64Url: sessionRecord.inviteSecretBase64Url,
    });
    if (meeting.ended || isKaigiInviteExpired(meeting)) {
      removePersistedHostSession(sessionRecord.callId);
      return;
    }

    clearHostMeetingState();
    resetSignalState();
    callMode.value = "start";
    hostMeetingCallId.value = sessionRecord.callId;
    hostMeetingCode.value = sessionRecord.meetingCode;
    hostMeetingLive.value = true;
    hostInviteSecretBase64Url.value = sessionRecord.inviteSecretBase64Url;
    hostInviteDeepLink.value = buildKaigiCompactInviteDeepLink(
      buildKaigiCompactInvitePayload(
        sessionRecord.callId,
        sessionRecord.inviteSecretBase64Url,
      ),
    );
    hostInviteHashRoute.value = buildKaigiCompactInviteHashRoute(
      buildKaigiCompactInvitePayload(
        sessionRecord.callId,
        sessionRecord.inviteSecretBase64Url,
      ),
    );
    hostMeetingKeys.value = sessionRecord.hostKaigiKeys;
    hostMeetingCreatedAtMs.value = sessionRecord.createdAtMs;
    hostLastSignalAtMs.value = sessionRecord.createdAtMs;
    meetingTitle.value = meeting.title || "";
    scheduledStartInput.value = formatDateTimeLocalInput(
      meeting.scheduledStartMs,
    );
    meetingPrivacyMode.value = sessionRecord.privacyMode;
    peerIdentityReveal.value = sessionRecord.peerIdentityReveal;
    manualRoomId.value = sessionRecord.callId;
    await restoreHostOfferFromMeeting(meeting);
    seenHostSignalHashes.clear();
    void startHostSignalWatch();
    setStatus(t("Resumed active meeting link."));
  } catch (_error) {
    // If the call can no longer be resolved, drop the stale local session quietly.
    removePersistedHostSession(sessionRecord.callId);
  } finally {
    signalBusy.value = false;
  }
};

const createMeetingLink = async () => {
  if (!activeAccount.value) {
    setError(t("Save a wallet before using Kaigi."));
    return;
  }

  signalBusy.value = true;
  try {
    clearPrivateKaigiFundingPrompt();
    clearHostMeetingState();
    parsedInvite.value = null;
    resetSignalState();
    callMode.value = "start";

    const scheduledStartMs = parseScheduledStartMs();
    const createdAtMs = Date.now();
    const expiresAtMs = computeKaigiMeetingExpiryMs(scheduledStartMs);
    const meetingCode = createMeetingCode();
    const callId = buildKaigiCallId(DEFAULT_KAIGI_CALL_DOMAIN, meetingCode);
    const inviteSecretBase64Url = createKaigiInviteSecretBase64Url();
    manualRoomId.value = callId;
    hostMeetingCallId.value = callId;
    hostMeetingCode.value = meetingCode;
    hostInviteSecretBase64Url.value = inviteSecretBase64Url;
    hostMeetingCreatedAtMs.value = createdAtMs;
    hostLastSignalAtMs.value = createdAtMs;
    hostMeetingKeys.value = generateKaigiSignalKeyPair();

    const offerDescription = await createOfferPacket(callId, {
      localWalletIdentity:
        meetingPrivacyMode.value === "transparent"
          ? walletIdentity.value || undefined
          : undefined,
    });
    const legacyInvite: KaigiInvitePayload = {
      schema: KAIGI_INVITE_SCHEMA,
      callId,
      meetingCode,
      ...(meetingTitle.value.trim()
        ? { title: meetingTitle.value.trim() }
        : {}),
      hostAccountId: activeAccount.value.accountId,
      hostDisplayName: participantName.value,
      hostParticipantId: participantId.value,
      hostKaigiPublicKeyBase64Url: hostMeetingKeys.value.publicKeyBase64Url,
      scheduledStartMs,
      expiresAtMs,
      createdAtMs,
      live: false,
      offerDescription,
    };

    let liveMeeting = false;
    let liveMeetingResult: Awaited<
      ReturnType<typeof createKaigiMeeting>
    > | null = null;
    let automaticError = "";
    if (isLiveWallet.value) {
      try {
        liveMeetingResult = await createKaigiMeeting({
          toriiUrl: session.connection.toriiUrl,
          chainId: session.connection.chainId,
          hostAccountId: activeAccount.value.accountId,
          privateKeyHex: activeAccount.value.privateKeyHex,
          callId,
          title: meetingTitle.value.trim() || undefined,
          scheduledStartMs,
          meetingCode,
          inviteSecretBase64Url,
          hostDisplayName: participantName.value,
          hostParticipantId: participantId.value,
          hostKaigiPublicKeyBase64Url: hostMeetingKeys.value.publicKeyBase64Url,
          offerDescription,
          privacyMode: meetingPrivacyMode.value,
          peerIdentityReveal: peerIdentityReveal.value,
        });
        liveMeeting = true;
      } catch (error) {
        automaticError = toUserFacingErrorMessage(
          error,
          t("Unable to create a live Kaigi meeting."),
        );
        if (
          meetingPrivacyMode.value === "private" &&
          (await preparePrivateKaigiFundingPrompt("create", automaticError))
        ) {
          setStatus(
            t(
              "Private Kaigi needs shielded XOR before it can submit this action.",
            ),
          );
          errorMessage.value = automaticError;
          return;
        }
      }
    }

    legacyInvite.live = liveMeeting;
    hostMeetingLive.value = liveMeeting;

    if (liveMeeting) {
      const compactInvite = buildKaigiCompactInvitePayload(
        callId,
        inviteSecretBase64Url,
      );
      hostInviteDeepLink.value = buildKaigiCompactInviteDeepLink(compactInvite);
      hostInviteHashRoute.value =
        buildKaigiCompactInviteHashRoute(compactInvite);
      savePersistedHostSession({
        callId,
        meetingCode,
        inviteSecretBase64Url,
        hostKaigiKeys: hostMeetingKeys.value,
        createdAtMs,
        scheduledStartMs,
        expiresAtMs,
        title: meetingTitle.value.trim() || undefined,
        live: true,
        privacyMode: meetingPrivacyMode.value,
        peerIdentityReveal: peerIdentityReveal.value,
      });
      seenHostSignalHashes.clear();
      void startHostSignalWatch();
      setStatus(
        appendTransactionFee(
          t("Meeting link ready. Share it with the other participant."),
          liveMeetingResult,
          t,
          transactionFeeHintForEndpoint(session.connection.toriiUrl),
        ),
      );
    } else {
      const inviteToken = encodeKaigiInvitePayload(legacyInvite);
      hostInviteDeepLink.value = buildKaigiInviteDeepLink(inviteToken);
      hostInviteHashRoute.value = buildKaigiInviteHashRoute(inviteToken);
      removePersistedHostSession(callId);
      clearHostSignalPolling();
      setStatus(
        isLiveWallet.value
          ? meetingPrivacyMode.value === "private"
            ? t(
                "Meeting link ready. Private automatic signaling is unavailable, so this meeting will use a transparent manual answer fallback.",
              )
            : t(
                "Meeting link ready. Automatic on-chain signaling is unavailable, so this meeting will use a manual answer fallback.",
              )
          : t(
              "Meeting link ready. This wallet is local only, so joining will use a manual answer fallback.",
            ),
      );
      if (automaticError) {
        errorMessage.value = t(
          meetingPrivacyMode.value === "private"
            ? "Automatic private meeting registration failed: {message}. Share the manual invite instead. This fallback does not preserve private on-chain signaling."
            : "Automatic meeting registration failed: {message}",
          {
            message: automaticError,
          },
        );
      }
    }
    hostPromptKind.value = "meetingReady";
  } catch (error) {
    clearHostMeetingState();
    setError(
      toUserFacingErrorMessage(
        error,
        t("Unable to create a Kaigi meeting link."),
      ),
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
    clearPrivateKaigiFundingPrompt();
    manualRoomId.value = invite.callId;
    const answerDescription = await createAnswerPacketFromOffer({
      roomId: invite.callId,
      participantId: invite.hostParticipantId || "host",
      participantName: invite.hostDisplayName || t("Host"),
      walletIdentity:
        invite.privacyMode === "transparent" ? invite.hostAccountId : undefined,
      createdAtMs: invite.createdAtMs,
      localWalletIdentity:
        invite.privacyMode === "transparent" ||
        invite.peerIdentityReveal === "RevealAfterJoin"
          ? walletIdentity.value || undefined
          : undefined,
      description: invite.offerDescription,
    });

    if (invite.live && isLiveWallet.value && activeAccount.value) {
      try {
        const result = await joinKaigiMeeting({
          toriiUrl: session.connection.toriiUrl,
          chainId: session.connection.chainId,
          participantAccountId: activeAccount.value.accountId,
          privateKeyHex: activeAccount.value.privateKeyHex,
          callId: invite.callId,
          hostAccountId: invite.hostAccountId,
          hostKaigiPublicKeyBase64Url: invite.hostKaigiPublicKeyBase64Url,
          participantId: participantId.value,
          participantName: participantName.value,
          walletIdentity:
            invite.privacyMode === "transparent" ||
            invite.peerIdentityReveal === "RevealAfterJoin"
              ? walletIdentity.value || undefined
              : undefined,
          roomId: invite.callId,
          privacyMode: invite.privacyMode,
          rosterRootHex: invite.rosterRootHex,
          answerDescription,
        });
        setStatus(
          appendTransactionFee(
            t(
              "Joined the meeting. Your encrypted answer was posted on-chain for the host to apply automatically.",
            ),
            result,
            t,
            transactionFeeHintForEndpoint(session.connection.toriiUrl),
          ),
        );
      } catch (error) {
        const automaticJoinError = toUserFacingErrorMessage(
          error,
          t("Unable to join the live Kaigi meeting."),
        );
        if (
          invite.privacyMode === "private" &&
          (await preparePrivateKaigiFundingPrompt("join", automaticJoinError))
        ) {
          setStatus(
            t(
              "Private Kaigi needs shielded XOR before it can submit this action.",
            ),
          );
          errorMessage.value = automaticJoinError;
          return;
        }
        setStatus(
          invite.privacyMode === "private"
            ? t(
                "Answer packet ready. Private automatic join failed, so send the manual answer packet to the host. This fallback does not preserve private on-chain signaling.",
              )
            : t(
                "Answer packet ready. Automatic join failed, so send the manual answer packet to the host.",
              ),
        );
        errorMessage.value = t("Automatic join failed: {message}", {
          message: automaticJoinError,
        });
        if (invite.privacyMode === "private") {
          errorMessage.value = t(
            "Automatic private join failed: {message}. Send the manual answer packet instead; this fallback does not preserve private on-chain signaling.",
            {
              message: automaticJoinError,
            },
          );
        }
      }
      return;
    }

    setStatus(t("Answer packet ready. Send it to the host manually."));
  } catch (error) {
    setError(toUserFacingErrorMessage(error, t("Unable to create an answer.")));
  } finally {
    signalBusy.value = false;
  }
};

const selfShieldPrivateKaigiAndRetry = async () => {
  if (!activeAccount.value || !privateKaigiPendingAction.value) {
    return;
  }
  privateKaigiShieldBusy.value = true;
  try {
    const retryAction = privateKaigiPendingAction.value;
    const result = await selfShieldPrivateKaigiXor({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      accountId: activeAccount.value.accountId,
      privateKeyHex: activeAccount.value.privateKeyHex,
      amount: privateKaigiRetryShieldAmount.value || "1",
    });
    const fundingMessage = appendTransactionFee(
      t("Private Kaigi funding transaction submitted."),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
    clearPrivateKaigiFundingPrompt();
    if (retryAction === "create") {
      await createMeetingLink();
    } else {
      await joinLoadedMeeting();
    }
    setStatus(
      statusMessage.value
        ? `${fundingMessage} ${statusMessage.value}`
        : fundingMessage,
    );
  } catch (error) {
    errorMessage.value = toUserFacingErrorMessage(
      error,
      t("Unable to self-shield XOR for private Kaigi."),
    );
  } finally {
    privateKaigiShieldBusy.value = false;
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
    setError(toUserFacingErrorMessage(error, t("Unable to create an answer.")));
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
    setError(toUserFacingErrorMessage(error, t("Unable to apply the answer.")));
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
  lastMediaErrorKind.value = null;
  activeMediaVideoLabel.value = "";
  activeMediaAudioLabel.value = "";
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
  advancedSignalsOpen.value = false;
  manualRoomId.value = parsedInvite.value?.callId || DEFAULT_ROOM_ID;

  if (shouldEndLiveMeeting && activeAccount.value) {
    try {
      const result = await endKaigiMeeting({
        toriiUrl: session.connection.toriiUrl,
        chainId: session.connection.chainId,
        hostAccountId: activeAccount.value.accountId,
        privateKeyHex: activeAccount.value.privateKeyHex,
        callId: hostMeetingCallId.value,
      });
      setStatus(
        appendTransactionFee(
          t("Meeting ended."),
          result,
          t,
          transactionFeeHintForEndpoint(session.connection.toriiUrl),
        ),
      );
    } catch (error) {
      setStatus(t("Meeting ended locally."));
      errorMessage.value = t(
        "Unable to publish the meeting end signal: {message}",
        {
          message: toUserFacingErrorMessage(
            error,
            t("Unknown Kaigi end error"),
          ),
        },
      );
    }
  } else {
    setStatus(t("Ready to prepare a Kaigi call."));
  }

  if (callMode.value === "start") {
    removePersistedHostSession();
    clearHostMeetingState();
  }
};

watch(
  () => activeAccount.value?.accountId,
  () => {
    clearHostSignalPolling();
    void restoreLatestHostMeetingSession();
  },
);

watch(
  [
    incomingPacket,
    callMode,
    () => peerConnection.value?.localDescription,
    () => peerConnection.value?.remoteDescription,
  ],
  () => {
    maybePromptHostForAnswerPacket();
  },
);

onMounted(() => {
  void refreshMediaDevices();
  loadInviteFromLocationHash();
  window.addEventListener("hashchange", loadInviteFromLocationHash);
  if (
    typeof window !== "undefined" &&
    !window.location.hash.includes("invite=") &&
    !window.location.hash.includes("call=")
  ) {
    void restoreLatestHostMeetingSession();
  }
});

onBeforeUnmount(() => {
  hostPromptPreviousFocus = null;
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
  --kaigi-ink: #151f2a;
  --kaigi-indigo: #1f3454;
  --kaigi-vermilion: #d94332;
  --kaigi-brass: #b9a16d;
  --kaigi-brass-dark: #816b45;
  --kaigi-panel-bg:
    linear-gradient(
      135deg,
      rgba(255, 254, 246, 0.95),
      rgba(236, 222, 194, 0.84) 58%,
      rgba(245, 240, 225, 0.9)
    ),
    repeating-linear-gradient(
      90deg,
      rgba(31, 52, 84, 0.045) 0 1px,
      transparent 1px 9px
    ),
    #f4ecda;
  --kaigi-panel-border: rgba(169, 145, 98, 0.78);
  --kaigi-panel-shadow:
    0 26px 46px rgba(37, 30, 20, 0.18), 0 10px 24px rgba(149, 34, 35, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  --kaigi-control-bg:
    linear-gradient(
      180deg,
      rgba(255, 252, 239, 0.94),
      rgba(220, 204, 167, 0.86)
    ),
    #eadfca;
  --kaigi-control-border: rgba(143, 119, 74, 0.68);
  --kaigi-field-bg:
    linear-gradient(
      180deg,
      rgba(255, 250, 238, 0.98),
      rgba(233, 224, 205, 0.92)
    ),
    #f4ead7;
  --kaigi-stage-bg:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.055) 0 1px,
      transparent 1px 7px
    ),
    linear-gradient(135deg, #273243, #0b1018 64%, #05070d);
}

:global(:root[data-theme="dark"]) .kaigi-layout {
  --kaigi-ink: #f3ead7;
  --kaigi-indigo: #3f5f8f;
  --kaigi-brass: #c4aa73;
  --kaigi-brass-dark: #7b6742;
  --kaigi-panel-bg:
    linear-gradient(145deg, rgba(21, 28, 40, 0.96), rgba(23, 18, 23, 0.92)),
    repeating-linear-gradient(
      90deg,
      rgba(224, 195, 132, 0.06) 0 1px,
      transparent 1px 9px
    ),
    rgba(10, 14, 22, 0.94);
  --kaigi-panel-border: rgba(194, 169, 112, 0.24);
  --kaigi-panel-shadow:
    0 26px 52px rgba(0, 0, 0, 0.42), 0 10px 26px rgba(217, 67, 50, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  --kaigi-control-bg:
    linear-gradient(180deg, rgba(37, 45, 56, 0.94), rgba(22, 26, 34, 0.92)),
    #1b222d;
  --kaigi-control-border: rgba(194, 169, 112, 0.26);
  --kaigi-field-bg:
    linear-gradient(180deg, rgba(28, 35, 45, 0.96), rgba(13, 18, 26, 0.92)),
    #151d29;
  --kaigi-stage-bg:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.04) 0 1px,
      transparent 1px 7px
    ),
    linear-gradient(135deg, #1a2330, #070a10 64%, #030408);
}

.kaigi-call-card,
.kaigi-overview-card,
.kaigi-signal-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: var(--kaigi-panel-bg);
  border-color: var(--kaigi-panel-border);
  box-shadow: var(--kaigi-panel-shadow);
}

.kaigi-call-card::before,
.kaigi-overview-card::before,
.kaigi-signal-card::before {
  content: "";
  position: absolute;
  inset: 0.55rem;
  z-index: 0;
  border-radius: 6px;
  pointer-events: none;
  background:
    radial-gradient(
      circle at 0.7rem 0.7rem,
      rgba(51, 43, 31, 0.82) 0 2px,
      rgba(221, 202, 153, 0.92) 2px 5px,
      transparent 5.5px
    ),
    radial-gradient(
      circle at calc(100% - 0.7rem) 0.7rem,
      rgba(51, 43, 31, 0.82) 0 2px,
      rgba(221, 202, 153, 0.92) 2px 5px,
      transparent 5.5px
    ),
    radial-gradient(
      circle at 0.7rem calc(100% - 0.7rem),
      rgba(51, 43, 31, 0.72) 0 2px,
      rgba(221, 202, 153, 0.82) 2px 5px,
      transparent 5.5px
    ),
    radial-gradient(
      circle at calc(100% - 0.7rem) calc(100% - 0.7rem),
      rgba(51, 43, 31, 0.72) 0 2px,
      rgba(221, 202, 153, 0.82) 2px 5px,
      transparent 5.5px
    );
  opacity: 0.78;
}

.kaigi-call-card > *,
.kaigi-overview-card > *,
.kaigi-signal-card > * {
  position: relative;
  z-index: 1;
}

.kaigi-call-card {
  display: grid;
  gap: 1rem;
  padding: 1.12rem;
  border-width: 1px;
}

.kaigi-call-header {
  padding: 0.35rem 0.5rem 0.8rem;
  border-bottom: 1px solid rgba(143, 119, 74, 0.28);
}

.kaigi-call-status {
  max-width: 72ch;
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

.kaigi-summary-pills .pill {
  border-radius: 6px;
  border-color: rgba(22, 31, 42, 0.34);
  background:
    linear-gradient(180deg, rgba(15, 24, 34, 0.96), rgba(6, 10, 15, 0.94)),
    #0d131b;
  color: #f7dfaa;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 8px rgba(0, 0, 0, 0.5);
}

.kaigi-summary-pills .pill::before {
  content: "";
  width: 0.48rem;
  height: 0.48rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #7d6b45;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.kaigi-summary-pills .pill.positive {
  color: #ffd9b5;
  border-color: rgba(217, 67, 50, 0.45);
  background:
    linear-gradient(180deg, rgba(41, 18, 17, 0.96), rgba(14, 8, 8, 0.96)),
    #160b0b;
}

.kaigi-summary-pills .pill.positive::before {
  background: #ff5a3f;
  box-shadow:
    0 0 10px rgba(255, 90, 63, 0.85),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35);
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
  border-color: rgba(136, 46, 39, 0.72);
  background:
    linear-gradient(180deg, #ef7464, #d94332 70%, #a82d26),
    var(--kaigi-vermilion);
  color: #fffaf0;
  text-shadow: 0 1px 0 rgba(55, 14, 12, 0.45);
}

.kaigi-mode-toggle {
  width: fit-content;
  padding: 0.28rem;
  border: 1px solid var(--kaigi-control-border);
  border-radius: 8px;
  background: var(--kaigi-control-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.44),
    inset 0 -1px 0 rgba(92, 72, 45, 0.22),
    0 10px 18px rgba(37, 30, 20, 0.08);
}

.kaigi-mode-toggle .secondary {
  min-height: 2.25rem;
  border-radius: 6px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.kaigi-config-form input[readonly],
.kaigi-config-form textarea[readonly] {
  opacity: 0.88;
}

.kaigi-config-form label,
.kaigi-device-grid label {
  font-weight: 700;
}

.kaigi-config-form input,
.kaigi-config-form select,
.kaigi-device-grid select {
  width: 100%;
  border-color: var(--kaigi-control-border);
  border-radius: 8px;
  background: var(--kaigi-field-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.46),
    inset 0 2px 6px rgba(64, 45, 20, 0.08),
    0 10px 22px rgba(39, 56, 96, 0.08);
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
  border: 1px solid var(--kaigi-control-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.24), transparent 52%),
    var(--kaigi-control-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 rgba(82, 63, 37, 0.16);
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

.kaigi-host-modal-backdrop {
  position: fixed;
  inset: 16px;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px;
  border-radius: 32px;
  background: color-mix(in srgb, var(--surface-base) 42%, transparent);
  backdrop-filter: blur(18px) saturate(145%);
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  overscroll-behavior: contain;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--glass-border) 72%, transparent),
    0 22px 48px color-mix(in srgb, #000 24%, transparent);
}

.kaigi-host-modal {
  width: min(100%, 460px);
  display: grid;
  gap: 0.9rem;
  padding: 1.4rem;
}

.kaigi-host-modal-label,
.kaigi-host-modal-title,
.kaigi-host-modal-detail {
  margin: 0;
}

.kaigi-host-modal-label {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  color: var(--iroha-muted);
}

.kaigi-host-modal-title {
  font-size: clamp(1.25rem, 3vw, 1.55rem);
}

.kaigi-host-modal-detail {
  max-width: 38ch;
}

.kaigi-host-modal-actions {
  flex-wrap: wrap;
}

.kaigi-link-field textarea,
.kaigi-config-form textarea,
.kaigi-packet-field textarea {
  width: 100%;
  resize: vertical;
  border-radius: 8px;
  border: 1px solid var(--kaigi-control-border);
  background: var(--kaigi-field-bg);
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

.kaigi-media-setup {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--kaigi-control-border);
  border-radius: 8px;
  background:
    repeating-linear-gradient(
      0deg,
      rgba(21, 31, 42, 0.035) 0 1px,
      transparent 1px 8px
    ),
    var(--kaigi-control-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.44),
    inset 0 -1px 0 rgba(92, 72, 45, 0.18);
}

.kaigi-media-setup h3 {
  margin: 0;
}

.kaigi-device-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kaigi-device-grid label {
  display: grid;
  gap: 0.35rem;
}

.kaigi-device-grid select {
  min-width: 0;
}

.kaigi-status-copy,
.kaigi-error {
  margin: 0;
}

.kaigi-private-funding-box {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  border: 1px solid rgba(255, 208, 140, 0.28);
  background: rgba(39, 26, 8, 0.42);
}

.kaigi-error {
  color: var(--accent-danger, #ff8a80);
}

.kaigi-packet-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kaigi-stage {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: clamp(28rem, 62vh, 46rem);
  padding: 1.08rem;
  border-radius: 8px;
  background: var(--kaigi-stage-bg);
  border: 1px solid rgba(22, 31, 42, 0.72);
  box-shadow:
    inset 0 0 0 4px rgba(221, 202, 153, 0.28),
    inset 0 0 0 7px rgba(7, 10, 15, 0.84),
    inset 0 18px 22px rgba(255, 255, 255, 0.08),
    inset 0 -20px 28px rgba(0, 0, 0, 0.52),
    0 24px 44px rgba(20, 16, 10, 0.28);
}

.kaigi-stage::before {
  content: "";
  position: absolute;
  inset: 1.08rem;
  z-index: 4;
  pointer-events: none;
  border-radius: 6px;
  background:
    linear-gradient(
      118deg,
      rgba(255, 255, 255, 0.2),
      transparent 18%,
      transparent 68%,
      rgba(255, 255, 255, 0.08)
    ),
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.055) 0 1px,
      transparent 1px 4px
    ),
    radial-gradient(circle at 50% 45%, transparent 56%, rgba(0, 0, 0, 0.34));
  mix-blend-mode: screen;
  opacity: 0.56;
}

.kaigi-stage::after {
  content: "";
  position: absolute;
  top: 1.55rem;
  bottom: 1.55rem;
  left: 0.42rem;
  z-index: 3;
  width: 0.38rem;
  border-radius: 999px;
  background: repeating-linear-gradient(
    180deg,
    rgba(225, 207, 160, 0.72) 0 5px,
    rgba(78, 63, 41, 0.52) 5px 9px
  );
}

.kaigi-video-shell {
  position: relative;
  overflow: hidden;
  min-height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background:
    radial-gradient(
      circle at top right,
      rgba(255, 76, 102, 0.16),
      transparent 36%
    ),
    linear-gradient(180deg, rgba(12, 18, 32, 0.86), rgba(5, 7, 13, 0.96));
}

.kaigi-remote-video {
  position: absolute;
  inset: 1.08rem;
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.68),
    0 0 0 1px rgba(222, 203, 156, 0.18);
}

.kaigi-local-video {
  position: absolute;
  right: 2rem;
  bottom: 2rem;
  z-index: 6;
  width: min(28%, 22rem);
  min-width: 13rem;
  min-height: 8.2rem;
  aspect-ratio: 16 / 10;
  border: 4px solid #121a26;
  box-shadow:
    0 0 0 2px rgba(222, 203, 156, 0.66),
    0 18px 32px rgba(0, 0, 0, 0.38),
    inset 0 0 18px rgba(0, 0, 0, 0.48);
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
  color: #fff;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.45);
}

.kaigi-video-meta > span {
  max-width: min(28rem, 48%);
  padding: 0.38rem 0.58rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(20, 25, 32, 0.88), rgba(5, 8, 12, 0.78)),
    rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.kaigi-video-meta .helper {
  color: rgba(255, 255, 255, 0.76);
}

.kaigi-video-shell video {
  width: 100%;
  min-height: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: rgba(4, 6, 12, 0.82);
}

.kaigi-local-video .kaigi-video-meta {
  top: 0.65rem;
  left: 0.7rem;
  right: 0.7rem;
  font-size: 0.78rem;
}

.kaigi-local-video .kaigi-video-meta .helper {
  display: none;
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
  color: #fff;
  background:
    radial-gradient(
      circle at center,
      rgba(255, 255, 255, 0.08),
      transparent 52%
    ),
    linear-gradient(180deg, rgba(14, 18, 28, 0.88), rgba(7, 10, 16, 0.94));
}

.kaigi-video-empty .helper {
  color: rgba(255, 255, 255, 0.7);
}

.kaigi-video-empty p {
  margin: 0;
}

.kaigi-local-video .kaigi-video-empty {
  padding: 1rem;
  font-size: 0.82rem;
}

.kaigi-local-video .kaigi-video-empty .helper {
  display: none;
}

.kaigi-call-control-bar {
  display: flex;
  justify-content: center;
  padding: 0.15rem 0.2rem 0.25rem;
}

.kaigi-call-control-bar .kaigi-control-row {
  justify-content: center;
  gap: 0.45rem;
  padding: 0.62rem;
  border: 1px solid var(--kaigi-control-border);
  border-radius: 8px;
  background: var(--kaigi-control-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.46),
    inset 0 -2px 0 rgba(74, 57, 34, 0.22),
    0 12px 26px rgba(16, 24, 44, 0.12);
}

.kaigi-control-row button {
  border-radius: 6px;
  border-color: rgba(123, 100, 64, 0.6);
  background: linear-gradient(180deg, #fff8e7, #dac89f 68%, #ac9870), #dac89f;
  color: #172230;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.48);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    inset 0 -1px 0 rgba(78, 61, 37, 0.22),
    0 3px 0 rgba(107, 86, 55, 0.8),
    0 8px 16px rgba(35, 28, 20, 0.16);
}

.kaigi-control-row button:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow:
    inset 0 2px 5px rgba(73, 55, 30, 0.24),
    0 1px 0 rgba(107, 86, 55, 0.8);
}

.kaigi-control-row .warn {
  border-color: rgba(126, 32, 26, 0.88);
  background:
    linear-gradient(180deg, #ff806e, #d94332 68%, #98261f),
    var(--kaigi-vermilion);
  color: #fffaf0;
  text-shadow: 0 1px 0 rgba(55, 14, 12, 0.45);
}

.kaigi-signal-card {
  overflow: hidden;
  padding: 0;
}

.kaigi-advanced {
  display: block;
}

.kaigi-advanced-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.kaigi-advanced-summary::-webkit-details-marker {
  display: none;
}

.kaigi-advanced-copy {
  min-width: 0;
  display: grid;
  gap: 0.35rem;
}

.kaigi-advanced-title {
  color: inherit;
  font-weight: 700;
}

.kaigi-advanced-summary .helper {
  margin: 0;
}

.kaigi-advanced-caret {
  width: 0.6rem;
  height: 0.6rem;
  flex: 0 0 auto;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  color: var(--iroha-muted);
  transform: rotate(45deg);
  transition: transform 0.2s ease;
}

.kaigi-advanced[open] .kaigi-advanced-caret {
  transform: rotate(225deg);
}

.kaigi-advanced-body {
  display: grid;
  gap: 1rem;
  padding: 0 1.25rem 1.25rem;
  border-top: 1px solid var(--kaigi-control-border);
}

.kaigi-advanced[open] .kaigi-advanced-summary {
  padding-bottom: 1rem;
}

@media (max-width: 1120px) {
  .kaigi-config-grid,
  .kaigi-packet-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .kaigi-kpis,
  .kaigi-device-grid,
  .kaigi-input-with-action {
    grid-template-columns: 1fr;
  }

  .kaigi-link-box-header,
  .kaigi-video-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .kaigi-call-card {
    padding: 0.85rem;
  }

  .kaigi-stage {
    display: grid;
    gap: 0.75rem;
    min-height: 0;
    padding: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .kaigi-stage::before,
  .kaigi-stage::after {
    display: none;
  }

  .kaigi-remote-video,
  .kaigi-local-video {
    position: relative;
    inset: auto;
    right: auto;
    bottom: auto;
    width: 100%;
    min-width: 0;
    min-height: 14rem;
  }

  .kaigi-local-video {
    aspect-ratio: 16 / 9;
    right: auto;
    bottom: auto;
  }

  .kaigi-video-shell video {
    min-height: 14rem;
  }
}

.kaigi-layout {
  gap: 1rem;
  --kaigi-accent: var(--iroha-accent);
  --kaigi-accent-soft: rgba(255, 76, 102, 0.16);
  --kaigi-blue-soft: rgba(94, 148, 255, 0.14);
  --kaigi-ink: inherit;
  --kaigi-panel-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.1), transparent 62%),
    var(--menu-glass-strong);
  --kaigi-panel-border: var(--glass-border);
  --kaigi-panel-shadow:
    0 18px 46px var(--gi-ambient), inset 0 1px 0 var(--glass-highlight);
  --kaigi-control-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 65%),
    var(--surface-soft);
  --kaigi-control-border: var(--panel-border);
  --kaigi-field-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 62%),
    var(--surface-soft);
  --kaigi-stage-bg:
    radial-gradient(
      circle at 76% 12%,
      rgba(94, 148, 255, 0.22),
      transparent 34%
    ),
    radial-gradient(
      circle at 18% 78%,
      rgba(255, 76, 102, 0.18),
      transparent 38%
    ),
    linear-gradient(145deg, #171923, #080a10 62%, #030408);
}

:global(:root[data-theme="dark"]) .kaigi-layout {
  --kaigi-panel-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 62%),
    rgba(16, 19, 28, 0.84);
  --kaigi-panel-border: rgba(255, 255, 255, 0.14);
  --kaigi-panel-shadow:
    0 22px 56px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  --kaigi-control-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), transparent 65%),
    rgba(255, 255, 255, 0.05);
  --kaigi-control-border: rgba(255, 255, 255, 0.12);
  --kaigi-field-bg:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 62%),
    rgba(255, 255, 255, 0.06);
}

.kaigi-call-card,
.kaigi-overview-card,
.kaigi-signal-card {
  border-radius: 8px;
  background: var(--kaigi-panel-bg);
  border-color: var(--kaigi-panel-border);
  box-shadow: var(--kaigi-panel-shadow);
}

.kaigi-call-card::before,
.kaigi-overview-card::before,
.kaigi-signal-card::before {
  display: none;
}

.kaigi-call-card {
  gap: 0;
  padding: 0;
  border-width: 1px;
}

.kaigi-overview-card {
  padding: 1rem;
}

.kaigi-call-header,
.kaigi-header {
  align-items: center;
  padding: 1rem 1.1rem;
  margin: 0;
  border-bottom: 1px solid var(--kaigi-control-border);
}

.kaigi-call-header h2,
.kaigi-header h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.kaigi-call-status {
  max-width: 70ch;
  margin: 0;
}

.kaigi-summary-pills {
  gap: 0.5rem;
}

.kaigi-summary-pills .pill {
  min-height: 2rem;
  border-radius: 999px;
  border-color: var(--kaigi-control-border);
  background: rgba(255, 255, 255, 0.07);
  color: inherit;
  font-family: inherit;
  box-shadow: none;
}

.kaigi-summary-pills .pill::before {
  width: 0.48rem;
  height: 0.48rem;
  background: var(--iroha-muted);
  box-shadow: none;
}

.kaigi-summary-pills .pill.positive {
  color: var(--kaigi-accent);
  border-color: color-mix(in srgb, var(--kaigi-accent) 54%, transparent);
  background: var(--kaigi-accent-soft);
}

.kaigi-summary-pills .pill.positive::before {
  background: var(--kaigi-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--kaigi-accent) 16%, transparent);
}

.kaigi-stage {
  min-height: min(62vh, 46rem);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--kaigi-stage-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.kaigi-stage::before {
  inset: 0;
  z-index: 4;
  border-radius: 0;
  background:
    linear-gradient(
      130deg,
      rgba(255, 255, 255, 0.16),
      transparent 24%,
      transparent 72%,
      rgba(255, 255, 255, 0.06)
    ),
    radial-gradient(circle at 50% 48%, transparent 54%, rgba(0, 0, 0, 0.32));
  opacity: 0.42;
  mix-blend-mode: screen;
}

.kaigi-stage::after {
  display: none;
}

.kaigi-video-shell {
  border-radius: 0;
  border: 0;
  background:
    radial-gradient(
      circle at 76% 18%,
      rgba(94, 148, 255, 0.2),
      transparent 36%
    ),
    linear-gradient(180deg, rgba(18, 22, 31, 0.9), rgba(3, 5, 10, 0.96));
}

.kaigi-remote-video {
  inset: 0;
  border: 0;
  box-shadow: none;
}

.kaigi-local-video {
  right: 1rem;
  bottom: 1rem;
  z-index: 6;
  width: min(28%, 21rem);
  min-width: 14rem;
  min-height: 8.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(5, 7, 12, 0.9);
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.kaigi-video-meta {
  top: 0.85rem;
  left: 0.85rem;
  right: 0.85rem;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.48);
}

.kaigi-video-meta > span {
  max-width: min(30rem, 52%);
  border-radius: 999px;
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(7, 10, 16, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09);
}

.kaigi-video-meta .helper {
  color: rgba(255, 255, 255, 0.72);
}

.kaigi-video-shell video {
  background: #05070c;
}

.kaigi-video-empty {
  background:
    radial-gradient(
      circle at 50% 36%,
      rgba(255, 255, 255, 0.08),
      transparent 42%
    ),
    linear-gradient(180deg, rgba(12, 15, 23, 0.9), rgba(5, 7, 12, 0.96));
}

.kaigi-video-empty p:first-child {
  font-weight: 700;
}

.kaigi-call-control-bar {
  justify-content: center;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--kaigi-control-border);
}

.kaigi-call-control-bar .kaigi-control-row {
  gap: 0.5rem;
  padding: 0.35rem;
  border-radius: 8px;
  border-color: var(--kaigi-control-border);
  background: var(--kaigi-control-bg);
  box-shadow: inset 0 1px 0 var(--glass-highlight);
}

.kaigi-control-row button {
  min-height: 2.3rem;
  border-radius: 8px;
  border-color: var(--kaigi-control-border);
  background: transparent;
  color: inherit;
  text-shadow: none;
  box-shadow: none;
}

.kaigi-control-row button:hover:not(:disabled) {
  background: var(--surface-soft);
  box-shadow: none;
}

.kaigi-control-row button:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: none;
}

.kaigi-control-row .warn {
  border-color: rgba(239, 68, 68, 0.34);
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  text-shadow: none;
}

.kaigi-config-grid {
  gap: 1rem;
  grid-template-columns: minmax(0, 1.25fr) minmax(19rem, 0.8fr);
}

.kaigi-config-pane,
.kaigi-status-pane {
  gap: 0.9rem;
}

.kaigi-status-pane {
  align-self: start;
}

.kaigi-mode-toggle {
  width: 100%;
  padding: 0.25rem;
  border-color: var(--kaigi-control-border);
  border-radius: 8px;
  background: var(--kaigi-control-bg);
  box-shadow: inset 0 1px 0 var(--glass-highlight);
}

.kaigi-mode-toggle .secondary {
  flex: 1 1 10rem;
  min-height: 2.4rem;
  border-radius: 6px;
}

.kaigi-mode-toggle .secondary.active {
  border-color: color-mix(in srgb, var(--kaigi-accent) 58%, transparent);
  background: var(--kaigi-accent);
  color: #fff;
  text-shadow: none;
  box-shadow: 0 10px 24px rgba(255, 76, 102, 0.22);
}

.kaigi-config-form label,
.kaigi-device-grid label {
  color: inherit;
  font-weight: 650;
}

.kaigi-config-form input,
.kaigi-config-form select,
.kaigi-device-grid select,
.kaigi-link-field textarea,
.kaigi-config-form textarea,
.kaigi-packet-field textarea {
  border-radius: 8px;
  border-color: var(--kaigi-control-border);
  background: var(--kaigi-field-bg);
  box-shadow: inset 0 1px 0 var(--glass-highlight);
}

.kaigi-input-with-action {
  gap: 0.55rem;
}

.kaigi-link-box,
.kaigi-media-setup,
.kaigi-private-funding-box {
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 8px;
  border-color: var(--kaigi-control-border);
  background: var(--kaigi-control-bg);
  box-shadow: inset 0 1px 0 var(--glass-highlight);
}

.kaigi-link-box h3,
.kaigi-media-setup h3 {
  margin: 0;
  font-size: 0.98rem;
}

.kaigi-link-box p {
  margin-top: 0.25rem;
}

.kaigi-kpis {
  gap: 0.65rem;
}

.kaigi-kpis .kv {
  border-radius: 8px;
  border-color: var(--kaigi-control-border);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 1px 0 var(--glass-highlight);
}

.kaigi-kpis .kv-label {
  letter-spacing: 0.08em;
}

.kaigi-device-grid {
  gap: 0.65rem;
}

.kaigi-primary-actions {
  gap: 0.6rem;
}

.kaigi-primary-actions button {
  flex: 1 1 13rem;
}

.kaigi-error {
  color: #ef4444;
}

.kaigi-signal-card {
  padding: 0;
}

.kaigi-advanced-summary {
  padding: 1rem;
}

.kaigi-advanced-body {
  padding: 0 1rem 1rem;
  border-top-color: var(--kaigi-control-border);
}

.kaigi-advanced-caret {
  color: var(--iroha-muted);
}

.kaigi-host-modal-backdrop {
  inset: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--surface-base, #05060b) 34%, transparent);
}

.kaigi-host-modal {
  border-radius: 8px;
}

@media (max-width: 1120px) {
  .kaigi-config-grid,
  .kaigi-packet-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .kaigi-call-header,
  .kaigi-header,
  .kaigi-call-control-bar,
  .kaigi-overview-card {
    padding: 0.85rem;
  }

  .kaigi-summary-pills,
  .kaigi-inline-actions,
  .kaigi-primary-actions,
  .kaigi-signal-actions {
    width: 100%;
  }

  .kaigi-mode-toggle {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
  }

  .kaigi-mode-toggle .secondary {
    min-height: 2.55rem;
    flex: none;
    padding-inline: 0.65rem;
  }

  .kaigi-call-control-bar .kaigi-control-row {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kaigi-control-row button {
    min-width: 0;
    padding-inline: 0.65rem;
  }

  .kaigi-summary-pills .pill,
  .kaigi-inline-actions button,
  .kaigi-primary-actions button,
  .kaigi-signal-actions button {
    flex: 1 1 auto;
  }

  .kaigi-kpis,
  .kaigi-device-grid,
  .kaigi-input-with-action {
    grid-template-columns: 1fr;
  }

  .kaigi-stage {
    display: grid;
    gap: 0.75rem;
    min-height: 0;
    padding: 0.75rem;
    border-top: 1px solid var(--kaigi-control-border);
    background: var(--kaigi-stage-bg);
  }

  .kaigi-stage::before {
    display: none;
  }

  .kaigi-remote-video,
  .kaigi-local-video {
    position: relative;
    inset: auto;
    right: auto;
    bottom: auto;
    width: 100%;
    min-width: 0;
    min-height: 14rem;
    border-radius: 8px;
  }

  .kaigi-local-video {
    aspect-ratio: 16 / 9;
  }

  .kaigi-video-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .kaigi-video-meta > span {
    max-width: 100%;
  }

  .kaigi-video-shell video {
    min-height: 14rem;
  }
}
</style>
