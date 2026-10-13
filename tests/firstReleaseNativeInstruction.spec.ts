import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBinding = {
  noritoEncodeInstruction: vi.fn(),
  noritoDecodeInstruction: vi.fn(),
  inspectSubscriptionTriggerAction: vi.fn(),
};

vi.mock("../electron/irohaJsNativeDir", () => ({
  getInstalledIrohaJsNativeBinding: () => nativeBinding,
  installGlobalIrohaJsNativeBinding: () => nativeBinding,
}));

import {
  decodeFirstReleaseInstruction,
  decodeReviewedFirstReleaseInstructionDraft,
  inspectFirstReleaseSubscriptionTriggerAction,
} from "../electron/firstReleaseNativeInstruction";

const WIRE_ID = "iroha.instruction.v1::governance::RegisterCitizen";
const REVIEWED = { RegisterCitizen: { owner: "testuOwner", amount: "100" } };

const leb128 = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return Buffer.from(bytes);
};

/** A public InstructionBox frame around one `(wire_id, concrete frame)` pair. */
const publicFrame = (
  wireId: string,
  frame: Buffer,
  options: { magic?: string; flags?: number } = {},
): Buffer => {
  const name = Buffer.from(wireId, "utf8");
  const nameField = Buffer.concat([leb128(name.length), name]);
  const frameLength = Buffer.alloc(8);
  frameLength.writeBigUInt64LE(BigInt(frame.length));
  const frameField = Buffer.concat([frameLength, frame]);
  const header = Buffer.alloc(40);
  header.write(options.magic ?? "NRT0", 0, "latin1");
  header[39] = options.flags ?? 0x02;
  return Buffer.concat([
    header,
    leb128(nameField.length),
    nameField,
    leb128(frameField.length),
    frameField,
  ]);
};

describe("first-release native instruction boundary", () => {
  beforeEach(() => {
    nativeBinding.noritoEncodeInstruction.mockReset();
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
    expect(decodeFirstReleaseInstruction(source, 369)).toEqual({
      Register: { Domain: { id: "wonderland" } },
    });
    const [nativeBytes, networkPrefix] =
      nativeBinding.noritoDecodeInstruction.mock.calls[0] ?? [];
    expect(Buffer.isBuffer(nativeBytes)).toBe(true);
    expect(nativeBytes).toEqual(Buffer.from([1, 2, 3]));
    expect(nativeBytes).not.toBe(source);
    expect(networkPrefix).toBe(369);
  });

  it("requires an explicit network prefix before native decoding", () => {
    for (const prefix of [undefined, -1, 0x4000, 1.5, "369"]) {
      expect(() =>
        decodeFirstReleaseInstruction(
          Uint8Array.of(1),
          prefix as unknown as number,
        ),
      ).toThrow(/network prefix/u);
      expect(() =>
        inspectFirstReleaseSubscriptionTriggerAction(
          "action-v1",
          prefix as unknown as number,
        ),
      ).toThrow(/network prefix/u);
    }
    expect(nativeBinding.noritoDecodeInstruction).not.toHaveBeenCalled();
    expect(
      nativeBinding.inspectSubscriptionTriggerAction,
    ).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized instruction input before native code", () => {
    expect(() => decodeFirstReleaseInstruction(new Uint8Array(), 369)).toThrow(
      /outside the first-release limit/u,
    );
    expect(() =>
      decodeFirstReleaseInstruction(new Uint8Array(16 * 1024 * 1024 + 1), 369),
    ).toThrow(/outside the first-release limit/u);
    expect(nativeBinding.noritoDecodeInstruction).not.toHaveBeenCalled();
  });

  it("requires strict, bounded object JSON from the native decoder", () => {
    nativeBinding.noritoDecodeInstruction.mockReturnValueOnce(
      '{"Register":{},"Register":{}}',
    );
    expect(() => decodeFirstReleaseInstruction(Uint8Array.of(1), 369)).toThrow(
      /unambiguous strict JSON/u,
    );

    nativeBinding.noritoDecodeInstruction.mockReturnValueOnce("[]");
    expect(() => decodeFirstReleaseInstruction(Uint8Array.of(1), 369)).toThrow(
      /JSON object/u,
    );

    nativeBinding.noritoDecodeInstruction.mockReturnValueOnce({});
    expect(() => decodeFirstReleaseInstruction(Uint8Array.of(1), 369)).toThrow(
      /bounded JSON text/u,
    );
  });

  it("routes canonical trigger text directly through native inspection", () => {
    expect(
      inspectFirstReleaseSubscriptionTriggerAction("action-v1", 369),
    ).toEqual({
      version: 1,
      kind: "usage",
      authority: "testuAccount",
      max_cycles: "42",
      trigger_id: "usage:1",
    });
    expect(
      nativeBinding.inspectSubscriptionTriggerAction,
    ).toHaveBeenCalledExactlyOnceWith("action-v1", 369);
  });

  it("rejects non-canonical action text and ambiguous native JSON", () => {
    expect(() =>
      inspectFirstReleaseSubscriptionTriggerAction(" action-v1", 369),
    ).toThrow(/bounded canonical text/u);
    expect(
      nativeBinding.inspectSubscriptionTriggerAction,
    ).not.toHaveBeenCalled();

    nativeBinding.inspectSubscriptionTriggerAction.mockReturnValueOnce(
      '{"version":1,"version":2}',
    );
    expect(() =>
      inspectFirstReleaseSubscriptionTriggerAction("action-v1", 369),
    ).toThrow(/unambiguous strict JSON/u);
  });
});

describe("reviewed governance draft instruction frames", () => {
  // Above 127 bytes so the frame field needs a two-byte LEB128 length.
  const concrete = Buffer.concat([
    Buffer.from("NRT0", "latin1"),
    Buffer.alloc(196, 7),
  ]);

  beforeEach(() => {
    nativeBinding.noritoEncodeInstruction
      .mockReset()
      .mockReturnValue(publicFrame(WIRE_ID, concrete));
    nativeBinding.noritoDecodeInstruction
      .mockReset()
      .mockReturnValue(JSON.stringify(REVIEWED));
  });

  it("decodes the native encoding of the reviewed instruction when the draft pair matches it", () => {
    expect(
      decodeReviewedFirstReleaseInstructionDraft({
        wireId: WIRE_ID,
        frame: Uint8Array.from(concrete),
        expectedInstruction: REVIEWED,
        networkPrefix: 369,
      }),
    ).toEqual(REVIEWED);
    expect(
      nativeBinding.noritoEncodeInstruction,
    ).toHaveBeenCalledExactlyOnceWith(JSON.stringify(REVIEWED), 369);
    const [decodedBytes, prefix] =
      nativeBinding.noritoDecodeInstruction.mock.calls[0] ?? [];
    expect(decodedBytes).toEqual(publicFrame(WIRE_ID, concrete));
    expect(prefix).toBe(369);
  });

  it.each([
    [
      "a different concrete frame",
      WIRE_ID,
      Buffer.concat([concrete, Buffer.of(0)]),
    ],
    ["a truncated concrete frame", WIRE_ID, concrete.subarray(0, -1)],
    [
      "another wire id",
      "iroha.instruction.v1::governance::CastPlainBallot",
      concrete,
    ],
  ])("rejects %s before native decoding", (_label, wireId, frame) => {
    expect(() =>
      decodeReviewedFirstReleaseInstructionDraft({
        wireId,
        frame,
        expectedInstruction: REVIEWED,
        networkPrefix: 369,
      }),
    ).toThrow(/differ from the exact reviewed instruction/u);
    expect(nativeBinding.noritoDecodeInstruction).not.toHaveBeenCalled();
  });

  it("rejects a native frame without the Norito magic or compact lengths", () => {
    for (const options of [{ magic: "NRT1" }, { flags: 0x00 }]) {
      nativeBinding.noritoEncodeInstruction.mockReturnValueOnce(
        publicFrame(WIRE_ID, concrete, options),
      );
      expect(() =>
        decodeReviewedFirstReleaseInstructionDraft({
          wireId: WIRE_ID,
          frame: concrete,
          expectedInstruction: REVIEWED,
          networkPrefix: 369,
        }),
      ).toThrow(/differ from the exact reviewed instruction/u);
    }
    nativeBinding.noritoEncodeInstruction.mockReturnValueOnce("not bytes");
    expect(() =>
      decodeReviewedFirstReleaseInstructionDraft({
        wireId: WIRE_ID,
        frame: concrete,
        expectedInstruction: REVIEWED,
        networkPrefix: 369,
      }),
    ).toThrow(/bounded instruction bytes/u);
    expect(nativeBinding.noritoDecodeInstruction).not.toHaveBeenCalled();
  });

  it("rejects malformed inputs before native encoding", () => {
    const valid = {
      wireId: WIRE_ID,
      frame: concrete,
      expectedInstruction: REVIEWED as Record<string, unknown>,
      networkPrefix: 369,
    };
    for (const [input, message] of [
      [{ ...valid, wireId: ` ${WIRE_ID}` }, /bounded canonical ASCII/u],
      [{ ...valid, wireId: "" }, /bounded canonical ASCII/u],
      [{ ...valid, frame: new Uint8Array() }, /first-release limit/u],
      [{ ...valid, frame: "00" }, /first-release limit/u],
      [
        { ...valid, expectedInstruction: { ...REVIEWED, Extra: {} } },
        /exactly one instruction envelope/u,
      ],
      [{ ...valid, networkPrefix: 0x4000 }, /network prefix/u],
    ] as const) {
      expect(() =>
        decodeReviewedFirstReleaseInstructionDraft(
          input as unknown as typeof valid,
        ),
      ).toThrow(message);
    }
    expect(nativeBinding.noritoEncodeInstruction).not.toHaveBeenCalled();
  });
});
