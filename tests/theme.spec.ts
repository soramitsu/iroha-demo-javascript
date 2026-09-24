import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import {
  THEME_SCHEMA,
  THEME_STORAGE_KEY,
  THEME_VERSION,
  useThemeStore,
} from "@/stores/theme";

const savedTheme = (theme: "dark" | "light") =>
  JSON.stringify({
    schema: THEME_SCHEMA,
    version: THEME_VERSION,
    theme,
  });

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    setActivePinia(createPinia());
  });

  it("hydrates default theme when none stored", () => {
    const store = useThemeStore();
    store.hydrate();
    expect(store.current).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("persists and restores toggled theme", () => {
    const store = useThemeStore();
    store.hydrate();
    store.toggle();
    expect(store.current).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(savedTheme("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    setActivePinia(createPinia());
    const freshStore = useThemeStore();
    freshStore.hydrate();
    expect(freshStore.current).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("rejects the former raw-string format without migrating its value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const store = useThemeStore();
    store.hydrate();

    expect(store.current).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(savedTheme("dark"));
  });

  it.each([
    [
      "unknown field",
      { schema: THEME_SCHEMA, version: 1, theme: "light", extra: true },
    ],
    ["missing field", { schema: THEME_SCHEMA, version: 1 }],
    ["wrong schema", { schema: "legacy-theme", version: 1, theme: "light" }],
    ["wrong version", { schema: THEME_SCHEMA, version: 2, theme: "light" }],
    ["unknown value", { schema: THEME_SCHEMA, version: 1, theme: "system" }],
  ])("rejects an exact-schema violation: %s", (_label, payload) => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));

    const store = useThemeStore();
    store.hydrate();

    expect(store.current).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(savedTheme("dark"));
  });

  it("rejects duplicate fields and oversized payloads", () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      `{"schema":"${THEME_SCHEMA}","version":1,"theme":"light","theme":"dark"}`,
    );

    let store = useThemeStore();
    store.hydrate();
    expect(store.current).toBe("dark");

    setActivePinia(createPinia());
    localStorage.setItem(THEME_STORAGE_KEY, " ".repeat(1_025));
    store = useThemeStore();
    store.hydrate();
    expect(store.current).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(savedTheme("dark"));
  });

  it("rejects unsupported runtime themes before persisting", () => {
    const store = useThemeStore();
    store.hydrate();
    const before = localStorage.getItem(THEME_STORAGE_KEY);

    expect(() => store.setTheme("sepia" as never)).toThrow(
      "Unsupported theme.",
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(before);
  });
});
