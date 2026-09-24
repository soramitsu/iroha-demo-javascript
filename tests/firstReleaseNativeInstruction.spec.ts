import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBinding = {
  noritoDecodeInstruction: vi.fn(),
  inspectSubscriptionTriggerAction: vi.fn(),
};

vi.mock("../electron/irohaJsNativeDir", () => ({
  getInstalledIrohaJsNativeBinding: () => nativeBinding,
  installGlobalIrohaJsNativeBinding: () => nativeBinding,
}));

import {
  decodeFirstReleaseInstruction,
  inspectFirstReleaseSubscriptionTriggerAction,
} from "../electron/firstReleaseNativeInstruction";

describe("first-release native instruction boundary", () => {
  beforeEach(() => {
    nativeBinding.noritoDecodeInstruction
      .mockReset()
      .mockReturnValue('{"Register":{"Domain":{"id":"wonderland"}}}');
    nativeBinding.inspectSubscriptionTriggerAction
      .mockReset()
      .mockReturnValue(
        '{"version":1,"kind":"usage","authority":"testuAccount","max_cycles":"42","trigger_id":"usage:1"}',
      );
  });

  it("copies bounded instruction bytes into the reviewed native decoder", () => {
    const source = Uint8Array.from([1, 2, 3]);
    expect(decodeFirstReleaseInstruction(source)).toEqual({
      Register: { Domain: { id: "wonderland" } },
    });
    const nativeBytes =
      nativeBinding.noritoDecodeInstruction.mock.calls[0]?.[0];
    expect(Buffer.isBuffer(nativeBytes)).toBe(true);
    expect(nativeBytes).toEqual(Buffer.from([1, 2, 3]));
    expect(nativeBytes).not.toBe(source);
  });

  it("rejects empty and oversized instruction input before native code", () => {
    expect(() => decodeFirstReleaseInstruction(new Uint8Array())).toThrow(
      /outside the first-release limit/u,
    );
    expect(() =>
      decodeFirstReleaseInstruction(new Uint8Array(16 * 1024 * 1024 + 1)),
    ).toThrow(/outside the first-release limit/u);
    expect(nativeBinding.noritoDecodeInstruction).not.toHaveBeenCalled();
  });

  it("requires strict, bounded object JSON from the native decoder", () => {
    nativeBinding.noritoDecodeInstruction.mockReturnValueOnce(
      '{"Register":{},"Register":{}}',
    );
    expect(() => decodeFirstReleaseInstruction(Uint8Array.of(1))).toThrow(
      /unambiguous strict JSON/u,
    );

    nativeBinding.noritoDecodeInstruction.mockReturnValueOnce("[]");
    expect(() => decodeFirstReleaseInstruction(Uint8Array.of(1))).toThrow(
      /JSON object/u,
    );

    nativeBinding.noritoDecodeInstruction.mockReturnValueOnce({});
    expect(() => decodeFirstReleaseInstruction(Uint8Array.of(1))).toThrow(
      /bounded JSON text/u,
    );
  });

  it("routes canonical trigger text directly through native inspection", () => {
    expect(inspectFirstReleaseSubscriptionTriggerAction("action-v1")).toEqual({
      version: 1,
      kind: "usage",
      authority: "testuAccount",
      max_cycles: "42",
      trigger_id: "usage:1",
    });
    expect(
      nativeBinding.inspectSubscriptionTriggerAction,
    ).toHaveBeenCalledExactlyOnceWith("action-v1");
  });

  it("rejects non-canonical action text and ambiguous native JSON", () => {
    expect(() =>
      inspectFirstReleaseSubscriptionTriggerAction(" action-v1"),
    ).toThrow(/bounded canonical text/u);
    expect(
      nativeBinding.inspectSubscriptionTriggerAction,
    ).not.toHaveBeenCalled();

    nativeBinding.inspectSubscriptionTriggerAction.mockReturnValueOnce(
      '{"version":1,"version":2}',
    );
    expect(() =>
      inspectFirstReleaseSubscriptionTriggerAction("action-v1"),
    ).toThrow(/unambiguous strict JSON/u);
  });
});
