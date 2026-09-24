import { describe, expect, it } from "vitest";

import {
  readBoundedJsonResponse,
  readBoundedResponseBytes,
} from "../electron/boundedJsonResponse";

const response = (
  body: BodyInit,
  headers: Record<string, string> = { "content-type": "application/json" },
) => new Response(body, { status: 200, headers });

describe("bounded JSON response", () => {
  it("accepts one exact application/json document", async () => {
    await expect(
      readBoundedJsonResponse(response('{"value":1}'), {
        label: "Test response",
        maximumBytes: 32,
        requireApplicationJson: true,
      }),
    ).resolves.toEqual({ value: 1 });
  });

  it("rejects duplicate keys and oversized bodies", async () => {
    await expect(
      readBoundedJsonResponse(response('{"value":1,"value":2}'), {
        label: "Test response",
        maximumBytes: 64,
      }),
    ).rejects.toThrow(/duplicate key/u);
    await expect(
      readBoundedJsonResponse(response('{"value":123}'), {
        label: "Test response",
        maximumBytes: 4,
      }),
    ).rejects.toThrow(/byte limit/u);
  });

  it("rejects non-JSON media types, invalid UTF-8, and a UTF-8 BOM", async () => {
    await expect(
      readBoundedJsonResponse(
        response("{}", { "content-type": "text/plain" }),
        {
          label: "Test response",
          maximumBytes: 32,
          requireApplicationJson: true,
        },
      ),
    ).rejects.toThrow(/application\/json/u);
    await expect(
      readBoundedJsonResponse(response(Uint8Array.from([0xff])), {
        label: "Test response",
        maximumBytes: 32,
      }),
    ).rejects.toThrow(/valid UTF-8/u);
    await expect(
      readBoundedJsonResponse(
        response(Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
        {
          label: "Test response",
          maximumBytes: 32,
        },
      ),
    ).rejects.toThrow(/canonical UTF-8/u);
  });

  it("rejects noncanonical or oversized content-length metadata", async () => {
    await expect(
      readBoundedJsonResponse(
        response("{}", {
          "content-type": "application/json",
          "content-length": "02",
        }),
        { label: "Test response", maximumBytes: 32 },
      ),
    ).rejects.toThrow(/advertised an invalid/u);
    await expect(
      readBoundedJsonResponse(
        response("{}", {
          "content-type": "application/json",
          "content-length": "33",
        }),
        { label: "Test response", maximumBytes: 32 },
      ),
    ).rejects.toThrow(/oversized/u);
  });

  it("allows empty bodies only when the caller explicitly opts in", async () => {
    await expect(
      readBoundedJsonResponse(response(""), {
        label: "Optional response",
        maximumBytes: 32,
        allowEmpty: true,
      }),
    ).resolves.toBeNull();
    await expect(
      readBoundedJsonResponse(response(""), {
        label: "Required response",
        maximumBytes: 32,
      }),
    ).rejects.toThrow(/byte limit/u);
    await expect(
      readBoundedResponseBytes(response(Uint8Array.from([1, 2, 3])), {
        label: "Binary response",
        maximumBytes: 3,
      }),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
  });
});
