<template>
  <div class="app-navigation-content">
    <div class="sidebar-heading">
      <p class="nav-title">{{ t("Navigate") }}</p>
      <button
        v-if="showClose"
        type="button"
        class="sidebar-close"
        :aria-label="t('Close navigation')"
        @click="emit('navigate')"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <div class="sidebar-scroll">
      <nav class="nav-groups" :aria-label="t('Navigate')">
        <div
          v-for="group in groups"
          :key="group.id"
          class="nav-group"
          :data-nav-group="group.id"
        >
          <p class="nav-group-label">{{ t(group.labelKey) }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            :class="{ active: isActive(item) }"
            :aria-label="t(item.navLabelKey)"
            :aria-current="
              activeSemantics && isActive(item) ? 'page' : undefined
            "
            @click="emit('navigate')"
          >
            <span class="nav-icon-shell" aria-hidden="true">
              <AppIcon :name="item.icon" class="nav-icon" />
            </span>
            <span class="nav-label">{{ t(item.navLabelKey) }}</span>
            <span class="nav-tooltip" role="tooltip" aria-hidden="true">
              {{ t(item.navLabelKey) }}
            </span>
          </RouterLink>
        </div>
      </nav>

      <nav class="sidebar-footer" :aria-label="t('Settings')">
        <RouterLink
          v-for="item in footerItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: isActive(item) }"
          :aria-label="t(item.navLabelKey)"
          :aria-current="activeSemantics && isActive(item) ? 'page' : undefined"
          @click="emit('navigate')"
        >
          <span class="nav-icon-shell" aria-hidden="true">
            <AppIcon :name="item.icon" class="nav-icon" />
          </span>
          <span class="nav-label">{{ t(item.navLabelKey) }}</span>
          <span class="nav-tooltip" role="tooltip" aria-hidden="true">
            {{ t(item.navLabelKey) }}
          </span>
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import { useAppI18n } from "@/composables/useAppI18n";
import type { AppNavGroupDefinition, AppNavItem } from "@/types/navigation";

const props = withDefaults(
  defineProps<{
    groups: ReadonlyArray<
      AppNavGroupDefinition & { items: ReadonlyArray<AppNavItem> }
    >;
    footerItems: ReadonlyArray<AppNavItem>;
    activePath: string;
    activeSemantics?: boolean;
    showClose?: boolean;
  }>(),
  {
    activeSemantics: true,
    showClose: false,
  },
);

const emit = defineEmits<{ navigate: [] }>();
const { t } = useAppI18n();

const isActive = (item: AppNavItem) => props.activePath === item.to;
</script>
