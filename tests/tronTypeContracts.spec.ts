import { describe, expectTypeOf, it } from "vitest";
import { tairaXorBurnToTairaAccountCallData } from "@iroha/iroha-js/sccp";
import type {
  TronConstantContractInput,
  TronTriggerSmartContractInput,
} from "@/types/iroha";

describe("TRON bridge type contracts", () => {
  it("keeps trigger call data and parameter mutually exclusive", () => {
    const callDataTrigger: TronTriggerSmartContractInput = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "burnToTaira(bytes,uint256)",
      callData: `0x${"12".repeat(4)}${"34".repeat(32)}`,
      feeLimit: 100_000_000,
    };
    const parameterTrigger: TronTriggerSmartContractInput = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "burnToTaira(bytes,uint256)",
      parameter: "34".repeat(32),
      feeLimit: 100_000_000,
    };
    const noArgumentTrigger: TronTriggerSmartContractInput = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "claim()",
    };
    const constantCall: TronConstantContractInput = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "balanceOf(address)",
      parameter: "00".repeat(32),
    };

    // @ts-expect-error TRON trigger requests must not provide both encodings.
    const ambiguousTrigger: TronTriggerSmartContractInput = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "burnToTaira(bytes,uint256)",
      callData: `0x${"12".repeat(4)}${"34".repeat(32)}`,
      parameter: "34".repeat(32),
    };
    // @ts-expect-error TRON constant calls must not provide both encodings.
    const ambiguousConstant: TronConstantContractInput = {
      ownerAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      contractAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
      functionSelector: "balanceOf(address)",
      callData: `0x${"12".repeat(4)}${"00".repeat(32)}`,
      parameter: "00".repeat(32),
    };

    expectTypeOf(
      callDataTrigger,
    ).toMatchTypeOf<TronTriggerSmartContractInput>();
    expectTypeOf(
      parameterTrigger,
    ).toMatchTypeOf<TronTriggerSmartContractInput>();
    expectTypeOf(
      noArgumentTrigger,
    ).toMatchTypeOf<TronTriggerSmartContractInput>();
    expectTypeOf(constantCall).toMatchTypeOf<TronConstantContractInput>();
    void ambiguousTrigger;
    void ambiguousConstant;
  });

  it("keeps account-only burn calldata free of raw recipient fields", () => {
    const validAccount =
      "soraiyc4xtt4plquq2c4uq2esvsgv3d4clb7os6wxjhhzq6gd5flfxq@wonderland";
    const validRecipientCall = () =>
      tairaXorBurnToTairaAccountCallData({
        tairaRecipient: validAccount,
        amount: 1n,
      });
    const validAccountIdCall = () =>
      tairaXorBurnToTairaAccountCallData({
        tairaAccountId: validAccount,
        amount: "1",
      });
    const invalidCalls = () => {
      tairaXorBurnToTairaAccountCallData({
        // @ts-expect-error account-only calldata must not accept raw recipient bytes.
        tairaRecipientBytes: new Uint8Array([1, 2, 3]),
        amount: 1n,
      });
      tairaXorBurnToTairaAccountCallData({
        // @ts-expect-error account-only calldata must not accept binary recipient aliases.
        tairaRecipient: new Uint8Array([1, 2, 3]),
        amount: 1n,
      });
    };

    expectTypeOf(validRecipientCall).returns.toEqualTypeOf<string>();
    expectTypeOf(validAccountIdCall).returns.toEqualTypeOf<string>();
    void invalidCalls;
  });
});
