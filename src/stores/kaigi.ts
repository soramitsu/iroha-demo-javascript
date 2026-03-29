import { defineStore } from "pinia";
import type {
  KaigiMeetingPrivacy,
  KaigiPeerIdentityReveal,
  KaigiSignalKeyPair,
} from "@/types/iroha";

export const KAIGI_STORAGE_KEY = "iroha-demo:kaigi";

export type KaigiHostSessionRecord = {
  accountId: string;
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
};

type KaigiStoreState = {
  hydrated: boolean;
  hostSessions: KaigiHostSessionRecord[];
};

const defaultState = (): KaigiStoreState => ({
  hydrated: false,
  hostSessions: [],
});

const trimString = (value: unknown): string => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeHostSession = (
  value: Partial<KaigiHostSessionRecord> & Record<string, unknown>,
): KaigiHostSessionRecord | null => {
  const accountId = trimString(value.accountId);
  const callId = trimString(value.callId);
  const meetingCode = trimString(value.meetingCode);
  const inviteSecretBase64Url = trimString(value.inviteSecretBase64Url);
  const hostKaigiKeys = asRecord(value.hostKaigiKeys);
  const publicKeyBase64Url = trimString(
    hostKaigiKeys?.publicKeyBase64Url,
  );
  const privateKeyBase64Url = trimString(
    hostKaigiKeys?.privateKeyBase64Url,
  );
  const createdAtMs = Number(value.createdAtMs);
  const scheduledStartMs = Number(value.scheduledStartMs);
  const expiresAtMs = Number(value.expiresAtMs);
  if (
    !accountId ||
    !callId ||
    !meetingCode ||
    !inviteSecretBase64Url ||
    !publicKeyBase64Url ||
    !privateKeyBase64Url ||
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(scheduledStartMs) ||
    !Number.isFinite(expiresAtMs)
  ) {
    return null;
  }
  return {
    accountId,
    callId,
    meetingCode,
    inviteSecretBase64Url,
    hostKaigiKeys: {
      publicKeyBase64Url,
      privateKeyBase64Url,
    },
    createdAtMs,
    scheduledStartMs,
    expiresAtMs,
    ...(trimString(value.title) ? { title: trimString(value.title) } : {}),
    live: value.live !== false,
    privacyMode:
      String(value.privacyMode ?? "").trim().toLowerCase() === "transparent"
        ? "transparent"
        : "private",
    peerIdentityReveal:
      String(value.peerIdentityReveal ?? "").trim().toLowerCase() ===
        "revealafterjoin" ||
      String(value.peerIdentityReveal ?? "").trim().toLowerCase() ===
        "reveal_after_join" ||
      String(value.peerIdentityReveal ?? "").trim().toLowerCase() ===
        "reveal-after-join"
        ? "RevealAfterJoin"
        : "Hidden",
  };
};

export const useKaigiStore = defineStore("kaigi", {
  state: (): KaigiStoreState => defaultState(),
  actions: {
    hydrate() {
      if (this.hydrated) {
        return;
      }
      const raw = localStorage.getItem(KAIGI_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<KaigiStoreState>;
          const hostSessions = Array.isArray(parsed.hostSessions)
            ? parsed.hostSessions
                .map((entry) =>
                  entry &&
                  typeof entry === "object" &&
                  !Array.isArray(entry)
                    ? normalizeHostSession(
                        entry as Partial<KaigiHostSessionRecord> &
                          Record<string, unknown>,
                      )
                    : null,
                )
                .filter(
                  (entry): entry is KaigiHostSessionRecord => Boolean(entry),
                )
            : [];
          this.$patch({
            hydrated: true,
            hostSessions,
          });
          return;
        } catch (_error) {
          localStorage.removeItem(KAIGI_STORAGE_KEY);
        }
      }
      this.hydrated = true;
    },
    persist(snapshot?: KaigiStoreState) {
      const payload = JSON.stringify(snapshot ?? this.$state);
      localStorage.setItem(KAIGI_STORAGE_KEY, payload);
    },
    saveHostSession(session: KaigiHostSessionRecord) {
      const normalized = normalizeHostSession(session);
      if (!normalized) {
        throw new Error("Kaigi host session is invalid.");
      }
      const next = this.hostSessions.filter(
        (entry) =>
          !(
            entry.accountId === normalized.accountId &&
            entry.callId === normalized.callId
          ),
      );
      next.unshift(normalized);
      this.hostSessions = next;
      this.persist();
    },
    removeHostSession(accountId: string, callId: string) {
      this.hostSessions = this.hostSessions.filter(
        (entry) => !(entry.accountId === accountId && entry.callId === callId),
      );
      this.persist();
    },
    pruneExpired(nowMs = Date.now()) {
      this.hostSessions = this.hostSessions.filter(
        (entry) => entry.expiresAtMs > nowMs,
      );
      this.persist();
    },
  },
  getters: {
    findLatestActiveHostSession:
      (state) =>
      (accountId: string, nowMs = Date.now()): KaigiHostSessionRecord | null =>
        state.hostSessions.find(
          (entry) => entry.accountId === accountId && entry.expiresAtMs > nowMs,
        ) ?? null,
  },
});
