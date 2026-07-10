export type NavGroup = "daily" | "grow" | "services" | "system";

export type NavPlacement = "primary" | "footer";

export type AppIconName =
  | "wallet"
  | "send"
  | "receive"
  | "staking"
  | "governance"
  | "subscriptions"
  | "stats"
  | "explore"
  | "cloud"
  | "vpn"
  | "kaigi"
  | "offline"
  | "bridge"
  | "settings"
  | "advanced"
  | "account"
  | "menu"
  | "close"
  | "chevron"
  | "network"
  | "language"
  | "sun"
  | "moon";

export interface AppRouteMeta extends Record<PropertyKey, unknown> {
  titleKey: string;
  subtitleKey: string;
  navLabelKey: string;
  navGroup: NavGroup;
  navOrder: number;
  icon: AppIconName;
  requiresAccount: boolean;
  navPlacement: NavPlacement;
}

export interface AppNavItem extends AppRouteMeta {
  to: string;
}

export interface AppNavGroupDefinition {
  id: Exclude<NavGroup, "system">;
  labelKey: string;
  order: number;
}

declare module "vue-router" {
  interface RouteMeta {
    titleKey?: string;
    subtitleKey?: string;
    navLabelKey?: string;
    navGroup?: NavGroup;
    navOrder?: number;
    icon?: AppIconName;
    requiresAccount?: boolean;
    navPlacement?: NavPlacement;
  }
}
