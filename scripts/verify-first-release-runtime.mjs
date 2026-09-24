#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");

const REQUIRED_RUNTIME_FILES = [
  "main/index.cjs",
  "preload/preload.mjs",
  "renderer/index.html",
];

const TEXT_RUNTIME_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
]);

const FORBIDDEN_RUNTIME_ASSET =
  /(?:^|\/)(?:native-v1|sccp(?:-|\/)|offline(?:-|\/)|walletconnect(?:-|\/)|sccpProver)/iu;

export const FIRST_RELEASE_FORBIDDEN_RUNTIME_MARKERS = [
  "/v1/sccp",
  "/v1/zk/ivm",
  "/v1/offline/readiness",
  "/v1/soracloud/hf/deploy",
  "Accept offline payment",
  "buildKaigiRosterJoinProof",
  "buildPrivateCreateKaigiTransaction",
  "buildPrivateEndKaigiTransaction",
  "buildPrivateJoinKaigiTransaction",
  "callEvmRpc",
  "callSolanaRpc",
  "CanEnactGovernance permission is required for enact.",
  "CanSubmitGovernanceBallot permission is missing on the active account.",
  "Cast Plain Ballot",
  "deploySoraCloud",
  "Destination Account ID",
  "governanceBallotDraft",
  "governanceEnactBoundary",
  "governancePlainReferendum",
  "Hide QR Code",
  "Iroha Offline Wallet",
  "joinSoraCloud",
  "kagemushaOffline",
  "Launch live instance",
  "Live deployments",
  "Manage deployments and rollouts",
  "peerIdentityReveal",
  "privateKaigiContract",
  "referendumId and proposalId are required for finalize.",
  "Referendum Lookup",
  "Register secure offline wallet",
  "rosterRootHex",
  "QR encodes account + amount + asset definition for compatible wallets.",
  "QR payload is invalid.",
  "Scan QR Code",
  "sccpLegacySdk",
  "SccpView",
  "sccpProver",
  "soraCloudDeployRequest",
  "soraCloudHfFlow",
  "soracloud-deployment-",
  "soracloud-launch-",
  "Send anonymously",
  "Share Payment QR",
  "Show QR Code",
  "Submit ballot",
  "Tap the button to generate a QR.",
  "Transaction submitted: {hash}",
  "Transfer Asset",
  "triggerTronSmartContract",
  "Upload QR Image",
  "Use the button above to render a QR that wallets can scan.",
  "useSccpBridge",
  "Use Launch instance to submit a real Hugging Face deployment.",
  "WalletConnect",
];

const requireDirectory = (path, label) => {
  const stats = lstatSync(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    realpathSync.native(path) !== path
  ) {
    throw new Error(`${label} must be a canonical physical directory.`);
  }
};

const requireRegularFile = (path, label) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0) {
    throw new Error(`${label} must be a non-empty regular file.`);
  }
};

const collectRuntimeFiles = (root, directory = root) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `First-release runtime output contains a symlink (${relativePath}).`,
      );
    }
    if (stats.isDirectory()) return collectRuntimeFiles(root, path);
    if (!stats.isFile()) {
      throw new Error(
        `First-release runtime output contains an unsupported entry (${relativePath}).`,
      );
    }
    return [{ path, relativePath }];
  });

export const verifyFirstReleaseRuntimeBuild = ({
  distRoot = resolve(projectRoot, "dist"),
} = {}) => {
  const canonicalDistRoot = resolve(distRoot);
  requireDirectory(canonicalDistRoot, "Wallet build output");

  for (const required of REQUIRED_RUNTIME_FILES) {
    requireRegularFile(
      join(canonicalDistRoot, ...required.split("/")),
      `First-release runtime ${required}`,
    );
  }

  const runtimeFiles = ["main", "preload", "renderer"].flatMap((directory) => {
    const root = join(canonicalDistRoot, directory);
    requireDirectory(root, `First-release ${directory} output`);
    return collectRuntimeFiles(canonicalDistRoot, root);
  });
  const allDistFiles = collectRuntimeFiles(canonicalDistRoot);
  const forbiddenAsset = allDistFiles.find(({ relativePath }) =>
    FORBIDDEN_RUNTIME_ASSET.test(relativePath),
  );
  if (forbiddenAsset) {
    throw new Error(
      `Retired first-release asset entered the build (${forbiddenAsset.relativePath}).`,
    );
  }

  for (const { path, relativePath } of runtimeFiles) {
    if (!TEXT_RUNTIME_EXTENSIONS.has(extname(relativePath).toLowerCase())) {
      continue;
    }
    const source = readFileSync(path, "utf8");
    const marker = FIRST_RELEASE_FORBIDDEN_RUNTIME_MARKERS.find((value) =>
      source.includes(value),
    );
    if (marker) {
      throw new Error(
        `Retired first-release runtime marker ${JSON.stringify(marker)} entered ${relativePath}.`,
      );
    }
  }

  return runtimeFiles.map(({ relativePath }) => relativePath).sort();
};

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const verified = verifyFirstReleaseRuntimeBuild();
  process.stdout.write(
    `Verified ${verified.length} first-release runtime files with no retired surfaces.\n`,
  );
}
