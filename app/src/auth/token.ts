import * as SecureStore from "expo-secure-store";

/**
 * Guarda o cookie UFGDNET no keychain/keystore. NUNCA sai do device nem vai
 * pro servidor. Guardar token ≈ guardar senha, então vai em armazenamento seguro.
 */
const KEY = "ufgdnet_token";

export async function saveToken(cookie: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, cookie, {
    // Silent pushes commonly run while the screen is locked. AFTER_FIRST_UNLOCK
    // keeps the token available to that background task without synchronizing it
    // to other devices or exposing it to normal app storage.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
