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

export function resolveCompatibleIrohaSdkRoot(
  options?: IrohaSdkResolutionOptions,
): string;
