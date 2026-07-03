#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const ROUTE_ID = "taira_ton_xor";
const ASSET_KEY = "xor";
const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const TAIRA_NETWORK_PREFIX = 369;
const TON_TESTNET_CHAIN_ID_HEX =
  "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd";
const BOUND_ROUTE_HASH =
  "0x8651c1b818973f92050f69e66e8491e9681d23db1cb37393b9ea15c5e7e02799";
const BOUND_PROOF_HASH =
  "0x0f1aa16d7496e1c04ebc773f62616c3f2df4c85839f4f825d95255f229f7d824";

const modules = [
  {
    kind: "ton-source",
    direction: "ton-to-taira",
    entry: "src/provers/sccp-ton-source-prover.js",
    out: "public/sccp-ton/taira-ton-xor-source-prover.js",
    moduleUrl: "/sccp-ton/taira-ton-xor-source-prover.js",
    schema: "iroha-sccp-ton-source-browser-prover-manifest/v1",
    exports: [
      "proveTonSccpSource",
      "irohaSccpTonSourceProve",
      "tonSccpSourceProve",
      "proveTonSource",
    ],
  },
  {
    kind: "ton-destination",
    direction: "taira-to-ton",
    entry: "src/provers/sccp-ton-destination-prover.js",
    out: "public/sccp-ton/taira-ton-xor-destination-prover.js",
    moduleUrl: "/sccp-ton/taira-ton-xor-destination-prover.js",
    schema: "iroha-sccp-ton-destination-browser-prover-manifest/v1",
    exports: ["proveTonSccpMessage"],
  },
];

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const stableJson = (value) => {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJson(entry)]),
    );
  }
  return value;
};

const buildOne = async (item) => {
  const outfile = resolve(item.out);
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [resolve(item.entry)],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    inject: [resolve("scripts/esbuild-buffer-shim.js")],
    define: {
      global: "globalThis",
    },
    sourcemap: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const bytes = await readFile(outfile);
  const moduleSha256 = sha256Hex(bytes);
  const manifest = {
    schema: item.schema,
    moduleUrl: item.moduleUrl,
    kind: item.kind,
    direction: item.direction,
    exports: item.exports,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY,
    tairaChainId: TAIRA_CHAIN_ID,
    tairaNetworkPrefix: TAIRA_NETWORK_PREFIX,
    tonNetwork: "testnet",
    tonChain: "ton-testnet",
    tonChainIdHex: TON_TESTNET_CHAIN_ID_HEX,
    moduleSha256,
    boundRouteHash: BOUND_ROUTE_HASH,
    boundProofHash: BOUND_PROOF_HASH,
  };
  manifest.manifestSha256 = sha256Hex(
    Buffer.from(JSON.stringify(stableJson(manifest))),
  );
  const manifestPath = `${outfile}.manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    moduleUrl: item.moduleUrl,
    outfile,
    manifestPath,
    moduleSha256,
    manifestSha256: manifest.manifestSha256,
  };
};

const main = async () => {
  const results = [];
  for (const item of modules) {
    results.push(await buildOne(item));
  }
  for (const result of results) {
    console.log(
      `Built ${result.moduleUrl} (${result.moduleSha256}) -> ${result.outfile}`,
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
