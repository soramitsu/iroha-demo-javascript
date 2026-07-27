import { lstatSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const AUTHENTICODE_STATUS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$signature = Get-AuthenticodeSignature -LiteralPath $env:SORA_WALLET_NATIVE_PATH",
  "if ($null -eq $signature -or $signature.Status.ToString() -cne 'Valid') { exit 1 }",
  "exit 0",
].join("; ");

const POWERSHELL_ENVIRONMENT_KEYS = [
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "PATH",
  "PSModulePath",
  "TEMP",
  "TMP",
];

export function verifyWindowsNativeAuthenticode(
  context,
  {
    environment = process.env,
    inspectPath = lstatSync,
    runProcess = spawnSync,
  } = {},
) {
  if (
    context.electronPlatformName !== "win32" ||
    environment.HAS_WIN_SIGNING !== "true"
  ) {
    return;
  }

  const nativePath = join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "dist",
    "native",
    "iroha_js_host.node",
  );

  let nativeStats;
  try {
    nativeStats = inspectPath(nativePath);
  } catch {
    throw new Error(
      "Signed Windows package is missing the staged Iroha native binding.",
    );
  }
  if (!nativeStats.isFile() || nativeStats.isSymbolicLink()) {
    throw new Error(
      "The staged Iroha native binding must be a regular, non-symlink file.",
    );
  }

  const powershellEnvironment = {
    SORA_WALLET_NATIVE_PATH: nativePath,
  };
  for (const requestedKey of POWERSHELL_ENVIRONMENT_KEYS) {
    const sourceKey = Object.keys(environment).find(
      (candidate) =>
        candidate.toLocaleLowerCase("en-US") ===
        requestedKey.toLocaleLowerCase("en-US"),
    );
    if (sourceKey && typeof environment[sourceKey] === "string") {
      powershellEnvironment[sourceKey] = environment[sourceKey];
    }
  }

  const result = runProcess(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      AUTHENTICODE_STATUS_SCRIPT,
    ],
    {
      env: powershellEnvironment,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "The staged Iroha native binding does not have a valid Authenticode signature.",
    );
  }
}

export default verifyWindowsNativeAuthenticode;
