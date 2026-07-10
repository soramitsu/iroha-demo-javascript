<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="path in iconPaths"
      :key="path"
      :d="path"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AppIconName } from "@/types/navigation";

const props = defineProps<{
  name: AppIconName;
}>();

const paths: Record<AppIconName, string[]> = {
  wallet: [
    "M4 7.5h16v11H4a2 2 0 0 1-2-2v-9a3 3 0 0 1 3-3h12",
    "M16 11.5h4v4h-4a2 2 0 1 1 0-4Z",
  ],
  send: ["M4 12h15", "m14 7 5 5-5 5"],
  receive: ["M20 12H5", "m10 7-5 5 5 5"],
  staking: [
    "M12 21v-9",
    "M12 15c-4.5 0-7-2.4-7-6.5 4.5 0 7 2.4 7 6.5Z",
    "M12 12c0-4.5 2.5-7 7-7 0 4.5-2.5 7-7 7Z",
  ],
  governance: ["m3 9 9-5 9 5", "M5 10v7m4-7v7m6-7v7m4-7v7M3 20h18M2 9h20"],
  subscriptions: [
    "M6 3v3m12-3v3M4 8h16M5 5h14a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z",
    "M8 13h3m2 0h3m-8 4h3",
  ],
  stats: ["M4 20V10h4v10M10 20V4h4v16m2 0v-7h4v7M2 20h20"],
  explore: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z",
  ],
  cloud: ["M7 18h11a4 4 0 0 0 .5-8A6.5 6.5 0 0 0 6 8.5 4.8 4.8 0 0 0 7 18Z"],
  vpn: [
    "M12 3 20 6v5c0 5.1-3.2 8.3-8 10-4.8-1.7-8-4.9-8-10V6l8-3Z",
    "M9 12.5 11 15l4-5",
  ],
  kaigi: [
    "M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
    "m17 10 5-3v10l-5-3",
  ],
  offline: [
    "M2 8.5a15 15 0 0 1 4.2-2.8M9.3 4.3A15 15 0 0 1 22 8.5M5 12a10 10 0 0 1 4-2.4m4.2-.6A10 10 0 0 1 19 12m-10.5 3.5A5 5 0 0 1 12 14a5 5 0 0 1 3.5 1.5M12 19h.01",
    "M3 3l18 18",
  ],
  bridge: ["M4 8h13m-4-4 4 4-4 4", "M20 16H7m4 4-4-4 4-4"],
  settings: [
    "M4 6h10m4 0h2M4 12h2m4 0h10M4 18h8m4 0h4",
    "M14 4v4M6 10v4m6 2v4",
  ],
  advanced: ["M4 5h16v14H4Z", "m8 9-3 3 3 3m3 0h5"],
  account: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  close: ["m6 6 12 12M18 6 6 18"],
  chevron: ["m9 6 6 6-6 6"],
  network: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M3.5 9h17M3.5 15h17M12 3c2.2 2.4 3.4 5.4 3.4 9S14.2 18.6 12 21c-2.2-2.4-3.4-5.4-3.4-9S9.8 5.4 12 3Z",
  ],
  language: [
    "M4 5h9M8.5 3v2c0 4.4-2 7.8-5.5 10",
    "M5.5 9.5c1.5 2.2 3.4 3.9 5.8 5.1M14 20l3.5-10 3.5 10m-5.8-3h4.6",
  ],
  sun: [
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  ],
  moon: ["M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.7 8.7 0 1 0 20.5 15.2Z"],
};

const iconPaths = computed(() => paths[props.name]);
</script>
