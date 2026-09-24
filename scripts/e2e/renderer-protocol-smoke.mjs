#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { verifyFirstReleaseRuntimeBuild } from "../verify-first-release-runtime.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mainEntry = path.join(repoRoot, "dist/main/index.cjs");
const rendererRoot = path.join(repoRoot, "dist/renderer");
const rendererIndex = path.join(rendererRoot, "index.html");
const forbiddenRuntimeAsset =
  /(?:^|\/)(?:sccp(?:-|\/)|offline(?:-|\/)|walletconnect(?:-|\/)|sccpProver)/iu;

const requireBuiltFile = (file) => {
  if (!existsSync(file)) {
    throw new Error(
      `Built Electron asset is missing: ${file}. Run npm run build first.`,
    );
  }
};

const listFiles = (directory, prefix = "") =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(path.join(directory, entry.name), relative)
      : [relative];
  });

const resolveRendererEntry = () => {
  requireBuiltFile(rendererIndex);
  const html = readFileSync(rendererIndex, "utf8");
  const matches = Array.from(
    html.matchAll(/<script\b[^>]*\bsrc="\.\/(assets\/[^"?#]+\.js)"[^>]*>/gu),
    (match) => match[1],
  );
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(
      `Expected exactly one relative hashed renderer entry, found ${matches.length}.`,
    );
  }
  if (!/^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(matches[0])) {
    throw new Error(
      `Renderer entry is not the expected hashed asset: ${matches[0]}`,
    );
  }
  const file = path.join(rendererRoot, ...matches[0].split("/"));
  requireBuiltFile(file);
  return { file, url: `/${matches[0]}` };
};

const main = async () => {
  verifyFirstReleaseRuntimeBuild({ distRoot: path.join(repoRoot, "dist") });
  requireBuiltFile(mainEntry);
  const rendererEntry = resolveRendererEntry();
  const builtFiles = listFiles(rendererRoot);
  const forbiddenBuiltFiles = builtFiles.filter((file) =>
    forbiddenRuntimeAsset.test(file),
  );
  if (forbiddenBuiltFiles.length > 0) {
    throw new Error(
      `Runtime-disabled assets entered the renderer build: ${forbiddenBuiltFiles.join(", ")}`,
    );
  }
  const expectedEntryHash = `0x${createHash("sha256")
    .update(readFileSync(rendererEntry.file))
    .digest("hex")}`;
  const env = { ...process.env };
  delete env.ELECTRON_RENDERER_URL;
  const application = await electron.launch({ args: [mainEntry], env });
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    const observed = await page.evaluate(
      async ({ entryUrl }) => {
        const response = await fetch(entryUrl, {
          cache: "no-store",
          credentials: "omit",
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const entryHash = `0x${Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")}`;
        const traversalResponse = await fetch(
          "/%252e%252e%252foutside-renderer",
        );
        const methodResponse = await fetch(entryUrl, { method: "POST" });
        const headResponse = await fetch(entryUrl, { method: "HEAD" });
        const headBytes = new Uint8Array(await headResponse.arrayBuffer());
        const forbiddenStatuses = await Promise.all(
          [
            "/sccp-solana/taira-solana-xor-destination-prover.js",
            "/offline/index.js",
            "/walletconnect/runtime.js",
            "/assets/sccpProver.worker-disabled.js",
            "/assets/privateKaigiContract.js",
            "/assets/governancePlainReferendum.js",
            "/assets/soraCloudDeployRequest.js",
          ].map(
            async (url) => (await fetch(url, { cache: "no-store" })).status,
          ),
        );
        return {
          protocol: location.protocol,
          origin: location.origin,
          responseOk: response.ok,
          status: response.status,
          byteLength: bytes.byteLength,
          entryHash,
          contentType: response.headers.get("content-type"),
          noSniff: response.headers.get("x-content-type-options"),
          traversalStatus: traversalResponse.status,
          methodStatus: methodResponse.status,
          headStatus: headResponse.status,
          headByteLength: headBytes.byteLength,
          headContentType: headResponse.headers.get("content-type"),
          forbiddenStatuses,
        };
      },
      { entryUrl: rendererEntry.url },
    );
    const expected = {
      protocol: "iroha-app:",
      origin: "iroha-app://renderer",
      responseOk: true,
      status: 200,
      entryHash: expectedEntryHash,
      contentType: "text/javascript; charset=utf-8",
      noSniff: "nosniff",
      traversalStatus: 400,
      methodStatus: 405,
      headStatus: 200,
      headByteLength: 0,
      headContentType: "text/javascript; charset=utf-8",
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
      throw new Error("Packaged renderer entry was empty.");
    }
    if (
      observed.forbiddenStatuses.length !== 7 ||
      observed.forbiddenStatuses.some((status) => status !== 400)
    ) {
      throw new Error(
        `Runtime-disabled renderer paths were unexpectedly readable: ${JSON.stringify(observed.forbiddenStatuses)}.`,
      );
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          ready: true,
          entryUrl: rendererEntry.url,
          forbiddenBuiltFiles,
          ...observed,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await application.close();
  }
};

await main();
