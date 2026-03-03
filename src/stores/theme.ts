import { defineStore } from "pinia";

const THEME_KEY = "iroha-demo:theme";

type Theme = "dark" | "light";

export const useThemeStore = defineStore("theme", {
  state: () => ({
    current: (localStorage.getItem(THEME_KEY) as Theme) || "dark",
  }),
  actions: {
    setTheme(theme: Theme) {
      this.current = theme;
      localStorage.setItem(THEME_KEY, theme);
      document.documentElement.setAttribute("data-theme", theme);
    },
    toggle() {
      this.setTheme(this.current === "dark" ? "light" : "dark");
    },
    hydrate() {
      this.setTheme(this.current);
    },
  },
});
