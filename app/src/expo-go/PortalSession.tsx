import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import { Brand, Notice, SecondaryButton } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";
import {
  BRIDGE_BOOTSTRAP,
  PortalBridgeError,
  buildBridgeCommand,
  parseBridgeResponse,
  type BridgeKind,
} from "./bridge";

const SIGECAD_ORIGIN = "https://sigecad-academico.app.ufgd.edu.br";
const CAS_URL =
  "https://login.app.ufgd.edu.br/?service=" +
  encodeURIComponent(`${SIGECAD_ORIGIN}/`);
const REQUEST_TIMEOUT_MS = 30_000;

type SessionPhase = "login" | "connecting" | "ready" | "error";

interface PortalSessionValue {
  phase: SessionPhase;
  request(kind: BridgeKind, numericId?: number): Promise<unknown>;
  resetSession(): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
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
  const requestCounter = useRef(0);
  const connecting = useRef(false);
  const [phase, setPhase] = useState<SessionPhase>("login");
  const [error, setError] = useState<string | null>(null);
  const [webKey, setWebKey] = useState(0);

  const rejectAll = useCallback((reason: Error) => {
    for (const item of pending.current.values()) {
      clearTimeout(item.timeout);
      item.reject(reason);
    }
    pending.current.clear();
  }, []);

  const resetSession = useCallback(() => {
    rejectAll(new PortalBridgeError("A sessão foi reiniciada.", "auth"));
    connecting.current = false;
    requestCounter.current = 0;
    setError(null);
    setPhase("login");
    setWebKey((value) => value + 1);
  }, [rejectAll]);

  const request = useCallback((kind: BridgeKind, numericId?: number) => {
    if (!webView.current) {
      return Promise.reject(new PortalBridgeError("Portal ainda não carregou.", "protocol"));
    }
    const id = `req-${++requestCounter.current}`;
    const command = `${BRIDGE_BOOTSTRAP}\n${buildBridgeCommand(id, kind, numericId)}`;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.current.delete(id);
        reject(new PortalBridgeError("O SIGECAD demorou demais para responder.", "timeout"));
      }, REQUEST_TIMEOUT_MS);
      pending.current.set(id, { resolve, reject, timeout });
      webView.current?.injectJavaScript(command);
    });
  }, []);

  const connect = useCallback(async () => {
    if (connecting.current) return;
    connecting.current = true;
    setError(null);
    setPhase("connecting");
    try {
      await request("periodos");
      setPhase("ready");
    } catch (cause) {
      const bridgeError = cause instanceof PortalBridgeError ? cause : null;
      if (bridgeError?.code === "auth") {
        resetSession();
      } else {
        setError(messageOf(cause));
        setPhase("error");
      }
    } finally {
      connecting.current = false;
    }
  }, [request, resetSession]);

  function onNavigation(nav: WebViewNavigation) {
    if (isAcademicUrl(nav.url) && phase === "login") setPhase("connecting");
  }

  function onLoadEnd(url: string) {
    if (isAcademicUrl(url)) void connect();
  }

  function onMessage(event: WebViewMessageEvent) {
    if (!isAcademicUrl(event.nativeEvent.url)) return;
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
    if (response.ok) {
      item.resolve(response.data);
      return;
    }
    const error = bridgeError(response.error, response.status);
    item.reject(error);
  }

  const value = useMemo<PortalSessionValue>(
    () => ({ phase, request, resetSession }),
    [phase, request, resetSession],
  );

  const ready = phase === "ready";
  return (
    <PortalSessionContext.Provider value={value}>
      <SafeAreaView style={styles.safe}>
        {ready ? children : (
          <View style={styles.loginShell}>
            <Brand />
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>EXPO GO • SESSÃO PRIVADA</Text>
              <Text style={styles.title}>Entre pela página oficial da UFGD</Text>
              <Text style={styles.subtitle}>
                A senha e o cookie ficam dentro deste navegador temporário. O app recebe
                somente seus dados acadêmicos para montar a tela.
              </Text>
            </View>
            {phase === "connecting" ? (
              <View style={styles.connecting}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.connectingText}>Conectando ao seu período…</Text>
              </View>
            ) : null}
            {error ? (
              <>
                <Notice danger>{error}</Notice>
                <SecondaryButton label="Reabrir login" onPress={resetSession} />
              </>
            ) : null}
          </View>
        )}
        <WebView
          key={webKey}
          ref={webView}
          source={{ uri: CAS_URL }}
          style={ready ? styles.hiddenBrowser : styles.browser}
          containerStyle={ready ? styles.hiddenBrowser : styles.browserContainer}
          onNavigationStateChange={onNavigation}
          onLoadEnd={(event) => onLoadEnd(event.nativeEvent.url)}
          onMessage={onMessage}
          onError={() => {
            setError("Não foi possível abrir a UFGD. Verifique sua internet.");
            setPhase("error");
          }}
          incognito
          cacheEnabled={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.connectingText}>Abrindo login seguro…</Text>
            </View>
          )}
          onShouldStartLoadWithRequest={({ url }) => isAllowedUfgdUrl(url)}
        />
      </SafeAreaView>
    </PortalSessionContext.Provider>
  );
}

function isAllowedUfgdUrl(value: string): boolean {
  if (value === "about:blank") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "ufgd.edu.br" || url.hostname.endsWith(".ufgd.edu.br"));
  } catch {
    return false;
  }
}

function isAcademicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === SIGECAD_ORIGIN;
  } catch {
    return false;
  }
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
  safe: { flex: 1, backgroundColor: colors.background },
  loginShell: { padding: spacing.lg, gap: spacing.md },
  copy: { gap: spacing.xs, marginTop: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  connecting: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  connectingText: { color: colors.muted, fontSize: 13 },
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
  hiddenBrowser: { position: "absolute", width: 1, height: 1, left: -10, bottom: 0, opacity: 0 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
});
