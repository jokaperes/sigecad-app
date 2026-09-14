import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Items } from "../core/types";
import type { CycleStorage, TurmaState } from "../sentinel/cycle";

const REGISTRATION_KEY = "app:registration:v1";
const PREVIEW_STATE_KEY = "app:expo-go-preview:v1";
const THEME_PREFERENCE_KEY = "app:theme-preference:v1";
const LEGACY_THEME_PREFERENCE_KEYS = ["app:design-preferences:v3", "app:design-preferences:v2"];

export type ThemePreference = "system" | "light" | "dark";

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

/** Persistência do último estado por turma no device (sem valor de nota, só hash). */
export const storage: CycleStorage = {
  async getTurmaState(code) {
    const raw = await AsyncStorage.getItem(`turma:${code}`);
    return raw ? (JSON.parse(raw) as TurmaState) : null;
  },
  async setTurmaState(code, state) {
    await AsyncStorage.setItem(`turma:${code}`, JSON.stringify(state));
  },
};

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

export async function getThemePreference(): Promise<ThemePreference> {
  const current = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  if (current === "system" || current === "light" || current === "dark") return current;
  for (const key of LEGACY_THEME_PREFERENCE_KEYS) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw) as { theme?: unknown };
      if (value.theme === "light" || value.theme === "dark") return value.theme;
    } catch { /* Ignore invalid preferences from older versions. */ }
  }
  return "system";
}

export async function saveThemePreference(value: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, value);
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

/** Removes registration metadata and hash-only snapshots from this device. */
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
