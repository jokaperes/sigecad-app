import * as SecureStore from "expo-secure-store";
import { randomHmacKeyHex } from "../core/hmac";

const HMAC_KEY_ID = "sigecad.hmac.v1";
const STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getInstallHmacKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(HMAC_KEY_ID, STORE_OPTIONS);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return existing.toLowerCase();
  const created = randomHmacKeyHex();
  await SecureStore.setItemAsync(HMAC_KEY_ID, created, STORE_OPTIONS);
  return created;
}

export async function clearInstallHmacKey(): Promise<void> {
  await SecureStore.deleteItemAsync(HMAC_KEY_ID);
}
