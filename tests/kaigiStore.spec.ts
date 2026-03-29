import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { KAIGI_STORAGE_KEY, useKaigiStore } from "@/stores/kaigi";

describe("kaigi store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("persists and restores host sessions", () => {
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession({
      accountId: "alice@wonderland",
      callId: "wonderland:kaigi-room",
      meetingCode: "room",
      inviteSecretBase64Url: "bXktc2VjcmV0",
      hostKaigiKeys: {
        publicKeyBase64Url: "host-public",
        privateKeyBase64Url: "host-private",
      },
      createdAtMs: 1_700_000_000_000,
      scheduledStartMs: 1_700_000_060_000,
      expiresAtMs: 1_700_086_460_000,
      title: "Demo Call",
      live: true,
      privacyMode: "private",
      peerIdentityReveal: "Hidden",
    });

    setActivePinia(createPinia());
    const restored = useKaigiStore();
    restored.hydrate();

    expect(localStorage.getItem(KAIGI_STORAGE_KEY)).toContain(
      "wonderland:kaigi-room",
    );
    expect(
      restored.findLatestActiveHostSession(
        "alice@wonderland",
        1_700_000_000_001,
      ),
    )?.toMatchObject({
      meetingCode: "room",
      privacyMode: "private",
      peerIdentityReveal: "Hidden",
    });
  });

  it("prunes expired sessions", () => {
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession({
      accountId: "alice@wonderland",
      callId: "wonderland:kaigi-old",
      meetingCode: "old",
      inviteSecretBase64Url: "bXktc2VjcmV0",
      hostKaigiKeys: {
        publicKeyBase64Url: "host-public",
        privateKeyBase64Url: "host-private",
      },
      createdAtMs: 10,
      scheduledStartMs: 20,
      expiresAtMs: 30,
      live: true,
      privacyMode: "private",
      peerIdentityReveal: "Hidden",
    });

    store.pruneExpired(31);

    expect(store.hostSessions).toEqual([]);
  });
});
