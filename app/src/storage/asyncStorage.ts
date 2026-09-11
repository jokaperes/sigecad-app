import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Items } from "../core/types";

const REGISTRATION_KEY = "app:registration:v1";
const PREVIEW_STATE_KEY = "app:expo-go-preview:v1";
const LEGACY_DESIGN_PREFERENCES_KEY = "app:design-preferences:v2";
const DESIGN_PREFERENCES_KEY = "app:design-preferences:v3";

export interface DesignPreferences {
  theme: "system" | "light" | "dark";
  home: "cards" | "dense" | "agenda";
  absences: "bars" | "alerts";
}

export const DEFAULT_DESIGN_PREFERENCES: DesignPreferences = {
  theme: "system",
  home: "cards",
  absences: "bars",
};

export interface Registration {
  turmas: string[];
  email: string | null;
  registeredAt: string;
}

export interface PreviewState {
  version: 2;
  items: Items;
  checkedAt: string;
}


export async function getRegistration(): Promise<Registration | null> {
  const raw = await AsyncStorage.getItem(REGISTRATION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Registration>;
    if (!Array.isArray(value.turmas) || typeof value.registeredAt !== "string") {
      await AsyncStorage.removeItem(REGISTRATION_KEY);
      return null;
    }
    return {
      turmas: value.turmas.filter((code): code is string => typeof code === "string"),
      email: typeof value.email === "string" ? value.email : null,
      registeredAt: value.registeredAt,
    };
  } catch {
    await AsyncStorage.removeItem(REGISTRATION_KEY);
    return null;
  }
}

export async function saveRegistration(value: Registration): Promise<void> {
  await AsyncStorage.setItem(REGISTRATION_KEY, JSON.stringify(value));
}

export async function getPreviewState(): Promise<PreviewState | null> {
  const raw = await AsyncStorage.getItem(PREVIEW_STATE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PreviewState>;
    if (value.version !== 2 || !isItems(value.items) || typeof value.checkedAt !== "string" || "labels" in value) {
      throw new Error("invalid preview state");
    }
    return { version: 2, items: value.items, checkedAt: value.checkedAt };
  } catch {
    await AsyncStorage.removeItem(PREVIEW_STATE_KEY);
    return null;
  }
}

export async function savePreviewState(value: PreviewState): Promise<void> {
  if (value && "labels" in value) {
    await AsyncStorage.removeItem(PREVIEW_STATE_KEY);
    return;
  }
  await AsyncStorage.setItem(PREVIEW_STATE_KEY, JSON.stringify(value));
}

export async function clearPreviewState(): Promise<void> {
  await AsyncStorage.removeItem(PREVIEW_STATE_KEY);
}

export async function wipeAcademicPersistence(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const owned = keys.filter((key) =>
    key === REGISTRATION_KEY ||
    key === PREVIEW_STATE_KEY ||
    key.startsWith("turma:")
  );
  if (owned.length) await AsyncStorage.multiRemove(owned);
}

export async function getDesignPreferences(): Promise<DesignPreferences> {
  const current = await AsyncStorage.getItem(DESIGN_PREFERENCES_KEY);
  const legacy = current ? null : await AsyncStorage.getItem(LEGACY_DESIGN_PREFERENCES_KEY);
  const raw = current ?? legacy;
  if (!raw) return DEFAULT_DESIGN_PREFERENCES;
  try {
    const value = JSON.parse(raw) as Partial<DesignPreferences>;
    const preferences: DesignPreferences = {
      theme: value.theme === "light" || value.theme === "dark" ? value.theme : "system",
      home: value.home === "dense" || value.home === "agenda" ? value.home : "cards",
      absences: legacy ? "bars" : value.absences === "alerts" ? "alerts" : "bars",
    };
    if (legacy) await saveDesignPreferences(preferences);
    return preferences;
  } catch {
    return DEFAULT_DESIGN_PREFERENCES;
  }
}

export async function saveDesignPreferences(value: DesignPreferences): Promise<void> {
  await AsyncStorage.setItem(DESIGN_PREFERENCES_KEY, JSON.stringify(value));
}


export async function clearAppState(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const owned = keys.filter(
    (key) => key === REGISTRATION_KEY || key === PREVIEW_STATE_KEY || key.startsWith("turma:"),
  );
  if (owned.length) await AsyncStorage.multiRemove(owned);
}

function isItems(value: unknown): value is Items {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const candidate = item as { hash?: unknown; publicar?: unknown };
    return typeof candidate.hash === "string" && candidate.hash.length === 64 &&
      (candidate.publicar === 0 || candidate.publicar === 1 || candidate.publicar === null);
  });
}
