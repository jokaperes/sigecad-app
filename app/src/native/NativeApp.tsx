import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import auth from "@react-native-firebase/auth";
import messaging from "@react-native-firebase/messaging";
import { SENTINEL_ENABLED } from "./sentinelFlag";
import { setupBackgroundHandler } from "../push/handlers";
import { initAppCheck } from "../backend/firebase";
import { clearToken, getToken } from "../auth/token";
import { NativeLoginScreen } from "./NativeLoginScreen";
import { registerDevice } from "../push/register";
import { deleteMe } from "../backend/reporter";
import {
  clearAppState,
  getRegistration,
  type Registration,
} from "../storage/asyncStorage";
import {
  Brand,
  Card,
  Eyebrow,
  Notice,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";

if (SENTINEL_ENABLED) setupBackgroundHandler();

type Stage = "loading" | "login" | "consent" | "registering" | "done" | "refreshing" | "deleting";

export default function App() {
  if (!SENTINEL_ENABLED) {
    throw new Error("O sentinela Firebase está desativado neste build.");
  }
  return <SentinelApp />;
}

function SentinelApp() {
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function boot() {
    setError(null);
    setStage("loading");
    try {
      await initAppCheck();
      const [token, saved] = await Promise.all([getToken(), getRegistration()]);
      setRegistration(saved);
      setEmail(saved?.email ?? "");
      if (!token) setStage("login");
      else setStage(saved ? "done" : "consent");
    } catch (cause) {
      setError(messageOf(cause, "Não foi possível iniciar o app."));
    }
  }

  useEffect(() => { void boot(); }, []);

  useEffect(() => {
    if (!registration) return undefined;
    return messaging().onTokenRefresh(() => { void enroll(true); });
  }, [registration?.registeredAt]);

  useEffect(() => {
    if (!registration) return undefined;
    return messaging().onMessage((message) => {
      if (message.data?.kind !== "grade-update") return;
      Alert.alert(
        message.notification?.title ?? "Atualização acadêmica",
        message.notification?.body ?? "Há uma atualização nas suas turmas.",
      );
    });
  }, [registration?.registeredAt]);

  async function enroll(refresh = false) {
    setError(null);
    setStage(refresh ? "refreshing" : "registering");
    try {
      const saved = await registerDevice(email.trim() || null);
      setRegistration(saved);
      setEmail(saved.email ?? "");
      setStage("done");
    } catch (cause) {
      setError(messageOf(cause, "Não foi possível concluir o cadastro."));
      setStage(refresh ? "done" : "consent");
    }
  }

  async function removeAccount() {
    setError(null);
    setStage("deleting");
    try {
      await deleteMe();
      await Promise.all([clearToken(), clearAppState()]);
      await auth().signOut().catch(() => undefined);
      setRegistration(null);
      setEmail("");
      setConsent(false);
      setStage("login");
    } catch (cause) {
      setError(messageOf(cause, "Não foi possível apagar seus dados."));
      setStage("done");
    }
  }

  if (stage === "loading") {
    return (
      <AppFrame>
        <Screen centered>
          <Brand />
          <Card accessibilityLabel="Inicialização do aplicativo">
            <Text style={styles.title}>Preparando seus alertas</Text>
            <Text style={styles.body}>Validando o dispositivo e carregando apenas dados locais.</Text>
            {error ? (
              <>
                <Notice danger>{error}</Notice>
                <PrimaryButton label="Tentar novamente" onPress={() => void boot()} />
              </>
            ) : <PrimaryButton label="Iniciando…" busy disabled />}
          </Card>
        </Screen>
      </AppFrame>
    );
  }

  if (stage === "login") {
    return (
      <AppFrame>
        <NativeLoginScreen onDone={() => setStage("consent")} />
      </AppFrame>
    );
  }

  if (stage === "consent" || stage === "registering") {
    return (
      <AppFrame>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Screen>
            <Brand />
            <View style={styles.hero}>
              <Eyebrow>Último passo</Eyebrow>
              <Text style={styles.heroTitle}>Ativar notificações</Text>
              <Text style={styles.body}>
                O servidor recebe o token de push, o contato opcional e as turmas necessárias
                para enviar os avisos.
              </Text>
            </View>
            <Card>
              <Text style={styles.sectionTitle}>Como prefere ser avisado?</Text>
              <Text style={styles.label}>Email de recuperação (opcional)</Text>
              <TextInput
                accessibilityLabel="Email opcional"
                placeholder="voce@exemplo.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                editable={stage !== "registering"}
                style={styles.input}
              />
              <View style={styles.consentRow}>
                <Switch
                  accessibilityLabel="Concordo com o tratamento mínimo de dados"
                  value={consent}
                  onValueChange={setConsent}
                  disabled={stage === "registering"}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
                <Text style={styles.consentText}>
                  Concordo com o tratamento mínimo descrito acima e posso apagar tudo quando quiser.
                </Text>
              </View>
              {error ? <Notice danger>{error}</Notice> : null}
              <PrimaryButton
                label="Ativar alertas"
                busy={stage === "registering"}
                disabled={!consent}
                onPress={() => void enroll()}
              />
            </Card>
          </Screen>
        </KeyboardAvoidingView>
      </AppFrame>
    );
  }

  const turmaCount = registration?.turmas.length ?? 0;
  const lastUpdated = formatDate(registration?.registeredAt);
  return (
    <AppFrame>
      <Screen>
        <Brand />
        <View style={styles.hero}>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Alertas cadastrados</Text>
          </View>
          <Text style={styles.heroTitle}>Avisos das suas turmas</Text>
          <Text style={styles.body}>O app pode avisar quando uma avaliação aparece ou uma nota é publicada.</Text>
        </View>
        <View style={styles.metrics}>
          <Card style={styles.metricCard}>
            <Text style={styles.metricValue}>{turmaCount}</Text>
            <Text style={styles.metricLabel}>turmas monitoradas</Text>
          </Card>
          <Card style={styles.metricCard}>
            <Text style={styles.metricValue}>6×</Text>
            <Text style={styles.metricLabel}>horários de verificação</Text>
          </Card>
        </View>
        <Card>
          <Text style={styles.sectionTitle}>Seu dispositivo</Text>
          <InfoRow label="Último cadastro" value={lastUpdated} />
          <InfoRow label="Servidor" value="Push, turmas, hashes e rótulos" />
          {error ? <Notice danger>{error}</Notice> : null}
          <SecondaryButton
            label="Sincronizar turmas agora"
            busy={stage === "refreshing"}
            onPress={() => void enroll(true)}
          />
        </Card>
        <Notice>O iOS pode atrasar verificações em segundo plano e deixa de executá-las se o app for encerrado à força.</Notice>
        {registration?.turmas.length ? (
          <Card>
            <Text style={styles.sectionTitle}>Turmas monitoradas</Text>
            <View style={styles.codeList}>
              {registration.turmas.map((code) => (
                <View key={code} style={styles.codePill}><Text style={styles.codeText}>{code}</Text></View>
              ))}
            </View>
          </Card>
        ) : (
          <Notice>Nenhuma turma com avaliações foi encontrada no período atual.</Notice>
        )}
        <Card style={styles.dangerCard}>
          <Text style={styles.sectionTitle}>Privacidade e saída</Text>
          <Text style={styles.body}>Remove o push, os vínculos de turma e os dados locais deste aparelho.</Text>
          <PrimaryButton
            label="Apagar meus dados e sair"
            danger
            busy={stage === "deleting"}
            onPress={() => Alert.alert(
              "Apagar todos os dados?",
              "Essa ação remove o cadastro do servidor e o token deste aparelho.",
              [
                { text: "Cancelar", style: "cancel" },
                { text: "Apagar", style: "destructive", onPress: () => void removeAccount() },
              ],
            )}
          />
        </Card>
      </Screen>
    </AppFrame>
  );
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function formatDate(value?: string): string {
  if (!value) return "Ainda não sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: spacing.sm },
  heroTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: "800" },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.ink,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  consentText: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20 },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  statusText: { color: colors.success, fontSize: 13, fontWeight: "800" },
  metrics: { flexDirection: "row", gap: spacing.sm },
  metricCard: { flex: 1, minHeight: 120, justifyContent: "center" },
  metricValue: { color: colors.primary, fontSize: 30, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  infoRow: { gap: 3, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12 },
  infoValue: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  codeList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  codePill: { backgroundColor: colors.soft, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 11 },
  codeText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  dangerCard: { borderColor: "#F4C7C3" },
});
