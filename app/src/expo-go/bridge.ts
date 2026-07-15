export const BRIDGE_CHANNEL = "sigecad-expo-go-v1";
export const MAX_BRIDGE_MESSAGE_BYTES = 1_500_000;

export type BridgeKind = "periodos" | "turmas" | "notas" | "card";

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
  if (
    kind !== "periodos" && kind !== "card" &&
    (!Number.isSafeInteger(numericId) || (numericId ?? 0) <= 0)
  ) {
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

/**
 * Bridge for the separate Card UFGD origin. IDs and hashes are discovered only
 * from the authenticated user's own page; the caller cannot supply either.
 * Photo, balances and transactions are returned in memory and never persisted.
 */
export const CARD_BRIDGE_BOOTSTRAP = `
(function () {
  if (window.__SIGECAD_REQUEST__) return true;
  var CHANNEL = ${JSON.stringify(BRIDGE_CHANNEL)};
  var MAX_TEXT = 1200000;
  var ORIGIN = "https://cartao.app.ufgd.edu.br";
  function send(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ channel: CHANNEL }, payload)));
  }
  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\\s+/g, " ").trim().slice(0, max || 300);
  }
  function documentOf(text) {
    return new DOMParser().parseFromString(text, "text/html");
  }
  function field(doc, label) {
    var labels = Array.prototype.slice.call(doc.querySelectorAll("label"));
    var found = labels.find(function (node) {
      return clean(node.textContent, 100).replace(/:$/, "").toLowerCase() === label.toLowerCase();
    });
    if (!found) return null;
    var sibling = found.nextElementSibling;
    return clean(sibling ? sibling.textContent : "", 300) || null;
  }
  function balance(text) {
    var decoded = documentOf(text).documentElement.textContent || "";
    var match = decoded.match(/Saldo atual:\\s*R\\$\\s*([0-9][0-9.,]*[.,][0-9]{2})/i);
    if (!match) return null;
    var value = match[1];
    if (value.indexOf(",") < 0) value = value.replace(".", ",");
    return "R$ " + value;
  }
  async function checked(path, json) {
    var response = await fetch(path, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      headers: { Accept: json ? "application/json" : "text/html, */*" }
    });
    var responseUrl = new URL(response.url);
    if (response.status === 401 || response.status === 403 || responseUrl.hostname === "login.app.ufgd.edu.br") {
      throw new Error("AUTH");
    }
    if (responseUrl.origin !== ORIGIN) throw new Error("ORIGIN");
    if (!response.ok) throw new Error("HTTP:" + response.status);
    var text = await response.text();
    if (text.length > MAX_TEXT) throw new Error("SIZE");
    if (!json) return text;
    try { return JSON.parse(text); } catch (_) { throw new Error("JSON"); }
  }
  async function photoData(personDoc) {
    var image = Array.prototype.slice.call(personDoc.querySelectorAll("img[src]")).find(function (node) {
      return /\\/foto\\/[A-Fa-f0-9]{32,}/.test(node.getAttribute("src") || "");
    });
    if (!image) return null;
    var url = new URL(image.getAttribute("src"), ORIGIN);
    if (url.origin !== ORIGIN || !/^\\/foto\\/[A-Fa-f0-9]{32,}(?:\\/\\d+\\/\\d+)?$/.test(url.pathname)) return null;
    var response = await fetch(url.pathname, { method: "GET", credentials: "include" });
    if (!response.ok || new URL(response.url).origin !== ORIGIN) return null;
    var type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (type !== "image/jpeg" && type !== "image/png") return null;
    var blob = await response.blob();
    if (blob.size <= 0 || blob.size > 650000) return null;
    return await new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () { resolve(typeof reader.result === "string" ? reader.result : null); };
      reader.onerror = function () { resolve(null); };
      reader.readAsDataURL(blob);
    });
  }
  function transactions(payload) {
    var rows = payload && Array.isArray(payload.Extrato) ? payload.Extrato : [];
    return rows.slice(0, 40).map(function (row) {
      return {
        date: clean(row && row.data, 30),
        time: clean(row && row.hora, 20),
        type: clean(row && row.tipo, 80),
        value: clean(row && row.valor, 60),
        merchant: clean(row && row.convenioNome, 160)
      };
    });
  }
  window.__SIGECAD_REQUEST__ = async function (request) {
    if (request.kind !== "card") {
      send({ id: request.id, ok: false, status: 0, error: "invalid-response" });
      return;
    }
    try {
      var personText = await checked("/cartoes_usuario/visualiza_pessoa", false);
      var person = documentOf(personText);
      var link = Array.prototype.slice.call(person.querySelectorAll("a[href]")).map(function (node) {
        return node.getAttribute("href") || "";
      }).find(function (href) {
        return /^\\/cartoes_usuario\\/visualiza_estatus\\/\\d+\\/[A-Fa-f0-9]{8,128}$/.test(href);
      });
      if (!link) throw new Error("CARD");
      var parts = link.match(/^\\/cartoes_usuario\\/visualiza_estatus\\/(\\d+)\\/([A-Fa-f0-9]{8,128})$/);
      if (!parts) throw new Error("CARD");
      var statusId = parts[1];
      var resourceHash = parts[2];
      var ruPath = "/cartoes_usuario/listagem_extrato_ru/" + statusId + "/" + resourceHash;
      var canteenPath = "/cartoes_usuario/listagem_extrato_cantina/" + statusId + "/" + resourceHash;
      var pages = await Promise.all([checked(link, false), checked(ruPath, false), checked(canteenPath, false)]);
      var statusDoc = documentOf(pages[0]);
      var cardLegend = Array.prototype.slice.call(statusDoc.querySelectorAll("legend")).map(function (node) {
        return clean(node.textContent, 200);
      }).find(function (value) { return /^Cartão:/i.test(value); }) || "";
      var number = cardLegend.match(/\\d{6,}/);
      var version = cardLegend.match(/\\(Via\\s+\\d+\\)/i);
      var params = "?dataInicio=&dataFim=&estatusId=" + encodeURIComponent(statusId) + "&pagina=1";
      var extracts = await Promise.all([
        checked("/cartoes_usuario/listagem_extrato_ajax_ru" + params, true),
        checked("/cartoes_usuario/listagem_extrato_ajax_cantina" + params, true),
        photoData(person)
      ]);
      send({
        id: request.id,
        ok: true,
        status: 200,
        data: {
          name: field(statusDoc, "Nome"),
          course: field(statusDoc, "Curso"),
          active: field(statusDoc, "Ativo"),
          cardLast4: number ? number[0].slice(-4) : null,
          version: version ? version[0].replace(/[()]/g, "") : null,
          ruBalance: balance(pages[1]),
          canteenBalance: balance(pages[2]),
          photoDataUrl: extracts[2],
          ruTransactions: transactions(extracts[0]),
          canteenTransactions: transactions(extracts[1])
        }
      });
    } catch (error) {
      var message = String(error && error.message || error);
      var kind = message === "AUTH" ? "auth" :
        message.indexOf("HTTP:") === 0 ? "http" :
        message === "CARD" || message === "ORIGIN" || message === "SIZE" || message === "JSON"
          ? "invalid-response" : "network";
      var status = message.indexOf("HTTP:") === 0 ? Number(message.slice(5)) || 0 : 0;
      send({ id: request.id, ok: false, status: status, error: kind });
    }
  };
  return true;
})();
true;
`;
