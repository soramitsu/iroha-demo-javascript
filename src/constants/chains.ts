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

export const MINAMOTO_CHAIN_PRESET: ChainPreset = {
  id: "minamoto-mainnet",
  label: "MINAMOTO Mainnet",
  description: "SORA Nexus mainnet profile.",
  connection: {
    toriiUrl: "https://minamoto.sora.org",
    chainId: "sora nexus main net",
    assetDefinitionId: "",
    networkPrefix: 753,
  },
};

export const CHAIN_PRESETS: ChainPreset[] = [
  TAIRA_CHAIN_PRESET,
  MINAMOTO_CHAIN_PRESET,
];

export const TAIRA_EXPLORER_URL = "https://taira-explorer.sora.org";
export const TAIRA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
