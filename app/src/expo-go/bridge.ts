export const BRIDGE_CHANNEL = "sigecad-expo-go-v1";
export const MAX_BRIDGE_MESSAGE_BYTES = 1_500_000;

export type BridgeKind = "periodos" | "turmas" | "notas";

export interface BridgeResponse {
  id: string;
  ok: boolean;
  status: number;
  data?: unknown;
  error?: "auth" | "http" | "network" | "invalid-response";
}

export class PortalBridgeError extends Error {
  constructor(
    message: string,
    readonly code: BridgeResponse["error"] | "timeout" | "protocol",
  ) {
    super(message);
  }
}

export function buildBridgeCommand(id: string, kind: BridgeKind, numericId?: number): string {
  if (!/^req-[0-9]{1,10}$/.test(id)) throw new Error("ID de bridge inválido.");
  if (kind !== "periodos" && (!Number.isSafeInteger(numericId) || (numericId ?? 0) <= 0)) {
    throw new Error("Parâmetro de bridge inválido.");
  }
  const request = JSON.stringify({ id, kind, numericId: numericId ?? null });
  return `window.__SIGECAD_REQUEST__(${request}); true;`;
}

export function parseBridgeResponse(raw: string): BridgeResponse {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_BRIDGE_MESSAGE_BYTES) {
    throw new PortalBridgeError("Resposta do portal excedeu o limite seguro.", "protocol");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PortalBridgeError("Resposta inválida do portal.", "protocol");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PortalBridgeError("Resposta inválida do portal.", "protocol");
  }
  const item = value as Record<string, unknown>;
  if (
    item.channel !== BRIDGE_CHANNEL ||
    typeof item.id !== "string" || !/^req-[0-9]{1,10}$/.test(item.id) ||
    typeof item.ok !== "boolean" ||
    typeof item.status !== "number" || !Number.isInteger(item.status)
  ) {
    throw new PortalBridgeError("Resposta não reconhecida do portal.", "protocol");
  }
  const allowedErrors = ["auth", "http", "network", "invalid-response"];
  if (!item.ok && (typeof item.error !== "string" || !allowedErrors.includes(item.error))) {
    throw new PortalBridgeError("Erro não reconhecido do portal.", "protocol");
  }
  return {
    id: item.id,
    ok: item.ok,
    status: item.status,
    data: item.data,
    error: item.error as BridgeResponse["error"],
  };
}

/**
 * Static code injected only after the WebView reaches the authenticated SIGECAD
 * origin. It accepts three fixed operations and never exposes document.cookie.
 */
export const BRIDGE_BOOTSTRAP = `
(function () {
  if (window.__SIGECAD_REQUEST__) return true;
  var CHANNEL = ${JSON.stringify(BRIDGE_CHANNEL)};
  var MAX_TEXT = 1200000;
  function send(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ channel: CHANNEL }, payload)));
  }
  window.__SIGECAD_REQUEST__ = async function (request) {
    var path;
    if (request.kind === "periodos") {
      path = "/rest/periodosletivos";
    } else if (request.kind === "turmas" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/turmas?periodoLetivoID=" + request.numericId;
    } else if (request.kind === "notas" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/notas?matriculaID=" + request.numericId;
    } else {
      send({ id: request.id, ok: false, status: 0, error: "invalid-response" });
      return;
    }
    try {
      var response = await fetch(path, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        headers: { Accept: "application/json" }
      });
      var responseUrl = new URL(response.url);
      if (response.status === 401 || response.status === 403 || responseUrl.hostname === "login.app.ufgd.edu.br") {
        send({ id: request.id, ok: false, status: response.status, error: "auth" });
        return;
      }
      if (responseUrl.origin !== window.location.origin) {
        send({ id: request.id, ok: false, status: response.status, error: "invalid-response" });
        return;
      }
      if (!response.ok) {
        send({ id: request.id, ok: false, status: response.status, error: "http" });
        return;
      }
      var text = await response.text();
      if (text.length > MAX_TEXT) {
        send({ id: request.id, ok: false, status: response.status, error: "invalid-response" });
        return;
      }
      var data;
      try { data = JSON.parse(text); }
      catch (_) {
        send({ id: request.id, ok: false, status: response.status, error: "invalid-response" });
        return;
      }
      send({ id: request.id, ok: true, status: response.status, data: data });
    } catch (_) {
      send({ id: request.id, ok: false, status: 0, error: "network" });
    }
  };
  return true;
})();
true;
`;
