import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useSessionStore } from "./stores/session";
import { useThemeStore } from "./stores/theme";
import { useOfflineStore } from "./stores/offline";
import { useSubscriptionStore } from "./stores/subscriptions";
import { useLocaleStore } from "./stores/locale";
import { useKaigiStore } from "./stores/kaigi";
import "./styles/main.css";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const session = useSessionStore();
const theme = useThemeStore();
const offline = useOfflineStore();
const subscriptions = useSubscriptionStore();
const locale = useLocaleStore();
const kaigi = useKaigiStore();

const bootstrap = async () => {
  await session.hydrate();
  theme.hydrate();
  offline.hydrate();
  subscriptions.hydrate();
  locale.hydrate();
  kaigi.hydrate();

  app.use(router);

  watch(
    () => session.$state,
    (state) => {
      session.persistState(state);
    },
    { deep: true },
  );

  app.mount("#app");
};

void bootstrap();
