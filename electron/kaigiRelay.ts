export type KaigiRelayManifest = {
  expiryMs: number;
  hops: Array<{
    relayId: string;
    hpkePublicKey: string;
    weight: number;
  }>;
};

type KaigiRelaySummary = {
  relay_id: string;
  status?: string | null;
  bandwidth_class?: number | null;
};

type KaigiRelayDetail = {
  relay: {
    relay_id: string;
  };
  hpke_public_key_b64: string;
};

export type KaigiRelayInventoryClient = {
  listKaigiRelays(): Promise<{ items?: readonly KaigiRelaySummary[] | null }>;
  getKaigiRelay(relayId: string): Promise<KaigiRelayDetail | null>;
};

export class KaigiRelayDiscoveryError extends Error {
  readonly code: "relay_inventory_unreachable" | "relay_inventory_empty";

  constructor(
    code: "relay_inventory_unreachable" | "relay_inventory_empty",
    message: string,
  ) {
    super(message);
    this.name = "KaigiRelayDiscoveryError";
    this.code = code;
  }
}

const errorDetail = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.trim();
  }
  return String(error ?? "").trim();
};

export const discoverKaigiRelayManifest = async (
  client: KaigiRelayInventoryClient,
  expiryMs: number,
): Promise<KaigiRelayManifest> => {
  let summaries: Awaited<
    ReturnType<KaigiRelayInventoryClient["listKaigiRelays"]>
  >;
  try {
    summaries = await client.listKaigiRelays();
  } catch (error) {
    const detail = errorDetail(error);
    throw new KaigiRelayDiscoveryError(
      "relay_inventory_unreachable",
      `Kaigi relay discovery failed because the relay inventory could not be reached.${detail ? ` ${detail}` : ""} No meeting was signed or submitted.`,
    );
  }

  const candidates = [...(summaries.items ?? [])]
    .filter((item) =>
      ["healthy", "degraded", ""].includes(String(item.status ?? "").trim()),
    )
    .sort((left, right) => {
      if ((left.status ?? "") !== (right.status ?? "")) {
        if (left.status === "healthy") return -1;
        if (right.status === "healthy") return 1;
      }
      return (
        Number(right.bandwidth_class ?? 0) - Number(left.bandwidth_class ?? 0)
      );
    })
    .slice(0, 2);

  if (candidates.length === 0) {
    throw new KaigiRelayDiscoveryError(
      "relay_inventory_empty",
      "Kaigi relay discovery succeeded, but no healthy relay is available. No meeting was signed or submitted. Open Advanced signaling to exchange raw packets manually.",
    );
  }

  let details: Array<KaigiRelayDetail | null>;
  try {
    details = await Promise.all(
      candidates.map((candidate) => client.getKaigiRelay(candidate.relay_id)),
    );
  } catch (error) {
    const detail = errorDetail(error);
    throw new KaigiRelayDiscoveryError(
      "relay_inventory_unreachable",
      `Kaigi relay discovery failed while loading relay details.${detail ? ` ${detail}` : ""} No meeting was signed or submitted.`,
    );
  }

  const hops = details
    .filter((detail): detail is KaigiRelayDetail => detail !== null)
    .map((detail, index) => ({
      relayId: detail.relay.relay_id,
      hpkePublicKey: detail.hpke_public_key_b64,
      weight: Math.max(1, 2 - index),
    }))
    .filter((hop) => hop.relayId.trim() && hop.hpkePublicKey.trim());

  if (hops.length === 0) {
    throw new KaigiRelayDiscoveryError(
      "relay_inventory_empty",
      "Kaigi relay discovery succeeded, but the relay inventory contained no usable relay details. No meeting was signed or submitted. Open Advanced signaling to exchange raw packets manually.",
    );
  }

  return {
    expiryMs,
    hops,
  };
};
