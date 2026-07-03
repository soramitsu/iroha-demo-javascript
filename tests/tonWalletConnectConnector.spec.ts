import { afterEach, describe, expect, it, vi } from "vitest";

const VALID_TON_ADDRESS =
  "0:1111111111111111111111111111111111111111111111111111111111111111";
const SECOND_TON_ADDRESS =
  "0:2222222222222222222222222222222222222222222222222222222222222222";
const TON_TESTNET_CHAIN = "-3";

describe("TON WalletConnect connector", () => {
  afterEach(() => {
    delete (
      window as unknown as {
        __irohaTonWalletHarness?: unknown;
      }
    ).__irohaTonWalletHarness;
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
    Reflect.deleteProperty(window, "iroha");
  });

  it("allows bounded batched TON messages through the E2E harness", async () => {
    vi.stubEnv("VITE_SCCP_TON_E2E_WALLET", "1");
    const sendTransaction = vi.fn().mockResolvedValue({ hash: "ok" });
    (
      window as unknown as {
        __irohaTonWalletHarness?: {
          connect: () => Promise<{
            address: string;
            topic: string;
            connectedAtMs: number;
          }>;
          maxMessages: () => number;
          sendTransaction: typeof sendTransaction;
        };
      }
    ).__irohaTonWalletHarness = {
      connect: async () => ({
        address: VALID_TON_ADDRESS,
        topic: "topic-ton",
        connectedAtMs: Date.now(),
      }),
      maxMessages: () => 2,
      sendTransaction,
    };

    const { useTonWalletConnect } = await import(
      "@/composables/useTonWalletConnect"
    );
    const ton = useTonWalletConnect();
    await ton.connect();
    await ton.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      network: TON_TESTNET_CHAIN,
      from: VALID_TON_ADDRESS,
      messages: [
        {
          address: SECOND_TON_ADDRESS,
          amount: "1",
          payload: "te6ccgEBAQEAAgAAAA==",
        },
        {
          address: SECOND_TON_ADDRESS,
          amount: "1",
          payload: "te6ccgEBAQEAAgAAAA==",
        },
      ],
    });

    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        network: TON_TESTNET_CHAIN,
        from: VALID_TON_ADDRESS,
        messages: expect.arrayContaining([
          expect.objectContaining({ amount: "1" }),
        ]),
      }),
    );
  });

  it("rejects TON batches larger than the connected wallet limit", async () => {
    vi.stubEnv("VITE_SCCP_TON_E2E_WALLET", "1");
    const sendTransaction = vi.fn();
    (
      window as unknown as {
        __irohaTonWalletHarness?: {
          connect: () => Promise<{ address: string; topic: string }>;
          maxMessages: number;
          sendTransaction: typeof sendTransaction;
        };
      }
    ).__irohaTonWalletHarness = {
      connect: async () => ({
        address: VALID_TON_ADDRESS,
        topic: "topic-ton",
      }),
      maxMessages: 1,
      sendTransaction,
    };

    const { useTonWalletConnect } = await import(
      "@/composables/useTonWalletConnect"
    );
    const ton = useTonWalletConnect();
    await ton.connect();

    await expect(
      ton.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        network: TON_TESTNET_CHAIN,
        from: VALID_TON_ADDRESS,
        messages: [
          { address: SECOND_TON_ADDRESS, amount: "1" },
          { address: SECOND_TON_ADDRESS, amount: "1" },
        ],
      }),
    ).rejects.toThrow(/between 1 and 1 message/);
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
