export const CAS_ORIGIN = "https://login.app.ufgd.edu.br";
export const SIGECAD_ORIGIN = "https://sigecad-academico.app.ufgd.edu.br";
const LEGACY_SIGECAD_ORIGIN = "http://sigecad-academico.app.ufgd.edu.br";
export const CARD_ORIGIN = "https://cartao.app.ufgd.edu.br";
export const WEBDOC_ORIGIN = "https://webdoc.app.ufgd.edu.br";
// IdP oficial usado pelo botão "Entrar com gov.br" da página CAS. Ele pode
// participar da navegação de autenticação, mas nunca recebe a bridge.
export const GOV_BR_ORIGIN = "https://sso.acesso.gov.br";

export const SESSION_ORIGINS = [CAS_ORIGIN, SIGECAD_ORIGIN, CARD_ORIGIN, GOV_BR_ORIGIN] as const;
export const BRIDGE_ORIGINS = [SIGECAD_ORIGIN, CARD_ORIGIN] as const;
// O SIGECAD HTTPS ainda manda o CAS com service=http://sigecad-academico...
// Se essa origem HTTP não passar no filtro nativo, o react-native-webview
// chama Linking e o Chrome abre. "*" entrega a URL ao callback JS, que
// reescreve o HTTP oficial para HTTPS ou recusa o destino sem sair do app.
export const WEBVIEW_ORIGIN_WHITELIST = ["*"] as const;
export const KEEP_SESSION_NAVIGATION_SCRIPT = `
(function () {
  try {
    document.addEventListener("click", function (event) {
      var element = event.target;
      while (element && element.tagName !== "A") element = element.parentElement;
      if (element && element.target === "_blank") element.target = "_self";
    }, true);
    document.addEventListener("submit", function (event) {
      if (event.target && event.target.target === "_blank") event.target.target = "_self";
    }, true);
    window.open = function (url) {
      if (typeof url === "string" && url.length > 0) window.location.assign(url);
      return null;
    };
  } catch (_) {}
})();
true;
`;

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

export function rewriteSessionNavigationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    let changed = false;
    if (url.origin === LEGACY_SIGECAD_ORIGIN) {
      url.protocol = "https:";
      changed = true;
    }
    if (url.protocol === "https:" && url.origin === CAS_ORIGIN) {
      const service = url.searchParams.get("service");
      if (service) {
        const rewrittenService = rewriteSessionNavigationUrl(service);
        if (rewrittenService) {
          url.searchParams.set("service", rewrittenService);
          changed = true;
        }
      }
    }
    return changed ? url.toString() : null;
  } catch {
    return null;
  }
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

// CAS puts a one-time `ticket` query on the SIGECAD URL. That page is still
// finishing SSO and is not ready for the academic bridge. Never log the URL.
export function hasCasServiceTicket(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === SIGECAD_ORIGIN && url.searchParams.has("ticket");
  } catch {
    return false;
  }
}

export function isStableAcademicUrl(value: string): boolean {
  return isAcademicUrl(value) && !hasCasServiceTicket(value);
}
