// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  combineNetworkIdentitySources,
  isNetworkIdentityPin,
  networkIdGenesisHashHex,
  parseAccountCapabilitiesIdentity,
  parseGenesisBlockIdentity,
  parseNetworkIdLiteral,
  trustedNetworkIdFromInspection,
} from "@/utils/networkIdentity";
import { discoverEndpointNetworkIdentity } from "../electron/networkIdentityDiscovery";
import {
  NetworkIdentityPinStore,
  resolvePinnedNetworkIdInMain,
} from "../electron/networkIdentityPinStore";
import type { EndpointInspection } from "@/types/endpointInspection";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_GENESIS_HASH,
  TEST_TAIRA_NETWORK_ID,
  matchedNetworkIdentity,
  testNetworkIdentityPin,
} from "./helpers/networkIdentityFixture";

const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const TEST_RESET_TAIRA_NETWORK_ID =
  "hash:CA7BEBB1579D7F490C23BCBABD27E116BF2F921A7DB69862F0AD28E22257B465#450F";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const liveCapabilities = {
  schema_version: 1,
  network_id: TEST_TAIRA_NETWORK_ID,
  network_prefix: 369,
  allowed_signing: ["bls_normal", "ed25519", "secp256k1"],
  default_signing: "ed25519",
};

const liveGenesis = {
  hash: TEST_TAIRA_NETWORK_ID,
  height: 1,
  created_at: "2026-10-11T15:03:56.844Z",
  prev_block_hash: null,
  transactions_hash:
    "hash:FE1E97FD43176802F36A29FAA53BF5D53B87E8BED4778989D2CF8410BC45618D#98E2",
  transactions_rejected: 0,
  transactions_total: 0,
};

const routeFetch = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL(String(input)).pathname;
    return routes[path]?.() ?? jsonResponse({ code: "route_not_found" }, 404);
  });

describe("endpoint-derived network identity parsing", () => {
  it("accepts Torii checksummed hash literals and legacy lowercase hex", () => {
    expect(parseNetworkIdLiteral(TEST_TAIRA_NETWORK_ID)).toBe(
      TEST_TAIRA_NETWORK_ID,
    );
    expect(parseNetworkIdLiteral(TEST_TAIRA_GENESIS_HASH)).toBe(
      TEST_TAIRA_NETWORK_ID,
    );
    expect(networkIdGenesisHashHex(TEST_TAIRA_NETWORK_ID)).toBe(
      TEST_TAIRA_GENESIS_HASH,
    );
  });

  it("rejects bad checksums, lowercase literals, and non-strings", () => {
    for (const value of [
      TEST_TAIRA_NETWORK_ID.replace("#44D9", "#44DA"),
      TEST_TAIRA_NETWORK_ID.toLowerCase(),
      TEST_TAIRA_GENESIS_HASH.toUpperCase(),
      `hash:${"0".repeat(63)}`,
      42,
      null,
    ]) {
      expect(() => parseNetworkIdLiteral(value)).toThrow(
        "canonical Iroha hash literal",
      );
    }
  });

  it("projects live capabilities and genesis responses", () => {
    expect(parseAccountCapabilitiesIdentity(liveCapabilities)).toEqual({
      networkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: 369,
    });
    expect(parseGenesisBlockIdentity(liveGenesis)).toEqual({
      networkId: TEST_TAIRA_NETWORK_ID,
    });
    expect(() =>
      parseAccountCapabilitiesIdentity({
        ...liveCapabilities,
        schema_version: 2,
      }),
    ).toThrow("schema_version 1");
    expect(() =>
      parseAccountCapabilitiesIdentity({
        ...liveCapabilities,
        network_prefix: -1,
      }),
    ).toThrow("network_prefix");
    expect(() =>
      parseGenesisBlockIdentity({ ...liveGenesis, height: 2 }),
    ).toThrow("height 1");
    expect(() =>
      parseGenesisBlockIdentity({
        ...liveGenesis,
        prev_block_hash: TEST_TAIRA_NETWORK_ID,
      }),
    ).toThrow("previous block");
  });

  it("combines only agreeing sources", () => {
    expect(
      combineNetworkIdentitySources(
        { networkId: TEST_TAIRA_NETWORK_ID, networkPrefix: 369 },
        { networkId: TEST_TAIRA_NETWORK_ID },
      ),
    ).toEqual({
      networkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: 369,
      genesisHashHex: TEST_TAIRA_GENESIS_HASH,
    });
    expect(
      combineNetworkIdentitySources(
        { networkId: TEST_TAIRA_NETWORK_ID, networkPrefix: 369 },
        { networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID },
      ),
    ).toBeNull();
  });

  it("validates persisted pins exactly", () => {
    expect(isNetworkIdentityPin(testNetworkIdentityPin())).toBe(true);
    expect(
      isNetworkIdentityPin(
        testNetworkIdentityPin({ confirmation: "testnet-current" }),
      ),
    ).toBe(true);
    expect(
      isNetworkIdentityPin({ ...testNetworkIdentityPin(), extra: true }),
    ).toBe(false);
    expect(
      isNetworkIdentityPin({
        ...testNetworkIdentityPin(),
        networkId: TEST_TAIRA_NETWORK_ID.toLowerCase(),
      }),
    ).toBe(false);
    expect(
      isNetworkIdentityPin({
        ...testNetworkIdentityPin(),
        confirmation: "automatic",
      }),
    ).toBe(false);
  });

  it("returns a trusted NetworkId only for matched pinned inspections", () => {
    const inspection = {
      identityStatus: "matched",
      observed: { networkId: TEST_TAIRA_NETWORK_ID },
      networkIdentity: matchedNetworkIdentity(),
    } as unknown as EndpointInspection;
    expect(trustedNetworkIdFromInspection(inspection)).toBe(
      TEST_TAIRA_NETWORK_ID,
    );
    expect(
      trustedNetworkIdFromInspection({
        ...inspection,
        identityStatus: "changed",
      }),
    ).toBeNull();
    expect(
      trustedNetworkIdFromInspection({
        ...inspection,
        networkIdentity: matchedNetworkIdentity(TEST_PREVIOUS_TAIRA_NETWORK_ID),
      }),
    ).toBeNull();
    expect(trustedNetworkIdFromInspection(null)).toBeNull();
  });
});

describe("endpoint network identity discovery", () => {
  it("verifies the live two-source identity", async () => {
    const fetchImpl = routeFetch({
      "/v1/accounts/capabilities": () => jsonResponse(liveCapabilities),
      "/v1/explorer/blocks/1": () => jsonResponse(liveGenesis),
    });
    const discovery = await discoverEndpointNetworkIdentity(
      "https://taira.sora.org",
      { fetchImpl },
    );
    expect(discovery).toMatchObject({
      status: "verified",
      identity: {
        networkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: 369,
        genesisHashHex: TEST_TAIRA_GENESIS_HASH,
      },
    });
  });

  it("reports conflicting, incomplete, and unreachable sources", async () => {
    await expect(
      discoverEndpointNetworkIdentity("https://taira.sora.org", {
        fetchImpl: routeFetch({
          "/v1/accounts/capabilities": () => jsonResponse(liveCapabilities),
          "/v1/explorer/blocks/1": () =>
            jsonResponse({
              ...liveGenesis,
              hash: TEST_PREVIOUS_TAIRA_NETWORK_ID,
            }),
        }),
      }),
    ).resolves.toMatchObject({ status: "conflicting", identity: null });
    await expect(
      discoverEndpointNetworkIdentity("https://taira.sora.org", {
        fetchImpl: routeFetch({
          "/v1/accounts/capabilities": () =>
            jsonResponse({ code: "canonical_authentication_required" }, 401),
          "/v1/explorer/blocks/1": () => jsonResponse(liveGenesis),
        }),
      }),
    ).resolves.toMatchObject({ status: "incomplete" });
    await expect(
      discoverEndpointNetworkIdentity("https://taira.sora.org", {
        fetchImpl: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
    ).resolves.toMatchObject({ status: "unreachable" });
  });
});

describe("network identity pin store", () => {
  const directories: string[] = [];
  const store = () => {
    const directory = mkdtempSync(join(tmpdir(), "wallet-pins-"));
    directories.push(directory);
    return new NetworkIdentityPinStore(directory, { now: () => 42 });
  };
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refreshes official TAIRA pins after successive resets and persists each identity", () => {
    const pins = store();
    expect(pins.read("https://taira.sora.org")).toBeNull();
    const first = pins.pinFirstUse("https://taira.sora.org/", {
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      networkPrefix: 369,
    });
    expect(first).toMatchObject({
      toriiUrl: "https://taira.sora.org",
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      confirmedAtMs: 42,
      confirmation: "first-use",
    });
    for (const networkId of [
      TEST_TAIRA_NETWORK_ID,
      TEST_RESET_TAIRA_NETWORK_ID,
    ]) {
      const refreshed = pins.pinFirstUse("https://taira.sora.org", {
        networkId,
        networkPrefix: 369,
      });
      expect(refreshed).toMatchObject({
        networkId,
        networkPrefix: 369,
        confirmedAtMs: 42,
        confirmation: "testnet-current",
      });
      expect(pins.read("https://taira.sora.org")).toEqual(refreshed);
      const reloaded = new NetworkIdentityPinStore(join(pins.filePath, ".."));
      expect(reloaded.read("https://taira.sora.org")).toEqual(refreshed);
    }
    expect(JSON.parse(readFileSync(pins.filePath, "utf8")).pins).toHaveLength(
      1,
    );
  });

  it("preserves non-TAIRA pins until the user confirms a replacement", () => {
    for (const [toriiUrl, networkPrefix] of [
      ["https://minamoto.sora.org", 753],
      ["https://example.test", 369],
      ["https://taira.sora.org:8443", 369],
      ["https://taira.sora.org/proxy", 369],
      ["https://taira.sora.org", 753],
    ] as const) {
      const pins = store();
      const first = pins.pinFirstUse(toriiUrl, {
        networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
        networkPrefix,
      });
      expect(
        pins.pinFirstUse(toriiUrl, {
          networkId: TEST_TAIRA_NETWORK_ID,
          networkPrefix,
        }),
      ).toEqual(first);
      const confirmed = pins.replaceConfirmed(toriiUrl, {
        networkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix,
      });
      expect(confirmed).toMatchObject({
        networkId: TEST_TAIRA_NETWORK_ID,
        confirmation: "user-confirmed",
      });
      expect(pins.read(toriiUrl)).toEqual(confirmed);
    }
  });

  it("never refreshes a TAIRA pin across a network-prefix change", () => {
    const pins = store();
    const previous = pins.pinFirstUse("https://taira.sora.org", {
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      networkPrefix: 753,
    });
    expect(
      pins.pinFirstUse("https://taira.sora.org", {
        networkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: 369,
      }),
    ).toEqual(previous);
  });

  it("fails closed on a malformed store instead of re-pinning", () => {
    const pins = store();
    writeFileSync(pins.filePath, JSON.stringify({ schema: "other", pins: [] }));
    expect(() => pins.read("https://taira.sora.org")).toThrow("malformed");
    expect(() =>
      pins.pinFirstUse("https://taira.sora.org", {
        networkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: 369,
      }),
    ).toThrow("malformed");
  });

  it("uses the current official TAIRA identity for main-process signers after resets", async () => {
    const pins = store();
    const verified = async () => ({
      status: "verified" as const,
      identity: {
        networkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: 369,
        genesisHashHex: TEST_TAIRA_GENESIS_HASH,
      },
    });
    await expect(
      resolvePinnedNetworkIdInMain(
        pins,
        {
          toriiUrl: "https://taira.sora.org",
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: 369,
        },
        verified,
      ),
    ).resolves.toBe(TEST_TAIRA_NETWORK_ID);
    pins.replaceConfirmed("https://taira.sora.org", {
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      networkPrefix: 369,
    });
    for (const networkId of [
      TEST_TAIRA_NETWORK_ID,
      TEST_RESET_TAIRA_NETWORK_ID,
    ]) {
      await expect(
        resolvePinnedNetworkIdInMain(
          pins,
          {
            toriiUrl: "https://taira.sora.org",
            chainId: TAIRA_CHAIN_ID,
            networkPrefix: 369,
          },
          async () => ({
            status: "verified" as const,
            identity: {
              networkId,
              networkPrefix: 369,
              genesisHashHex: networkIdGenesisHashHex(networkId),
            },
          }),
        ),
      ).resolves.toBe(networkId);
      expect(pins.read("https://taira.sora.org")).toMatchObject({
        networkId,
        confirmation: "testnet-current",
      });
    }
    await expect(
      resolvePinnedNetworkIdInMain(
        pins,
        {
          toriiUrl: "https://taira.sora.org",
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: 753,
        },
        verified,
      ),
    ).rejects.toThrow("network prefix");
    for (const status of [
      "incomplete",
      "conflicting",
      "unreachable",
    ] as const) {
      await expect(
        resolvePinnedNetworkIdInMain(
          pins,
          {
            toriiUrl: "https://taira.sora.org",
            chainId: TAIRA_CHAIN_ID,
            networkPrefix: 369,
          },
          async () => ({ status, detail: "missing or conflicting identity" }),
        ),
      ).rejects.toThrow("not verified");
      expect(pins.read("https://taira.sora.org")?.networkId).toBe(
        TEST_RESET_TAIRA_NETWORK_ID,
      );
    }
  });

  it("blocks main-process signing when Minamoto changes its pinned identity", async () => {
    const pins = store();
    const input = {
      toriiUrl: "https://minamoto.sora.org",
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 753,
    };
    pins.pinFirstUse(input.toriiUrl, {
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      networkPrefix: 753,
    });
    await expect(
      resolvePinnedNetworkIdInMain(pins, input, async () => ({
        status: "verified" as const,
        identity: {
          networkId: TEST_TAIRA_NETWORK_ID,
          networkPrefix: 753,
          genesisHashHex: TEST_TAIRA_GENESIS_HASH,
        },
      })),
    ).rejects.toThrow("Confirm the new network identity");
  });

  it("does not refresh a pin for main-process signing with a wrong TAIRA chain", async () => {
    const pins = store();
    pins.pinFirstUse("https://taira.sora.org", {
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      networkPrefix: 369,
    });
    await expect(
      resolvePinnedNetworkIdInMain(
        pins,
        {
          toriiUrl: "https://taira.sora.org",
          chainId: "00000000-0000-0000-0000-000000000000",
          networkPrefix: 369,
        },
        async () => ({
          status: "verified" as const,
          identity: {
            networkId: TEST_TAIRA_NETWORK_ID,
            networkPrefix: 369,
            genesisHashHex: TEST_TAIRA_GENESIS_HASH,
          },
        }),
      ),
    ).rejects.toThrow();
    expect(pins.read("https://taira.sora.org")?.networkId).toBe(
      TEST_PREVIOUS_TAIRA_NETWORK_ID,
    );
  });
});
