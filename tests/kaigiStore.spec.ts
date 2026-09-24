import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  KAIGI_STORAGE_KEY,
  type KaigiHostSessionRecord,
  useKaigiStore,
} from "@/stores/kaigi";
import { buildEndpointIdentityScope } from "@/utils/endpointScope";
import { KAIGI_MEETING_WINDOW_MS } from "@/utils/kaigiInvite";

const KAIGI_INVITE_SECRET = "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u";
const HOST_PRIVATE_KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const HOST_PUBLIC_KEY = "B6N8vBQgk8i3VdwbEOhstCY3StFqqFPtC9_AsrhtHHw";

const endpointIdentity = {
  toriiUrl: "https://taira.sora.org",
  observedChainId: "fc56984b-2be7-431d-840e-21514d1883f0",
  observedNetworkPrefix: 369,
  observedGenesisHash:
    "77fb29d14745adccfdc14350e1a6fe6a10265798cc936a1dafa7d2552ac3b9f7",
};

const hostSession = (
  overrides: Partial<KaigiHostSessionRecord> = {},
): KaigiHostSessionRecord => {
  const scheduledStartMs = 1_700_000_060_000;
  return {
    endpointScope: buildEndpointIdentityScope(endpointIdentity),
    accountId: "testuAlice",
    callId: "kaigi.universal:kaigi-room",
    meetingCode: "room",
    inviteSecretBase64Url: KAIGI_INVITE_SECRET,
    hostKaigiKeys: {
      publicKeyBase64Url: HOST_PUBLIC_KEY,
      privateKeyBase64Url: HOST_PRIVATE_KEY,
    },
    createdAtMs: 1_700_000_000_000,
    scheduledStartMs,
    expiresAtMs: scheduledStartMs + KAIGI_MEETING_WINDOW_MS,
    title: "Demo Call",
    live: true,
    privacyMode: "transparent",
    ...overrides,
  };
};

describe("kaigi store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("keeps validated host sessions in memory without persisting secrets", () => {
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession(hostSession());

    expect(
      store.findLatestActiveHostSession(
        endpointIdentity,
        "testuAlice",
        1_700_000_000_001,
      ),
    ).toMatchObject({
      meetingCode: "room",
      privacyMode: "transparent",
    });
    expect(localStorage.length).toBe(0);

    setActivePinia(createPinia());
    const restarted = useKaigiStore();
    restarted.hydrate();
    expect(restarted.hostSessions).toEqual([]);
  });

  it("prunes expired current-run sessions", () => {
    const store = useKaigiStore();
    store.hydrate();
    const session = hostSession();
    store.saveHostSession(session);

    store.pruneExpired(session.expiresAtMs + 1);

    expect(store.hostSessions).toEqual([]);
  });

  it("isolates endpoint identities", () => {
    const store = useKaigiStore();
    store.hydrate();
    store.saveHostSession(hostSession());

    expect(
      store.findLatestActiveHostSession(
        { ...endpointIdentity, observedChainId: "archived-chain" },
        "testuAlice",
        1_700_000_000_001,
      ),
    ).toBeNull();
  });

  it("deletes every retired localStorage host-session bucket", () => {
    for (const retiredKey of [
      KAIGI_STORAGE_KEY,
      "iroha-demo:kaigi",
      "iroha-demo:kaigi:v2",
    ]) {
      localStorage.setItem(retiredKey, "must-not-be-read");
    }

    const store = useKaigiStore();
    store.hydrate();

    expect(store.hostSessions).toEqual([]);
    expect(localStorage.getItem(KAIGI_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("iroha-demo:kaigi")).toBeNull();
    expect(localStorage.getItem("iroha-demo:kaigi:v2")).toBeNull();
  });

  it.each([
    {
      name: "legacy account alias",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        accountId: "alice@wonderland",
      }),
    },
    {
      name: "meeting-code mismatch",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        meetingCode: "other",
      }),
    },
    {
      name: "noncanonical invite secret",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        inviteSecretBase64Url: `${KAIGI_INVITE_SECRET}=`,
      }),
    },
    {
      name: "mismatched host key pair",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        hostKaigiKeys: {
          ...session.hostKaigiKeys,
          publicKeyBase64Url: HOST_PRIVATE_KEY,
        },
      }),
    },
    {
      name: "inconsistent expiry",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        expiresAtMs: session.expiresAtMs + 1,
      }),
    },
    {
      name: "retired identity reveal field",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        peerIdentityReveal: "Hidden",
      }),
    },
    {
      name: "private live session",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        privacyMode: "private",
      }),
    },
    {
      name: "unknown field",
      mutate: (session: KaigiHostSessionRecord) => ({
        ...session,
        legacyInvite: true,
      }),
    },
  ])("rejects $name instead of coercing it", ({ mutate }) => {
    const store = useKaigiStore();
    store.hydrate();

    expect(() =>
      store.saveHostSession(
        mutate(hostSession()) as unknown as KaigiHostSessionRecord,
      ),
    ).toThrow();
    expect(store.hostSessions).toEqual([]);
  });
});
