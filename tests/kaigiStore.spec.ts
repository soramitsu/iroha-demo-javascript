import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  KAIGI_STORAGE_KEY,
  LEGACY_KAIGI_STORAGE_KEY,
  useKaigiStore,
} from "@/stores/kaigi";
import { buildEndpointIdentityScope } from "@/utils/endpointScope";

const endpointIdentity = {
  toriiUrl: "https://taira.sora.org",
  observedChainId: "fc56984b-2be7-431d-840e-21514d1883f0",
  observedNetworkPrefix: 369,
};

describe("kaigi store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("persists and restores host sessions", () => {
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession({
      endpointScope: buildEndpointIdentityScope(endpointIdentity),
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
        endpointIdentity,
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
      endpointScope: buildEndpointIdentityScope(endpointIdentity),
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

  it("quarantines legacy global sessions and isolates endpoint identities", () => {
    localStorage.setItem(
      LEGACY_KAIGI_STORAGE_KEY,
      JSON.stringify({ hostSessions: [{ accountId: "legacy" }] }),
    );
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession({
      endpointScope: buildEndpointIdentityScope(endpointIdentity),
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
      live: true,
      privacyMode: "private",
      peerIdentityReveal: "Hidden",
    });

    expect(localStorage.getItem(LEGACY_KAIGI_STORAGE_KEY)).toBeNull();
    expect(
      store.findLatestActiveHostSession(
        {
          ...endpointIdentity,
          observedChainId: "archived-chain",
        },
        "alice@wonderland",
        1_700_000_000_001,
      ),
    ).toBeNull();
  });
});
