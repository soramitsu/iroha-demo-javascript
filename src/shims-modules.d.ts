/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_SCCP_TRON_NETWORK?: string;
  readonly VITE_SCCP_TRON_PROVER_MODULE_URL?: string;
  readonly VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL?: string;
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
