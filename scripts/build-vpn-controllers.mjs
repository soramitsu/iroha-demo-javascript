import { cpSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const irohaRoot = resolve(repoRoot, "../iroha");
const distRoot = resolve(repoRoot, "dist-native", "vpn");

const parsePlatformArg = () => {
  const index = process.argv.indexOf("--platform");
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return process.platform;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
};

const ensureParent = (target) => {
  mkdirSync(dirname(target), { recursive: true });
};

const copyBuiltBinary = (source, target) => {
  ensureParent(target);
  cpSync(source, target);
  console.log(`copied ${source} -> ${target}`);
};

const buildLinuxController = () => {
  run("cargo", ["build", "--release", "-p", "sora-vpn-helper"], {
    cwd: irohaRoot,
  });
  copyBuiltBinary(
    join(irohaRoot, "target", "release", "sora-vpn-controller"),
    join(distRoot, "linux", "sora-vpn-controller"),
  );
};

const buildMacController = () => {
  const packageRoot = join(repoRoot, "native", "macos-vpn-controller");
  run("swift", ["build", "-c", "release", "--package-path", packageRoot], {
    cwd: repoRoot,
  });
  copyBuiltBinary(
    join(packageRoot, ".build", "release", "sora-vpn-controller"),
    join(distRoot, "darwin", "sora-vpn-controller"),
  );
};

const platform = parsePlatformArg();

if (platform === "linux") {
  buildLinuxController();
} else if (platform === "darwin") {
  buildMacController();
} else {
  console.log(
    `No VPN controller build is configured for platform ${platform}.`,
  );
}
