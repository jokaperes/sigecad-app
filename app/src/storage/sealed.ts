import { hmacSha256hex, parseHmacKeyHex } from "../core/hmac";
import type { Items } from "../core/types";

export interface SealedPreview {
  version: 2;
  items: Items;
  checkedAt: string;
}

export function sealItems(items: Items, keyHex: string): Items {
  const key = parseHmacKeyHex(keyHex);
  const sealed: Items = {};
  for (const [name, item] of Object.entries(items)) {
    const sealedName = hmacSha256hex(key, `k|${name}`);
    sealed[sealedName] = {
      hash: hmacSha256hex(key, `v|${item.hash}|${item.publicar}`),
      publicar: item.publicar,
    };
  }
  return sealed;
}

export function createSealedPreview(items: Items, checkedAt: string, keyHex: string): SealedPreview {
  return { version: 2, items: sealItems(items, keyHex), checkedAt };
}
