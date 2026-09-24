import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  FIRST_RELEASE_SSE_EVENT_MAX_BYTES,
  streamFirstReleaseSseJson,
} from "../electron/firstReleaseSse";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

const serve = async (
  respond: (response: ServerResponse) => void,
): Promise<string> => {
  const server = createServer((_request, response) => respond(response));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/events`;
};

const collect = async (url: string): Promise<unknown[]> => {
  const values: unknown[] = [];
  for await (const value of streamFirstReleaseSseJson({ url })) {
    values.push(value);
  }
  return values;
};

describe("first-release SSE transport", () => {
  it("decodes split, bounded strict-JSON events", async () => {
    const url = await serve((response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('event: message\nid: 1\ndata: {"kind":"roster_');
      response.write('updated","count":2}\n\n');
      response.end('data: {"kind":"ended"}\n\n');
    });

    await expect(collect(url)).resolves.toEqual([
      { kind: "roster_updated", count: 2 },
      { kind: "ended" },
    ]);
  });

  it("rejects duplicate JSON keys and unsupported SSE fields", async () => {
    const duplicateUrl = await serve((response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end('data: {"kind":"ended","kind":"ended"}\n\n');
    });
    await expect(collect(duplicateUrl)).rejects.toThrow(/duplicate key kind/iu);

    const unsupportedUrl = await serve((response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end('legacy: true\ndata: {"kind":"ended"}\n\n');
    });
    await expect(collect(unsupportedUrl)).rejects.toThrow(
      /unsupported field legacy/iu,
    );
  });

  it("rejects oversized events before parsing", async () => {
    const url = await serve((response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        `data: {"value":"${"x".repeat(FIRST_RELEASE_SSE_EVENT_MAX_BYTES)}"}\n\n`,
      );
    });
    await expect(collect(url)).rejects.toThrow(/byte limit/iu);
  });

  it("requires an exact event-stream response without redirects", async () => {
    const wrongTypeUrl = await serve((response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
    await expect(collect(wrongTypeUrl)).rejects.toThrow(/text\/event-stream/iu);

    const redirectUrl = await serve((response) => {
      response.writeHead(302, { Location: "https://example.com/events" });
      response.end();
    });
    await expect(collect(redirectUrl)).rejects.toThrow(/status 302/iu);
  });
});
