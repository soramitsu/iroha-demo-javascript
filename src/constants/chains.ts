import type { ConnectionConfig } from "@/stores/session";

export type ChainPreset = {
  id: string;
  label: string;
  description: string;
  connection: ConnectionConfig;
};

export const TAIRA_CHAIN_PRESET: ChainPreset = {
  id: "taira-testnet",
  label: "TAIRA Testnet",
  description: "Public TAIRA testnet profile.",
  connection: {
    toriiUrl: "https://taira.sora.org",
    chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
    assetDefinitionId: "",
    networkPrefix: 369,
  },
};

export const CHAIN_PRESETS: ChainPreset[] = [TAIRA_CHAIN_PRESET];

export const TAIRA_EXPLORER_URL = "https://taira-explorer.sora.org";
