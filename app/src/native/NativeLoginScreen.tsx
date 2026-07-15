import React, { useRef, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import CookieManager from "@preeternal/react-native-cookie-manager";
import { saveToken } from "../auth/token";
import { Brand, Notice } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";

const CAS_URL =
  "https://login.app.ufgd.edu.br/?service=" +
  encodeURIComponent("https://sigecad-academico.app.ufgd.edu.br/");
const SIGECAD_HOST = "https://sigecad-academico.app.ufgd.edu.br";

/**
 * Login CAS inside the official UFGD page. The app never reads the password;
 * after the redirect it stores only UFGDNET in the device keychain.
 */
export function NativeLoginScreen({ onDone }: { onDone: () => void }) {
  const completed = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function onNav(nav: WebViewNavigation) {
    if (completed.current || !nav.url.startsWith(SIGECAD_HOST)) return;
    try {
      const cookies = await CookieManager.get(SIGECAD_HOST, true);
      const rootCookies = await CookieManager.get("https://ufgd.edu.br", true);
      const ufgdnet = cookies.UFGDNET?.value ?? rootCookies.UFGDNET?.value;
      if (!ufgdnet) return;
      completed.current = true;
      await saveToken(`UFGDNET=${ufgdnet}`);
      onDone();
    } catch {
      completed.current = false;
      setError("O login terminou, mas não foi possível proteger a sessão neste aparelho.");
    }
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
          source={{ uri: CAS_URL }}
          onNavigationStateChange={(nav) => { void onNav(nav); }}
          onError={() => setError("Não foi possível abrir o login da UFGD. Verifique sua conexão.")}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          incognito={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Abrindo login seguro…</Text>
            </View>
          )}
          onShouldStartLoadWithRequest={({ url }) => {
            try {
              const host = new URL(url).hostname;
              return host === "ufgd.edu.br" || host.endsWith(".ufgd.edu.br");
            } catch {
              return false;
            }
          }}
        />
      </View>
      <Text style={styles.footer}>Domínios permitidos: somente ufgd.edu.br</Text>
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
