import { access, lstat, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { VpnExitClass } from "../src/types/iroha";
import { sanitizeErrorMessage } from "../src/utils/errorMessage";
import { parseJsonWithoutDuplicateObjectKeys } from "../src/utils/json";

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
  installed: boolean;
  active: boolean;
  controller_kind: string;
  interface_name: string | null;
  network_service: string | null;
  version: string;
  controller_path: string | null;
  repair_required: boolean;
  bytes_in: number;
  bytes_out: number;
  message: string;
};

const CONTROLLER_RESPONSE_KEYS = [
  "active",
  "bytes_in",
  "bytes_out",
  "controller_kind",
  "controller_path",
  "installed",
  "interface_name",
  "message",
  "network_service",
  "repair_required",
  "version",
] as const;

const CONTROLLER_RESPONSE_MAX_BYTES = 64 * 1024;
const CONTROLLER_COMMAND_TIMEOUT_MS = 30_000;

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

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireExactControllerResponse = (
  value: unknown,
  platform: string,
  controllerPath: string,
): JsonControllerResponse => {
  if (!isPlainRecord(value)) {
    throw new Error("VPN controller response must be a JSON object.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== CONTROLLER_RESPONSE_KEYS.length ||
    keys.some((key, index) => key !== CONTROLLER_RESPONSE_KEYS[index])
  ) {
    throw new Error(
      `VPN controller response must contain exactly: ${CONTROLLER_RESPONSE_KEYS.join(", ")}.`,
    );
  }
  const requireBoolean = (key: "installed" | "active" | "repair_required") => {
    if (typeof value[key] !== "boolean") {
      throw new Error(`VPN controller response ${key} must be a boolean.`);
    }
    return value[key];
  };
  const requireNullableString = (
    key: "interface_name" | "network_service" | "controller_path",
  ) => {
    const candidate = value[key];
    if (candidate === null) {
      return null;
    }
    if (
      typeof candidate !== "string" ||
      candidate.length === 0 ||
      candidate !== candidate.trim()
    ) {
      throw new Error(
        `VPN controller response ${key} must be null or an exact non-empty string.`,
      );
    }
    return candidate;
  };
  const requireString = (key: "controller_kind" | "version" | "message") => {
    const candidate = value[key];
    if (
      typeof candidate !== "string" ||
      candidate.length === 0 ||
      candidate !== candidate.trim()
    ) {
      throw new Error(
        `VPN controller response ${key} must be an exact non-empty string.`,
      );
    }
    return candidate;
  };
  const requireCounter = (key: "bytes_in" | "bytes_out") => {
    const candidate = value[key];
    if (!Number.isSafeInteger(candidate) || Number(candidate) < 0) {
      throw new Error(
        `VPN controller response ${key} must be a non-negative safe integer.`,
      );
    }
    return Number(candidate);
  };

  const installed = requireBoolean("installed");
  const active = requireBoolean("active");
  const controllerKind = requireString("controller_kind");
  const expectedControllerKind =
    platform === "darwin"
      ? "macos-network-extension"
      : platform === "linux"
        ? "linux-helperd"
        : null;
  if (
    expectedControllerKind === null ||
    controllerKind !== expectedControllerKind
  ) {
    throw new Error(
      `VPN controller response controller_kind must equal ${String(expectedControllerKind)} on ${platform}.`,
    );
  }
  if (active && !installed) {
    throw new Error("VPN controller cannot report active while not installed.");
  }
  const reportedPath = requireNullableString("controller_path");
  if (reportedPath === null || resolve(reportedPath) !== controllerPath) {
    throw new Error(
      "VPN controller response controller_path must exactly match the executed helper.",
    );
  }

  return {
    installed,
    active,
    controller_kind: controllerKind,
    interface_name: requireNullableString("interface_name"),
    network_service: requireNullableString("network_service"),
    version: requireString("version"),
    controller_path: reportedPath,
    repair_required: requireBoolean("repair_required"),
    bytes_in: requireCounter("bytes_in"),
    bytes_out: requireCounter("bytes_out"),
    message: requireString("message"),
  };
};

export const hasRequiredMacVpnEntitlements = (entitlements: string) =>
  /<key>com\.apple\.developer\.system-extension\.install<\/key>\s*<true\s*\/>/u.test(
    entitlements,
  ) &&
  /<key>com\.apple\.developer\.networking\.networkextension<\/key>\s*<array>\s*<string>packet-tunnel-provider-systemextension<\/string>\s*<\/array>/u.test(
    entitlements,
  ) &&
  /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\s*\/>/u.test(
    entitlements,
  ) &&
  /<key>com\.apple\.security\.application-groups<\/key>\s*<array>\s*<string>[^<\s]+<\/string>\s*<\/array>/u.test(
    entitlements,
  );

export const getMacVpnProvisioningMessage = (input: {
  entitlements: string;
  signatureDetails?: string;
}) => {
  const normalizedEntitlements = input.entitlements.trim();
  const normalizedSignatureDetails = String(
    input.signatureDetails ?? "",
  ).trim();
  const adHocOrUnsigned =
    /Signature=adhoc/i.test(normalizedSignatureDetails) ||
    /TeamIdentifier=not set/i.test(normalizedSignatureDetails);
  if (adHocOrUnsigned) {
    return "Bundled VPN helper is ad hoc-signed and cannot install the macOS VPN system extension. Rebuild the macOS helper app with Apple provisioning and the VPN capabilities enabled for its App ID.";
  }
  if (!/^TeamIdentifier=[A-Z0-9]{10}$/mu.test(normalizedSignatureDetails)) {
    return "Bundled VPN helper does not have an inspectable Apple TeamIdentifier. Rebuild and sign the helper with the release team.";
  }
  return hasRequiredMacVpnEntitlements(normalizedEntitlements)
    ? null
    : "Bundled VPN helper is missing the exact sandbox, app-group, system-extension, or packet-tunnel entitlement set. Rebuild the macOS helper app with the VPN capabilities enabled for its App ID.";
};

const normalizeStatus = (
  payload: JsonControllerResponse,
): VpnControllerStatus => ({
  installed: payload.installed,
  active: payload.active,
  controllerKind: payload.controller_kind,
  interfaceName: payload.interface_name,
  networkService: payload.network_service,
  version: payload.version,
  controllerPath: payload.controller_path,
  repairRequired: payload.repair_required,
  bytesIn: payload.bytes_in,
  bytesOut: payload.bytes_out,
  message: payload.message,
});

const resolveCandidatePaths = (input: {
  platform: string;
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  resourcesPath: string | null;
  developmentRoot: string;
}) => {
  const { platform, env, isPackaged, resourcesPath, developmentRoot } = input;
  const explicit = isPackaged ? "" : env["SORANET_VPN_CONTROLLER"]?.trim();
  const binaryName = defaultControllerBinaryName(platform);
  const candidates = [];
  if (explicit) {
    return [explicit];
  }
  if (resourcesPath) {
    if (platform === "darwin") {
      candidates.push(
        join(
          resourcesPath,
          "..",
          "Helpers",
          "SoraVpnController.app",
          "Contents",
          "MacOS",
          binaryName,
        ),
      );
    }
    if (platform === "linux") {
      candidates.push(join(resourcesPath, "vpn", binaryName));
    }
  }
  if (isPackaged) {
    return candidates;
  }
  if (platform === "darwin") {
    candidates.push(
      join(
        developmentRoot,
        "dist-native",
        "vpn",
        platform,
        "SoraVpnController.app",
        "Contents",
        "MacOS",
        binaryName,
      ),
    );
  }
  candidates.push(
    join(developmentRoot, "dist-native", "vpn", platform, binaryName),
  );
  return candidates;
};

const firstExistingPath = async (paths: string[]) => {
  for (const path of paths) {
    try {
      await access(path, fsConstants.X_OK);
      const absolutePath = isAbsolute(path) ? path : resolve(path);
      const metadata = await lstat(absolutePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        continue;
      }
      if ((metadata.mode & 0o022) !== 0) {
        continue;
      }
      const canonicalPath = await realpath(absolutePath);
      return canonicalPath;
    } catch {
      continue;
    }
  }
  return null;
};

const resolveMacBundlePath = (controllerPath: string) => {
  const marker = "/Contents/MacOS/";
  const markerIndex = controllerPath.lastIndexOf(marker);
  return markerIndex >= 0
    ? controllerPath.slice(0, markerIndex)
    : controllerPath;
};

export class BundledVpnController implements VpnLocalController {
  private readonly platform: string;

  private readonly env: NodeJS.ProcessEnv;

  private readonly isPackaged: boolean;

  private readonly resourcesPath: string | null;

  private readonly developmentRoot: string;

  private controllerPath: string | null = null;

  constructor(options?: {
    platform?: string;
    env?: NodeJS.ProcessEnv;
    isPackaged?: boolean;
    resourcesPath?: string | null;
    developmentRoot?: string;
  }) {
    this.platform = options?.platform ?? process.platform;
    this.env = options?.env ?? process.env;
    this.isPackaged = options?.isPackaged === true;
    this.resourcesPath = options?.resourcesPath?.trim() || null;
    this.developmentRoot = options?.developmentRoot ?? process.cwd();
  }

  private candidatePaths(): string[] {
    return resolveCandidatePaths({
      platform: this.platform,
      env: this.env,
      isPackaged: this.isPackaged,
      resourcesPath: this.resourcesPath,
      developmentRoot: this.developmentRoot,
    });
  }

  async refreshCapability(): Promise<VpnControllerStatus> {
    this.controllerPath = await firstExistingPath(this.candidatePaths());
    if (!this.controllerPath) {
      return missingStatus(this.platform, null);
    }
    try {
      return await this.run("install-check");
    } catch (error) {
      return {
        ...missingStatus(this.platform, this.controllerPath),
        controllerPath: this.controllerPath,
        repairRequired: true,
        message: sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }

  async getStatus(): Promise<VpnControllerStatus> {
    const controllerPath =
      this.controllerPath ?? (await firstExistingPath(this.candidatePaths()));
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
    this.controllerPath = await firstExistingPath(
      this.controllerPath ? [this.controllerPath] : this.candidatePaths(),
    );
    return Boolean(this.controllerPath);
  }

  private async validateMacProvisioning(controllerPath: string) {
    if (this.platform !== "darwin") {
      return null;
    }
    try {
      const inspectPath = resolveMacBundlePath(controllerPath);
      await execFileAsync("/usr/bin/codesign", [
        "--verify",
        "--deep",
        "--strict",
        "--verbose=2",
        inspectPath,
      ]);
      const [
        { stdout: entitlementStdout, stderr: entitlementStderr },
        { stdout: signatureStdout, stderr: signatureStderr },
      ] = await Promise.all([
        execFileAsync("/usr/bin/codesign", [
          "-d",
          "--entitlements",
          ":-",
          inspectPath,
        ]),
        execFileAsync("/usr/bin/codesign", ["-dvv", inspectPath]),
      ]);
      return getMacVpnProvisioningMessage({
        entitlements: `${entitlementStdout ?? ""}${entitlementStderr ?? ""}`,
        signatureDetails: `${signatureStdout ?? ""}${signatureStderr ?? ""}`,
      });
    } catch (error) {
      const detail = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      return `Bundled VPN helper signature and entitlement verification failed closed${detail ? `: ${detail}` : "."}`;
    }
  }

  private async run(command: ControllerCommand, payload?: unknown) {
    if (!(await this.ensureInstalled()) || !this.controllerPath) {
      return missingStatus(this.platform, this.controllerPath);
    }
    const provisioningMessage = await this.validateMacProvisioning(
      this.controllerPath,
    );
    if (provisioningMessage) {
      throw new Error(provisioningMessage);
    }
    const args = [command, "--json"];
    if (payload !== undefined) {
      args.push(JSON.stringify(payload));
    }
    const result = await execFileAsync(this.controllerPath, args, {
      encoding: "utf8",
      maxBuffer: CONTROLLER_RESPONSE_MAX_BYTES,
      timeout: CONTROLLER_COMMAND_TIMEOUT_MS,
    });
    if (result.stderr.trim() !== "") {
      throw new Error("VPN controller emitted unexpected diagnostic output.");
    }
    const parsed = requireExactControllerResponse(
      parseJsonWithoutDuplicateObjectKeys(
        result.stdout,
        "VPN controller response",
      ),
      this.platform,
      this.controllerPath,
    );
    return normalizeStatus(parsed);
  }
}
