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

  it("pins on first use and never replaces a pin implicitly", () => {
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
    expect(
      pins.pinFirstUse("https://taira.sora.org", {
        networkId: TEST_TAIRA_NETWORK_ID,
        networkPrefix: 369,
      }).networkId,
    ).toBe(TEST_PREVIOUS_TAIRA_NETWORK_ID);
    const replaced = pins.replaceConfirmed("https://taira.sora.org", {
      networkId: TEST_TAIRA_NETWORK_ID,
      networkPrefix: 369,
    });
    expect(replaced).toMatchObject({
      networkId: TEST_TAIRA_NETWORK_ID,
      confirmation: "user-confirmed",
    });
    expect(pins.read("https://taira.sora.org")).toEqual(replaced);
    expect(JSON.parse(readFileSync(pins.filePath, "utf8")).pins).toHaveLength(
      1,
    );
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

  it("resolves main-process signing identities through the pin", async () => {
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
        { toriiUrl: "https://taira.sora.org", networkPrefix: 369 },
        verified,
      ),
    ).resolves.toBe(TEST_TAIRA_NETWORK_ID);
    pins.replaceConfirmed("https://taira.sora.org", {
      networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID,
      networkPrefix: 369,
    });
    await expect(
      resolvePinnedNetworkIdInMain(
        pins,
        { toriiUrl: "https://taira.sora.org", networkPrefix: 369 },
        verified,
      ),
    ).rejects.toThrow("Confirm the new network identity");
    await expect(
      resolvePinnedNetworkIdInMain(
        pins,
        { toriiUrl: "https://taira.sora.org", networkPrefix: 753 },
        verified,
      ),
    ).rejects.toThrow("network prefix");
    await expect(
      resolvePinnedNetworkIdInMain(
        pins,
        { toriiUrl: "https://taira.sora.org", networkPrefix: 369 },
        async () => ({ status: "incomplete" as const, detail: "missing" }),
      ),
    ).rejects.toThrow("not verified");
  });
});
