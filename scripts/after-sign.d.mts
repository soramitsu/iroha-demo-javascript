import type { Stats } from "node:fs";

export type AfterSignContext = Readonly<{
  electronPlatformName?: string;
  appOutDir: string;
}>;

export type AfterSignProcessResult = Readonly<{
  error?: unknown;
  status: number | null;
}>;

export type AfterSignRunProcess = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    env: Readonly<Record<string, string>>;
    stdio: "ignore";
    windowsHide: true;
  }>,
) => AfterSignProcessResult;

export type AfterSignDependencies = Readonly<{
  environment?: NodeJS.ProcessEnv;
  inspectPath?: (path: string) => Pick<Stats, "isFile" | "isSymbolicLink">;
  runProcess?: AfterSignRunProcess;
}>;

export function verifyWindowsNativeAuthenticode(
  context: AfterSignContext,
  dependencies?: AfterSignDependencies,
): void;

export default verifyWindowsNativeAuthenticode;
