/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_SCCP_TRON_NETWORK?: string;
  readonly VITE_SCCP_TRON_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_NETWORK?: string;
  readonly VITE_SCCP_BSC_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_PROVER_MANIFEST_URL?: string;
  readonly VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL?: string;
  readonly VITE_SCCP_BSC_PROVER_CONFIG_URL?: string;
  readonly VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL?: string;
  readonly VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL?: string;
  readonly VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL?: string;
  readonly VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL?: string;
  readonly VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL?: string;
  readonly VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "qrcode" {
  export function toDataURL(text: string, options?: unknown): Promise<string>;
  export function toString(text: string, options?: unknown): Promise<string>;
  const QRCode: {
    toDataURL: typeof toDataURL;
    toString: typeof toString;
  };
  export default QRCode;
}
