<template>
  <div class="header-preferences">
    <label class="header-language-control">
      <AppIcon name="language" />
      <span class="header-language-code" aria-hidden="true">
        {{ compactLocaleCode }}
      </span>
      <select
        class="header-language-full"
        data-testid="locale-select"
        :aria-label="languageControlLabel"
        :title="activeLocaleLabel"
        :value="localeStore.current"
        @change="handleLocaleChange"
      >
        <option
          v-for="option in localeOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </label>

    <div
      class="header-theme-selector"
      role="group"
      :aria-label="themeSelectorLabel"
    >
      <button
        class="header-theme-option"
        :class="{ active: theme.current === 'light' }"
        type="button"
        data-testid="theme-light-button"
        :aria-label="t('Switch to light')"
        :aria-pressed="theme.current === 'light'"
        :title="t('Switch to light')"
        @click="theme.setTheme('light')"
      >
        <AppIcon name="sun" />
      </button>
      <button
        class="header-theme-option"
        :class="{ active: theme.current === 'dark' }"
        type="button"
        data-testid="theme-dark-button"
        :aria-label="t('Switch to dark')"
        :aria-pressed="theme.current === 'dark'"
        :title="t('Switch to dark')"
        @click="theme.setTheme('dark')"
      >
        <AppIcon name="moon" />
      </button>
    </div>

    <button
      class="header-theme-toggle"
      type="button"
      data-testid="theme-toggle"
      :data-theme="theme.current"
      :aria-label="themeToggleLabel"
      :aria-pressed="theme.current === 'light'"
      :title="themeToggleLabel"
      @click="theme.toggle"
    >
      <AppIcon :name="theme.current === 'dark' ? 'sun' : 'moon'" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "@/components/AppIcon.vue";
import { useAppI18n } from "@/composables/useAppI18n";
import type { SupportedLocale } from "@/i18n/messages";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const { localeStore, localeOptions, t } = useAppI18n();

const activeLocaleLabel = computed(
  () =>
    localeOptions.value.find((option) => option.value === localeStore.current)
      ?.label ?? localeStore.current,
);
const historicalLocaleAccessibleNames: Partial<
  Record<SupportedLocale, string>
> = {
  "egy-Egyp": "Ancient Egyptian",
  "akk-Xsux": "Old Akkadian",
};
const languageControlLabel = computed(() => {
  const historicalName = historicalLocaleAccessibleNames[localeStore.current];
  return historicalName ? `Language — ${historicalName}` : t("Language");
});
const compactLocaleCode = computed(() =>
  localeStore.current.split("-")[0].toUpperCase(),
);
const themeSelectorLabel = computed(
  () => `${t("Switch to light")} / ${t("Switch to dark")}`,
);
const themeToggleLabel = computed(() =>
  theme.current === "dark" ? t("Switch to light") : t("Switch to dark"),
);

const handleLocaleChange = (event: Event) => {
  localeStore.setLocale(
    (event.target as HTMLSelectElement).value as SupportedLocale,
  );
};
</script>

<style scoped>
.header-preferences {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-2);
  app-region: no-drag;
  -webkit-app-region: no-drag;
}

.header-language-control,
.header-theme-selector,
.header-theme-toggle {
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface-raised);
  transition:
    color var(--duration-fast) var(--ease-standard),
    background var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.header-language-control {
  position: relative;
  width: 158px;
  height: 44px;
  padding-inline-start: 11px;
  display: flex;
  align-items: center;
  gap: 7px;
  box-shadow: var(--shadow-control);
  cursor: pointer;
}

.header-language-control:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text-strong);
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

.header-language-control:focus-within {
  border-color: var(--color-focus);
  box-shadow:
    var(--shadow-control),
    0 0 0 3px color-mix(in srgb, var(--color-focus) 18%, transparent);
}

.header-language-control > .app-icon,
.header-theme-option > .app-icon,
.header-theme-toggle > .app-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.header-language-full {
  width: 119px;
  min-width: 0;
  height: 44px;
  min-height: 44px;
  margin-block: -1px;
  padding: 5px 24px 5px 2px;
  border: 0;
  border-radius: 9px;
  color: var(--color-text-strong);
  background-color: transparent;
  box-shadow: none;
  font-size: 0.75rem;
  font-weight: 700;
}

.header-language-full:focus {
  border: 0;
  background: transparent;
  box-shadow: none;
}

:global(:root:lang(egy)) .header-language-full,
:global(:root:lang(akk)) .header-language-full {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.header-language-code {
  display: none;
  color: var(--color-text-strong);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.05em;
}

.header-theme-selector {
  height: 44px;
  display: grid;
  grid-template-columns: repeat(2, 44px);
  overflow: hidden;
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-pressed);
}

.header-theme-option,
.header-theme-toggle {
  width: 44px;
  min-width: 44px;
  height: 44px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.header-theme-option {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  color: var(--color-text-muted);
  background: transparent;
  box-shadow: none;
}

.header-theme-option:hover:not(:disabled) {
  color: var(--color-text-strong);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-control);
  transform: translateY(-1px);
}

.header-theme-option.active,
.header-theme-option[aria-pressed="true"] {
  color: var(--color-accent);
  background: color-mix(
    in srgb,
    var(--color-accent-soft) 70%,
    var(--color-surface-raised)
  );
  box-shadow: var(--shadow-pressed);
  transform: translateY(0);
}

.header-theme-toggle {
  display: none;
  border-color: var(--color-border);
  color: var(--color-text);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-control);
}

.header-theme-toggle:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  color: var(--color-accent);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

.header-theme-toggle:active:not(:disabled) {
  box-shadow: var(--shadow-pressed);
  transform: translateY(0);
}

@media (min-width: 761px) and (max-width: 1179px) {
  .header-language-control {
    width: 64px;
    padding-inline: 9px;
    justify-content: flex-start;
  }

  .header-language-code {
    display: inline;
  }

  .header-language-full {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin-block: 0;
    padding: 0;
    opacity: 0;
  }

  .header-theme-selector {
    display: none;
  }

  .header-theme-toggle {
    display: inline-flex;
  }
}

@media (max-width: 760px) {
  .header-preferences {
    gap: 5px;
  }

  .header-language-control {
    width: 44px;
    min-width: 44px;
    padding: 0;
    justify-content: center;
  }

  .header-language-code {
    display: none;
  }

  .header-language-full {
    position: absolute;
    inset: -1px;
    width: 44px;
    min-width: 44px;
    max-width: none;
    height: 44px;
    margin-block: 0;
    padding: 0;
    opacity: 0;
  }

  .header-theme-selector {
    display: none;
  }

  .header-theme-toggle {
    display: inline-flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  .header-language-control,
  .header-theme-option,
  .header-theme-toggle {
    transition: none;
  }

  .header-language-control:hover,
  .header-theme-option:hover:not(:disabled),
  .header-theme-toggle:hover:not(:disabled) {
    transform: none;
  }
}
</style>
