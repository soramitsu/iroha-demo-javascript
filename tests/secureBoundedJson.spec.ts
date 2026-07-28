import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  governanceIntegrityDirectoryPath,
  loadSecureBoundedJson,
  secureReadBoundedFile,
  secureWriteBoundedFile,
} from "../electron/secureBoundedJson";

const roots: string[] = [];

const testRoot = (): string => {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "secure-bounded-json-")),
  );
  roots.push(root);
  return root;
};

const targetPath = (userDataPath: string): string =>
  join(governanceIntegrityDirectoryPath(userDataPath), "state.json");

const options = {
  label: "Test integrity state",
  maximumBytes: 4096,
} as const;

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("native secure bounded JSON boundary", () => {
  it("creates private storage, atomically replaces bytes, and reads back canonical JSON", () => {
    const root = testRoot();
    const path = targetPath(root);
    const first = Buffer.from('{"schema":"test.v1","value":1}', "utf8");
    const second = Buffer.from('{"schema":"test.v1","value":2}', "utf8");

    expect(
      secureWriteBoundedFile(path, first, options).bytes.equals(first),
    ).toBe(true);
    expect(
      secureWriteBoundedFile(path, second, options).bytes.equals(second),
    ).toBe(true);
    expect(loadSecureBoundedJson(path, options).value).toEqual({
      schema: "test.v1",
      value: 2,
    });
    expect(readdirSync(governanceIntegrityDirectoryPath(root)).sort()).toEqual([
      "state.json",
    ]);

    if (process.platform !== "win32") {
      expect(
        lstatSync(governanceIntegrityDirectoryPath(root)).mode & 0o777,
      ).toBe(0o700);
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("rejects empty, oversized, relative, and noncanonical JSON inputs", () => {
    const root = testRoot();
    const path = targetPath(root);

    expect(() =>
      secureWriteBoundedFile(path, Buffer.alloc(0), options),
    ).toThrow(/non-empty bounded/u);
    expect(() =>
      secureWriteBoundedFile(path, Buffer.alloc(4097), options),
    ).toThrow(/non-empty bounded/u);
    expect(() =>
      secureWriteBoundedFile(
        "relative-state.json",
        Buffer.from("{}", "utf8"),
        options,
      ),
    ).toThrow(/path or byte bound/u);

    secureWriteBoundedFile(
      path,
      Buffer.from('{"schema":"test.v1","schema":"test.v1"}', "utf8"),
      options,
    );
    expect(() => loadSecureBoundedJson(path, options)).toThrow(
      /duplicate key/u,
    );
  });

  it("rejects hard-linked files", () => {
    const root = testRoot();
    const path = targetPath(root);
    secureWriteBoundedFile(path, Buffer.from('{"value":1}', "utf8"), options);
    const hardLink = join(
      governanceIntegrityDirectoryPath(root),
      "linked-state.json",
    );
    linkSync(path, hardLink);
    expect(() => secureReadBoundedFile(path, options)).toThrow();
  });

  it("rejects indirect private roots", () => {
    const root = testRoot();
    const path = targetPath(root);
    secureWriteBoundedFile(path, Buffer.from('{"value":1}', "utf8"), options);
    const indirectParent = join(root, "indirect-integrity");
    symlinkSync(
      governanceIntegrityDirectoryPath(root),
      indirectParent,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() =>
      secureReadBoundedFile(join(indirectParent, "state.json"), options),
    ).toThrow();
  });

  it.runIf(process.platform !== "win32")(
    "rejects a file whose private mode was broadened",
    () => {
      const root = testRoot();
      const path = targetPath(root);
      secureWriteBoundedFile(path, Buffer.from('{"value":1}', "utf8"), options);
      chmodSync(path, 0o644);
      expect(() => secureReadBoundedFile(path, options)).toThrow();
    },
  );
});
