export interface IrohaSdkAlias {
  find: string | RegExp;
  replacement: string;
}

export interface IrohaSdkResolutionOptions {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}

export function hasCurrentIrohaSdkApi(sdkRoot: string): boolean;

export function buildIrohaSdkAliases(sdkRoot: string): IrohaSdkAlias[];

/** Absolute SDK root pinned by `IROHA_JS_SDK_ROOT=` in the git-ignored `.env.local`, or "". */
export function readLocalIrohaSdkRoot(projectRoot: string): string;

export function resolveCompatibleIrohaSdkRoot(
  options?: IrohaSdkResolutionOptions,
): string;
