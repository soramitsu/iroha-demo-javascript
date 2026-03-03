import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAccountAssets,
  fetchAccountTransactions,
  getExplorerAccountQr,
} from "@/services/iroha";

describe("iroha services bridge", () => {
  afterEach(() => {
    delete (window as any).iroha;
  });

  it("forwards offset-based pagination to asset and transaction fetchers", async () => {
    const fetchAccountAssetsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });
    const fetchAccountTransactionsMock = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    (window as any).iroha = {
      fetchAccountAssets: fetchAccountAssetsMock,
      fetchAccountTransactions: fetchAccountTransactionsMock,
    };

    const assetsInput = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
      limit: 10,
      offset: 5,
    };
    const txInput = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
      limit: 6,
      offset: 0,
    };

    await fetchAccountAssets(assetsInput);
    await fetchAccountTransactions(txInput);

    expect(fetchAccountAssetsMock).toHaveBeenCalledWith(assetsInput);
    expect(fetchAccountTransactionsMock).toHaveBeenCalledWith(txInput);
  });

  it("returns explorer QR snapshots with svg markup", async () => {
    const snapshot = {
      canonicalId: "alice@wonderland",
      literal: "snx1alice",
      addressFormat: "ih58" as const,
      networkPrefix: 42,
      errorCorrection: "Q",
      modules: 21,
      qrVersion: 6,
      svg: '<svg aria-label="qr"></svg>',
    };
    const getExplorerAccountQrMock = vi.fn().mockResolvedValue(snapshot);
    (window as any).iroha = {
      getExplorerAccountQr: getExplorerAccountQrMock,
    };

    const input = {
      toriiUrl: "http://localhost:8080",
      accountId: "alice@wonderland",
      addressFormat: "compressed" as const,
    };
    const result = await getExplorerAccountQr(input);

    expect(getExplorerAccountQrMock).toHaveBeenCalledWith(input);
    expect(result.svg).toBe(snapshot.svg);
    expect(result.qrVersion).toBe(snapshot.qrVersion);
    expect(result.addressFormat).toBe("ih58");
  });
});
