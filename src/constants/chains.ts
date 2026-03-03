import type { ConnectionConfig } from "@/stores/session";

export type ChainPreset = {
  id: string;
  label: string;
  description: string;
  connection: ConnectionConfig;
};

export const CHAIN_PRESETS: ChainPreset[] = [
  {
    id: "nexus",
    label: "Nexus",
    description: "SORA Nexus (mainnet) — production profile.",
    connection: {
      toriiUrl: "https://nexus.mof2.sora.org:8080",
      chainId: "00000000-0000-0000-0000-000000000753",
      assetDefinitionId: "rose#wonderland",
      networkPrefix: 42,
    },
  },
  {
    id: "testus",
    label: "Testus",
    description: "Public testnet mirror of Nexus.",
    connection: {
      toriiUrl: "https://testus.mof3.sora.org:18080",
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      assetDefinitionId: "rose#wonderland",
      networkPrefix: 42,
    },
  },
];
