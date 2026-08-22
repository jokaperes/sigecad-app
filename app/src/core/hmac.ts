export { hmacSha256hex, parseHmacKeyHex } from "./sha256";

export function randomHmacKeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
