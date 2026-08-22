export const CAS_ORIGIN = "https://login.app.ufgd.edu.br";
export const SIGECAD_ORIGIN = "https://sigecad-academico.app.ufgd.edu.br";
export const CARD_ORIGIN = "https://cartao.app.ufgd.edu.br";
export const WEBDOC_ORIGIN = "https://webdoc.app.ufgd.edu.br";

export const SESSION_ORIGINS = [CAS_ORIGIN, SIGECAD_ORIGIN, CARD_ORIGIN] as const;
export const BRIDGE_ORIGINS = [SIGECAD_ORIGIN, CARD_ORIGIN] as const;
export const WEBVIEW_ORIGIN_WHITELIST = [...SESSION_ORIGINS];

export function safeHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function isAllowedSessionUrl(value: string): boolean {
  if (value === "about:blank") return true;
  const origin = safeHttpsOrigin(value);
  return origin !== null && (SESSION_ORIGINS as readonly string[]).includes(origin);
}

export function isBridgeUrl(value: string): boolean {
  const origin = safeHttpsOrigin(value);
  return origin !== null && (BRIDGE_ORIGINS as readonly string[]).includes(origin);
}

export function isAcademicUrl(value: string): boolean {
  return safeHttpsOrigin(value) === SIGECAD_ORIGIN;
}

export function isLoginUrl(value: string): boolean {
  return safeHttpsOrigin(value) === CAS_ORIGIN;
}

export function isCardUrl(value: string): boolean {
  return safeHttpsOrigin(value) === CARD_ORIGIN;
}
