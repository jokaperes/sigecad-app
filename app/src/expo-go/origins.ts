export const CAS_ORIGIN = "https://login.app.ufgd.edu.br";
export const SIGECAD_ORIGIN = "https://sigecad-academico.app.ufgd.edu.br";
export const CARD_ORIGIN = "https://cartao.app.ufgd.edu.br";
export const WEBDOC_ORIGIN = "https://webdoc.app.ufgd.edu.br";
// IdP oficial usado pelo botão "Entrar com gov.br" da página CAS. Ele pode
// participar da navegação de autenticação, mas nunca recebe a bridge.
export const GOV_BR_ORIGIN = "https://sso.acesso.gov.br";

export const SESSION_ORIGINS = [CAS_ORIGIN, SIGECAD_ORIGIN, CARD_ORIGIN, GOV_BR_ORIGIN] as const;
export const BRIDGE_ORIGINS = [SIGECAD_ORIGIN, CARD_ORIGIN] as const;
// Este filtro é aplicado pelo wrapper nativo antes de
// `onShouldStartLoadWithRequest`. Se uma origem HTTPS não passar aqui, o
// react-native-webview tenta abri-la com `Linking` (Safari). Mantemos todo
// HTTPS no WebView para que o callback abaixo possa rejeitar a navegação sem
// sair do app; a política efetiva continua sendo `isAllowedSessionUrl`.
export const WEBVIEW_ORIGIN_WHITELIST = ["https://*"] as const;

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
