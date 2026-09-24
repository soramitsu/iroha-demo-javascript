// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { RollupOutput, RollupWatcher } from "rollup";
import { build } from "vite";

import electronViteConfig from "../electron.vite.config";

const FORBIDDEN_MAIN_BUNDLE_PATTERN =
  /\/v1\/sccp|\/v1\/zk\/ivm|SccpRouteGovernance|LocalSigningContext|class ToriiClient|offline\/readiness|kagemushaOffline|proof-requests|prover\/reports/iu;

const outputCode = (result: RollupOutput | RollupOutput[]): string =>
  (Array.isArray(result) ? result : [result])
    .flatMap((bundle) => bundle.output)
    .map((chunk) => (chunk.type === "chunk" ? chunk.code : ""))
    .join("\n");

describe("first-release main-process bundle", () => {
  it("cannot carry dormant SCCP, prover, or offline SDK routes", async () => {
    const config = electronViteConfig as {
      main: Parameters<typeof build>[0];
    };
    const main = config.main as Exclude<typeof config.main, undefined> & {
      build?: Record<string, unknown>;
    };
    const result = await build({
      ...main,
      configFile: false,
      logLevel: "silent",
      build: {
        ...main.build,
        emptyOutDir: false,
        ssr: true,
        write: false,
      },
    });
    if ("on" in (result as RollupWatcher)) {
      throw new Error("Main-process regression build unexpectedly watched.");
    }
    const code = outputCode(result as RollupOutput | RollupOutput[]);

    expect(code).not.toMatch(FORBIDDEN_MAIN_BUNDLE_PATTERN);
    expect(code).not.toContain("ToriiClient");
    for (const requiredRoute of [
      "/v1/fees/quote",
      "/v1/pipeline/transactions",
      "/v1/pipeline/transactions/status",
      "/v1/vpn/profile",
      "/v1/vpn/quotes",
      "/v1/vpn/receipts",
      "/v1/vpn/sessions",
    ]) {
      expect(code).toContain(requiredRoute);
    }
  }, 30_000);
});
