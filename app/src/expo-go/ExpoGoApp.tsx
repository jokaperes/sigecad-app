import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadAcademicOverview, type AcademicCourse, type AcademicOverview } from "../core/academic";
import { diff } from "../core/diff";
import {
  clearPreviewState,
  getPreviewState,
  savePreviewState,
} from "../storage/asyncStorage";
import { Brand, Card, Notice, PrimaryButton, SecondaryButton } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";
import { PortalSession, usePortalSession } from "./PortalSession";
import { ExpoGoPollClient } from "./client";

type Tab = "home" | "grades" | "privacy";

export function ExpoGoApp() {
  return (
    <PortalSession>
      <StatusBar barStyle="dark-content" />
      <ExpoGoDashboard />
    </PortalSession>
  );
}

function ExpoGoDashboard() {
  const { request, resetSession } = usePortalSession();
  const [tab, setTab] = useState<Tab>("home");
  const [overview, setOverview] = useState<AcademicOverview | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);

  const refresh = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const previous = await getPreviewState();
      const next = await loadAcademicOverview(new ExpoGoPollClient(request));
      setOverview(next);
      setEvents(previous ? diff(previous.items, next.items, next.labels) : []);
      await savePreviewState({ items: next.items, labels: next.labels, checkedAt: next.checkedAt });
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function clearHistory() {
    await clearPreviewState();
    setEvents([]);
    setPrivacyMessage("Histórico local removido. Suas notas nunca foram salvas.");
  }

  if (loading && !overview) {
    return (
      <View style={styles.centeredState}>
        <View style={styles.livePill}><Text style={styles.liveDot}>●</Text><Text style={styles.liveText}>EXPO GO • AO VIVO</Text></View>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>Montando seu painel</Text>
        <Text style={styles.loadingCopy}>Consultando período, disciplinas e avaliações…</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <Brand />
        <View style={styles.livePill}><Text style={styles.liveDot}>●</Text><Text style={styles.liveText}>AO VIVO</Text></View>
      </View>
      {error ? (
        <View style={styles.errorWrap}>
          <Notice danger>{error}</Notice>
          <SecondaryButton label="Tentar novamente" busy={refreshing} onPress={() => void refresh(true)} />
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} tintColor={colors.primary} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {tab === "home" ? <Home overview={overview} events={events} onRefresh={() => void refresh(true)} refreshing={refreshing} /> : null}
        {tab === "grades" ? <Grades overview={overview} /> : null}
        {tab === "privacy" ? (
          <Privacy
            message={privacyMessage}
            onClear={() => void clearHistory()}
            onLogout={resetSession}
          />
        ) : null}
      </ScrollView>
      <TabBar value={tab} onChange={setTab} />
    </View>
  );
}

function Home({
  overview,
  events,
  refreshing,
  onRefresh,
}: {
  overview: AcademicOverview | null;
  events: string[];
  refreshing: boolean;
  onRefresh(): void;
}) {
  const stats = useMemo(() => {
    const assessments = overview?.courses.flatMap((course) => course.assessments) ?? [];
    return {
      courses: overview?.courses.length ?? 0,
      published: assessments.filter((item) => item.published).length,
      assessments: assessments.length,
    };
  }, [overview]);

  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PAINEL ACADÊMICO</Text>
        <Text style={styles.heroTitle}>{overview?.period.nome ?? "Período atual"}</Text>
        <Text style={styles.heroCopy}>Uma leitura privada e atual do seu SIGECAD.</Text>
      </View>
      <View style={styles.metricRow}>
        <Metric value={stats.courses} label="Disciplinas" />
        <Metric value={stats.published} label="Publicadas" />
        <Metric value={stats.assessments} label="Avaliações" />
      </View>
      <Card>
        <View style={styles.cardHeadingRow}>
          <View style={styles.flex}>
            <Text style={styles.cardEyebrow}>ATUALIZAÇÕES</Text>
            <Text style={styles.cardTitle}>{events.length ? `${events.length} mudança${events.length > 1 ? "s" : ""}` : "Tudo em dia"}</Text>
          </View>
          <View style={[styles.statusIcon, events.length ? styles.statusIconWarm : null]}>
            <Text style={styles.statusIconText}>{events.length ? "!" : "✓"}</Text>
          </View>
        </View>
        {events.length ? events.map((event, index) => (
          <View key={`${event}-${index}`} style={styles.eventRow}>
            <View style={styles.eventDot} />
            <Text style={styles.eventText}>{event}</Text>
          </View>
        )) : (
          <Text style={styles.bodyCopy}>Nenhuma mudança desde a última consulta neste iPhone.</Text>
        )}
        <Text style={styles.timestamp}>Consultado {formatTimestamp(overview?.checkedAt)}</Text>
      </Card>
      <PrimaryButton label="Atualizar agora" busy={refreshing} onPress={onRefresh} />
      <Text style={styles.pullHint}>Você também pode puxar a tela para atualizar.</Text>
    </>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Grades({ overview }: { overview: AcademicOverview | null }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return overview?.courses ?? [];
    return (overview?.courses ?? []).filter((course) =>
      `${course.code} ${course.name} ${course.section}`.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [overview, query]);

  function toggle(course: AcademicCourse) {
    const key = `${course.code}::${course.section}`;
    setExpanded((value) => ({ ...value, [key]: !value[key] }));
  }

  return (
    <>
      <View style={styles.sectionIntro}>
        <Text style={styles.eyebrow}>NOTAS E FREQUÊNCIA</Text>
        <Text style={styles.sectionTitle}>Suas disciplinas</Text>
        <Text style={styles.bodyCopy}>Toque em uma disciplina para ver as avaliações.</Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar disciplina ou código"
        placeholderTextColor="#7C91A3"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.search}
        accessibilityLabel="Buscar disciplinas"
      />
      {filtered.length ? filtered.map((course) => {
        const key = `${course.code}::${course.section}`;
        const open = Boolean(expanded[key]);
        return (
          <Pressable
            key={key}
            onPress={() => toggle(course)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={({ pressed }) => [styles.courseCard, pressed && styles.coursePressed]}
          >
            <View style={styles.courseHeader}>
              <View style={styles.flex}>
                <Text style={styles.courseCode}>{course.code} • {course.section}</Text>
                <Text style={styles.courseName}>{course.name}</Text>
              </View>
              <Text style={styles.chevron}>{open ? "−" : "+"}</Text>
            </View>
            <View style={styles.chipRow}>
              <View style={styles.neutralChip}><Text style={styles.neutralChipText}>{formatAbsences(course)}</Text></View>
              {course.result ? <View style={styles.successChip}><Text style={styles.successChipText}>{course.result}</Text></View> : null}
            </View>
            {open ? (
              <View style={styles.assessmentList}>
                {course.assessments.length ? course.assessments.map((assessment, index) => (
                  <View key={`${assessment.name}-${index}`} style={styles.assessmentRow}>
                    <View style={styles.flex}>
                      <Text style={styles.assessmentName}>{assessment.name}</Text>
                      <Text style={assessment.published ? styles.published : styles.pending}>
                        {assessment.published ? "Publicada" : "Ainda não publicada"}
                      </Text>
                    </View>
                    <Text style={styles.gradeValue}>{displayGrade(assessment.value, assessment.published)}</Text>
                  </View>
                )) : <Text style={styles.emptyInline}>Nenhuma avaliação cadastrada.</Text>}
              </View>
            ) : null}
          </Pressable>
        );
      }) : (
        <Card><Text style={styles.emptyInline}>Nenhuma disciplina encontrada.</Text></Card>
      )}
    </>
  );
}

function Privacy({ message, onClear, onLogout }: { message: string | null; onClear(): void; onLogout(): void }) {
  return (
    <>
      <View style={styles.sectionIntro}>
        <Text style={styles.eyebrow}>PRIVACIDADE</Text>
        <Text style={styles.sectionTitle}>Seus dados ficam com você</Text>
        <Text style={styles.bodyCopy}>Este modo foi desenhado especificamente para o Expo Go.</Text>
      </View>
      {message ? <Notice>{message}</Notice> : null}
      <Card>
        <PrivacyRow icon="✓" title="Login oficial" copy="Usuário, senha e cookie permanecem no navegador privado da UFGD." />
        <Divider />
        <PrivacyRow icon="✓" title="Notas só na tela" copy="Valores de notas e faltas ficam apenas na memória enquanto o app está aberto." />
        <Divider />
        <PrivacyRow icon="#" title="Histórico sem valores" copy="O iPhone guarda somente hashes irreversíveis para detectar mudanças." />
        <Divider />
        <PrivacyRow icon="—" title="Sem segundo plano" copy="O Expo Go não suporta o módulo nativo de alertas. Atualize ao abrir o app." />
      </Card>
      <SecondaryButton label="Apagar histórico local" onPress={onClear} />
      <PrimaryButton label="Sair e apagar sessão" danger onPress={onLogout} />
      <Text style={styles.pullHint}>Ao sair, o navegador privado é destruído e o login precisa ser refeito.</Text>
    </>
  );
}

function PrivacyRow({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return (
    <View style={styles.privacyRow}>
      <View style={styles.privacyIcon}><Text style={styles.privacyIconText}>{icon}</Text></View>
      <View style={styles.flex}>
        <Text style={styles.privacyTitle}>{title}</Text>
        <Text style={styles.privacyCopy}>{copy}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function TabBar({ value, onChange }: { value: Tab; onChange(tab: Tab): void }) {
  const tabs: Array<{ key: Tab; icon: string; label: string }> = [
    { key: "home", icon: "⌂", label: "Início" },
    { key: "grades", icon: "A+", label: "Notas" },
    { key: "privacy", icon: "◇", label: "Privacidade" },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <Text style={[styles.tabIcon, active && styles.tabActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function displayGrade(value: number | string | null, published: boolean): string {
  if (!published || value === null || value === "") return "—";
  return String(value);
}

function formatAbsences(course: AcademicCourse): string {
  const used = course.absences ?? 0;
  return course.absenceLimit === null ? `${used} faltas` : `${used}/${course.absenceLimit} faltas`;
}

function formatTimestamp(value?: string): string {
  if (!value) return "agora";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "agora"
    : date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Não foi possível atualizar seus dados.";
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.successSoft },
  liveDot: { color: colors.success, fontSize: 8 },
  liveText: { color: colors.success, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  hero: { backgroundColor: colors.primary, borderRadius: 22, padding: spacing.lg, gap: spacing.xs, overflow: "hidden" },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: colors.white, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  heroCopy: { color: "#D7F1F3", fontSize: 14, lineHeight: 20 },
  metricRow: { flexDirection: "row", gap: spacing.sm },
  metric: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: "center" },
  metricValue: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  cardHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  cardEyebrow: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", marginTop: 4 },
  statusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
  statusIconWarm: { backgroundColor: "#FFF3E5" },
  statusIconText: { color: colors.success, fontSize: 20, fontWeight: "900" },
  bodyCopy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  eventRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 7, backgroundColor: colors.accent },
  eventText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 },
  timestamp: { color: colors.muted, fontSize: 11 },
  pullHint: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: spacing.md },
  sectionIntro: { gap: spacing.xs, paddingVertical: spacing.xs },
  sectionTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  search: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.ink, fontSize: 15, paddingHorizontal: spacing.md },
  courseCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  coursePressed: { backgroundColor: "#FAFCFD" },
  courseHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  courseCode: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  courseName: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 3 },
  chevron: { color: colors.primary, fontSize: 25, fontWeight: "400", lineHeight: 27 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  neutralChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.soft },
  neutralChipText: { color: colors.primaryPressed, fontSize: 10, fontWeight: "800" },
  successChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.successSoft },
  successChipText: { color: colors.success, fontSize: 10, fontWeight: "800" },
  assessmentList: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  assessmentRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  assessmentName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  published: { color: colors.success, fontSize: 11, marginTop: 3 },
  pending: { color: colors.muted, fontSize: 11, marginTop: 3 },
  gradeValue: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  emptyInline: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", paddingVertical: spacing.sm },
  privacyRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  privacyIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft },
  privacyIconText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  privacyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  privacyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  tabBar: { flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  tab: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 },
  tabPressed: { opacity: 0.65 },
  tabIcon: { color: colors.muted, fontSize: 15, fontWeight: "800" },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  tabActive: { color: colors.primary },
  centeredState: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  loadingTitle: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  loadingCopy: { color: colors.muted, fontSize: 14, textAlign: "center" },
  errorWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
});
