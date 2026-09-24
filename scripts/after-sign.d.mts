import type { Stats } from "node:fs";

export type AfterSignContext = Readonly<{
  electronPlatformName?: string;
  appOutDir: string;
  packager: Readonly<{
    appInfo: Readonly<{ productFilename: string }>;
  }>;
}>;

export type AfterSignProcessResult = Readonly<{
  error?: unknown;
  status: number | null;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
}>;

export type AfterSignRunProcess = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    encoding?: "utf8";
    env: Readonly<Record<string, string>>;
    input?: string | Buffer;
    stdio?: "ignore";
    windowsHide?: true;
  }>,
) => AfterSignProcessResult;

export type AfterSignDependencies = Readonly<{
  environment?: NodeJS.ProcessEnv;
  inspectPath?: (
    path: string,
  ) => Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink">;
  runProcess?: AfterSignRunProcess;
}>;

export function verifyWindowsPackageAuthenticode(
  context: AfterSignContext,
  dependencies?: AfterSignDependencies,
): void;

export function verifyMacPackageSignatures(
  context: AfterSignContext,
  dependencies?: AfterSignDependencies,
): void;

export default function verifyPackagedSignatures(
  context: AfterSignContext,
): void;
