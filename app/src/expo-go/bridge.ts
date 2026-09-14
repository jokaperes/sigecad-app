import { DOCUMENT_BRIDGE_CHANNEL, MAX_DOCUMENT_BYTES } from "./documents";

export const BRIDGE_CHANNEL = "sigecad-expo-go-v1";
export const BRIDGE_PERF_CHANNEL = "sigecad-perf-v1";
export const MAX_BRIDGE_MESSAGE_BYTES = 1_500_000;

export type BridgeKind =
  | "periodos"
  | "turmas"
  | "notas"
  | "faltas"
  | "matriculas"
  | "horarios"
  | "historico"
  | "estrutura"
  | "chcursada"
  | "cursadascursando"
  | "dadosacademico"
  | "notificacoes"
  | "planosensino"
  | "document-catalog"
  | "card-summary"
  | "card";

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
  const numericKinds: BridgeKind[] = ["turmas", "notas", "faltas", "matriculas", "horarios", "planosensino"];
  if (numericKinds.includes(kind) && (!Number.isSafeInteger(numericId) || (numericId ?? 0) <= 0)) {
    throw new Error("Parâmetro de bridge inválido.");
  }
  if (kind === "card" && numericId !== undefined && (!Number.isSafeInteger(numericId) || numericId < 1 || numericId > 50)) {
    throw new Error("Página de cartão inválida.");
  }
  if (kind === "card-summary" && numericId !== undefined) throw new Error("Resumo de cartão inválido.");
  const request = JSON.stringify({ id, kind, numericId: numericId ?? null });
  return `window.__SIGECAD_REQUEST__(${request}); true;`;
}

export function parseBridgeResponse(raw: string): BridgeResponse {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_BRIDGE_MESSAGE_BYTES) {
    throw new PortalBridgeError("Resposta do portal excedeu o limite permitido.", "protocol");
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
  if (item.data !== undefined) {
    const encoded = JSON.stringify(item.data);
    if (/UFGDNET=|"password"\s*:|document\.cookie/i.test(encoded)) {
      throw new PortalBridgeError("Resposta contendo segredo foi recusada.", "protocol");
    }
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
 * origin. It accepts a closed set of read-only operations and never exposes
 * document.cookie. Numeric IDs always come from the authenticated session.
 */
export const BRIDGE_BOOTSTRAP = `
(function () {
  if (window.__SIGECAD_BRIDGE_VERSION__ === 6 && window.__SIGECAD_REQUEST__ &&
    window.__SIGECAD_DOCUMENT__) return true;
  var CHANNEL = ${JSON.stringify(BRIDGE_CHANNEL)};
  var DOCUMENT_CHANNEL = ${JSON.stringify(DOCUMENT_BRIDGE_CHANNEL)};
  var MAX_TEXT = 1200000;
  var MAX_DOCUMENT_BYTES = ${MAX_DOCUMENT_BYTES};
  var DOCUMENT_CHUNK_BYTES = 192 * 1024;
  var documentLinks = null;
  var teachingPlanIds = new Set();
  function send(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ channel: CHANNEL }, payload)));
  }
  function sendDocument(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ channel: DOCUMENT_CHANNEL }, payload)));
  }
  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\\s+/g, " ").trim().slice(0, max || 300);
  }
  function normalized(value) {
    return clean(value, 120).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
  }
  function safeRelative(value) {
    try {
      var url = new URL(value, window.location.origin);
      return url.protocol === "https:" && url.origin === window.location.origin
        ? url.pathname + url.search : null;
    } catch (_) { return null; }
  }
  function scanDocumentLinks() {
    var targets = {
      enrollmentCertificate: { labels: ["atestado de matricula"], path: null, available: false, supportsSocialName: false },
      schoolTranscript: { labels: ["historico escolar"], path: null, available: false, supportsSocialName: false },
      teachingPlans: { labels: ["planos de ensino", "plano de ensino"], path: null, available: false, supportsSocialName: false }
    };
    Array.prototype.slice.call(document.querySelectorAll("a[href]")).forEach(function (node) {
      var label = normalized(node.textContent || node.getAttribute("title") || "");
      Object.keys(targets).forEach(function (key) {
        var target = targets[key];
        if (target.path || target.labels.indexOf(label) < 0) return;
        var path = safeRelative(node.getAttribute("href") || "");
        if (!path) return;
        var disabled = node.id === "atestado-desabilitado" || node.getAttribute("aria-disabled") === "true";
        target.path = path;
        target.available = !disabled;
        target.supportsSocialName = node.classList.contains("nome-social");
      });
    });
    documentLinks = targets;
    return {
      enrollmentCertificate: {
        available: targets.enrollmentCertificate.available,
        supportsSocialName: targets.enrollmentCertificate.supportsSocialName
      },
      schoolTranscript: {
        available: targets.schoolTranscript.available,
        supportsSocialName: targets.schoolTranscript.supportsSocialName
      },
      teachingPlans: {
        available: targets.teachingPlans.available,
        supportsSocialName: targets.teachingPlans.supportsSocialName
      }
    };
  }
  function pick(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    var result = {};
    keys.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key]; });
    return result;
  }
  function pickedRows(value, max, keys) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, max).map(function (item) { return pick(item, keys); });
  }
  function minimize(kind, data) {
    if (kind === "dadosacademico") {
      return pick(data, ["nome", "rga", "curso", "faculdade", "sigla_faculdade", "ultima_ocorrencia", "percentual_concluido", "estrutura_ano", "estrutura_numero"]);
    }
    if (kind === "matriculas") {
      return pickedRows(data, 200, ["id", "codigo", "disciplina", "turma", "data_solicitacao", "data_matricula", "data_cancelamento", "data_remocao", "situacao", "etapa"]);
    }
    if (kind === "notificacoes") {
      return { operacoes: pickedRows(data && data.operacoes, 100, ["id", "data_inicio", "data_fim", "hora_inicio", "hora_fim", "etapa_matricula"]) };
    }
    if (kind === "planosensino") {
      return pickedRows(data, 300, ["id", "codigo", "disciplina"]);
    }
    if (kind === "estrutura") {
      return {
        curso: data && data.curso,
        estrutura: data && data.estrutura,
        faculdade: data && data.faculdade,
        grades: pickedRows(data && data.grades, 1000, ["id", "disciplina_id", "codigo_disciplina", "nome_disciplina", "ch_total", "tipo_disciplina"])
      };
    }
    if (kind === "historico" && Array.isArray(data)) {
      return data.slice(0, 100).map(function (term) {
        return {
          ano_semestre: term && term.ano_semestre,
          historico: pickedRows(term && term.historico, 100, ["id", "ano", "semestre", "ch_total", "faltas", "resultado", "nota", "codigo_disciplina", "nome_disciplina", "tipo_disciplina", "avaliacao"])
        };
      });
    }
    return data;
  }
  window.__SIGECAD_REQUEST__ = async function (request) {
    if (request.kind === "document-catalog") {
      send({ id: request.id, ok: true, status: 200, data: scanDocumentLinks() });
      return;
    }
    var path;
    if (request.kind === "periodos") {
      path = "/rest/periodosletivos";
    } else if (request.kind === "turmas" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/turmas?periodoLetivoID=" + request.numericId;
    } else if (request.kind === "notas" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/notas?matriculaID=" + request.numericId;
    } else if (request.kind === "faltas" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/faltas?matriculaID=" + request.numericId;
    } else if (request.kind === "matriculas" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/matriculas?periodoLetivoID=" + request.numericId;
    } else if (request.kind === "horarios" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/horarios?periodoLetivoID=" + request.numericId;
    } else if (request.kind === "historico") {
      path = "/rest/historico";
    } else if (request.kind === "estrutura") {
      path = "/rest/estrutura";
    } else if (request.kind === "chcursada") {
      path = "/rest/chcursada";
    } else if (request.kind === "cursadascursando") {
      path = "/rest/cursadascursando";
    } else if (request.kind === "dadosacademico") {
      path = "/rest/dadosacademico";
    } else if (request.kind === "notificacoes") {
      path = "/rest/notificacoes";
    } else if (request.kind === "planosensino" && Number.isSafeInteger(request.numericId) && request.numericId > 0) {
      path = "/rest/planosensino?periodoLetivoID=" + request.numericId;
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
      if (response.status === 401 || responseUrl.hostname === "login.app.ufgd.edu.br") {
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
      if (request.kind === "planosensino" && Array.isArray(data)) {
        data.forEach(function (item) {
          var id = Number(item && item.id);
          if (Number.isSafeInteger(id) && id > 0) teachingPlanIds.add(id);
        });
      }
      send({ id: request.id, ok: true, status: response.status, data: minimize(request.kind, data) });
    } catch (_) {
      send({ id: request.id, ok: false, status: 0, error: "network" });
    }
  };

  function sameOriginResponse(response) {
    var url = new URL(response.url);
    if (response.status === 401 || url.hostname === "login.app.ufgd.edu.br") {
      throw new Error("AUTH");
    }
    if (url.origin !== window.location.origin) throw new Error("ORIGIN");
    if (!response.ok) throw new Error("HTTP");
    return response;
  }
  async function getRelative(path, accept) {
    if (!safeRelative(path)) throw new Error("ORIGIN");
    return sameOriginResponse(await fetch(path, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      headers: { Accept: accept }
    }));
  }
  function withNameMode(path, supportsSocialName, nameMode) {
    if (!supportsSocialName) return path;
    var url = new URL(path, window.location.origin);
    url.searchParams.set("nomesocial", nameMode === "social" ? "true" : "false");
    return url.pathname + url.search;
  }
  function referencesPlan(url, planId) {
    var expected = String(planId);
    if (url.pathname.split("/").some(function (part) { return part === expected; })) return true;
    return Array.prototype.slice.call(url.searchParams.values()).some(function (value) { return value === expected; });
  }
  function candidateFromHtml(html, planId) {
    if (html.length > MAX_TEXT) throw new Error("SIZE");
    var parsed = new DOMParser().parseFromString(html, "text/html");
    var candidates = Array.prototype.slice.call(parsed.querySelectorAll("iframe[src], embed[src], object[data], a[href]"));
    for (var index = 0; index < candidates.length; index += 1) {
      var node = candidates[index];
      var raw = node.getAttribute("src") || node.getAttribute("data") || node.getAttribute("href") || "";
      var relative = safeRelative(raw);
      if (!relative) continue;
      var url = new URL(relative, window.location.origin);
      var hint = normalized(node.textContent || node.getAttribute("title") || "") + " " + url.pathname.toLowerCase();
      if (planId && !referencesPlan(url, planId)) continue;
      if (/pdf|imprim|atestado|historico|plano|ensino/.test(hint)) return relative;
    }
    return null;
  }
  async function resolveDocumentResponse(request) {
    if (!documentLinks) scanDocumentLinks();
    var target;
    if (request.kind === "enrollment-certificate") target = documentLinks.enrollmentCertificate;
    else if (request.kind === "school-transcript") target = documentLinks.schoolTranscript;
    else target = documentLinks.teachingPlans;
    if (!target || !target.available || !target.path) throw new Error("UNAVAILABLE");
    var path = withNameMode(target.path, target.supportsSocialName, request.nameMode);
    if (request.kind === "teaching-plan") {
      if (!Number.isSafeInteger(request.planId) || !teachingPlanIds.has(request.planId)) throw new Error("PLAN");
      var listingResponse = await getRelative(path, "text/html, application/xhtml+xml");
      var listing = await listingResponse.text();
      var planPath = candidateFromHtml(listing, request.planId);
      if (!planPath) throw new Error("UNAVAILABLE");
      path = planPath;
    }
    var response = await getRelative(path, "application/pdf, text/html;q=0.8, */*;q=0.2");
    var contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.indexOf("text/html") >= 0 || contentType.indexOf("application/xhtml") >= 0) {
      var html = await response.text();
      var nested = candidateFromHtml(html, request.kind === "teaching-plan" ? request.planId : null);
      if (!nested) throw new Error("UNAVAILABLE");
      response = await getRelative(nested, "application/pdf, */*;q=0.2");
    }
    var announced = Number(response.headers.get("content-length"));
    if (Number.isFinite(announced) && announced > MAX_DOCUMENT_BYTES) throw new Error("SIZE");
    return response;
  }
  function isSignedWebdoc(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "webdoc.app.ufgd.edu.br" || url.pathname !== "/gerar") return false;
      var keys = Array.prototype.slice.call(url.searchParams.keys()).sort();
      if (keys.join(",") !== "documento,hash") return false;
      var documento = url.searchParams.get("documento") || "";
      var hash = url.searchParams.get("hash") || "";
      return documento.length >= 8 && documento.length <= 40 && /^[A-Za-z0-9_-]+$/.test(documento) &&
        /^[a-f0-9]{32}$/i.test(hash);
    } catch (_) { return false; }
  }
  function signedDocumentPath(request) {
    if (!documentLinks) scanDocumentLinks();
    if (request.kind === "teaching-plan") {
      if (!Number.isSafeInteger(request.planId) || !teachingPlanIds.has(request.planId)) {
        throw new Error("PLAN");
      }
      return "/graduacao/relatorios/planoensino?peID=" + request.planId;
    }
    var target = request.kind === "enrollment-certificate"
      ? documentLinks.enrollmentCertificate
      : documentLinks.schoolTranscript;
    if (!target || !target.available || !target.path) throw new Error("UNAVAILABLE");
    return withNameMode(target.path, target.supportsSocialName, request.nameMode);
  }
  async function captureSignedDocument(request) {
    var path = signedDocumentPath(request);
    sendDocument({ id: request.id, type: "navigation-ready" });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    try {
      var response = await fetch(path, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        headers: { Accept: "application/pdf, */*;q=0.2" }
      });
      if (isSignedWebdoc(response.url)) {
        sendDocument({ id: request.id, type: "signed-url", url: response.url });
        return;
      }
    } catch (_) {}
    window.location.assign(path);
  }
  function base64Of(bytes) {
    var binary = "";
    for (var offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return btoa(binary);
  }
  window.__SIGECAD_DOCUMENT__ = async function (request) {
    if (!request || typeof request !== "object" || !/^doc-[0-9]{1,10}$/.test(request.id || "") ||
      ["enrollment-certificate", "school-transcript", "teaching-plan"].indexOf(request.kind) < 0 ||
      ["civil", "social"].indexOf(request.nameMode) < 0) return;
    try {
      if (request.kind === "enrollment-certificate" || request.kind === "school-transcript" ||
        request.kind === "teaching-plan") {
        await captureSignedDocument(request);
        return;
      }
      var response = await resolveDocumentResponse(request);
      var bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length <= 5 || bytes.length > MAX_DOCUMENT_BYTES) throw new Error(bytes.length > MAX_DOCUMENT_BYTES ? "SIZE" : "PDF");
      if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
        throw new Error("PDF");
      }
      var chunks = Math.ceil(bytes.length / DOCUMENT_CHUNK_BYTES);
      sendDocument({ id: request.id, type: "start", totalBytes: bytes.length, totalChunks: chunks });
      for (var index = 0; index < chunks; index += 1) {
        var start = index * DOCUMENT_CHUNK_BYTES;
        sendDocument({ id: request.id, type: "chunk", index: index, data: base64Of(bytes.subarray(start, Math.min(start + DOCUMENT_CHUNK_BYTES, bytes.length))) });
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
      sendDocument({ id: request.id, type: "complete" });
    } catch (error) {
      var message = String(error && error.message || error);
      var code = message === "AUTH" ? "auth" : message === "SIZE" ? "too-large" :
        message === "UNAVAILABLE" || message === "HTTP" ? "unavailable" :
        message === "ORIGIN" || message === "PLAN" || message === "PDF" ? "invalid" : "network";
      sendDocument({ id: request.id, type: "error", error: code });
    }
  };
  window.__SIGECAD_BRIDGE_VERSION__ = 6;
  return true;
})();
true;
`;

/**
 * Bridge for the separate Card UFGD origin. IDs and hashes are discovered only
 * from the authenticated user's own page; the caller cannot supply either.
 * Photo, barcode value, balances and transactions are returned in memory and
 * never persisted.
 */
export const CARD_BRIDGE_BOOTSTRAP = `
(function () {
  if (window.__SIGECAD_REQUEST__) return true;
  var CHANNEL = ${JSON.stringify(BRIDGE_CHANNEL)};
  var PERF_CHANNEL = ${JSON.stringify(BRIDGE_PERF_CHANNEL)};
  var MAX_TEXT = 1200000;
  // Keeps the base64 response below the 1.5 MB native bridge envelope while
  // allowing a materially sharper source than the former 650 KB ceiling.
  var MAX_PHOTO_BYTES = 900000;
  var ORIGIN = "https://cartao.app.ufgd.edu.br";
  // Used exactly once to avoid repeating the discovery/status/balance GETs
  // between the priority summary and the immediately following full card load.
  var summaryContext = null;
  var summaryContextTimer = null;
  function send(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ channel: CHANNEL }, payload)));
  }
  var perfStartedAt = Date.now();
  function perf(stage) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ channel: PERF_CHANNEL, stage: stage, elapsed: Date.now() - perfStartedAt }));
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
  function money(text) {
    var match = String(text || "").match(/R\\$\\s*([0-9][0-9.,]*[.,][0-9]{2})/i);
    if (!match) return null;
    var value = match[1];
    if (value.indexOf(",") < 0) value = value.replace(".", ",");
    return "R$ " + value;
  }
  function balance(text) {
    var decoded = documentOf(text).documentElement.textContent || "";
    var match = decoded.match(/Saldo atual:\\s*(R\\$\\s*[0-9][0-9.,]*[.,][0-9]{2})/i);
    return match ? money(match[1]) : null;
  }
  function statusBalance(doc, label) {
    var node = Array.prototype.slice.call(doc.querySelectorAll("a, li, span")).find(function (item) {
      var text = clean(item.textContent, 120);
      return text.toLowerCase().indexOf(label.toLowerCase()) >= 0 && /R\\$/i.test(text);
    });
    return node ? money(clean(node.textContent, 120)) : null;
  }
  function findCardLink(doc) {
    return Array.prototype.slice.call(doc.querySelectorAll("a[href]")).map(function (node) {
      return node.getAttribute("href") || "";
    }).find(function (href) {
      return /^\\/cartoes_usuario\\/visualiza_estatus\\/\\d+\\/[A-Fa-f0-9]{8,128}$/.test(href);
    });
  }
  async function waitForCardLink(doc) {
    for (var attempt = 0; attempt < 40; attempt += 1) {
      var link = findCardLink(doc);
      if (link) return link;
      await new Promise(function (resolve) { setTimeout(resolve, 25); });
    }
    return null;
  }
  async function checked(path, json) {
    var response = await fetch(path, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      headers: { Accept: json ? "application/json" : "text/html, */*" }
    });
    var responseUrl = new URL(response.url);
    if (response.status === 401 || responseUrl.hostname === "login.app.ufgd.edu.br") {
      throw new Error("AUTH");
    }
    if (responseUrl.origin !== ORIGIN) throw new Error("ORIGIN");
    if (!response.ok) throw new Error("HTTP:" + response.status);
    var text = await response.text();
    if (text.length > MAX_TEXT) throw new Error("SIZE");
    if (!json) return text;
    try { return JSON.parse(text); } catch (_) { throw new Error("JSON"); }
  }
  async function optionalChecked(path, json, fallback) {
    try { return await checked(path, json); }
    catch (error) {
      var message = String(error && error.message || error);
      if (message === "AUTH" || message === "ORIGIN") throw error;
      return fallback;
    }
  }
  async function limitedPhotoBytes(response) {
    var announced = Number(response.headers.get("content-length"));
    if (Number.isFinite(announced) && announced > MAX_PHOTO_BYTES) throw new Error("PHOTO_SIZE");
    if (!response.body || typeof response.body.getReader !== "function") {
      var fallback = await response.arrayBuffer();
      if (fallback.byteLength <= 0 || fallback.byteLength > MAX_PHOTO_BYTES) throw new Error("PHOTO_SIZE");
      return new Uint8Array(fallback);
    }
    var reader = response.body.getReader();
    var chunks = [];
    var total = 0;
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      total += result.value.byteLength;
      if (total > MAX_PHOTO_BYTES) {
        try { await reader.cancel(); } catch (_) {}
        throw new Error("PHOTO_SIZE");
      }
      chunks.push(result.value);
    }
    if (total <= 0) throw new Error("PHOTO_SIZE");
    var bytes = new Uint8Array(total);
    var offset = 0;
    chunks.forEach(function (chunk) { bytes.set(chunk, offset); offset += chunk.byteLength; });
    return bytes;
  }
  function imageDimensions(bytes, jpeg, png) {
    if (png && bytes.length >= 24) {
      var pngWidth = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
      var pngHeight = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
      return pngWidth > 0 && pngHeight > 0 ? { width: pngWidth, height: pngHeight } : null;
    }
    if (!jpeg) return null;
    var offset = 2;
    var sof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      var marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      var length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if (sof.indexOf(marker) >= 0 && length >= 7) {
        var height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        var width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return width > 0 && height > 0 ? { width: width, height: height } : null;
      }
      offset += 2 + length;
    }
    return null;
  }
  async function photoCandidate(path, variant) {
    var response;
    try { response = await fetch(path, { method: "GET", credentials: "include", redirect: "follow" }); }
    catch (_) { return { candidate: null, status: "http-error" }; }
    if (!response.ok || new URL(response.url).origin !== ORIGIN) return { candidate: null, status: "http-error" };
    var bytes;
    try { bytes = await limitedPhotoBytes(response); }
    catch (error) {
      return { candidate: null, status: String(error && error.message || error) === "PHOTO_SIZE" ? "too-large" : "read-error" };
    }
    var jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    var png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!jpeg && !png) return { candidate: null, status: "invalid-image" };
    var dimensions = imageDimensions(bytes, jpeg, png);
    if (!dimensions || dimensions.width > 10000 || dimensions.height > 10000) {
      return { candidate: null, status: "invalid-image" };
    }
    return { candidate: {
      bytes: bytes,
      jpeg: jpeg,
      png: png,
      width: dimensions.width,
      height: dimensions.height,
      variant: variant
    }, status: "ok" };
  }
  async function photoData(personDoc) {
    var candidates = Array.prototype.slice.call(personDoc.querySelectorAll(".dados-foto img[src], .imagem-perfil[src], img[src]"));
    var image = candidates.find(function (node) {
      return /\\/foto\\/[A-Fa-f0-9]{32,}/.test(node.getAttribute("src") || "");
    });
    if (!image) return { dataUrl: null, status: "not-found" };
    var url;
    try { url = new URL(image.getAttribute("src"), ORIGIN); }
    catch (_) { return { dataUrl: null, status: "invalid-url" }; }
    if (url.origin !== ORIGIN || !/^\\/foto\\/[A-Fa-f0-9]{32,}(?:\\/\\d+\\/\\d+)?$/.test(url.pathname)) {
      return { dataUrl: null, status: "invalid-url" };
    }
    var match = url.pathname.match(/^\\/foto\\/([A-Fa-f0-9]{32,})(?:\\/\\d+\\/\\d+)?$/);
    if (!match) return { dataUrl: null, status: "invalid-url" };
    var base = "/foto/" + match[1];
    var requested = [
      { path: base, variant: "original" },
      { path: base + "/2048/2048", variant: "2048" },
      { path: base + "/1024/1024", variant: "1024" }
    ];
    if (!requested.some(function (item) { return item.path === url.pathname; })) {
      requested.push({ path: url.pathname, variant: "portal" });
    }
    var lastStatus = "http-error";
    var results = await Promise.all(requested.map(function (item) { return photoCandidate(item.path, item.variant); }));
    var valid = results.map(function (item) {
      if (item.status !== "ok") lastStatus = item.status;
      return item.candidate;
    }).filter(Boolean);
    if (!valid.length) return { dataUrl: null, status: lastStatus, width: null, height: null, variant: null };
    valid.sort(function (a, b) {
      return (b.width * b.height) - (a.width * a.height) || b.bytes.length - a.bytes.length;
    });
    var best = valid[0];
    var blob = new Blob([best.bytes], { type: best.jpeg ? "image/jpeg" : "image/png" });
    return await new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === "string"
          ? { dataUrl: reader.result, status: "ok", width: best.width, height: best.height, variant: best.variant }
          : { dataUrl: null, status: "read-error", width: null, height: null, variant: null });
      };
      reader.onerror = function () { resolve({ dataUrl: null, status: "read-error", width: null, height: null, variant: null }); };
      try { reader.readAsDataURL(blob); }
      catch (_) { resolve({ dataUrl: null, status: "read-error", width: null, height: null, variant: null }); }
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
  async function loadCardContext() {
    var locationUrl = new URL(window.location.href);
    if (locationUrl.origin !== ORIGIN || !/^\\/cartoes_usuario\\/visualiza_pessoa\\/?$/.test(locationUrl.pathname)) {
      throw new Error("ORIGIN");
    }
    // ensureOrigin already loaded this authenticated page; do not GET it twice.
    var person = document;
    perf("cartao-pessoa");
    // The origin handshake deliberately runs before page assets finish. Wait
    // only for the card anchor so we do not race the still-parsing HTML.
    var link = await waitForCardLink(person);
    if (!link) throw new Error("CARD");
    var parts = link.match(/^\\/cartoes_usuario\\/visualiza_estatus\\/(\\d+)\\/([A-Fa-f0-9]{8,128})$/);
    if (!parts) throw new Error("CARD");
    perf("cartao-link");
    var statusId = parts[1];
    var resourceHash = parts[2];
    var ruPath = "/cartoes_usuario/listagem_extrato_ru/" + statusId + "/" + resourceHash;
    var canteenPath = "/cartoes_usuario/listagem_extrato_cantina/" + statusId + "/" + resourceHash;
    // This page occasionally returns 5xx while its dedicated balance/extract
    // routes still work. Auth/origin errors remain fatal in optionalChecked.
    var statusText = await optionalChecked(link, false, "");
    var statusDoc = documentOf(statusText);
    perf(statusText ? "cartao-status" : "cartao-status-fallback");
    var ruBalance = statusBalance(statusDoc, "Extrato RU");
    var canteenBalance = statusBalance(statusDoc, "Extrato Cantina");
    if (!ruBalance || !canteenBalance) {
      var fallbackPages = await Promise.all([
        ruBalance ? Promise.resolve("") : optionalChecked(ruPath, false, ""),
        canteenBalance ? Promise.resolve("") : optionalChecked(canteenPath, false, "")
      ]);
      if (!ruBalance) ruBalance = balance(fallbackPages[0]);
      if (!canteenBalance) canteenBalance = balance(fallbackPages[1]);
      perf("cartao-saldos-fallback");
    }
    perf("cartao-saldos");
    var cardLegend = Array.prototype.slice.call(statusDoc.querySelectorAll("legend")).map(function (node) {
      return clean(node.textContent, 200);
    }).find(function (value) { return /^Cartão:/i.test(value); }) || "";
    return {
      person: person,
      statusDoc: statusDoc,
      statusId: statusId,
      number: cardLegend.match(/\\d{6,}/),
      version: cardLegend.match(/\\(Via\\s+\\d+\\)/i),
      ruBalance: ruBalance,
      canteenBalance: canteenBalance
    };
  }
  window.__SIGECAD_REQUEST__ = async function (request) {
    if (request.kind !== "card" && request.kind !== "card-summary") {
      send({ id: request.id, ok: false, status: 0, error: "invalid-response" });
      return;
    }
    try {
      perfStartedAt = Date.now();
      perf("cartao-inicio");
      var page = request.numericId == null ? 1 : request.numericId;
      if (!Number.isSafeInteger(page) || page < 1 || page > 50) throw new Error("CARD");
      var reusedSummary = request.kind === "card" && page === 1 && summaryContext;
      var context = reusedSummary ? summaryContext : await loadCardContext();
      if (reusedSummary) {
        if (summaryContextTimer) clearTimeout(summaryContextTimer);
        summaryContextTimer = null;
        summaryContext = null;
        perf("cartao-contexto-reutilizado");
      }
      var person = context.person;
      var statusDoc = context.statusDoc;
      var statusId = context.statusId;
      var number = context.number;
      var version = context.version;
      if (request.kind === "card-summary") {
        summaryContext = context;
        if (summaryContextTimer) clearTimeout(summaryContextTimer);
        summaryContextTimer = setTimeout(function () {
          summaryContext = null;
          summaryContextTimer = null;
        }, 5000);
        perf("cartao-resumo");
        send({
          id: request.id,
          ok: true,
          status: 200,
          data: {
            name: field(statusDoc, "Nome") || field(person, "Nome"),
            course: field(statusDoc, "Curso") || field(person, "Curso"),
            active: field(statusDoc, "Ativo"),
            cardLast4: number ? number[0].slice(-4) : null,
            barcodeValue: number ? number[0] : null,
            version: version ? version[0].replace(/[()]/g, "") : null,
            ruBalance: context.ruBalance,
            canteenBalance: context.canteenBalance,
            photoDataUrl: null,
            photoStatus: "not-requested",
            photoWidth: null,
            photoHeight: null,
            photoVariant: null,
            page: 1,
            ruTransactions: [],
            canteenTransactions: []
          }
        });
        return;
      }
      var params = "?dataInicio=&dataFim=&estatusId=" + encodeURIComponent(statusId) + "&pagina=" + page;
      var extracts = await Promise.all([
        optionalChecked("/cartoes_usuario/listagem_extrato_ajax_ru" + params, true, { Extrato: [] }),
        optionalChecked("/cartoes_usuario/listagem_extrato_ajax_cantina" + params, true, { Extrato: [] }),
        page === 1 ? photoData(person) : Promise.resolve({ dataUrl: null, status: "not-requested" })
      ]);
      send({
        id: request.id,
        ok: true,
        status: 200,
        data: {
          name: field(statusDoc, "Nome") || field(person, "Nome"),
          course: field(statusDoc, "Curso") || field(person, "Curso"),
          active: field(statusDoc, "Ativo"),
          cardLast4: number ? number[0].slice(-4) : null,
          barcodeValue: number ? number[0] : null,
          version: version ? version[0].replace(/[()]/g, "") : null,
          ruBalance: context.ruBalance,
          canteenBalance: context.canteenBalance,
          photoDataUrl: extracts[2].dataUrl,
          photoStatus: extracts[2].status,
          photoWidth: extracts[2].width,
          photoHeight: extracts[2].height,
          photoVariant: extracts[2].variant,
          page: page,
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
      perf(kind === "auth" ? "cartao-falha-auth" :
        kind === "http" ? "cartao-falha-http" :
        kind === "invalid-response" ? "cartao-falha-resposta" : "cartao-falha-rede");
      var status = message.indexOf("HTTP:") === 0 ? Number(message.slice(5)) || 0 : 0;
      send({ id: request.id, ok: false, status: status, error: kind });
    }
  };
  return true;
})();
true;
`;
