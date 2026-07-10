#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mainEntry = path.join(repoRoot, "dist/main/index.cjs");
const proverPath = path.join(
  repoRoot,
  "dist/renderer/sccp-solana/taira-solana-xor-destination-prover.js",
);
const proverUrl = "/sccp-solana/taira-solana-xor-destination-prover.js";
const workerAssetsDir = path.join(repoRoot, "dist/renderer/assets");
const expectedDestinationProverError =
  "Solana SCCP destination prover is not bundled in this build. Publish the governed Solana proof package before enabling taira_sol_xor.";

const resolveHashedWorkerUrl = () => {
  requireBuiltFile(workerAssetsDir);
  const matches = readdirSync(workerAssetsDir).filter((name) =>
    /^sccpProver\.worker-[A-Za-z0-9_-]+\.js$/u.test(name),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one built SCCP prover worker asset, found ${matches.length}.`,
    );
  }
  return `/assets/${matches[0]}`;
};

const requireBuiltFile = (file) => {
  if (!existsSync(file)) {
    throw new Error(
      `Built Electron asset is missing: ${file}. Run npm run build first.`,
    );
  }
};

const main = async () => {
  requireBuiltFile(mainEntry);
  requireBuiltFile(proverPath);
  const workerUrl = resolveHashedWorkerUrl();
  const expectedModuleHash = `0x${createHash("sha256")
    .update(readFileSync(proverPath))
    .digest("hex")}`;
  const env = { ...process.env };
  delete env.ELECTRON_RENDERER_URL;
  const application = await electron.launch({ args: [mainEntry], env });
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    const observed = await page.evaluate(
      async ({ moduleUrl, workerUrl, expectedProverError }) => {
        const response = await fetch(moduleUrl, {
          cache: "no-store",
          credentials: "omit",
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const moduleHash = `0x${Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")}`;
        const loaded = await import(moduleUrl);
        const selfTest = await loaded.solanaSccpDestinationProverSelfTest();
        const traversalResponse = await fetch(
          "/%252e%252e%252foutside-renderer",
        );
        const methodResponse = await fetch(moduleUrl, { method: "POST" });
        const headResponse = await fetch(moduleUrl, { method: "HEAD" });
        const headBytes = new Uint8Array(await headResponse.arrayBuffer());
        const runWorkerRequest = (request) =>
          new Promise((resolve, reject) => {
            const worker = new Worker(workerUrl, { type: "module" });
            const timeout = setTimeout(() => {
              worker.terminate();
              reject(
                new Error("Packaged SCCP prover worker response timed out."),
              );
            }, 10_000);
            worker.addEventListener(
              "message",
              (event) => {
                clearTimeout(timeout);
                worker.terminate();
                resolve(event.data);
              },
              { once: true },
            );
            worker.addEventListener(
              "error",
              (event) => {
                clearTimeout(timeout);
                worker.terminate();
                reject(
                  new Error(
                    event.message || "Packaged SCCP prover worker failed.",
                  ),
                );
              },
              { once: true },
            );
            worker.postMessage(request);
          });
        const workerMalformedResponse = await runWorkerRequest({
          id: "renderer-protocol-smoke",
          kind: "malformed-protocol-request",
          input: {},
        });
        const workerGovernedLoaderResponse = await runWorkerRequest({
          id: "renderer-protocol-governed-loader-smoke",
          kind: "prove-solana-proof-package",
          input: {
            witness: {
              messageId: `0x${"11".repeat(32)}`,
              payloadHash: `0x${"22".repeat(32)}`,
            },
            publicInputs: {
              messageId: `0x${"11".repeat(32)}`,
              payloadHash: `0x${"22".repeat(32)}`,
              targetDomain: 3,
              commitmentRoot: `0x${"33".repeat(32)}`,
              finalityHeight: "42",
              finalityBlockHash: `0x${"44".repeat(32)}`,
            },
            bundleBytes: `0x${"55".repeat(32)}`,
            manifest: {
              route_id: "taira_sol_xor",
              destinationBrowserProver: {
                moduleUrl,
                moduleHash,
              },
            },
          },
        });
        return {
          protocol: location.protocol,
          origin: location.origin,
          responseOk: response.ok,
          status: response.status,
          byteLength: bytes.byteLength,
          moduleHash,
          exactExport: typeof loaded.proveSolanaSccpDestination === "function",
          placeholderFailsClosed:
            selfTest.ready === false &&
            selfTest.productionProofsReady === false,
          traversalStatus: traversalResponse.status,
          methodStatus: methodResponse.status,
          headStatus: headResponse.status,
          headByteLength: headBytes.byteLength,
          headContentType: headResponse.headers.get("content-type"),
          workerUrl,
          workerUrlHashed:
            /^\/assets\/sccpProver\.worker-[A-Za-z0-9_-]+\.js$/u.test(
              workerUrl,
            ),
          workerMalformedResponse:
            workerMalformedResponse?.id === "renderer-protocol-smoke" &&
            workerMalformedResponse?.ok === false &&
            typeof workerMalformedResponse?.error === "string" &&
            workerMalformedResponse.error.includes(
              "Unsupported SCCP worker request",
            ),
          workerGovernedLoaderResponse:
            workerGovernedLoaderResponse?.id ===
              "renderer-protocol-governed-loader-smoke" &&
            workerGovernedLoaderResponse?.ok === false &&
            workerGovernedLoaderResponse?.error === expectedProverError,
          workerGovernedLoaderError:
            workerGovernedLoaderResponse?.error ?? null,
        };
      },
      {
        moduleUrl: proverUrl,
        workerUrl,
        expectedProverError: expectedDestinationProverError,
      },
    );
    const expected = {
      protocol: "iroha-app:",
      origin: "iroha-app://renderer",
      responseOk: true,
      status: 200,
      moduleHash: expectedModuleHash,
      exactExport: true,
      placeholderFailsClosed: true,
      traversalStatus: 400,
      methodStatus: 405,
      headStatus: 200,
      headByteLength: 0,
      headContentType: "text/javascript; charset=utf-8",
      workerUrl,
      workerUrlHashed: true,
      workerMalformedResponse: true,
      workerGovernedLoaderResponse: true,
      workerGovernedLoaderError: expectedDestinationProverError,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (observed[key] !== value) {
        throw new Error(
          `Packaged renderer protocol ${key} mismatch: expected ${JSON.stringify(value)}, observed ${JSON.stringify(observed[key])}.`,
        );
      }
    }
    if (
      !Number.isSafeInteger(observed.byteLength) ||
      observed.byteLength <= 0
    ) {
      throw new Error("Packaged renderer prover module was empty.");
    }
    process.stdout.write(
      `${JSON.stringify({ ready: true, ...observed }, null, 2)}\n`,
    );
  } finally {
    await application.close();
  }
};

await main();
