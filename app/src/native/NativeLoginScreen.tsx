import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Brand, Notice } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";
import {
  CAS_ORIGIN,
  KEEP_SESSION_NAVIGATION_SCRIPT,
  SIGECAD_ORIGIN,
  WEBVIEW_ORIGIN_WHITELIST,
  isAllowedSessionUrl,
  rewriteSessionNavigationUrl,
} from "../expo-go/origins";

const CAS_URL =
  `${CAS_ORIGIN}/?service=` +
  encodeURIComponent(`${SIGECAD_ORIGIN}/`);

export function NativeLoginScreen({ onDone: _onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [browserUri, setBrowserUri] = useState(CAS_URL);

  function allowInsideApp(url: string): boolean {
    const rewrittenUrl = rewriteSessionNavigationUrl(url);
    if (rewrittenUrl) {
      setBrowserUri(rewrittenUrl);
      return false;
    }
    return isAllowedSessionUrl(url);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Brand />
        <Text style={styles.title}>Entre pela página oficial da UFGD</Text>
        <Text style={styles.subtitle}>Sua senha fica dentro do portal e nunca é lida pelo aplicativo.</Text>
        {error ? <Notice danger>{error}</Notice> : null}
      </View>
      <View style={styles.browser}>
        <WebView
          source={{ uri: browserUri }}
          onError={() => setError("Não foi possível abrir o login da UFGD. Verifique sua conexão.")}
          incognito
          cacheEnabled={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          webviewDebuggingEnabled={false}
          originWhitelist={[...WEBVIEW_ORIGIN_WHITELIST]}
          mixedContentMode="never"
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          geolocationEnabled={false}
          injectedJavaScriptBeforeContentLoaded={KEEP_SESSION_NAVIGATION_SCRIPT}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Abrindo login seguro…</Text>
            </View>
          )}
          onShouldStartLoadWithRequest={({ url }) => allowInsideApp(url)}
          onOpenWindow={({ nativeEvent }) => {
            const requestedUrl = nativeEvent.targetUrl;
            const url = rewriteSessionNavigationUrl(requestedUrl) ?? requestedUrl;
            if (isAllowedSessionUrl(url)) setBrowserUri(url);
          }}
        />
      </View>
      <Text style={styles.footer}>Domínios permitidos: CAS, gov.br oficial, SIGECAD e cartão da UFGD</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  header: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800", marginTop: spacing.sm },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  browser: {
    flex: 1,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  loadingText: { color: colors.muted, fontSize: 14 },
  footer: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
