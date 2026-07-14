import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const IROHA_SDK_COMPAT_REVISION =
  "ddc6d8607bb2dbf9949c64aaedb271994fbc6931";

const REQUIRED_SCCP_EXPORTS = [
  "bindTairaXorBscToTairaSourceProofPackage",
  "buildBscSourceChainProofEnvelope",
  "buildBscTestnetSccpDestinationProofRequest",
  "buildSolanaSccpProofRequest",
  "buildTairaXorSccpRecordDescriptor",
  "buildTairaXorTonSccpRecordDescriptor",
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(scriptDir, "..");

const commandFailure = (label, result) => {
  const detail = String(result.stderr ?? result.error?.message ?? "").trim();
  throw new Error(`${label} failed${detail ? `: ${detail}` : "."}`);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    commandFailure(`${command} ${args.join(" ")}`, result);
  }
  return result;
};

export const hasCompatibleSccpApi = (sdkRoot) => {
  const sccpPath = join(sdkRoot, "dist", "sccp.js");
  if (!existsSync(sccpPath)) return false;
  const source = readFileSync(sccpPath, "utf8");
  return REQUIRED_SCCP_EXPORTS.every(
    (name) =>
      source.includes(`export function ${name}`) ||
      source.includes(`export class ${name}`) ||
      source.includes(`export const ${name}`),
  );
};

export const buildIrohaSdkAliases = (sdkRoot) => {
  const dist = resolve(sdkRoot, "dist");
  return [
    {
      find: "@iroha/iroha-js/crypto",
      replacement: resolve(dist, "crypto.js"),
    },
    {
      find: "@iroha/iroha-js/address",
      replacement: resolve(dist, "address.js"),
    },
    {
      find: "@iroha/iroha-js/connect-browser",
      replacement: resolve(dist, "connect.browser.js"),
    },
    {
      find: "@iroha/iroha-js/sccp",
      replacement: resolve(dist, "sccp.js"),
    },
    {
      find: "@iroha/iroha-js",
      replacement: resolve(dist, "index.js"),
    },
  ];
};

const ensureGitRevision = (irohaRepoRoot) => {
  const result = spawnSync(
    "git",
    [
      "-C",
      irohaRepoRoot,
      "cat-file",
      "-e",
      `${IROHA_SDK_COMPAT_REVISION}^{commit}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    throw new Error(
      `The linked Iroha SDK is incompatible and the pinned compatibility revision ${IROHA_SDK_COMPAT_REVISION} is not available locally. ` +
        `Fetch that revision in ${irohaRepoRoot}, or set IROHA_JS_SDK_ROOT to a compatible iroha_js checkout.`,
    );
  }
};

const installSdkDependencies = (sdkRoot) => {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const npmArgs = [
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-package-lock",
    "--no-audit",
    "--no-fund",
  ];
  const args = npmExecPath
    ? [npmExecPath, ...npmArgs]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", `npm ${npmArgs.join(" ")}`]
      : npmArgs;
  const result = spawnSync(command, args, {
    cwd: sdkRoot,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    commandFailure("installing pinned @iroha/iroha-js dependencies", result);
  }
};

const hasSdkDependencies = (nodeModulesRoot) =>
  existsSync(join(nodeModulesRoot, "@noble", "ciphers", "chacha.js")) &&
  existsSync(join(nodeModulesRoot, "@noble", "hashes", "blake2b.js")) &&
  existsSync(join(nodeModulesRoot, "@scure", "bip39", "package.json"));

const ensureSdkDependencies = (sdkRoot, linkedSdkRoot) => {
  const target = join(sdkRoot, "node_modules");
  if (hasSdkDependencies(target)) return;

  rmSync(target, { recursive: true, force: true });
  const linkedDependencies = join(linkedSdkRoot, "node_modules");
  if (hasSdkDependencies(linkedDependencies)) {
    symlinkSync(
      linkedDependencies,
      target,
      process.platform === "win32" ? "junction" : "dir",
    );
    return;
  }

  installSdkDependencies(sdkRoot);
  if (!hasSdkDependencies(target)) {
    throw new Error(
      `Pinned @iroha/iroha-js dependencies are incomplete at ${target}.`,
    );
  }
};

const materializePinnedSdk = ({
  projectRoot,
  irohaRepoRoot,
  linkedSdkRoot,
}) => {
  ensureGitRevision(irohaRepoRoot);
  const cacheRoot = join(
    projectRoot,
    "node_modules",
    ".cache",
    "iroha-sdk-compat",
    IROHA_SDK_COMPAT_REVISION,
  );
  const sdkRoot = join(cacheRoot, "javascript", "iroha_js");
  const markerPath = join(cacheRoot, ".ready.json");

  if (!hasCompatibleSccpApi(sdkRoot)) {
    const stagingRoot = `${cacheRoot}.staging-${process.pid}`;
    rmSync(stagingRoot, { recursive: true, force: true });
    mkdirSync(stagingRoot, { recursive: true });

    const archive = run(
      "git",
      [
        "-C",
        irohaRepoRoot,
        "archive",
        "--format=tar",
        IROHA_SDK_COMPAT_REVISION,
        "javascript/iroha_js",
      ],
      { encoding: null, maxBuffer: 256 * 1024 * 1024 },
    );
    const extracted = spawnSync("tar", ["-xf", "-", "-C", stagingRoot], {
      input: archive.stdout,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (extracted.status !== 0) {
      rmSync(stagingRoot, { recursive: true, force: true });
      commandFailure("extracting pinned @iroha/iroha-js", extracted);
    }

    rmSync(cacheRoot, { recursive: true, force: true });
    mkdirSync(dirname(cacheRoot), { recursive: true });
    renameSync(stagingRoot, cacheRoot);
  }

  ensureSdkDependencies(sdkRoot, linkedSdkRoot);
  writeFileSync(
    markerPath,
    `${JSON.stringify({ revision: IROHA_SDK_COMPAT_REVISION }, null, 2)}\n`,
  );
  return sdkRoot;
};

const activateSdkRoot = (projectRoot, sdkRoot) => {
  const activeRoot = join(
    projectRoot,
    "node_modules",
    ".cache",
    "iroha-sdk-compat",
    "active",
  );
  mkdirSync(dirname(activeRoot), { recursive: true });
  rmSync(activeRoot, { recursive: true, force: true });
  symlinkSync(
    sdkRoot,
    activeRoot,
    process.platform === "win32" ? "junction" : "dir",
  );
  return sdkRoot;
};

export const resolveCompatibleIrohaSdkRoot = ({
  projectRoot = defaultProjectRoot,
  env = process.env,
  log = console.info,
} = {}) => {
  const linkedSdkRoot = resolve(projectRoot, "../iroha/javascript/iroha_js");
  const configuredRoot = String(env.IROHA_JS_SDK_ROOT ?? "").trim();
  if (configuredRoot) {
    const resolvedConfiguredRoot = resolve(configuredRoot);
    if (!hasCompatibleSccpApi(resolvedConfiguredRoot)) {
      throw new Error(
        `IROHA_JS_SDK_ROOT does not expose the wallet-compatible SCCP API: ${resolvedConfiguredRoot}`,
      );
    }
    return activateSdkRoot(projectRoot, resolvedConfiguredRoot);
  }

  if (hasCompatibleSccpApi(linkedSdkRoot)) {
    return activateSdkRoot(projectRoot, linkedSdkRoot);
  }

  const irohaRepoRoot = resolve(linkedSdkRoot, "../..");
  const compatibleRoot = materializePinnedSdk({
    projectRoot,
    irohaRepoRoot,
    linkedSdkRoot,
  });
  log(
    `[iroha-sdk] ${linkedSdkRoot} no longer exposes the wallet SCCP API; using cached revision ${IROHA_SDK_COMPAT_REVISION}.`,
  );
  return activateSdkRoot(projectRoot, compatibleRoot);
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(resolveCompatibleIrohaSdkRoot());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
