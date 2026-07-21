import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type ApiTarget = "local" | "prod";

export const TARGET_KEY = "jatek_driver_api_target";

const PROD_BASE = "https://ma.jatek.app/api";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;
const LOCAL_BASE = DOMAIN ? `https://${DOMAIN}/api` : "/api";

/**
 * In production EAS builds EXPO_PUBLIC_DOMAIN is set to "ma.jatek.app", which
 * means LOCAL_BASE === PROD_BASE.  We still want the app to default to the
 * "prod" auth flow (email + password) rather than the OTP demo flow.
 */
export const IS_PROD_BUILD = DOMAIN === "ma.jatek.app";

const webStore = {
  getItemAsync: async (k: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(k);
  },
  setItemAsync: async (k: string, v: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, v);
  },
};

const store = Platform.OS === "web" ? webStore : SecureStore;

let cached: ApiTarget | null = null;

export async function getApiTarget(): Promise<ApiTarget> {
  if (cached) return cached;
  try {
    const stored = await store.getItemAsync(TARGET_KEY);
    if (stored === "prod" || stored === "local") {
      cached = stored;
    } else {
      cached = IS_PROD_BUILD ? "prod" : "local";
    }
  } catch {
    cached = IS_PROD_BUILD ? "prod" : "local";
  }
  return cached;
}

export function getApiTargetSync(): ApiTarget {
  return cached ?? (IS_PROD_BUILD ? "prod" : "local");
}

export async function setApiTarget(target: ApiTarget): Promise<void> {
  cached = target;
  await store.setItemAsync(TARGET_KEY, target);
}

export function getBaseUrl(target: ApiTarget): string {
  return target === "prod" ? PROD_BASE : LOCAL_BASE;
}

export const API_BASES = { local: LOCAL_BASE, prod: PROD_BASE };
