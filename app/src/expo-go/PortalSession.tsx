import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Image, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
} from "react-native-webview";
import { Notice, SecondaryButton } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";
import { fonts } from "./design/tokens";
import {
  BRIDGE_BOOTSTRAP,
  BRIDGE_PERF_CHANNEL,
  CARD_BRIDGE_BOOTSTRAP,
  PortalBridgeError,
  buildBridgeCommand,
  parseBridgeResponse,
  type BridgeKind,
} from "./bridge";
import {
  CARD_ORIGIN,
  CAS_ORIGIN,
  SIGECAD_ORIGIN,
  WEBDOC_ORIGIN,
  WEBVIEW_ORIGIN_WHITELIST,
  isAllowedSessionUrl,
  isBridgeUrl,
  isLoginUrl,
  isStableAcademicUrl,
  hasCasServiceTicket,
  safeHttpsOrigin,
} from "./origins";
import type { PortalBatchItem, PortalBatchRequest } from "./client";
import {
  base64DecodedBytes,
  buildDocumentBridgeCommand,
  cleanupAcademicDocumentCache,
  parseDocumentBridgeMessage,
  shareAcademicDocument,
  shareSignedAcademicDocument,
  isAllowedSignedDocumentUrl,
  type AcademicDocumentRequest,
  type DocumentBridgeMessage,
} from "./documents";

const CARD_URL = `${CARD_ORIGIN}/cartoes_usuario/visualiza_pessoa`;
const SIGECAD_HOME = `${SIGECAD_ORIGIN}/`;
const CAS_URL =
  `${CAS_ORIGIN}/?service=` +
  encodeURIComponent(SIGECAD_HOME);
const REQUEST_TIMEOUT_MS = 15_000;
const DOCUMENT_TIMEOUT_MS = 45_000;
const PERIOD_CACHE_TTL_MS = 5 * 60_000;
const ACADEMIC_BRIDGE_REVISION = "academic-v5";
const CARD_BRIDGE_REVISION = "card-v1";
const NAV_READY_CHANNEL = "sigecad-nav-ready-v1";
const NAV_READY_SCRIPT = `
(function () {
  try {
    var origin = window.location.origin;
    if (origin !== ${JSON.stringify(SIGECAD_ORIGIN)} && origin !== ${JSON.stringify(CARD_ORIGIN)}) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({ channel: ${JSON.stringify(NAV_READY_CHANNEL)}, ready: true }));
  } catch (_) {}
})();
true;
`;

type SessionPhase = "login" | "connecting" | "ready" | "expired" | "offline" | "error";

interface PortalSessionValue {
  phase: SessionPhase;
  request(kind: BridgeKind, numericId?: number): Promise<unknown>;
  requestBatch: PortalBatchRequest;
  shareDocument(request: AcademicDocumentRequest): Promise<void>;
  resetSession(): void;
  continueOffline(): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
  kind: BridgeKind;
  startedAt: number;
}

interface PendingDocument {
  resolve(base64: string | null): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
  expectedBytes: number | null;
  expectedChunks: number | null;
  receivedBytes: number;
  chunks: string[];
  kind: AcademicDocumentRequest["kind"];
}

interface NavigationWait {
  origin: string;
  resolve(): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

const PortalSessionContext = createContext<PortalSessionValue | null>(null);

export function usePortalSession(): PortalSessionValue {
  const value = useContext(PortalSessionContext);
  if (!value) throw new Error("PortalSession não está disponível.");
  return value;
}

export function PortalSession({ children }: { children: React.ReactNode }) {
  const webView = useRef<WebView>(null);
  const pending = useRef(new Map<string, PendingRequest>());
  const pendingDocuments = useRef(new Map<string, PendingDocument>());
  const currentOrigin = useRef<string | null>(null);
  const navigationWait = useRef<NavigationWait | null>(null);
  const operationQueue = useRef<Promise<void>>(Promise.resolve());
  const requestCounter = useRef(0);
  const connecting = useRef(false);
  const connectAttempt = useRef(0);
  const connectRetries = useRef(0);
  const ticketSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodCache = useRef<{ value: unknown; cachedAt: number } | null>(null);
  const installedBridge = useRef<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("login");
  const [error, setError] = useState<string | null>(null);
  const [webKey, setWebKey] = useState(0);
  // The CAS must be the first page in the same WebView that later hosts the
  // academic portal. This keeps the UFGDNET cookie in the WebView's jar.
  const [browserUri, setBrowserUri] = useState(CAS_URL);
  const [documentSurface, setDocumentSurface] = useState(false);

  useEffect(() => {
    // Cleanup is best-effort. Delay the lazily loaded filesystem module so its
    // parse/evaluation cannot compete with login or the first Home paint.
    const timer = setTimeout(() => { void cleanupAcademicDocumentCache(); }, 10_000);
    return () => clearTimeout(timer);
  }, []);

  const rejectAll = useCallback((reason: Error) => {
    for (const item of pending.current.values()) {
      clearTimeout(item.timeout);
      item.reject(reason);
    }
    pending.current.clear();
    for (const item of pendingDocuments.current.values()) {
      clearTimeout(item.timeout);
      item.reject(reason);
    }
    pendingDocuments.current.clear();
  }, []);

  const beginLogin = useCallback((clearCookies: boolean) => {
    rejectAll(new PortalBridgeError("A sessão foi reiniciada.", "auth"));
    if (navigationWait.current) {
      clearTimeout(navigationWait.current.timeout);
      navigationWait.current.reject(new PortalBridgeError("A sessão foi reiniciada.", "auth"));
      navigationWait.current = null;
    }
    currentOrigin.current = null;
    operationQueue.current = Promise.resolve();
    connecting.current = false;
    connectAttempt.current += 1;
    connectRetries.current = 0;
    if (ticketSettle.current) {
      clearTimeout(ticketSettle.current);
      ticketSettle.current = null;
    }
    requestCounter.current = 0;
    periodCache.current = null;
    installedBridge.current = null;
    const openLogin = () => {
      setError(null);
      setPhase("login");
      setBrowserUri(CAS_URL);
      setWebKey((value) => value + 1);
    };
    if (!clearCookies) {
      openLogin();
      return;
    }
    void destroyBrowserSession(webView.current).finally(openLogin);
  }, [rejectAll]);

  const resetSession = useCallback(() => beginLogin(true), [beginLogin]);
  const reopenLogin = useCallback(() => beginLogin(false), [beginLogin]);

  const continueOffline = useCallback(() => setPhase("offline"), []);

  const ensureOrigin = useCallback((origin: string) => {
    if (currentOrigin.current === origin) return Promise.resolve();
    if (!webView.current || navigationWait.current) {
      return Promise.reject(new PortalBridgeError("Navegador do portal indisponível.", "protocol"));
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        navigationWait.current = null;
        reject(new PortalBridgeError("O portal demorou demais para abrir.", "timeout"));
      }, REQUEST_TIMEOUT_MS);
      navigationWait.current = { origin, resolve, reject, timeout };
      const destination = origin === CARD_ORIGIN ? CARD_URL : SIGECAD_HOME;
      // Updating `source` is reliable even while WKWebView is covered by the
      // native app. Injected location changes can be deferred indefinitely by
      // iOS for an off-screen/transparent page, which used to cost 15 seconds.
      // A Fast Refresh/process restoration can preserve `source` while refs
      // that tracked the loaded origin are rebuilt. Setting the same URI is a
      // React no-op, so explicitly reload it to complete the ready handshake.
      if (browserUri === destination) webView.current?.reload();
      else setBrowserUri(destination);
    });
  }, [browserUri]);

  const injectRequest = useCallback((kind: BridgeKind, numericId?: number) => {
    if (!webView.current) {
      return Promise.reject(new PortalBridgeError("Portal ainda não carregou.", "protocol"));
    }
    const id = `req-${++requestCounter.current}`;
    const cardRequest = kind === "card" || kind === "card-summary";
    const revision = cardRequest ? CARD_BRIDGE_REVISION : ACADEMIC_BRIDGE_REVISION;
    const bootstrap = cardRequest ? CARD_BRIDGE_BOOTSTRAP : BRIDGE_BOOTSTRAP;
    const needsBootstrap = installedBridge.current !== revision;
    const command = `${needsBootstrap ? `${bootstrap}\n` : ""}${buildBridgeCommand(id, kind, numericId)}`;
    installedBridge.current = revision;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.current.delete(id);
        installedBridge.current = null;
        reject(new PortalBridgeError("O SIGECAD demorou demais para responder.", "timeout"));
      }, REQUEST_TIMEOUT_MS);
      pending.current.set(id, { resolve, reject, timeout, kind, startedAt: Date.now() });
      webView.current?.injectJavaScript(command);
    });
  }, []);

  const performRequest = useCallback(async (kind: BridgeKind, numericId?: number) => {
    const origin = kind === "card" || kind === "card-summary" ? CARD_ORIGIN : SIGECAD_ORIGIN;
    await ensureOrigin(origin);
    return injectRequest(kind, numericId);
  }, [ensureOrigin, injectRequest]);

  const request = useCallback((kind: BridgeKind, numericId?: number) => {
    const cachedPeriods = periodCache.current;
    if (kind === "periodos" && numericId === undefined && cachedPeriods &&
      Date.now() - cachedPeriods.cachedAt < PERIOD_CACHE_TTL_MS) {
      return Promise.resolve(cachedPeriods.value);
    }
    const result = operationQueue.current.then(() => performRequest(kind, numericId));
    operationQueue.current = result.then(() => undefined, () => undefined);
    if (kind === "periodos" && numericId === undefined) {
      void result.then((value) => {
        periodCache.current = { value, cachedAt: Date.now() };
      }, () => undefined);
    }
    return result;
  }, [performRequest]);

  const requestBatch = useCallback(async (items: PortalBatchItem[]) => {
    if (!items.length) return [];
    if (items.length > 100 || items.some((item) => item.kind === "card" || item.kind === "card-summary")) {
      throw new PortalBridgeError("Lote de consulta inválido.", "protocol");
    }
    const result = operationQueue.current.then(async () => {
      await ensureOrigin(SIGECAD_ORIGIN);
      const results = new Array<PromiseSettledResult<unknown>>(items.length);
      const pendingIndices: number[] = [];
      items.forEach((item, index) => {
        const cachedPeriods = periodCache.current;
        if (item.kind === "periodos" && item.numericId === undefined && cachedPeriods &&
          Date.now() - cachedPeriods.cachedAt < PERIOD_CACHE_TTL_MS) {
          results[index] = { status: "fulfilled", value: cachedPeriods.value };
        } else {
          pendingIndices.push(index);
        }
      });

      const execute = async (index: number) => {
        const item = items[index];
        try {
          const value = await injectRequest(item.kind, item.numericId);
          if (item.kind === "periodos" && item.numericId === undefined) {
            periodCache.current = { value, cachedAt: Date.now() };
          }
          results[index] = { status: "fulfilled", value };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      };

      // Native injectJavaScript calls can overtake one another. After a portal
      // navigation, wait for the first response (which installs the bootstrap)
      // before releasing command-only requests to the concurrent workers.
      if (installedBridge.current !== ACADEMIC_BRIDGE_REVISION && pendingIndices.length) {
        await execute(pendingIndices.shift() as number);
      }

      let cursor = 0;
      const workers = Array.from({ length: Math.min(6, pendingIndices.length) }, async () => {
        while (cursor < pendingIndices.length) {
          const index = pendingIndices[cursor++];
          await execute(index);
        }
      });
      await Promise.all(workers);
      return results;
    });
    operationQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, [ensureOrigin, injectRequest]);

  const injectDocumentRequest = useCallback((input: AcademicDocumentRequest) => {
    if (!webView.current) {
      return Promise.reject(new PortalBridgeError("Portal ainda não carregou.", "protocol"));
    }
    const id = `doc-${++requestCounter.current}`;
    const needsBootstrap = installedBridge.current !== ACADEMIC_BRIDGE_REVISION;
    const command = `${needsBootstrap ? `${BRIDGE_BOOTSTRAP}\n` : ""}${buildDocumentBridgeCommand(id, input)}`;
    installedBridge.current = ACADEMIC_BRIDGE_REVISION;
    return new Promise<string | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingDocuments.current.delete(id);
        installedBridge.current = null;
        reject(new PortalBridgeError("O documento demorou demais para ser preparado.", "timeout"));
      }, DOCUMENT_TIMEOUT_MS);
      pendingDocuments.current.set(id, {
        resolve,
        reject,
        timeout,
        expectedBytes: null,
        expectedChunks: null,
        receivedBytes: 0,
        chunks: [],
        kind: input.kind,
      });
      webView.current?.injectJavaScript(command);
    });
  }, []);

  const shareDocument = useCallback((input: AcademicDocumentRequest) => {
    const result = operationQueue.current.then(async () => {
      setDocumentSurface(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      try {
        await ensureOrigin(SIGECAD_ORIGIN);
        const base64 = await injectDocumentRequest(input);
        if (base64 !== null) await shareAcademicDocument(input.kind, base64);
      } finally {
        setDocumentSurface(false);
      }
    });
    operationQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, [ensureOrigin, injectDocumentRequest]);

  const abortInFlightBridge = useCallback(() => {
    connectAttempt.current += 1;
    connecting.current = false;
    installedBridge.current = null;
    rejectAll(new PortalBridgeError("A sessão ainda está abrindo.", "timeout"));
  }, [rejectAll]);

  const connect = useCallback(async () => {
    const attempt = ++connectAttempt.current;
    connecting.current = true;
    setError(null);
    setPhase("connecting");
    try {
      const periods = await request("periodos");
      if (attempt !== connectAttempt.current) return;
      periodCache.current = { value: periods, cachedAt: Date.now() };
      connectRetries.current = 0;
      setPhase("ready");
    } catch (cause) {
      if (attempt !== connectAttempt.current) return;
      const bridgeError = cause instanceof PortalBridgeError ? cause : null;
      if (bridgeError?.code === "auth") {
        connectRetries.current = 0;
        reopenLogin();
        return;
      }
      if (connectRetries.current < 1) {
        connectRetries.current += 1;
        connecting.current = false;
        void connect();
        return;
      }
      setError(messageOf(cause));
      setPhase("error");
    } finally {
      if (attempt === connectAttempt.current) connecting.current = false;
    }
  }, [request, reopenLogin]);

  function coverAcademicNavigation(url: string) {
    if ((phase === "login" || phase === "connecting" || phase === "error") &&
      (isStableAcademicUrl(url) || hasCasServiceTicket(url))) {
      setPhase("connecting");
    }
  }

  function markOriginReady(url: string) {
    const origin = safeHttpsOrigin(url);
    installedBridge.current = null;
    currentOrigin.current = origin;
    const waiting = navigationWait.current;
    if (waiting && origin === waiting.origin) {
      clearTimeout(waiting.timeout);
      navigationWait.current = null;
      waiting.resolve();
    } else if (waiting && isLoginUrl(url)) {
      clearTimeout(waiting.timeout);
      navigationWait.current = null;
      waiting.reject(new PortalBridgeError("Sua sessão UFGD terminou.", "auth"));
      if (phase === "ready" || phase === "offline") setPhase("expired");
      else reopenLogin();
    }
    coverAcademicNavigation(url);
    if (hasCasServiceTicket(url)) {
      abortInFlightBridge();
      if (ticketSettle.current) clearTimeout(ticketSettle.current);
      const scheduled = connectAttempt.current;
      ticketSettle.current = setTimeout(() => {
        ticketSettle.current = null;
        if (scheduled !== connectAttempt.current) return;
        void connect();
      }, 800);
      return;
    }
    if (ticketSettle.current) {
      clearTimeout(ticketSettle.current);
      ticketSettle.current = null;
    }
    if (isStableAcademicUrl(url) && (phase === "login" || phase === "connecting" || phase === "error")) {
      void connect();
    }
  }

  function onLoadStart(url: string) {
    coverAcademicNavigation(url);
    if (hasCasServiceTicket(url)) abortInFlightBridge();
  }

  function onLoadEnd(url: string) {
    markOriginReady(url);
  }

  function onOpenWindow(event: { nativeEvent: { targetUrl: string } }) {
    const url = event.nativeEvent.targetUrl;
    if (isAllowedSessionUrl(url)) setBrowserUri(url);
  }

  function onMessage(event: WebViewMessageEvent) {
    if (!isBridgeUrl(event.nativeEvent.url)) return;
    const documentMessage = parseDocumentBridgeMessage(event.nativeEvent.data);
    if (documentMessage) {
      handleDocumentMessage(documentMessage);
      return;
    }
    try {
      const perf = JSON.parse(event.nativeEvent.data) as { channel?: unknown; ready?: unknown; stage?: unknown; elapsed?: unknown };
      if (perf.channel === NAV_READY_CHANNEL && perf.ready === true) {
        markOriginReady(event.nativeEvent.url);
        return;
      }
      const allowedStages = [
        "cartao-inicio", "cartao-pessoa", "cartao-saldos", "cartao-resumo",
        "cartao-contexto-reutilizado", "cartao-link", "cartao-status",
        "cartao-status-fallback", "cartao-saldos-fallback", "cartao-falha-auth",
        "cartao-falha-http", "cartao-falha-resposta", "cartao-falha-rede",
      ];
      if (perf.channel === BRIDGE_PERF_CHANNEL && typeof perf.stage === "string" &&
        allowedStages.includes(perf.stage) && Number.isInteger(perf.elapsed) &&
        (perf.elapsed as number) >= 0 && (perf.elapsed as number) <= 120_000) {
        if (__DEV__) console.info(`[SIGECAD ponte] ${perf.stage}: ${perf.elapsed}ms`);
        return;
      }
    } catch { /* Não é uma mensagem de performance; validar como resposta normal. */ }
    let response;
    try {
      response = parseBridgeResponse(event.nativeEvent.data);
    } catch {
      return;
    }
    const item = pending.current.get(response.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.current.delete(response.id);
    if (__DEV__) {
      const stage = response.ok ? item.kind : `${item.kind}-failed`;
      console.info(`[SIGECAD request] ${stage}: ${Date.now() - item.startedAt}ms`);
    }
    if (response.ok) {
      item.resolve(response.data);
      return;
    }
    const error = bridgeError(response.error, response.status);
    item.reject(error);
    if (error.code === "auth" && (phase === "ready" || phase === "offline")) {
      setPhase("expired");
    }
  }

  function handleDocumentMessage(message: DocumentBridgeMessage) {
    const item = pendingDocuments.current.get(message.id);
    if (!item) return;
    if (message.type === "error") {
      clearTimeout(item.timeout);
      pendingDocuments.current.delete(message.id);
      const labels = {
        auth: "Sua sessão UFGD terminou.",
        unavailable: "Este documento não está disponível no portal agora.",
        invalid: "O portal não retornou um PDF seguro para este documento.",
        "too-large": "O documento ultrapassa o limite seguro de 8 MB.",
        network: "Não foi possível baixar o documento da UFGD.",
      } as const;
      item.reject(new PortalBridgeError(labels[message.error], message.error === "auth" ? "auth" : "invalid-response"));
      if (message.error === "auth") setPhase("expired");
      return;
    }
    if (message.type === "start") {
      if (item.expectedBytes !== null || item.chunks.length) {
        failDocument(message.id, item);
        return;
      }
      item.expectedBytes = message.totalBytes;
      item.expectedChunks = message.totalChunks;
      return;
    }
    if (message.type === "chunk") {
      if (item.expectedBytes === null || item.expectedChunks === null ||
        message.index !== item.chunks.length || message.index >= item.expectedChunks) {
        failDocument(message.id, item);
        return;
      }
      const decoded = base64DecodedBytes(message.data);
      if (decoded <= 0 || item.receivedBytes + decoded > item.expectedBytes) {
        failDocument(message.id, item);
        return;
      }
      item.chunks.push(message.data);
      item.receivedBytes += decoded;
      return;
    }
    if (message.type === "signed-url") {
      clearTimeout(item.timeout);
      pendingDocuments.current.delete(message.id);
      void shareSignedAcademicDocument(item.kind, message.url)
        .then(() => item.resolve(null))
        .catch(() => item.reject(new PortalBridgeError(
          "Não foi possível preparar o PDF oficial da UFGD.",
          "invalid-response",
        )));
      return;
    }
    if (item.expectedBytes === null || item.expectedChunks === null ||
      item.chunks.length !== item.expectedChunks || item.receivedBytes !== item.expectedBytes) {
      failDocument(message.id, item);
      return;
    }
    clearTimeout(item.timeout);
    pendingDocuments.current.delete(message.id);
    item.resolve(item.chunks.join(""));
  }

  function failDocument(id: string, item: PendingDocument) {
    clearTimeout(item.timeout);
    pendingDocuments.current.delete(id);
    item.reject(new PortalBridgeError("Transferência de documento inválida.", "protocol"));
  }

  function consumeSignedDocumentUrl(url: string): boolean {
    if (!isAllowedSignedDocumentUrl(url)) return false;
    const match = [...pendingDocuments.current.entries()].find(([, item]) =>
      item.kind === "enrollment-certificate" || item.kind === "school-transcript" ||
      item.kind === "teaching-plan");
    if (match) {
      const [id, item] = match;
      clearTimeout(item.timeout);
      pendingDocuments.current.delete(id);
      if (__DEV__) console.info("[SIGECAD documento] redirect-assinado");
      void shareSignedAcademicDocument(item.kind, url)
        .then(() => {
          if (__DEV__) console.info("[SIGECAD documento] folha-concluida");
          item.resolve(null);
        })
        .catch(() => {
          if (__DEV__) console.info("[SIGECAD documento] falha-validacao");
          item.reject(new PortalBridgeError(
            "Não foi possível preparar o PDF oficial da UFGD.",
            "invalid-response",
          ));
        });
    }
    return true;
  }

  function onShouldStartLoad(requestValue: { url: string }): boolean {
    const { url } = requestValue;
    if (consumeSignedDocumentUrl(url)) return false;
    if (safeHttpsOrigin(url) === WEBDOC_ORIGIN) return false;
    return isAllowedSessionUrl(url);
  }

  const value = useMemo<PortalSessionValue>(
    () => ({ phase, request, requestBatch, shareDocument, resetSession, continueOffline }),
    [phase, request, requestBatch, shareDocument, resetSession, continueOffline],
  );

  const ready = phase === "ready";
  const showContent = ready || phase === "expired" || phase === "offline";
  const showLoginChrome = phase === "login" || phase === "error";
  const coveringPortal = phase === "connecting";
  const liveDocumentSurface = showContent && documentSurface;
  const hiddenBrowserStyle = Platform.OS === "android"
    ? (liveDocumentSurface ? styles.documentBrowserAndroid : styles.hiddenBrowserAndroid)
    : styles.hiddenBrowser;
  return (
    <PortalSessionContext.Provider value={value}>
      <View style={styles.root}>
        {!showContent ? <StatusBar barStyle="dark-content" backgroundColor={colors.background} /> : null}
        {showContent ? <View style={styles.contentLayer}>{children}</View> : null}
        {showLoginChrome ? (
          <SafeAreaView edges={["top", "left", "right"]} style={styles.loginSafe}>
            <View style={styles.loginShell}>
            <View style={styles.loginBrand}>
              <View style={styles.loginMark}>
                <Image source={require("../../assets/brand/ufgd-symbol-negative-1024.png")} style={styles.loginMarkImage} />
              </View>
              <Text style={styles.loginBrandText}>SIGECAD</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>Acesso com sua conta UFGDNET</Text>
              <Text style={styles.subtitle}>
                Entre no portal oficial dentro do app. A senha fica só neste aparelho.
              </Text>
              <View style={styles.originPill}><Text style={styles.originText}>login.app.ufgd.edu.br</Text></View>
            </View>
            {error ? (
              <>
                <Notice danger>{error}</Notice>
                <SecondaryButton label="Reabrir login" onPress={reopenLogin} />
              </>
            ) : null}
            </View>
          </SafeAreaView>
        ) : null}
        <WebView
          key={webKey}
          ref={webView}
          source={{ uri: browserUri }}
          pointerEvents={showLoginChrome ? "auto" : "none"}
          style={showContent ? hiddenBrowserStyle : styles.browser}
          containerStyle={showContent ? hiddenBrowserStyle : styles.browserContainer}
          onLoadStart={(event) => onLoadStart(event.nativeEvent.url)}
          onLoadEnd={(event) => onLoadEnd(event.nativeEvent.url)}
          onOpenWindow={onOpenWindow}
          onMessage={onMessage}
          injectedJavaScriptBeforeContentLoaded={NAV_READY_SCRIPT}
          onError={() => {
            if (navigationWait.current) {
              clearTimeout(navigationWait.current.timeout);
              navigationWait.current.reject(new PortalBridgeError("Falha ao abrir o portal.", "network"));
              navigationWait.current = null;
            }
            setError("Não foi possível abrir a UFGD. Verifique sua internet.");
            setPhase("error");
          }}
          incognito={false}
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          sharedCookiesEnabled
          thirdPartyCookiesEnabled={false}
          webviewDebuggingEnabled={false}
          originWhitelist={[...WEBVIEW_ORIGIN_WHITELIST]}
          mixedContentMode="never"
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowingReadAccessToURL=""
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          geolocationEnabled={false}
          mediaPlaybackRequiresUserAction
          startInLoadingState={showLoginChrome}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.connectingText}>Abrindo login seguro…</Text>
            </View>
          )}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          onFileDownload={(event) => { consumeSignedDocumentUrl(event.nativeEvent.downloadUrl); }}
        />
        {coveringPortal ? (
          <View style={styles.connectingOverlay} pointerEvents="auto">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.connectingTitle}>Entrando no SIGECAD…</Text>
            <Text style={styles.connectingCopy}>
              A sessão fica só neste aparelho. O app não vê sua senha.
            </Text>
          </View>
        ) : null}
        {liveDocumentSurface ? (
          <View style={styles.connectingOverlay} pointerEvents="auto">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.connectingTitle}>Preparando o PDF oficial…</Text>
            <Text style={styles.connectingCopy}>
              O arquivo fica só neste aparelho, só enquanto você compartilha ou salva.
            </Text>
          </View>
        ) : null}
        {phase === "expired" ? (
          <View style={styles.expiredOverlay}>
            <View style={styles.expiredSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.expiredTitle}>Sessão expirada</Text>
              <Text style={styles.expiredCopy}>
                Sua sessão UFGDNET venceu. Entre de novo para atualizar — os dados que você
                já viu continuam disponíveis enquanto o app estiver aberto.
              </Text>
              <Pressable onPress={reopenLogin} style={styles.expiredPrimary}>
                <Text style={styles.expiredPrimaryText}>Entrar com UFGDNET</Text>
              </Pressable>
              <Pressable onPress={continueOffline} style={styles.expiredSecondary}>
                <Text style={styles.expiredSecondaryText}>Continuar offline</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </PortalSessionContext.Provider>
  );
}

async function destroyBrowserSession(view: WebView | null): Promise<void> {
  try {
    const CookieManager = (await import("@preeternal/react-native-cookie-manager")).default;
    await CookieManager.clearAll(true);
  } catch { /* Cookie manager is unavailable in some runtimes. */ }
  view?.clearCache?.(true);
  view?.clearHistory?.();
  view?.injectJavaScript?.("try{localStorage.clear();sessionStorage.clear();}catch(e){} true;");
}

function bridgeError(
  code: PortalBridgeError["code"] | undefined,
  status: number,
): PortalBridgeError {
  if (code === "auth") return new PortalBridgeError("Sua sessão UFGD terminou.", "auth");
  if (code === "network") return new PortalBridgeError("Falha de conexão com o SIGECAD.", "network");
  if (code === "invalid-response") {
    return new PortalBridgeError("O SIGECAD respondeu em um formato inesperado.", "invalid-response");
  }
  return new PortalBridgeError(
    status ? `O SIGECAD está indisponível (HTTP ${status}).` : "O SIGECAD está indisponível.",
    "http",
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Não foi possível conectar ao SIGECAD.";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // Keep the authenticated UI physically above the live bridge WebView on
  // Android. `pointerEvents="none"` alone does not reliably stop a native
  // WebView from intercepting hardware/ADB taps when it is the top sibling.
  contentLayer: { flex: 1, position: "relative", zIndex: 1 },
  loginSafe: { backgroundColor: colors.background },
  loginShell: { paddingHorizontal: 20, paddingTop: 18, gap: spacing.md },
  loginBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  loginMark: { width: 34, height: 34, borderRadius: 8, backgroundColor: "#174F3D", alignItems: "center", justifyContent: "center" },
  loginMarkImage: { width: 24, height: 24 },
  loginBrandText: { color: "#17201C", fontFamily: fonts.monoSemibold, fontSize: 15, letterSpacing: 0.8, paddingRight: 6, flexShrink: 0 },
  copy: { gap: spacing.xs, marginTop: spacing.sm },
  title: { color: "#17201C", fontFamily: fonts.sansSemibold, fontSize: 24, lineHeight: 30 },
  subtitle: { color: "#3D4A43", fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  originPill: { alignSelf: "flex-start", backgroundColor: "#EFF1ED", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4, marginTop: 4 },
  originText: { color: "#5C6B63", fontFamily: fonts.mono, fontSize: 10.5 },
  connecting: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  connectingText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
  connectingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: 32,
  },
  connectingTitle: { color: "#17201C", fontFamily: fonts.sansSemibold, fontSize: 20, lineHeight: 26, textAlign: "center" },
  connectingCopy: { color: "#3D4A43", fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, textAlign: "center" },
  browserContainer: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  browser: { flex: 1, backgroundColor: colors.surface },
  // WKWebView may suspend navigation/network when reduced to 1×1 and fully
  // transparent. Keep a laid-out, non-interactive surface behind the app.
  hiddenBrowser: { ...StyleSheet.absoluteFill, opacity: 0.01, zIndex: 0 },
  // Android's native WebView may intercept hardware taps even with
  // pointerEvents="none". It continues bridge fetches in this tiny off-screen
  // surface, while the dashboard owns the entire interactive area.
  // Android may defer cross-origin WebView navigation when the view is fully
  // transparent and outside the viewport. Keep a drawable 2 px surface behind
  // the native dashboard; z-index + pointerEvents prevent visual/touch overlap.
  hiddenBrowserAndroid: { position: "absolute", width: 2, height: 2, left: 0, bottom: 0, opacity: 0.01, zIndex: 0 },
  // Cross-origin redirect to Webdoc is deferred on the 2×2 surface. Expand
  // behind an overlay only while a PDF is being prepared.
  documentBrowserAndroid: { ...StyleSheet.absoluteFill, opacity: 0.02, zIndex: 0 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  expiredOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    backgroundColor: "rgba(23,32,28,0.25)",
    justifyContent: "flex-end",
  },
  expiredSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 10,
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#D6DBD4", alignSelf: "center" },
  expiredTitle: { color: "#17201C", fontFamily: fonts.sansSemibold, fontSize: 26, lineHeight: 31 },
  expiredCopy: { color: "#3D4A43", fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  expiredPrimary: { minHeight: 48, borderRadius: 8, backgroundColor: "#174F3D", alignItems: "center", justifyContent: "center" },
  expiredPrimaryText: { color: "#FFFFFF", fontFamily: fonts.sansSemibold, fontSize: 14 },
  expiredSecondary: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  expiredSecondaryText: { color: "#174F3D", fontFamily: fonts.sansSemibold, fontSize: 13 },
});
