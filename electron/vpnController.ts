import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VpnExitClass } from "../src/types/iroha";

const execFileAsync = promisify(execFile);

export type VpnControllerStatus = {
  installed: boolean;
  active: boolean;
  controllerKind: string | null;
  interfaceName: string | null;
  networkService: string | null;
  version: string | null;
  controllerPath: string | null;
  repairRequired: boolean;
  bytesIn: number;
  bytesOut: number;
  message: string;
};

export type VpnControllerConnectInput = {
  sessionId: string;
  relayEndpoint: string;
  exitClass: VpnExitClass;
  helperTicketHex: string;
  routePushes: string[];
  excludedRoutes: string[];
  dnsServers: string[];
  tunnelAddresses: string[];
  mtuBytes: number;
};

export interface VpnLocalController {
  refreshCapability(): Promise<VpnControllerStatus>;
  getStatus(): Promise<VpnControllerStatus>;
  connect(input: VpnControllerConnectInput): Promise<VpnControllerStatus>;
  disconnect(): Promise<VpnControllerStatus>;
  repair(): Promise<VpnControllerStatus>;
}

type ControllerCommand =
  | "install-check"
  | "status"
  | "connect"
  | "disconnect"
  | "repair";

type JsonControllerResponse = {
  installed?: boolean;
  active?: boolean;
  controller_kind?: string | null;
  interface_name?: string | null;
  network_service?: string | null;
  version?: string | null;
  controller_path?: string | null;
  repair_required?: boolean;
  bytes_in?: number;
  bytes_out?: number;
  message?: string;
};

const defaultControllerBinaryName = (platform: string) =>
  platform === "win32" ? "sora-vpn-controller.exe" : "sora-vpn-controller";

const missingStatus = (
  platform: string,
  controllerPath: string | null,
): VpnControllerStatus => ({
  installed: false,
  active: false,
  controllerKind:
    platform === "darwin"
      ? "macos-network-extension"
      : platform === "linux"
        ? "linux-helperd"
        : null,
  interfaceName: null,
  networkService: null,
  version: null,
  controllerPath,
  repairRequired: false,
  bytesIn: 0,
  bytesOut: 0,
  message:
    platform === "darwin" || platform === "linux"
      ? "Bundled VPN controller is not installed. Build or package the platform controller first."
      : "Bundled VPN controller is unavailable on this platform.",
});

const normalizeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const normalizeStatus = (
  platform: string,
  fallbackPath: string | null,
  payload: JsonControllerResponse,
): VpnControllerStatus => ({
  installed: Boolean(payload.installed),
  active: Boolean(payload.active),
  controllerKind:
    typeof payload.controller_kind === "string"
      ? payload.controller_kind
      : null,
  interfaceName:
    typeof payload.interface_name === "string" ? payload.interface_name : null,
  networkService:
    typeof payload.network_service === "string"
      ? payload.network_service
      : null,
  version: typeof payload.version === "string" ? payload.version : null,
  controllerPath:
    typeof payload.controller_path === "string"
      ? payload.controller_path
      : fallbackPath,
  repairRequired: Boolean(payload.repair_required),
  bytesIn: normalizeNumber(payload.bytes_in),
  bytesOut: normalizeNumber(payload.bytes_out),
  message:
    typeof payload.message === "string"
      ? payload.message
      : missingStatus(platform, fallbackPath).message,
});

const resolveCandidatePaths = (platform: string, env: NodeJS.ProcessEnv) => {
  const explicit = env["SORANET_VPN_CONTROLLER"]?.trim();
  const binaryName = defaultControllerBinaryName(platform);
  const candidates = [];
  if (explicit) {
    return [explicit];
  }
  const resourcesPath =
    "resourcesPath" in process &&
    typeof (process as NodeJS.Process & { resourcesPath?: string })
      .resourcesPath === "string"
      ? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      : null;
  if (resourcesPath) {
    candidates.push(join(resourcesPath, "vpn", binaryName));
  }
  candidates.push(
    join(process.cwd(), "dist-native", "vpn", platform, binaryName),
  );
  return candidates;
};

const firstExistingPath = async (paths: string[]) => {
  for (const path of paths) {
    try {
      await access(path, fsConstants.X_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
};

export class BundledVpnController implements VpnLocalController {
  private readonly platform: string;

  private readonly env: NodeJS.ProcessEnv;

  private controllerPath: string | null = null;

  constructor(options?: { platform?: string; env?: NodeJS.ProcessEnv }) {
    this.platform = options?.platform ?? process.platform;
    this.env = options?.env ?? process.env;
  }

  async refreshCapability(): Promise<VpnControllerStatus> {
    this.controllerPath = await firstExistingPath(
      resolveCandidatePaths(this.platform, this.env),
    );
    if (!this.controllerPath) {
      return missingStatus(this.platform, null);
    }
    try {
      return await this.run("install-check");
    } catch (error) {
      return {
        ...missingStatus(this.platform, this.controllerPath),
        controllerPath: this.controllerPath,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(): Promise<VpnControllerStatus> {
    const controllerPath =
      this.controllerPath ??
      (await firstExistingPath(resolveCandidatePaths(this.platform, this.env)));
    this.controllerPath = controllerPath;
    if (!controllerPath) {
      return missingStatus(this.platform, null);
    }
    return this.run("status");
  }

  async connect(
    input: VpnControllerConnectInput,
  ): Promise<VpnControllerStatus> {
    if (!(await this.ensureInstalled())) {
      throw new Error(
        missingStatus(this.platform, this.controllerPath).message,
      );
    }
    return this.run("connect", input);
  }

  async disconnect(): Promise<VpnControllerStatus> {
    if (!(await this.ensureInstalled())) {
      return missingStatus(this.platform, this.controllerPath);
    }
    return this.run("disconnect");
  }

  async repair(): Promise<VpnControllerStatus> {
    if (!(await this.ensureInstalled())) {
      return missingStatus(this.platform, this.controllerPath);
    }
    return this.run("repair");
  }

  private async ensureInstalled() {
    if (this.controllerPath) {
      return true;
    }
    this.controllerPath = await firstExistingPath(
      resolveCandidatePaths(this.platform, this.env),
    );
    return Boolean(this.controllerPath);
  }

  private async run(command: ControllerCommand, payload?: unknown) {
    if (!(await this.ensureInstalled()) || !this.controllerPath) {
      return missingStatus(this.platform, this.controllerPath);
    }
    const args = [command, "--json"];
    if (payload !== undefined) {
      args.push(JSON.stringify(payload));
    }
    const result = await execFileAsync(this.controllerPath, args, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = JSON.parse(result.stdout || "{}") as JsonControllerResponse;
    return normalizeStatus(this.platform, this.controllerPath, parsed);
  }
}
