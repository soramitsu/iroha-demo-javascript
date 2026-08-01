// @vitest-environment node

import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TAIRA_CHAIN_ID,
  TAIRA_NETWORK_PREFIX,
  runSccpSolanaRoutePreflight,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";
import {
  buildExactSolanaCapabilitiesFixture,
  buildExactSolanaRegistryFixture,
} from "./helpers/sccpSolanaExactRegistryFixture.js";

const openServers = new Set();
const tempDirectories = new Set();

afterEach(async () => {
  await Promise.all(
    [...openServers].map(
      (server) =>
        new Promise((resolve) => server.close(() => resolve(undefined))),
    ),
  );
  openServers.clear();
  await Promise.all(
    [...tempDirectories].map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
  tempDirectories.clear();
});

const json = (response, status, body) => {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
};

const startExactTairaFixture = async ({
  mutateRegistryRead,
  metadataForPath,
} = {}) => {
  const registry = buildExactSolanaRegistryFixture();
  let registryReads = 0;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/v1/sccp/capabilities") {
      json(response, 200, buildExactSolanaCapabilitiesFixture());
      return;
    }
    if (pathname === "/v1/sccp/registry") {
      registryReads += 1;
      const body = structuredClone(registry);
      mutateRegistryRead?.({ body, read: registryReads });
      json(response, 200, body);
      return;
    }
    const metadata = metadataForPath?.(pathname);
    if (metadata !== undefined) {
      json(response, 200, metadata);
      return;
    }
    if (pathname === "/v1/chain/metadata") {
      json(response, 200, {
        chain_id: TAIRA_CHAIN_ID,
        network_prefix: TAIRA_NETWORK_PREFIX,
      });
      return;
    }
    json(response, 404, { error: "not found" });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "localhost", resolve);
  });
  openServers.add(server);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const outputDir = await mkdtemp(
    path.join(tmpdir(), "sccp-solana-exact-preflight-"),
  );
  tempDirectories.add(outputDir);
  return {
    getRegistryReads: () => registryReads,
    outputDir,
    toriiUrl: `http://localhost:${port}`,
  };
};

const runFixture = async (fixture) =>
  runSccpSolanaRoutePreflight({
    toriiUrl: fixture.toriiUrl,
    outputDir: fixture.outputDir,
    skipSolanaRpc: true,
    fetchAttempts: 1,
  });

describe("exact Solana SCCP preflight stability", () => {
  it("binds the report to fresh TAIRA metadata and two identical registry reads", async () => {
    const fixture = await startExactTairaFixture();
    const { report } = await runFixture(fixture);
    const checks = new Map(report.checks.map((check) => [check.id, check]));

    expect(report.ready).toBe(true);
    expect(report.taira).toMatchObject({
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: TAIRA_NETWORK_PREFIX,
      registryPath: "/v1/sccp/registry",
    });
    expect(fixture.getRegistryReads()).toBe(2);
    expect(checks.get("taira-chain-metadata")).toMatchObject({
      status: "pass",
    });
    expect(checks.get("sccp-registry-stability")).toMatchObject({
      status: "pass",
      evidence: {
        initialRegistrySha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        finalRegistrySha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      },
    });
    expect(
      checks.get("sccp-registry-stability").evidence.initialRegistrySha256,
    ).toBe(checks.get("sccp-registry-stability").evidence.finalRegistrySha256);
  });

  it("fails when the typed registry changes after Solana verification", async () => {
    const fixture = await startExactTairaFixture({
      mutateRegistryRead: ({ body, read }) => {
        if (read === 2) {
          body.lanes[0].native_trust_anchors[0].checkpoint_height = 2;
        }
      },
    });
    const { report } = await runFixture(fixture);
    const check = report.checks.find(
      (candidate) => candidate.id === "sccp-registry-stability",
    );

    expect(report.ready).toBe(false);
    expect(report.failedCheckIds).toContain("sccp-registry-stability");
    expect(check).toMatchObject({
      status: "fail",
      detail:
        "Public TAIRA typed registry changed during Solana live-state verification.",
    });
  });

  it("fails closed on wrong or conflicting endpoint chain metadata", async () => {
    const wrong = await startExactTairaFixture({
      metadataForPath: (pathname) =>
        pathname === "/v1/chain/metadata"
          ? {
              chain_id: "00000000-0000-0000-0000-000000000000",
              network_prefix: TAIRA_NETWORK_PREFIX,
            }
          : undefined,
    });
    const wrongResult = await runFixture(wrong);
    expect(wrongResult.report.ready).toBe(false);
    expect(wrongResult.report.failedCheckIds).toContain("taira-chain-metadata");
    expect(wrongResult.report.taira).toMatchObject({
      chainId: null,
      networkPrefix: null,
    });

    const conflicting = await startExactTairaFixture({
      metadataForPath: (pathname) => {
        if (pathname === "/v1/chain/metadata") {
          return {
            chain_id: TAIRA_CHAIN_ID,
            network_prefix: TAIRA_NETWORK_PREFIX,
          };
        }
        return pathname === "/chain/metadata"
          ? {
              chain_id: TAIRA_CHAIN_ID,
              network_prefix: 753,
            }
          : undefined;
      },
    });
    const conflictingResult = await runFixture(conflicting);
    const metadataCheck = conflictingResult.report.checks.find(
      (check) => check.id === "taira-chain-metadata",
    );
    expect(conflictingResult.report.ready).toBe(false);
    expect(metadataCheck).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("one unambiguous chain id"),
    });
  });
});
