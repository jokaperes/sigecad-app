import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import {
  clearPreviewState,
  savePreviewState,
} from "../storage/asyncStorage";
import { Brand, Card, Notice, PrimaryButton, SecondaryButton } from "../ui/components";
import { colors, radius, spacing } from "../ui/theme";
import { PortalSession, usePortalSession } from "./PortalSession";
import { loadStudentCard, type CardTransaction, type StudentCard } from "./card";
import { ExpoGoPollClient } from "./client";

type Tab = "home" | "grades" | "cards" | "privacy";

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
  const [studentCard, setStudentCard] = useState<StudentCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);

  const refresh = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const next = await loadAcademicOverview(new ExpoGoPollClient(request));
      setOverview(next);
      await savePreviewState({
        items: next.items,
        labels: next.labels,
        checkedAt: next.checkedAt,
      });
      try {
        setStudentCard(await loadStudentCard(request));
        setCardError(null);
      } catch (cause) {
        setCardError(cardMessageOf(cause));
      }
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
    setPrivacyMessage("Histórico local removido. Notas, foto e saldos nunca foram salvos.");
  }

  if (loading && !overview) {
    return (
      <View style={styles.centeredState}>
        <Brand />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>Preparando seu SIGECAD</Text>
        <Text style={styles.loadingCopy}>Carregando dados acadêmicos e cartão…</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.header}><Brand /></View>
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh(true)}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {tab === "home" ? (
          <Home overview={overview} studentCard={studentCard} cardError={cardError} />
        ) : null}
        {tab === "grades" ? <Grades overview={overview} /> : null}
        {tab === "cards" ? <Cards studentCard={studentCard} error={cardError} /> : null}
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
  studentCard,
  cardError,
}: {
  overview: AcademicOverview | null;
  studentCard: StudentCard | null;
  cardError: string | null;
}) {
  return (
    <>
      <View style={styles.profileHero}>
        <StudentPhoto card={studentCard} />
        <View style={styles.profileCopy}>
          <Text style={styles.greeting}>Olá,</Text>
          <Text style={styles.studentName}>{studentCard?.name ?? "Estudante UFGD"}</Text>
          {studentCard?.course ? <Text style={styles.studentCourse}>{studentCard.course}</Text> : null}
          <View style={styles.periodPill}>
            <Text style={styles.periodPillText}>{overview?.period.nome ?? "Período atual"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.balanceRow}>
        <BalanceCard label="Restaurante universitário" shortLabel="RU" value={studentCard?.ruBalance} />
        <BalanceCard label="Cantina" shortLabel="CANTINA" value={studentCard?.canteenBalance} />
      </View>

      {cardError ? <Notice danger>{cardError}</Notice> : null}

      <Card style={styles.welcomeCard}>
        <Text style={styles.cardTitle}>Tudo em um só lugar</Text>
        <Text style={styles.bodyCopy}>
          Consulte suas notas na aba Notas e veja as movimentações recentes do cartão na aba Cartões.
        </Text>
      </Card>
      <Text style={styles.pullHint}>Puxe a tela para atualizar os dados.</Text>
    </>
  );
}

function StudentPhoto({ card }: { card: StudentCard | null }) {
  if (card?.photoDataUrl) {
    return <Image source={{ uri: card.photoDataUrl }} style={styles.studentPhoto} accessibilityLabel="Foto do aluno" />;
  }
  const initial = card?.name?.trim().charAt(0).toUpperCase() || "U";
  return (
    <View style={styles.photoFallback} accessibilityLabel="Foto não disponível">
      <Text style={styles.photoInitial}>{initial}</Text>
    </View>
  );
}

function BalanceCard({
  label,
  shortLabel,
  value,
}: {
  label: string;
  shortLabel: string;
  value: string | null | undefined;
}) {
  return (
    <View style={styles.balanceCard} accessibilityLabel={`${label}: ${value ?? "indisponível"}`}>
      <Text style={styles.balanceLabel}>{shortLabel}</Text>
      <Text style={styles.balanceValue}>{value ?? "—"}</Text>
      <Text style={styles.balanceCaption}>{label}</Text>
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
        placeholderTextColor="#838B67"
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
            style={({ pressed }) => [styles.courseCard, pressed && styles.pressed]}
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
              {course.result ? <View style={styles.accentChip}><Text style={styles.accentChipText}>{course.result}</Text></View> : null}
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
      }) : <Card><Text style={styles.emptyInline}>Nenhuma disciplina encontrada.</Text></Card>}
    </>
  );
}

function Cards({ studentCard, error }: { studentCard: StudentCard | null; error: string | null }) {
  const [source, setSource] = useState<"ru" | "canteen">("ru");
  const transactions = source === "ru"
    ? studentCard?.ruTransactions ?? []
    : studentCard?.canteenTransactions ?? [];

  return (
    <>
      <View style={styles.sectionIntro}>
        <Text style={styles.eyebrow}>CARTÃO UFGD</Text>
        <Text style={styles.sectionTitle}>Cartão e extratos</Text>
        <Text style={styles.bodyCopy}>Movimentações recentes da sua própria conta.</Text>
      </View>
      {error ? <Notice danger>{error}</Notice> : null}
      <View style={styles.digitalCard}>
        <View style={styles.digitalCardTop}>
          <Text style={styles.digitalCardBrand}>UFGD</Text>
          <Text style={styles.digitalCardStatus}>{studentCard?.active ?? "—"}</Text>
        </View>
        <Text style={styles.digitalCardNumber}>••••  ••••  ••••  {studentCard?.cardLast4 ?? "————"}</Text>
        <View style={styles.digitalCardBottom}>
          <View><Text style={styles.digitalCardLabel}>ALUNO</Text><Text style={styles.digitalCardValue}>{studentCard?.name ?? "—"}</Text></View>
          <View><Text style={styles.digitalCardLabel}>VIA</Text><Text style={styles.digitalCardValue}>{studentCard?.version ?? "—"}</Text></View>
        </View>
      </View>

      <View style={styles.segmented}>
        <Segment label="RU" active={source === "ru"} onPress={() => setSource("ru")} />
        <Segment label="Cantina" active={source === "canteen"} onPress={() => setSource("canteen")} />
      </View>
      <View style={styles.extractHeading}>
        <View>
          <Text style={styles.cardTitle}>Movimentações</Text>
          <Text style={styles.extractCount}>{transactions.length} registro{transactions.length === 1 ? "" : "s"}</Text>
        </View>
        <Text style={styles.extractBalance}>{source === "ru" ? studentCard?.ruBalance ?? "—" : studentCard?.canteenBalance ?? "—"}</Text>
      </View>
      {transactions.length ? transactions.map((transaction, index) => (
        <TransactionRow key={`${source}-${transaction.date}-${transaction.time}-${index}`} item={transaction} />
      )) : (
        <Card><Text style={styles.emptyInline}>Nenhuma movimentação recente encontrada.</Text></Card>
      )}
    </>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TransactionRow({ item }: { item: CardTransaction }) {
  const incoming = /cr[eé]dito|entrada|recarga/i.test(item.type) || /^\+/.test(item.value);
  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, incoming && styles.transactionIconIncoming]}>
        <Text style={styles.transactionIconText}>{incoming ? "+" : "−"}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.transactionTitle}>{item.merchant || item.type}</Text>
        <Text style={styles.transactionMeta}>{item.date}{item.time ? ` • ${item.time}` : ""} • {item.type}</Text>
      </View>
      <Text style={[styles.transactionValue, incoming && styles.transactionValueIncoming]}>{item.value}</Text>
    </View>
  );
}

function Privacy({ message, onClear, onLogout }: { message: string | null; onClear(): void; onLogout(): void }) {
  return (
    <>
      <View style={styles.sectionIntro}>
        <Text style={styles.eyebrow}>PRIVACIDADE</Text>
        <Text style={styles.sectionTitle}>Seus dados ficam com você</Text>
        <Text style={styles.bodyCopy}>SIGECAD é um cliente independente e não oficial da UFGD.</Text>
      </View>
      {message ? <Notice>{message}</Notice> : null}
      <Card>
        <PrivacyRow icon="✓" title="Login oficial" copy="Usuário, senha e cookie permanecem no navegador privado da UFGD." />
        <Divider />
        <PrivacyRow icon="✓" title="Dados somente na tela" copy="Notas, foto, saldos e extratos ficam apenas na memória enquanto o app está aberto." />
        <Divider />
        <PrivacyRow icon="#" title="Histórico sem valores" copy="O iPhone guarda somente hashes irreversíveis para detectar mudanças acadêmicas." />
        <Divider />
        <PrivacyRow icon="—" title="Sem segundo plano" copy="No Expo Go, os dados são atualizados ao abrir ou puxar a tela." />
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
    { key: "cards", icon: "▰", label: "Cartões" },
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
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
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

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Não foi possível atualizar seus dados acadêmicos.";
}

function cardMessageOf(cause: unknown): string {
  const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : "";
  return `O portal Cartão está indisponível no momento.${detail}`;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  profileHero: { backgroundColor: colors.primary, borderRadius: 24, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  studentPhoto: { width: 92, height: 112, borderRadius: 18, borderWidth: 3, borderColor: "rgba(255,255,255,0.75)", backgroundColor: colors.soft },
  photoFallback: { width: 92, height: 112, borderRadius: 18, borderWidth: 3, borderColor: "rgba(255,255,255,0.75)", backgroundColor: colors.primaryPressed, alignItems: "center", justifyContent: "center" },
  photoInitial: { color: colors.white, fontSize: 42, fontWeight: "900" },
  profileCopy: { flex: 1, gap: 3 },
  greeting: { color: "#ECF3D8", fontSize: 13, fontWeight: "700" },
  studentName: { color: colors.white, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  studentCourse: { color: "#ECF3D8", fontSize: 11, lineHeight: 16, marginTop: 2 },
  periodPill: { alignSelf: "flex-start", marginTop: spacing.xs, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" },
  periodPillText: { color: colors.white, fontSize: 10, fontWeight: "800" },
  balanceRow: { flexDirection: "row", gap: spacing.sm },
  balanceCard: { flex: 1, minHeight: 118, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  balanceLabel: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  balanceValue: { color: colors.ink, fontSize: 24, fontWeight: "900", marginTop: 4 },
  balanceCaption: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  welcomeCard: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  cardTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  bodyCopy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  pullHint: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: spacing.md },
  sectionIntro: { gap: spacing.xs, paddingVertical: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  sectionTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  search: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.ink, fontSize: 15, paddingHorizontal: spacing.md },
  courseCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  courseHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  courseCode: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  courseName: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 3 },
  chevron: { color: colors.primary, fontSize: 25, fontWeight: "400", lineHeight: 27 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  neutralChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.soft },
  neutralChipText: { color: colors.primaryPressed, fontSize: 10, fontWeight: "800" },
  accentChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "#F4F6C9" },
  accentChipText: { color: "#657000", fontSize: 10, fontWeight: "800" },
  assessmentList: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  assessmentRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  assessmentName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  published: { color: colors.success, fontSize: 11, marginTop: 3 },
  pending: { color: colors.muted, fontSize: 11, marginTop: 3 },
  gradeValue: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  emptyInline: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", paddingVertical: spacing.sm },
  digitalCard: { backgroundColor: colors.primary, minHeight: 194, borderRadius: 22, padding: spacing.lg, justifyContent: "space-between", shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  digitalCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  digitalCardBrand: { color: colors.white, fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  digitalCardStatus: { color: colors.white, fontSize: 10, fontWeight: "800", paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" },
  digitalCardNumber: { color: colors.white, fontSize: 16, fontWeight: "800", letterSpacing: 1.2 },
  digitalCardBottom: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  digitalCardLabel: { color: "#E9F0D5", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  digitalCardValue: { color: colors.white, fontSize: 11, fontWeight: "800", marginTop: 3, maxWidth: 235 },
  segmented: { flexDirection: "row", padding: 4, backgroundColor: colors.soft, borderRadius: radius.md },
  segment: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: colors.primary },
  extractHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  extractCount: { color: colors.muted, fontSize: 11, marginTop: 2 },
  extractBalance: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  transactionRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  transactionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#FDECEA" },
  transactionIconIncoming: { backgroundColor: colors.successSoft },
  transactionIconText: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  transactionTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  transactionMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  transactionValue: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  transactionValueIncoming: { color: colors.success },
  privacyRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  privacyIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft },
  privacyIconText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  privacyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  privacyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  tabBar: { flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  tab: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { color: colors.muted, fontSize: 15, fontWeight: "800" },
  tabLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  tabActive: { color: colors.primary },
  centeredState: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  loadingTitle: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  loadingCopy: { color: colors.muted, fontSize: 14, textAlign: "center" },
  errorWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
});
