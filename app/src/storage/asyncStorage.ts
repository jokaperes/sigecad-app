import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CycleStorage, TurmaState } from "../sentinel/cycle";

const REGISTRATION_KEY = "app:registration:v1";

export interface Registration {
  turmas: string[];
  email: string | null;
  registeredAt: string;
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

/** Removes registration metadata and hash-only snapshots from this device. */
export async function clearAppState(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const owned = keys.filter((key) => key === REGISTRATION_KEY || key.startsWith("turma:"));
  if (owned.length) await AsyncStorage.multiRemove(owned);
}
