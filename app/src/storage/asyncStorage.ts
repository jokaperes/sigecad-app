import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Items, Labels } from "../core/types";
import type { CycleStorage, TurmaState } from "../sentinel/cycle";

const REGISTRATION_KEY = "app:registration:v1";
const PREVIEW_STATE_KEY = "app:expo-go-preview:v1";

export interface Registration {
  turmas: string[];
  email: string | null;
  registeredAt: string;
}

/** Expo Go persists only one-way hashes and human-readable assessment labels. */
export interface PreviewState {
  items: Items;
  labels: Labels;
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
    if (!isItems(value.items) || !isLabels(value.labels) || typeof value.checkedAt !== "string") {
      throw new Error("invalid preview state");
    }
    return { items: value.items, labels: value.labels, checkedAt: value.checkedAt };
  } catch {
    await AsyncStorage.removeItem(PREVIEW_STATE_KEY);
    return null;
  }
}

export async function savePreviewState(value: PreviewState): Promise<void> {
  await AsyncStorage.setItem(PREVIEW_STATE_KEY, JSON.stringify(value));
}

export async function clearPreviewState(): Promise<void> {
  await AsyncStorage.removeItem(PREVIEW_STATE_KEY);
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

function isLabels(value: unknown): value is Labels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((label) => typeof label === "string" && label.length <= 600);
}
