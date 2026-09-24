export interface IrohaNativeBuildResolution {
  readonly buildEnvironment: Readonly<NodeJS.ProcessEnv>;
  readonly cargoManifest: string;
  readonly cargoPath: string;
  readonly cargoTargetDirectory: string;
  readonly repoRoot: string;
  readonly sdkRoot: string;
}

export interface IrohaNativeBuildProcessResult {
  readonly error?: Error;
  readonly status: number | null;
  readonly stdout?: string | Buffer | null;
}

export type IrohaNativeBuildProcess = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    encoding?: BufferEncoding;
    env?: NodeJS.ProcessEnv;
    stdio?: "inherit";
  }>,
) => IrohaNativeBuildProcessResult;

export interface IrohaNativeBuildOptions {
  environment?: NodeJS.ProcessEnv;
  projectRoot?: string;
  runProcess?: IrohaNativeBuildProcess;
  sdkRoot: string;
}

export function resolveIrohaNativeBuildEnvironment(
  options: IrohaNativeBuildOptions,
): IrohaNativeBuildResolution;

export function buildIrohaNative(
  options: IrohaNativeBuildOptions,
): IrohaNativeBuildResolution;
