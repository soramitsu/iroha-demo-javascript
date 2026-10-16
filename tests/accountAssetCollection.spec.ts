// @vitest-environment node
import { AccountAddress } from "@iroha/iroha-js";
import { ed25519 } from "@noble/curves/ed25519";
import { describe, expect, it, vi } from "vitest";
import { fetchAccountAssetCollection } from "../electron/accountAssetCollection";

const accountId = AccountAddress.fromAccount({
  publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(7)),
}).toI105(369);
const asset = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const input = {
  toriiUrl: "https://taira.sora.org",
  accountId,
  networkPrefix: 369,
};
const row = (scope = "global") => ({
  account_id: accountId,
  asset,
  asset_alias: "xor#universal",
  asset_name: "XOR",
  quantity: "25000",
  scope,
});
const response = (
  items: unknown[],
  total: number,
  cursor: string | null = null,
) =>
  new Response(JSON.stringify({ items, total, next_cursor: cursor }), {
    headers: { "content-type": "application/json" },
  });

describe("account assets through the current SDK collection", () => {
  it("uses the real SDK POST query and maps current rows for the renderer", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([row()], 1));
    const result = await fetchAccountAssetCollection(
      { ...input, assetDefinitionId: asset },
      transport,
    );
    expect(result).toEqual({
      items: [
        {
          asset_id: `${asset}#${accountId}`,
          asset_definition_id: asset,
          asset_alias: "xor#universal",
          asset_name: "XOR",
          quantity: "25000",
          scope: "global",
        },
      ],
      total: 1,
    });
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://taira.sora.org/v1/accounts/${encodeURIComponent(accountId)}/assets/query`,
    );
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    const query = JSON.parse(String(init?.body));
    expect(query).toMatchObject({
      limit: 50,
      include_total: true,
      filter: { op: "eq", args: ["asset", asset] },
    });
    expect(query).not.toHaveProperty("offset");
    expect(query).not.toHaveProperty("count_mode");
  });

  it("follows cursors to provide the requested renderer row window", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([row()], 3, "page-two"))
      .mockResolvedValueOnce(
        response([row("dataspace:1"), row("dataspace:2")], 3),
      );
    const result = await fetchAccountAssetCollection(
      { ...input, offset: 1, limit: 1 },
      transport,
    );
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.scope)).toEqual(["dataspace:1"]);
    expect(JSON.parse(String(transport.mock.calls[1]![1]?.body))).toMatchObject(
      { cursor: "page-two", include_total: true },
    );
  });

  it("returns an empty window beyond the last holding", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([row()], 1));
    await expect(
      fetchAccountAssetCollection({ ...input, offset: 2 }, transport),
    ).resolves.toEqual({ items: [], total: 1 });
  });

  it.each([
    [
      "wrong account",
      {
        ...row(),
        account_id: AccountAddress.fromAccount({
          publicKey: ed25519.getPublicKey(new Uint8Array(32).fill(8)),
        }).toI105(369),
      },
      "requested account",
    ],
    ["unsafe quantity", { ...row(), quantity: "1e9" }, "canonical quantity"],
    [
      "legacy projection",
      { ...row(), primary_alias: null },
      "must contain exactly",
    ],
  ])("rejects %s rows", async (_label, item, message) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([item], 1));
    await expect(fetchAccountAssetCollection(input, transport)).rejects.toThrow(
      String(message),
    );
  });

  it.each([
    ["repeated holding", [row()], 3, "two", "repeated a holding"],
    ["repeated cursor", [row("dataspace:1")], 3, "one", "repeated a cursor"],
    ["changed total", [row("dataspace:1")], 4, "two", "total changed"],
    ["truncated collection", [row("dataspace:1")], 3, null, "cursor disagrees"],
  ])("fails closed on %s", async (_label, items, total, cursor, message) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([row()], 3, "one"))
      .mockResolvedValueOnce(
        response(items as unknown[], Number(total), cursor as string | null),
      );
    await expect(
      fetchAccountAssetCollection({ ...input, limit: 3 }, transport),
    ).rejects.toThrow(String(message));
  });

  it("retains strict duplicate-key and byte-size network boundaries", async () => {
    const duplicate = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('{"items":[],"items":[],"total":0,"next_cursor":null}', {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(fetchAccountAssetCollection(input, duplicate)).rejects.toThrow(
      /duplicate/iu,
    );
    const oversized = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": "4194305",
        },
      }),
    );
    await expect(fetchAccountAssetCollection(input, oversized)).rejects.toThrow(
      /oversized/iu,
    );
  });

  it("rejects malformed input before any network request", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      fetchAccountAssetCollection({ ...input, offset: 10001 }, transport),
    ).rejects.toThrow(/offset/iu);
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a wire negative-zero total before SDK serialization", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('{"items":[],"total":-0,"next_cursor":null}', {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(fetchAccountAssetCollection(input, transport)).rejects.toThrow(
      /total/iu,
    );
  });
});

it.skipIf(!process.env.LIVE_TAIRA_BALANCE_ACCOUNT)(
  "reads current Taira balances through the production helper (opt-in, read-only)",
  async () => {
    const result = await fetchAccountAssetCollection({
      ...input,
      accountId: process.env.LIVE_TAIRA_BALANCE_ACCOUNT!,
    });
    expect(
      result.items.some(
        (item) =>
          item.asset_definition_id === asset &&
          item.scope === "global" &&
          Number(item.quantity) > 0,
      ),
    ).toBe(true);
    expect(
      result.items.some(
        (item) =>
          item.asset_definition_id !== asset &&
          item.scope === "global" &&
          Number(item.quantity) > 0,
      ),
    ).toBe(true);
  },
  30_000,
);
