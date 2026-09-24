import { describe, expect, it, vi } from "vitest";

import {
  FIRST_RELEASE_IPC_INPUT_SCHEMAS,
  requireFirstReleaseIpcInput,
  requireFirstReleaseIpcInputObject,
} from "../electron/firstReleaseIpcInput";

describe("first-release IPC input boundary", () => {
  it.each(Object.entries(FIRST_RELEASE_IPC_INPUT_SCHEMAS))(
    "%s rejects missing and unknown top-level fields",
    (_kind, schema) => {
      const exact = Object.fromEntries(
        schema.required.map((key) => [key, `${key}-value`]),
      );
      expect(requireFirstReleaseIpcInputObject(exact, schema)).toEqual(exact);
      expect(() =>
        requireFirstReleaseIpcInputObject(
          { ...exact, retired_alias: "unsupported" },
          schema,
        ),
      ).toThrow(/unsupported shape/u);
      const [requiredKey] = schema.required;
      expect(requiredKey).toBeDefined();
      const missing = { ...exact };
      delete missing[requiredKey];
      expect(() => requireFirstReleaseIpcInputObject(missing, schema)).toThrow(
        /unsupported shape/u,
      );
    },
  );

  it("requires an explicit account signing algorithm", () => {
    expect(() =>
      requireFirstReleaseIpcInput({} as never, "generateKeyPair"),
    ).toThrow(/unsupported shape/u);
    expect(() =>
      requireFirstReleaseIpcInput(undefined as never, "generateKeyPair"),
    ).toThrow(/exact object/u);
    expect(() =>
      requireFirstReleaseIpcInput(
        {
          accountId: "account",
          networkPrefix: 369,
          privateKeyHex: "11".repeat(32),
        } as never,
        "storeAccountSecret",
      ),
    ).toThrow(/unsupported shape/u);
    expect(() =>
      requireFirstReleaseIpcInput("11".repeat(32) as never, "derivePublicKey"),
    ).toThrow(/exact object/u);
    expect(() =>
      requireFirstReleaseIpcInput(
        { privateKeyHex: "11".repeat(32) } as never,
        "derivePublicKey",
      ),
    ).toThrow(/unsupported shape/u);
  });

  it("rejects removed confidential-transfer fields", () => {
    expect(() =>
      requireFirstReleaseIpcInputObject(
        {
          toriiUrl: "https://taira.sora.org",
          chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
          assetDefinitionId: "asset",
          accountId: "account",
          networkPrefix: 369,
          quantity: "1",
          shieldedOwnerTagHex: "11".repeat(32),
        },
        FIRST_RELEASE_IPC_INPUT_SCHEMAS.transferAsset,
      ),
    ).toThrow(/unsupported shape/u);
    expect(() =>
      requireFirstReleaseIpcInputObject(
        {
          toriiUrl: "https://taira.sora.org",
          chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
          assetDefinitionId: "asset",
          accountId: "account",
          destinationAccountId: "destination",
          networkPrefix: 369,
          quantity: "1",
          shieldedRecipient: {
            receiveKeyId: "receive-key",
            receivePublicKeyBase64Url: "public-key",
            ownerTagHex: "11".repeat(32),
            diversifierHex: "22".repeat(32),
          },
        },
        FIRST_RELEASE_IPC_INPUT_SCHEMAS.transferAsset,
      ),
    ).toThrow(/unsupported shape/u);
  });

  it.each(["kaigiCreate", "kaigiJoin", "kaigiEnd"] as const)(
    "%s rejects the retired private-Kaigi asset field",
    (kind) => {
      const schema = FIRST_RELEASE_IPC_INPUT_SCHEMAS[kind];
      const exact = Object.fromEntries(
        schema.required.map((key) => [
          key,
          key === "privacyMode" ? "transparent" : `${key}-value`,
        ]),
      );
      expect(() =>
        requireFirstReleaseIpcInputObject(
          { ...exact, assetDefinitionId: "retired-private-kaigi-asset" },
          schema,
        ),
      ).toThrow(/unsupported shape/u);
    },
  );

  it("snapshots an exact mutation object", () => {
    const input = {
      toriiUrl: "https://taira.sora.org",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      accountId: "account",
      networkPrefix: 369,
      requestId: "request-1",
    };
    const result = requireFirstReleaseIpcInput(input, "faucetRequest");
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects missing, unknown, undefined, symbol, and accessor fields", () => {
    const schema = FIRST_RELEASE_IPC_INPUT_SCHEMAS.faucetCancel;
    expect(() => requireFirstReleaseIpcInputObject({}, schema)).toThrow(
      /unsupported shape/u,
    );
    expect(() =>
      requireFirstReleaseIpcInputObject(
        { requestId: "request-1", legacyId: "old" },
        schema,
      ),
    ).toThrow(/unsupported shape/u);
    expect(() =>
      requireFirstReleaseIpcInputObject({ requestId: undefined }, schema),
    ).toThrow(/unsupported shape/u);
    expect(() =>
      requireFirstReleaseIpcInputObject(
        { requestId: "request-1", [Symbol("hidden")]: true },
        schema,
      ),
    ).toThrow(/only named fields/u);

    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "requestId", {
      enumerable: true,
      get: () => "request-1",
    });
    expect(() => requireFirstReleaseIpcInputObject(accessor, schema)).toThrow(
      /unsupported shape/u,
    );
  });

  it("rejects arrays and non-plain object prototypes", () => {
    const schema = FIRST_RELEASE_IPC_INPUT_SCHEMAS.faucetCancel;
    expect(() =>
      requireFirstReleaseIpcInputObject(["request-1"], schema),
    ).toThrow(/exact object/u);
    expect(() =>
      requireFirstReleaseIpcInputObject(new (class Input {})(), schema),
    ).toThrow(/exact object/u);
  });

  it("rejects a wide DTO without materializing all of its keys", () => {
    const input: Record<string, unknown> = { requestId: "request-1" };
    for (let index = 0; index < 10_000; index += 1) {
      input[`extra${index}`] = index;
    }
    const ownKeys = vi.spyOn(Reflect, "ownKeys");
    const ownPropertyNames = vi.spyOn(Object, "getOwnPropertyNames");
    let failure: unknown;
    let ownKeyCalls = -1;
    let ownPropertyNameCalls = -1;
    try {
      try {
        requireFirstReleaseIpcInputObject(
          input,
          FIRST_RELEASE_IPC_INPUT_SCHEMAS.faucetCancel,
        );
      } catch (error) {
        failure = error;
      }
    } finally {
      ownKeyCalls = ownKeys.mock.calls.length;
      ownPropertyNameCalls = ownPropertyNames.mock.calls.length;
      ownKeys.mockRestore();
      ownPropertyNames.mockRestore();
    }

    expect(failure).toHaveProperty(
      "message",
      "Faucet cancellation input has an unsupported shape.",
    );
    expect(ownKeyCalls).toBe(0);
    expect(ownPropertyNameCalls).toBe(0);
  });
});
