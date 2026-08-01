import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { KAIGI_STORAGE_KEY, useKaigiStore } from "@/stores/kaigi";
import { buildEndpointIdentityScope } from "@/utils/endpointScope";

const KAIGI_INVITE_SECRET = "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u";

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
      callId: "wonderland.universal:kaigi-room",
      meetingCode: "room",
      inviteSecretBase64Url: KAIGI_INVITE_SECRET,
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
      "wonderland.universal:kaigi-room",
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
      callId: "wonderland.universal:kaigi-old",
      meetingCode: "old",
      inviteSecretBase64Url: KAIGI_INVITE_SECRET,
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

  it("isolates endpoint identities", () => {
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession({
      endpointScope: buildEndpointIdentityScope(endpointIdentity),
      accountId: "alice@wonderland",
      callId: "wonderland.universal:kaigi-room",
      meetingCode: "room",
      inviteSecretBase64Url: KAIGI_INVITE_SECRET,
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

  it("deletes obsolete host-session buckets without migrating them", () => {
    for (const obsoleteKey of ["iroha-demo:kaigi", "iroha-demo:kaigi:v2"]) {
      localStorage.setItem(
        obsoleteKey,
        JSON.stringify({
          hostSessions: [
            {
              callId: "wonderland:legacy",
              inviteSecretBase64Url: "legacy-secret",
            },
          ],
        }),
      );
    }

    const store = useKaigiStore();
    store.hydrate();

    expect(store.hostSessions).toEqual([]);
    expect(localStorage.getItem("iroha-demo:kaigi")).toBeNull();
    expect(localStorage.getItem("iroha-demo:kaigi:v2")).toBeNull();
  });

  it("discards persisted sessions with non-canonical invite material", () => {
    localStorage.setItem(
      KAIGI_STORAGE_KEY,
      JSON.stringify({
        hydrated: true,
        hostSessions: [
          {
            endpointScope: buildEndpointIdentityScope(endpointIdentity),
            accountId: "alice@wonderland",
            callId: "wonderland:kaigi-room",
            meetingCode: "room",
            inviteSecretBase64Url: "short",
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
          },
        ],
      }),
    );

    const store = useKaigiStore();
    store.hydrate();

    expect(store.hostSessions).toEqual([]);
  });
});
