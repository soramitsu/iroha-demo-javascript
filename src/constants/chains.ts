import type { ConnectionConfig } from "@/stores/session";

export type ChainPreset = {
  id: string;
  label: string;
  description: string;
  connection: ConnectionConfig;
};

export const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

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
    assetDefinitionId: SORA_XOR_ASSET_DEFINITION_ID,
    networkPrefix: 753,
  },
};

export const CHAIN_PRESETS: ChainPreset[] = [
  MINAMOTO_CHAIN_PRESET,
  TAIRA_CHAIN_PRESET,
];

const envString = (key: string): string | null => {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const envNumber = (key: string): number | null => {
  const value = envString(key);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const defaultPresetId = envString("VITE_DEFAULT_CHAIN_PRESET");
const defaultPreset =
  CHAIN_PRESETS.find((preset) => preset.id === defaultPresetId) ??
  MINAMOTO_CHAIN_PRESET;

export const DEFAULT_CHAIN_PRESET: ChainPreset = {
  ...defaultPreset,
  connection: {
    ...defaultPreset.connection,
    toriiUrl:
      envString("VITE_DEFAULT_TORII_URL") ?? defaultPreset.connection.toriiUrl,
    chainId:
      envString("VITE_DEFAULT_CHAIN_ID") ?? defaultPreset.connection.chainId,
    assetDefinitionId:
      envString("VITE_DEFAULT_ASSET_DEFINITION_ID") ??
      defaultPreset.connection.assetDefinitionId,
    networkPrefix:
      envNumber("VITE_DEFAULT_NETWORK_PREFIX") ??
      defaultPreset.connection.networkPrefix,
  },
};

export const MINAMOTO_EXPLORER_URL = "https://minamoto-explorer.sora.org";
export const TAIRA_EXPLORER_URL = "https://taira-explorer.sora.org";
export const DEFAULT_EXPLORER_URL = MINAMOTO_EXPLORER_URL;
