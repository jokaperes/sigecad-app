import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useFonts } from "expo-font";
import * as bwipjs from "@bwip-js/react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans/500Medium";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans/700Bold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono/600SemiBold";
import AlertTriangle from "lucide-react-native/icons/triangle-alert";
import Bell from "lucide-react-native/icons/bell";
import BookOpen from "lucide-react-native/icons/book-open";
import CalendarDays from "lucide-react-native/icons/calendar-days";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Clock3 from "lucide-react-native/icons/clock-3";
import Copy from "lucide-react-native/icons/copy";
import CreditCard from "lucide-react-native/icons/credit-card";
import FileText from "lucide-react-native/icons/file-text";
import GraduationCap from "lucide-react-native/icons/graduation-cap";
import Home from "lucide-react-native/icons/house";
import Layers3 from "lucide-react-native/icons/layers";
import ListChecks from "lucide-react-native/icons/list-checks";
import LogOut from "lucide-react-native/icons/log-out";
import Moon from "lucide-react-native/icons/moon";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Sun from "lucide-react-native/icons/sun";
import Trash2 from "lucide-react-native/icons/trash-2";
import User from "lucide-react-native/icons/user";
import WifiOff from "lucide-react-native/icons/wifi-off";
import type { LucideIcon } from "lucide-react-native";
import type { AcademicCourse, AcademicOverview } from "../../core/academic";
import type { Periodo } from "../../core/client";
import {
  DEFAULT_DESIGN_PREFERENCES,
  clearPreviewState,
  getDesignPreferences,
  saveDesignPreferences,
  type DesignPreferences,
} from "../../storage/asyncStorage";
import { PortalSession, usePortalSession } from "../PortalSession";
import { activeScheduleEntries, isFinishedCourse } from "../academicStatus";
import { loadStudentCard, loadStudentCardPage, loadStudentCardSummary, mergeStudentCardSummary, type CardTransaction, type StudentCard } from "../card";
import { buildSpendingInsight, formatMoneyCents, type SpendingSource } from "../cardInsights";
import { createBatchedPortalRequest, hydrateAcademicNotes, loadAcademicStartupFast } from "../client";
import { buildSafeDiagnostics, photoStatusLabel } from "../diagnostics";
import {
  parseDocumentCatalog,
  parseTeachingPlans,
  orderTeachingPlanSections,
  type AcademicDocumentCatalog,
  type AcademicDocumentRequest,
  type DocumentAvailability,
  type TeachingPlanSection,
} from "../documents";
import { parsePeriodos } from "../validation";
import {
  courseKey,
  emptyPortalData,
  loadPortalExtras,
  matchesCourseType,
  officialAveragesByType,
  portalDataFromStartup,
  resolveCourseProgress,
  type AbsenceEntry,
  type AcademicProfile,
  type CourseTypeFilter,
  type CurriculumCourse,
  type EnrollmentEntry,
  type HistoryCourse,
  type PortalData,
  type ScheduleEntry,
} from "../portalData";
import { darkTheme, fonts, lightTheme, type DesignTheme } from "./tokens";
import { courseDisplayValue, formatAcademicName, formatCourseName, formatPersonName, formatScheduleRoom, formatScheduleSlot, hasPublishedValue, nextClassContext } from "./format";
import { currentSchedule, nextSchedule } from "./schedule";

type MainRoute = "home" | "grades" | "schedule" | "card" | "profile";
type DetailRoute =
  | "grade-detail"
  | "absences"
  | "history"
  | "curriculum"
  | "enrollment"
  | "documents"
  | "notifications"
  | "diagnostics";
type Route = MainRoute | DetailRoute;
type SecondaryPhase = "loading" | "ready" | "partial";

const MAIN_ROUTES: MainRoute[] = ["home", "grades", "schedule", "card", "profile"];

export function DesignExpoGoApp() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const loadingTheme = scheme === "dark" ? darkTheme : lightTheme;
  const loadingStyles = useMemo(() => createStyles(loadingTheme), [loadingTheme]);
  return (
    <PortalSession>
      {fontsLoaded
        ? <DesignDashboard />
        : <View style={loadingStyles.shell}><LoadingScreen theme={loadingTheme} styles={loadingStyles} /></View>}
    </PortalSession>
  );
}

function DesignDashboard() {
  const { request, requestBatch, shareDocument, resetSession } = usePortalSession();
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const [route, setRoute] = useState<Route>("home");
  const [selectedCourse, setSelectedCourse] = useState<AcademicCourse | null>(null);
  const [overview, setOverview] = useState<AcademicOverview | null>(null);
  const [studentCard, setStudentCard] = useState<StudentCard | null>(null);
  const [portal, setPortal] = useState<PortalData>(emptyPortalData());
  const [preferences, setPreferences] = useState<DesignPreferences>(DEFAULT_DESIGN_PREFERENCES);
  const [initialComplete, setInitialComplete] = useState(false);
  const [cardLoading, setCardLoading] = useState(true);
  const [secondaryPhase, setSecondaryPhase] = useState<SecondaryPhase>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [documentCatalog, setDocumentCatalog] = useState<AcademicDocumentCatalog | null>(null);
  const [teachingPlanSections, setTeachingPlanSections] = useState<TeachingPlanSection[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [sharingDocument, setSharingDocument] = useState<string | null>(null);
  const [morePlansAvailable, setMorePlansAvailable] = useState(false);
  const [loadingMorePlans, setLoadingMorePlans] = useState(false);
  const refreshGeneration = useRef(0);
  const refreshBusy = useRef(false);
  const studentCardRef = useRef<StudentCard | null>(null);
  const pendingPlanPeriods = useRef<Periodo[]>([]);
  const loadMorePlansBusy = useRef(false);

  const dark = preferences.theme === "dark" ||
    (preferences.theme === "system" && systemScheme === "dark");
  const theme = dark ? darkTheme : lightTheme;
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    void getDesignPreferences().then(setPreferences);
  }, []);
  useEffect(() => { studentCardRef.current = studentCard; }, [studentCard]);

  useEffect(() => {
    if (route !== "documents" || !overview || documentsLoaded) return;
    let active = true;
    const documentsStartedAt = Date.now();
    setDocumentsLoading(true);
    setDocumentError(null);
    void requestBatch([
      { kind: "document-catalog" },
      { kind: "periodos" },
      { kind: "planosensino", numericId: overview.period.id },
    ]).then(async ([catalogResult, periodsResult, currentPlansResult]) => {
      if (!active) return;
      let partial = false;
      if (catalogResult.status === "fulfilled") {
        try { setDocumentCatalog(parseDocumentCatalog(catalogResult.value)); }
        catch { partial = true; }
      } else partial = true;

      let periods: Periodo[] = [overview.period];
      if (periodsResult.status === "fulfilled") {
        try { periods = parsePeriodos(periodsResult.value); }
        catch { partial = true; }
      } else partial = true;
      if (!periods.some((period) => period.id === overview.period.id)) {
        periods = [overview.period, ...periods];
      }

      if (currentPlansResult.status === "fulfilled") {
        try {
          const currentPlans = parseTeachingPlans(currentPlansResult.value);
          if (currentPlans.length) {
            setTeachingPlanSections([{
              periodId: overview.period.id,
              periodName: overview.period.nome,
              current: true,
              plans: currentPlans,
            }]);
          }
          reportLoadTiming("documents-current", documentsStartedAt);
        } catch { partial = true; }
      } else partial = true;

      pendingPlanPeriods.current = periods.filter((period) => period.id !== overview.period.id);
      setMorePlansAvailable(pendingPlanPeriods.current.length > 0);
      setDocumentError(partial ? "Alguns documentos não puderam ser consultados agora." : null);
      setDocumentsLoaded(true);
      reportLoadTiming("documents-complete", documentsStartedAt);
    }).catch(() => {
      if (active) setDocumentError("Não foi possível consultar os documentos agora. Volte e tente novamente.");
    }).finally(() => { if (active) setDocumentsLoading(false); });
    return () => { active = false; };
  }, [documentsLoaded, overview, requestBatch, route]);

  const loadMoreTeachingPlans = useCallback(async () => {
    if (!overview || loadMorePlansBusy.current || !pendingPlanPeriods.current.length) return;
    loadMorePlansBusy.current = true;
    setLoadingMorePlans(true);
    try {
      let added = 0;
      while (added === 0 && pendingPlanPeriods.current.length) {
        const period = pendingPlanPeriods.current.shift();
        if (!period) break;
        const [result] = await requestBatch([{ kind: "planosensino", numericId: period.id }]);
        if (result.status === "rejected") continue;
        try {
          const plans = parseTeachingPlans(result.value);
          if (!plans.length) continue;
          setTeachingPlanSections((current) => orderTeachingPlanSections(
            [...current, {
              periodId: period.id,
              periodName: period.nome,
              current: false,
              plans,
            }],
            overview.period.id,
          ));
          added += 1;
        } catch {
          continue;
        }
      }
      setMorePlansAvailable(pendingPlanPeriods.current.length > 0);
    } finally {
      loadMorePlansBusy.current = false;
      setLoadingMorePlans(false);
    }
  }, [overview, requestBatch]);

  const updatePreferences = useCallback((patch: Partial<DesignPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void saveDesignPreferences(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async (manual = false) => {
    // A second foreground cycle would only wait behind the same WebView queue
    // and make the app slower. The current cycle already refreshes every view.
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    let backgroundScheduled = false;
    const generation = ++refreshGeneration.current;
    const startedAt = Date.now();
    const hadCardDetails = Boolean(studentCardRef.current && (
      studentCardRef.current.photoDataUrl ||
      studentCardRef.current.ruTransactions.length ||
      studentCardRef.current.canteenTransactions.length
    ));
    if (manual) setRefreshing(true);
    if (!studentCardRef.current) setCardLoading(true);
    setSecondaryPhase("loading");
    setError(null);
    try {
      // Identity, classes, schedule and enrollment windows share the first
      // academic batch. Notes stay off Home's critical path.
      const startup = await loadAcademicStartupFast(request, requestBatch);
      const next = startup.overview;
      const currentPortal = portalDataFromStartup(startup.portal);
      if (generation !== refreshGeneration.current) return;
      setOverview(next);
      setPortal(currentPortal);
      setInitialComplete(true);
      setRefreshing(false);
      reportLoadTiming("academic-data", startedAt);
      reportLoadTiming("home-painted", startedAt);
      const background = (async () => {
        const cardResult = await Promise.resolve(loadStudentCardSummary(request))
          .then((value) => ({ status: "fulfilled", value }) as const)
          .catch((reason: unknown) => ({ status: "rejected", reason }) as const);
        if (generation !== refreshGeneration.current) return;
        setCardLoading(false);
        if (cardResult.status === "fulfilled") {
          setStudentCard((current) => mergeStudentCardSummary(current, cardResult.value));
          setCardError(cardResult.value.ruBalance || cardResult.value.canteenBalance
            ? null
            : "Os saldos do cartão estão indisponíveis no momento.");
          reportLoadTiming("card-summary", startedAt);
        } else {
          setCardError("O portal Cartão está indisponível no momento.");
          reportLoadTiming("card-summary-failed", startedAt);
        }
        try {
          const academicRequest = createBatchedPortalRequest(requestBatch);
          const [notes, complete] = await Promise.all([
            hydrateAcademicNotes(academicRequest, startup),
            loadPortalExtras(academicRequest, next, currentPortal),
          ]);
          const resolvedPortal = notes.complete ? complete : {
            ...complete,
            unavailable: [...new Set([...complete.unavailable, "notas"])],
          };
          if (generation === refreshGeneration.current) {
            setOverview(notes.overview);
            setSelectedCourse((current) => current
              ? notes.overview.courses.find((course) => course.enrollmentId === current.enrollmentId) ?? current
              : null);
            setPortal(resolvedPortal);
            setSecondaryPhase(resolvedPortal.unavailable.length ? "partial" : "ready");
            if (notes.complete) {
              void clearPreviewState();
            }
          }
          reportLoadTiming(notes.complete ? "notes" : "notes-partial", startedAt);
          reportLoadTiming("secondary-complete", startedAt);
        } catch {
          if (generation === refreshGeneration.current) {
            setPortal((current) => ({
              ...current,
              unavailable: [...new Set([...current.unavailable, "dados acadêmicos detalhados"])],
            }));
            setSecondaryPhase("partial");
          }
          reportLoadTiming("secondary-failed", startedAt);
        }
        try {
          if (!manual || !hadCardDetails) {
            const completeCard = await loadStudentCard(request);
            if (generation === refreshGeneration.current) {
              setStudentCard(completeCard);
              setCardError(null);
            }
            reportLoadTiming("card-full", startedAt);
          }
        } catch { /* O resumo prioritário continua utilizável; falhas ficam sanitizadas. */ }
      })();
      backgroundScheduled = true;
      void background.finally(() => { refreshBusy.current = false; });
    } catch (cause) {
      setError(messageOf(cause));
      setSecondaryPhase("partial");
    } finally {
      if (!backgroundScheduled) refreshBusy.current = false;
      setRefreshing(false);
      setInitialComplete(true);
    }
  }, [request, requestBatch]);

  useEffect(() => { void refresh(); }, [refresh]);

  function openCourse(course: AcademicCourse) {
    setSelectedCourse(course);
    setRoute("grade-detail");
  }

  function navigate(next: Route) {
    setRoute(next);
  }

  async function clearLocalHistory() {
    await clearPreviewState();
    setLocalMessage("Histórico local removido. Nenhuma nota, foto ou saldo estava salvo.");
  }

  function confirmAndShareDocument(
    key: string,
    requestValue: Omit<AcademicDocumentRequest, "nameMode">,
    availability: DocumentAvailability,
  ) {
    if (!availability.available || sharingDocument) return;
    const start = async (nameMode: AcademicDocumentRequest["nameMode"]) => {
      setSharingDocument(key);
      try {
        await shareDocument({ ...requestValue, nameMode });
      } catch (cause) {
        Alert.alert("Documento indisponível", messageOf(cause));
      } finally {
        setSharingDocument(null);
      }
    };
    if (availability.supportsSocialName) {
      Alert.alert("Nome no documento", "Escolha como o nome deve aparecer no PDF.", [
        { text: "Cancelar", style: "cancel" },
        { text: "Nome civil", onPress: () => void start("civil") },
        { text: "Nome social", onPress: () => void start("social") },
      ]);
    } else {
      void start("civil");
    }
  }

  if (!initialComplete) {
    return (
      <View style={styles.shell}>
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <LoadingScreen theme={theme} styles={styles} />
      </View>
    );
  }

  if (error && !overview) {
    return (
      <View style={styles.shell}>
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <PortalUnavailableScreen theme={theme} styles={styles} onRetry={() => void refresh(true)} onLogin={resetSession} />
      </View>
    );
  }

  const main = MAIN_ROUTES.includes(route as MainRoute);
  const profile = portal.profile;
  const homeHasGreenHeader = !dark && route === "home" && preferences.home !== "agenda";
  const topInsetColor = homeHasGreenHeader ? "#174F3D" : theme.background;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safeShell, { backgroundColor: topInsetColor }]}
    >
      <View style={styles.shell}>
      <StatusBar
        barStyle={homeHasGreenHeader || dark ? "light-content" : "dark-content"}
        backgroundColor={topInsetColor}
      />
      {route === "documents" ? (
        <DocumentsScreen
          catalog={documentCatalog}
          sections={teachingPlanSections}
          loading={documentsLoading}
          error={documentError}
          sharingKey={sharingDocument}
          hasMore={morePlansAvailable}
          loadingMore={loadingMorePlans}
          onLoadMore={() => void loadMoreTeachingPlans()}
          onShare={confirmAndShareDocument}
          theme={theme}
          styles={styles}
          back={() => navigate("profile")}
          bottomInset={insets.bottom}
        />
      ) : <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          main && styles.scrollContentWithTabs,
          main && { paddingBottom: 96 + insets.bottom },
        ]}
        refreshControl={main ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} tintColor={theme.primary} />
        ) : undefined}
        showsVerticalScrollIndicator={false}
      >
        {error && overview ? (
          <OfflineBanner theme={theme} styles={styles} onRetry={() => void refresh(true)} />
        ) : null}
        {route === "home" && overview ? (
          preferences.home === "dense" ? (
            <HomeDense overview={overview} card={studentCard} profile={profile} portal={portal} theme={theme} styles={styles} />
          ) : preferences.home === "agenda" ? (
            <HomeAgenda overview={overview} card={studentCard} profile={profile} portal={portal} theme={theme} styles={styles} />
          ) : (
            <HomeCards overview={overview} card={studentCard} cardLoading={cardLoading} profile={profile} portal={portal} theme={theme} styles={styles} navigate={navigate} />
          )
        ) : null}
        {route === "grades" && overview ? (
          <GradesScreen overview={overview} loading={secondaryPhase === "loading"} theme={theme} styles={styles} openCourse={openCourse} openAbsences={() => navigate("absences")} />
        ) : null}
        {route === "grade-detail" && selectedCourse ? (
          <GradeDetailScreen course={selectedCourse} theme={theme} styles={styles} back={() => navigate("grades")} />
        ) : null}
        {route === "absences" && overview ? (
          <AbsencesScreen overview={overview} portal={portal} loading={secondaryPhase === "loading"} variant={preferences.absences} onVariantChange={(absences) => updatePreferences({ absences })} theme={theme} styles={styles} back={() => navigate("grades")} />
        ) : null}
        {route === "schedule" && overview ? (
          <ScheduleScreen period={overview.period.nome} entries={portal.schedule} courses={overview.courses} theme={theme} styles={styles} />
        ) : null}
        {route === "card" ? (
          <CardScreen card={studentCard} error={cardError} request={request} onCardUpdate={(next) => { setStudentCard(next); setCardError(null); }} theme={theme} styles={styles} />
        ) : null}
        {route === "profile" ? (
          <ProfileScreen
            card={studentCard}
            profile={profile}
            portal={portal}
            preferences={preferences}
            theme={theme}
            styles={styles}
            message={localMessage}
            secondaryPhase={secondaryPhase}
            updatePreferences={updatePreferences}
            navigate={navigate}
            clearHistory={() => void clearLocalHistory()}
            logout={resetSession}
          />
        ) : null}
        {route === "history" ? <HistoryScreen portal={portal} loading={secondaryPhase === "loading"} theme={theme} styles={styles} back={() => navigate("profile")} /> : null}
        {route === "curriculum" ? <CurriculumScreen portal={portal} loading={secondaryPhase === "loading"} theme={theme} styles={styles} back={() => navigate("profile")} /> : null}
        {route === "enrollment" ? <EnrollmentScreen portal={portal} period={overview?.period.nome ?? ""} loading={secondaryPhase === "loading"} theme={theme} styles={styles} back={() => navigate("home")} /> : null}
        {route === "notifications" && overview ? <NotificationsScreen overview={overview} portal={portal} loading={secondaryPhase === "loading"} theme={theme} styles={styles} back={() => navigate("profile")} /> : null}
        {route === "diagnostics" ? <DiagnosticsScreen overview={overview} card={studentCard} portal={portal} cardUnavailable={Boolean(cardError)} detailsLoading={secondaryPhase === "loading"} theme={theme} styles={styles} back={() => navigate("profile")} /> : null}
      </ScrollView>}
      {main ? <BottomTabs value={route as MainRoute} onChange={navigate} theme={theme} styles={styles} bottomInset={insets.bottom} /> : null}
      </View>
    </SafeAreaView>
  );
}

interface ScreenProps { theme: DesignTheme; styles: ReturnType<typeof createStyles> }

function HomeCards({ overview, card, cardLoading, profile, portal, theme, styles, navigate }: ScreenProps & {
  overview: AcademicOverview; card: StudentCard | null; cardLoading: boolean; profile: AcademicProfile | null; portal: PortalData; navigate(route: Route): void;
}) {
  const activeCourses = useMemo(() => overview.courses.filter((course) => !isFinishedCourse(course)), [overview.courses]);
  const schedule = useMemo(() => activeScheduleEntries(portal.schedule, overview.courses), [portal.schedule, overview.courses]);
  const current = useMemo(() => currentSchedule(schedule), [schedule]);
  const next = useMemo(() => nextSchedule(schedule, current), [schedule, current]);
  const risks = useMemo(() => [...activeCourses].filter((item) => item.absenceLimit && item.absences !== null && absenceRatio(item) >= .5)
    .sort((a, b) => absenceRatio(b) - absenceRatio(a)).slice(0, 2), [activeCourses]);
  const name = firstName(profile?.name ?? card?.name);
  const featured = current ?? next;
  const featuredRoom = formatScheduleRoom(featured?.room);
  return (
    <View>
      <Hero theme={theme} styles={styles} period={overview.period.nome} title={`${greeting()}, ${name}`} subtitle={profileLine(profile, card)} />
      <View style={styles.page}>
        <Surface styles={styles}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Eyebrow styles={styles}>{current ? "AGORA" : next ? nextClassContext(next.day) : "AGENDA"}{featuredRoom ? ` · ${featuredRoom.toUpperCase()}` : ""}</Eyebrow>
              <Text style={styles.monoLarge}>{formatScheduleSlot(featured?.slot) ?? "Sem aula encontrada"}</Text>
              <Text style={styles.cardTitle}>{formatAcademicName(current?.course ?? next?.course) ?? "Sua agenda está livre"}</Text>
              {next && current ? <Text style={styles.caption}>Próxima: {formatAcademicName(next.course)} · {formatScheduleSlot(next.slot) ?? next.slot}{formatScheduleRoom(next.room) ? ` · ${formatScheduleRoom(next.room)}` : ""}</Text> : null}
            </View>
            <Clock3 size={22} color={theme.primary} strokeWidth={1.8} />
          </View>
        </Surface>
        <HomeAcademicCard card={card} loading={cardLoading} profile={profile} onPress={() => navigate("card")} theme={theme} styles={styles} />
        <Surface styles={styles}>
          <Eyebrow styles={styles}>{risks.length ? "ATENÇÃO A FALTAS" : "FALTAS E FREQUÊNCIA"}</Eyebrow>
          {risks.map((item) => <RiskBar key={courseKey(item)} course={item} theme={theme} styles={styles} />)}
          <LinkRow label={risks.length ? "Ver todas as faltas" : "Ver detalhes"} icon={AlertTriangle} onPress={() => navigate("absences")} theme={theme} styles={styles} />
        </Surface>
        <Pressable onPress={() => navigate("enrollment")} style={({ pressed }) => [pressed && styles.pressed]}>
          <Surface styles={styles}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Eyebrow styles={styles}>MATRÍCULA</Eyebrow>
                <Text style={styles.cardTitle}>{portal.enrollmentWindows[0]?.label ?? "Ver solicitações"}</Text>
              </View>
              <Text style={styles.monoLink}>ver detalhes</Text>
            </View>
          </Surface>
        </Pressable>
      </View>
    </View>
  );
}

function HomeDense({ overview, card, profile, portal, theme, styles }: ScreenProps & {
  overview: AcademicOverview; card: StudentCard | null; profile: AcademicProfile | null; portal: PortalData;
}) {
  const next = nextSchedule(activeScheduleEntries(portal.schedule, overview.courses), null);
  const nextRoom = formatScheduleRoom(next?.room);
  const activeCount = overview.courses.filter((course) => !isFinishedCourse(course)).length;
  const progress = resolveCourseProgress(profile?.progress, portal.workload);
  return (
    <View>
      <View style={styles.denseHero}>
        <View style={styles.rowBetween}><Text style={styles.periodOnGreen}>{overview.period.nome}</Text><Text style={styles.monoOnGreen}>{profile?.rga ? `RGA ${profile.rga}` : "SIGECAD"}</Text></View>
        <View style={styles.denseMetrics}>
          <HeroMetric label="ATIVAS" value={`${activeCount}`} styles={styles} />
          <HeroMetric label="RU" value={cleanMoney(card?.ruBalance)} styles={styles} />
          <HeroMetric label="CANTINA" value={cleanMoney(card?.canteenBalance)} styles={styles} />
          <HeroMetric label="CURSO" value={progress !== null ? `${Math.round(progress)}%` : "—"} styles={styles} />
        </View>
      </View>
      <View style={styles.page}>
        <View style={styles.rowBetween}><Eyebrow styles={styles}>DISCIPLINAS</Eyebrow><Text style={styles.monoCaption}>nota · faltas</Text></View>
        <Surface styles={styles} style={styles.listSurface}>
          {overview.courses.map((course, index) => (
            <View key={courseKey(course)} style={[styles.denseCourse, index > 0 && styles.topBorder]}>
              <View style={styles.flex}><Text style={styles.itemTitle}>{formatAcademicName(course.name)}</Text><Text style={styles.monoCaption}>{course.code} · {course.section}</Text></View>
              <View style={styles.inlineValues}><Text style={styles.monoValue}>{formatGrade(courseDisplayValue(course))}</Text><Text style={[styles.monoCaption, !isFinishedCourse(course) && absenceRatio(course) >= .75 && styles.dangerText]}>{isFinishedCourse(course) ? course.result : absenceText(course)}</Text></View>
            </View>
          ))}
        </Surface>
        <Surface styles={styles}><View style={styles.rowBetween}><View style={styles.flex}><Text style={styles.itemTitle}>Próxima aula</Text><Text style={styles.caption}>{next ? `${formatAcademicName(next.course) ?? next.course}${nextRoom ? ` · ${nextRoom}` : ""}` : "Nenhuma aula encontrada"}</Text></View><Text style={styles.monoValue}>{formatScheduleSlot(next?.slot) ?? "—"}</Text></View></Surface>
      </View>
    </View>
  );
}

function HomeAgenda({ overview, card, profile, portal, theme, styles }: ScreenProps & {
  overview: AcademicOverview; card: StudentCard | null; profile: AcademicProfile | null; portal: PortalData;
}) {
  const today = new Date();
  const activeCourses = overview.courses.filter((course) => !isFinishedCourse(course));
  const entries = activeScheduleEntries(portal.schedule, overview.courses).filter((item) => item.day === today.getDay());
  return (
    <View>
      <View style={styles.agendaHeader}>
        <View><Text style={styles.eyebrow}>{dateHeading(today)}</Text><Text style={styles.pageTitle}>Hoje</Text></View>
        <Text style={styles.periodPill}>{overview.period.nome}</Text>
      </View>
      <View style={styles.page}>
        <Surface styles={styles} style={styles.timelineSurface}>
          {entries.length ? entries.map((entry, index) => <TimelineEntry key={`${entry.day}-${entry.slot}-${index}`} entry={entry} active={isCurrentEntry(entry)} last={index === entries.length - 1} theme={theme} styles={styles} />) : <EmptyInline styles={styles}>Nenhuma aula encontrada para hoje.</EmptyInline>}
        </Surface>
        <View style={styles.fourMetrics}>
          <TinyMetric label="RU" value={cleanMoney(card?.ruBalance)} styles={styles} />
          <TinyMetric label="CANTINA" value={cleanMoney(card?.canteenBalance)} styles={styles} />
          <TinyMetric label="ATIVAS" value={`${activeCourses.length}`} styles={styles} />
          <TinyMetric label="FALTAS" value={`${activeCourses.filter((course) => absenceRatio(course) >= .75).length} alerta`} danger styles={styles} />
        </View>
      </View>
    </View>
  );
}

function GradesScreen({ overview, loading, theme, styles, openCourse, openAbsences }: ScreenProps & {
  overview: AcademicOverview; loading: boolean; openCourse(course: AcademicCourse): void; openAbsences(): void;
}) {
  return (
    <View style={styles.page}>
      <TitleBlock title="Notas" subtitle={overview.period.nome} styles={styles} />
      <Pressable onPress={openAbsences} style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}>
        <View><Eyebrow styles={styles}>FREQUÊNCIA</Eyebrow><Text style={styles.itemTitle}>Faltas e limites por disciplina</Text></View><ChevronRight size={20} color={theme.primary} />
      </Pressable>
      {loading && !overview.courses.some((course) => course.assessments.length || course.finalGrade !== null) ? <LoadingNotice label="Carregando notas" theme={theme} styles={styles} /> : null}
      <Surface styles={styles} style={styles.listSurface}>
        {overview.courses.map((course, index) => (
          <Pressable key={courseKey(course)} onPress={() => openCourse(course)} style={({ pressed }) => [styles.gradeCourse, index > 0 && styles.topBorder, pressed && styles.pressed]}>
            <View style={styles.flex}><Text style={styles.itemTitle}>{formatAcademicName(course.name)}</Text><Text style={styles.monoCaption}>{course.code} · {course.section}{course.totalHours ? ` · ${course.totalHours}h` : ""}</Text></View>
            <View style={styles.gradeSide}><Text style={styles.monoValue}>{formatGrade(courseDisplayValue(course))}</Text><Text style={[styles.monoCaption, absenceRatio(course) >= .75 && styles.dangerText]}>{absenceText(course)}</Text></View>
            <ChevronRight size={17} color={theme.faint} />
          </Pressable>
        ))}
      </Surface>
    </View>
  );
}

function GradeDetailScreen({ course, theme, styles, back }: ScreenProps & { course: AcademicCourse; back(): void }) {
  return (
    <View style={styles.page}>
      <BackHeader label="Notas" onPress={back} theme={theme} styles={styles} />
      <Text style={styles.pageTitle}>{formatAcademicName(course.name)}</Text>
      <Text style={styles.monoCaption}>{course.code} · {course.section}{course.totalHours ? ` · ${course.totalHours}h` : ""}</Text>
      <View style={styles.metricGrid}>
        <Metric label={numericGrade(course.finalGrade) !== null ? "NOTA FINAL" : "ÚLTIMA NOTA"} value={formatGrade(courseDisplayValue(course))} styles={styles} />
        <Metric label="APROVAÇÃO" value={formatGrade(course.approvalAverage)} styles={styles} muted />
      </View>
      <Eyebrow styles={styles}>AVALIAÇÕES</Eyebrow>
      <Surface styles={styles} style={styles.listSurface}>
        {course.assessments.map((assessment, index) => (
          <View key={`${assessment.name}-${index}`} style={[styles.assessmentRow, index > 0 && styles.topBorder]}>
            <View style={styles.flex}><Text style={styles.itemTitle}>{assessment.name}</Text><Text style={styles.caption}>{assessment.published ? "lançada" : "sem nota"}</Text></View>
            <Text style={[styles.monoAssessment, !assessment.published && styles.faintText]}>{assessment.published ? formatGrade(assessment.value) : "—"}</Text>
          </View>
        ))}
      </Surface>
      {course.formula ? <View style={styles.infoBox}><Eyebrow styles={styles}>FÓRMULA</Eyebrow><Text style={styles.body}>{course.formula}</Text></View> : null}
      <Surface styles={styles}><View style={styles.rowBetween}><View><Eyebrow styles={styles}>FALTAS NESTA DISCIPLINA</Eyebrow><Text style={styles.body}>{absenceRemaining(course)}</Text></View><Text style={[styles.monoValue, absenceRatio(course) >= .75 && styles.dangerText]}>{absenceText(course)}</Text></View></Surface>
    </View>
  );
}

function AbsencesScreen({ overview, portal, loading, variant, onVariantChange, theme, styles, back }: ScreenProps & {
  overview: AcademicOverview; portal: PortalData; loading: boolean; variant: DesignPreferences["absences"]; onVariantChange(value: DesignPreferences["absences"]): void; back(): void;
}) {
  const sorted = overview.courses.filter((course) => !isFinishedCourse(course)).sort((a, b) => absenceRatio(b) - absenceRatio(a));
  const risk = sorted.filter((course) => absenceRatio(course) >= .5);
  const safe = sorted.filter((course) => absenceRatio(course) < .5);
  return (
    <View style={styles.page}>
      <BackHeader label="Notas" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Faltas" subtitle={`Limite individual por disciplina · ${overview.period.nome}`} styles={styles} />
      <PreferenceGroup label="Exibição" values={[{key:"bars",label:"Barras"},{key:"alerts",label:"Alertas"}]} selected={variant} onChange={(value) => onVariantChange(value as DesignPreferences["absences"])} styles={styles} />
      {loading && variant === "alerts" ? <LoadingNotice label="Carregando datas das faltas" theme={theme} styles={styles} /> : null}
      {variant === "bars" ? (
        <Surface styles={styles}>
          {sorted.length ? sorted.map((course) => <RiskBar key={courseKey(course)} course={course} theme={theme} styles={styles} detailed />) : <EmptyInline styles={styles}>Nenhuma disciplina ativa para acompanhar faltas.</EmptyInline>}
        </Surface>
      ) : (
        <>
          <Eyebrow styles={styles}>RISCO DE REPROVAÇÃO POR FALTA</Eyebrow>
          {risk.length ? risk.map((course) => (
            <Surface key={courseKey(course)} styles={styles} style={absenceRatio(course) >= .75 ? styles.riskSurface : undefined}>
              <View style={styles.rowBetween}><Text style={styles.cardTitle}>{formatAcademicName(course.name)}</Text><Text style={[styles.monoValue, absenceRatio(course) >= .75 && styles.dangerText]}>{absenceText(course)}</Text></View>
              <Text style={styles.body}>{absenceRemaining(course)}</Text>
              <MiniAbsenceHistory entries={portal.absences[courseKey(course)] ?? []} styles={styles} />
            </Surface>
          )) : <EmptyState label="Nenhuma disciplina em risco." styles={styles} />}
          <Eyebrow styles={styles}>SEM RISCO</Eyebrow>
          <Surface styles={styles} style={styles.listSurface}>{safe.length ? safe.map((course, index) => <View key={courseKey(course)} style={[styles.simpleRow, index > 0 && styles.topBorder]}><Text style={styles.itemTitle}>{formatAcademicName(course.name)}</Text><Text style={styles.monoValue}>{absenceText(course)}</Text></View>) : <EmptyInline styles={styles}>Nenhuma outra disciplina ativa.</EmptyInline>}</Surface>
        </>
      )}
    </View>
  );
}

function ScheduleScreen({ period, entries, courses, theme, styles }: ScreenProps & { period: string; entries: ScheduleEntry[]; courses: AcademicCourse[] }) {
  const today = new Date().getDay();
  const [day, setDay] = useState(today >= 1 && today <= 5 ? today : 1);
  const activeEntries = useMemo(() => activeScheduleEntries(entries, courses), [entries, courses]);
  const filtered = useMemo(() => activeEntries.filter((entry) => entry.day === day), [activeEntries, day]);
  return (
    <View style={styles.page}>
      <View style={styles.rowBetween}><TitleBlock title="Horários" subtitle={period} styles={styles} /><CalendarDays size={23} color={theme.primary} /></View>
      <View style={styles.dayTabs}>{[1,2,3,4,5].map((value) => <Pressable key={value} onPress={() => setDay(value)} style={[styles.dayTab, day === value && styles.dayTabActive]}><Text style={[styles.dayName, day === value && styles.dayNameActive]}>{dayName(value)}</Text><Text style={[styles.dayNumber, day === value && styles.dayNameActive]}>{weekDate(value)}</Text></Pressable>)}</View>
      <Surface styles={styles} style={styles.listSurface}>
        {filtered.length ? filtered.map((entry, index) => (
          <View key={`${entry.slot}-${index}`} style={[styles.scheduleRow, index > 0 && styles.topBorder]}>
            <Text style={styles.monoTime}>{entry.slot.split(/[–-]/)[0]?.trim()}</Text>
            <View style={styles.scheduleLine} />
            <View style={styles.flex}><Text style={styles.itemTitle}>{formatAcademicName(entry.course)}</Text><Text style={styles.caption}>{locationLine(entry)} · {entry.slot}</Text>{entry.professor ? <Text style={styles.faintCaption}>{formatPersonName(entry.professor)}</Text> : null}</View>
          </View>
        )) : <EmptyInline styles={styles}>Nenhuma aula encontrada neste dia.</EmptyInline>}
      </Surface>
    </View>
  );
}

function CardScreen({ card, error, request, onCardUpdate, theme, styles }: ScreenProps & { card: StudentCard | null; error: string | null; request: Parameters<typeof loadStudentCardPage>[0]; onCardUpdate(card: StudentCard): void }) {
  const [source, setSource] = useState<"ru" | "canteen">("ru");
  const [visibleCard, setVisibleCard] = useState<StudentCard | null>(card);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [retryingPhoto, setRetryingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(() => {
    setVisibleCard(card);
    setPage(1);
    setCanLoadMore(true);
    setPageError(null);
    setPhotoError(null);
  }, [card]);
  const transactions = useMemo(
    () => (source === "ru" ? visibleCard?.ruTransactions ?? [] : visibleCard?.canteenTransactions ?? []),
    [source, visibleCard?.ruTransactions, visibleCard?.canteenTransactions],
  );

  async function loadMore() {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    setPageError(null);
    try {
      const nextPage = page + 1;
      const next = await loadStudentCardPage(request, nextPage);
      if (!next.ruTransactions.length && !next.canteenTransactions.length) {
        setCanLoadMore(false);
        return;
      }
      const current = visibleCard;
      if (!current) {
        setVisibleCard(next);
      } else {
        const ruTransactions = mergeTransactions(current.ruTransactions, next.ruTransactions);
        const canteenTransactions = mergeTransactions(current.canteenTransactions, next.canteenTransactions);
        const added = ruTransactions.length > current.ruTransactions.length || canteenTransactions.length > current.canteenTransactions.length;
        setVisibleCard({ ...current, ruTransactions, canteenTransactions, page: next.page });
        if (!added) setCanLoadMore(false);
      }
      setPage(nextPage);
    } catch {
      setPageError("Não foi possível carregar a próxima página do extrato.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function retryPhoto() {
    if (retryingPhoto) return;
    setRetryingPhoto(true);
    setPhotoError(null);
    try {
      const next = await loadStudentCard(request);
      const merged = visibleCard ? {
        ...next,
        ruTransactions: mergeTransactions(visibleCard.ruTransactions, next.ruTransactions),
        canteenTransactions: mergeTransactions(visibleCard.canteenTransactions, next.canteenTransactions),
        page: visibleCard.page,
      } : next;
      setVisibleCard(merged);
      onCardUpdate(next);
      if (!next.photoDataUrl) setPhotoError(photoStatusLabel(next.photoStatus));
    } catch {
      setPhotoError("Não foi possível consultar a foto nesta tentativa.");
    } finally {
      setRetryingPhoto(false);
    }
  }

  function markPhotoRenderFailure() {
    setVisibleCard((current) => current ? { ...current, photoDataUrl: null, photoStatus: "render-error", photoWidth: null, photoHeight: null, photoVariant: null } : current);
    setPhotoError(photoStatusLabel("render-error"));
  }
  return (
    <View style={styles.page}>
      <TitleBlock title="Cartão" subtitle="Saldos e movimentações da sua conta" styles={styles} />
      {error && !visibleCard ? <InlineNotice text={error} danger styles={styles} /> : null}
      <Surface styles={styles} style={styles.studentCardSurface}>
        <Eyebrow styles={styles}>CARTÃO ACADÊMICO</Eyebrow>
        <View style={styles.cardIdentity}>
          <StudentPhoto card={visibleCard} styles={styles} onRenderError={markPhotoRenderFailure} />
          <View style={styles.flex}><Text style={styles.cardTitle}>{formatPersonName(visibleCard?.name) ?? "Estudante UFGD"}</Text><Text style={styles.caption}>{formatCourseName(visibleCard?.course) ?? "Curso não informado"}</Text><Text style={styles.monoCaption}>Nº •••• •••• {visibleCard?.cardLast4 ?? "————"} · {visibleCard?.version ?? "via não informada"}</Text></View>
        </View>
        <BarcodeStrip value={visibleCard?.barcodeValue} styles={styles} />
      </Surface>
      {!visibleCard?.photoDataUrl ? (
        <>
          <InlineNotice text={`Foto: ${photoError ?? photoStatusLabel(visibleCard?.photoStatus ?? "not-requested")}.`} styles={styles} />
          <SecondaryAction icon={RefreshCw} label={retryingPhoto ? "Consultando foto…" : "Tentar carregar foto"} onPress={() => void retryPhoto()} theme={theme} styles={styles} />
        </>
      ) : null}
      <View style={styles.balanceTabs}>
        <BalanceTab label="RESTAURANTE" value={visibleCard?.ruBalance ?? "—"} active={source === "ru"} onPress={() => setSource("ru")} styles={styles} />
        <BalanceTab label="CANTINA" value={visibleCard?.canteenBalance ?? "—"} active={source === "canteen"} onPress={() => setSource("canteen")} styles={styles} />
      </View>
      <SpendingPanel card={visibleCard} source={source} theme={theme} styles={styles} />
      <Eyebrow styles={styles}>EXTRATO · {source === "ru" ? "RU" : "CANTINA"}</Eyebrow>
      <Surface styles={styles} style={styles.listSurface}>
        {transactions.length ? transactions.map((item, index) => <Transaction key={`${item.date}-${item.time}-${index}`} item={item} index={index} styles={styles} />) : <EmptyInline styles={styles}>Nenhuma movimentação recente.</EmptyInline>}
      </Surface>
      {pageError ? <InlineNotice text={pageError} danger styles={styles} /> : null}
      {canLoadMore && visibleCard ? (
        <SecondaryAction icon={RefreshCw} label={loadingMore ? "Carregando…" : "Carregar mais"} onPress={() => void loadMore()} theme={theme} styles={styles} />
      ) : null}
    </View>
  );
}

function ProfileScreen({ card, profile, portal, preferences, theme, styles, message, secondaryPhase, updatePreferences, navigate, clearHistory, logout }: ScreenProps & {
  card: StudentCard | null; profile: AcademicProfile | null; portal: PortalData; preferences: DesignPreferences; message: string | null;
  secondaryPhase: SecondaryPhase;
  updatePreferences(value: Partial<DesignPreferences>): void; navigate(route: Route): void; clearHistory(): void; logout(): void;
}) {
  const [rgaCopyStatus, setRgaCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const progress = resolveCourseProgress(profile?.progress, portal.workload);
  const admission = profile?.admission ?? earliestHistoryTerm(portal.history);
  const admissionIsExact = Boolean(admission && /\/\d$/.test(admission));
  async function copyRga() {
    if (!profile?.rga) return;
    try {
      await Clipboard.setStringAsync(profile.rga);
      setRgaCopyStatus("copied");
    } catch {
      setRgaCopyStatus("error");
    }
  }
  return (
    <View style={styles.page}>
      <View style={styles.profileHeader}>
        <StudentPhoto card={card} large styles={styles} />
        <Text style={styles.pageTitle}>{formatPersonName(profile?.name ?? card?.name) ?? "Estudante UFGD"}</Text>
        {profile?.rga ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copiar RGA"
            onPress={() => void copyRga()}
            style={({ pressed }) => [styles.rgaCopy, pressed && styles.pressed]}
          >
            <Text style={styles.monoCaption}>RGA {profile.rga}</Text>
            {rgaCopyStatus === "copied" ? <Check size={14} color={theme.success} /> : <Copy size={14} color={theme.primary} />}
            <Text style={[styles.rgaCopyHint, rgaCopyStatus === "error" && styles.dangerText]}>
              {rgaCopyStatus === "copied" ? "Copiado" : rgaCopyStatus === "error" ? "Tente novamente" : "Copiar"}
            </Text>
          </Pressable>
        ) : <Text style={styles.monoCaption}>Conta UFGDNET</Text>}
      </View>
      <Surface styles={styles} style={styles.listSurface}>
        <InfoRow label="Curso" value={formatCourseName(profile?.course ?? card?.course) ?? "—"} styles={styles} />
        <InfoRow label="Faculdade" value={profile?.facultyCode ?? profile?.faculty ?? "—"} styles={styles} border />
        <InfoRow label={admissionIsExact ? "Ingresso" : admission ? "Ano de ingresso (RGA)" : "Primeiro período no histórico"} value={admission ?? "—"} styles={styles} border />
        <InfoRow label="Situação" value={profile?.status ?? card?.active ?? "—"} styles={styles} border />
      </Surface>
      <Surface styles={styles}><Eyebrow styles={styles}>PROGRESSO DO CURSO</Eyebrow><Text style={styles.monoMetric}>{progress !== null ? `${Math.round(progress)}%` : "—"}</Text><Progress value={(progress ?? 0) / 100} color={theme.primary} styles={styles} /><Text style={styles.caption}>{workloadLine(portal)}</Text></Surface>
      {secondaryPhase === "loading" ? <LoadingNotice label="Carregando notas, histórico e grade" theme={theme} styles={styles} /> : null}
      <Eyebrow styles={styles}>PERSONALIZAÇÃO</Eyebrow>
      <PreferenceGroup label="Início" values={[{key:"cards",label:"Cards"},{key:"dense",label:"Lista"},{key:"agenda",label:"Agenda"}]} selected={preferences.home} onChange={(home) => updatePreferences({ home: home as DesignPreferences["home"] })} styles={styles} />
      <PreferenceGroup label="Faltas" values={[{key:"bars",label:"Barras"},{key:"alerts",label:"Alertas"}]} selected={preferences.absences} onChange={(absences) => updatePreferences({ absences: absences as DesignPreferences["absences"] })} styles={styles} />
      <PreferenceGroup label="Tema" values={[{key:"system",label:"Sistema"},{key:"light",label:"Claro"},{key:"dark",label:"Escuro"}]} selected={preferences.theme} onChange={(value) => updatePreferences({ theme: value as DesignPreferences["theme"] })} styles={styles} />
      <Eyebrow styles={styles}>TELAS ACADÊMICAS</Eyebrow>
      <Surface styles={styles} style={styles.listSurface}>
        <MenuRow label="Documentos acadêmicos" icon={FileText} onPress={() => navigate("documents")} theme={theme} styles={styles} />
        <MenuRow label="Histórico escolar" icon={GraduationCap} onPress={() => navigate("history")} theme={theme} styles={styles} border />
        <MenuRow label="Estrutura curricular" icon={Layers3} onPress={() => navigate("curriculum")} theme={theme} styles={styles} border />
        <MenuRow label="Matrícula" icon={ListChecks} onPress={() => navigate("enrollment")} theme={theme} styles={styles} border />
        <MenuRow label="Notas e matrícula" icon={Bell} onPress={() => navigate("notifications")} theme={theme} styles={styles} border />
        <MenuRow label="Diagnóstico seguro" icon={ListChecks} onPress={() => navigate("diagnostics")} theme={theme} styles={styles} border />
      </Surface>
      {portal.unavailable.length ? <InlineNotice text={`Não foi possível carregar: ${portal.unavailable.join(", ")}.`} styles={styles} /> : null}
      {message ? <InlineNotice text={message} styles={styles} /> : null}
      <SecondaryAction icon={Trash2} label="Apagar histórico local" onPress={clearHistory} theme={theme} styles={styles} />
      <SecondaryAction icon={LogOut} label="Sair da conta" onPress={logout} theme={theme} styles={styles} danger />
    </View>
  );
}

function DocumentsScreen({ catalog, sections, loading, error, sharingKey, hasMore, loadingMore, onLoadMore, onShare, theme, styles, back, bottomInset }: ScreenProps & {
  catalog: AcademicDocumentCatalog | null;
  sections: TeachingPlanSection[];
  loading: boolean;
  error: string | null;
  sharingKey: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore(): void;
  onShare(
    key: string,
    request: Omit<AcademicDocumentRequest, "nameMode">,
    availability: DocumentAvailability,
  ): void;
  back(): void;
  bottomInset: number;
}) {
  const [query, setQuery] = useState("");
  const unavailable: DocumentAvailability = { available: false, supportsSocialName: false };
  const normalizedQuery = normalizeSearch(query);
  const filteredSections = useMemo(() => sections.map((section) => ({
    ...section,
    data: section.plans.filter((plan) => !normalizedQuery ||
      normalizeSearch(`${plan.code} ${plan.course}`).includes(normalizedQuery)),
  })).filter((section) => section.data.length), [normalizedQuery, sections]);
  const totalPlans = useMemo(
    () => sections.reduce((total, section) => total + section.plans.length, 0),
    [sections],
  );
  // The authenticated REST list is the authoritative proof that this period
  // has plan IDs. This also avoids depending on the menu page being the current
  // hidden-WebView document when the catalog is scanned.
  const plansAvailability: DocumentAvailability = totalPlans
    ? { available: true, supportsSocialName: false }
    : catalog?.teachingPlans ?? unavailable;
  const visibleSections = plansAvailability.available ? filteredSections : [];
  const header = (
    <View style={styles.documentHeader}>
      <BackHeader label="Perfil" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Documentos" subtitle="PDFs oficiais do portal, sem cópias permanentes no aparelho" styles={styles} />
      {loading ? <LoadingNotice label={totalPlans ? "Carregando semestres anteriores" : "Consultando documentos disponíveis"} theme={theme} styles={styles} /> : null}
      {error ? <InlineNotice text={error} styles={styles} /> : null}
      <Eyebrow styles={styles}>DOCUMENTOS PESSOAIS</Eyebrow>
      <Surface styles={styles} style={styles.listSurface}>
        <DocumentActionRow
          label="Atestado de matrícula"
          detail="Comprovante oficial em PDF"
          available={catalog?.enrollmentCertificate.available === true}
          unavailableDetail="A UFGD libera apenas no período letivo atual para estudante regularmente matriculado"
          busy={sharingKey === "enrollment-certificate"}
          disabled={Boolean(sharingKey)}
          onPress={() => onShare(
            "enrollment-certificate",
            { kind: "enrollment-certificate" },
            catalog?.enrollmentCertificate ?? unavailable,
          )}
          theme={theme}
          styles={styles}
        />
        <DocumentActionRow
          label="Histórico escolar"
          detail="Histórico oficial em PDF"
          available={catalog?.schoolTranscript.available === true}
          busy={sharingKey === "school-transcript"}
          disabled={Boolean(sharingKey)}
          border
          onPress={() => onShare(
            "school-transcript",
            { kind: "school-transcript" },
            catalog?.schoolTranscript ?? unavailable,
          )}
          theme={theme}
          styles={styles}
        />
      </Surface>
      <View style={styles.documentSectionTitle}>
        <Eyebrow styles={styles}>PLANOS DE ENSINO · {totalPlans}</Eyebrow>
      </View>
      {!loading && catalog && !plansAvailability.available ? (
        <InlineNotice text="A UFGD não disponibilizou planos de ensino para este período." styles={styles} />
      ) : <View style={styles.searchBox}>
        <TextInput
          accessibilityLabel="Buscar plano de ensino"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Buscar por disciplina ou código"
          placeholderTextColor={theme.faint}
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>}
    </View>
  );
  return (
    <SectionList
      style={styles.scroll}
      contentContainerStyle={[styles.documentListContent, { paddingBottom: 28 + bottomInset }]}
      sections={visibleSections}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <View style={styles.documentSemesterHeader}>
          <Eyebrow styles={styles}>{section.periodName}{section.current ? " · ATUAL" : ""}</Eyebrow>
          <Text style={styles.caption}>
            {section.data.length} {section.data.length === 1 ? "disciplina" : "disciplinas"}
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const key = `plan-${item.id}`;
        return (
          <Surface styles={styles} style={styles.documentPlanSurface}>
            <DocumentActionRow
              label={formatAcademicName(item.course) ?? item.course}
              detail={item.code}
              available={plansAvailability.available}
              busy={sharingKey === key}
              disabled={Boolean(sharingKey)}
              onPress={() => onShare(key, { kind: "teaching-plan", planId: item.id }, plansAvailability)}
              theme={theme}
              styles={styles}
            />
          </Surface>
        );
      }}
      ListEmptyComponent={!loading ? (
        <EmptyState
          label={!plansAvailability.available && catalog
            ? "Nenhum plano de ensino foi disponibilizado pela UFGD para este período."
            : query ? "Nenhum plano corresponde à busca." : "Nenhum plano de ensino disponível nos seus semestres."}
          styles={styles}
        />
      ) : null}
      ListFooterComponent={hasMore || loadingMore ? (
        <Pressable
          accessibilityRole="button"
          disabled={loadingMore}
          onPress={onLoadMore}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
        >
          {loadingMore
            ? <ActivityIndicator size="small" color={theme.primary} />
            : <Text style={styles.secondaryActionText}>Mais semestres</Text>}
        </Pressable>
      ) : null}
      onEndReached={() => { if (hasMore && !loadingMore) onLoadMore(); }}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={5}
    />
  );
}

function DocumentActionRow({ label, detail, available, unavailableDetail, busy, disabled, onPress, theme, styles, border }: ScreenProps & {
  label: string;
  detail: string;
  available: boolean;
  unavailableDetail?: string;
  busy: boolean;
  disabled: boolean;
  onPress(): void;
  border?: boolean;
}) {
  const inactive = disabled || !available;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.documentActionRow, border && styles.topBorder, pressed && styles.pressed]}
    >
      <FileText size={19} color={available ? theme.primary : theme.faint} />
      <View style={styles.flex}>
        <Text style={[styles.itemTitle, !available && styles.faintText]}>{label}</Text>
        <Text style={styles.caption}>{available ? detail : unavailableDetail ?? "Indisponível no portal"}</Text>
      </View>
      {busy
        ? <ActivityIndicator size="small" color={theme.primary} />
        : <ChevronRight size={17} color={available ? theme.primary : theme.faint} />}
    </Pressable>
  );
}

function DiagnosticsScreen({ overview, card, portal, cardUnavailable, detailsLoading, theme, styles, back }: ScreenProps & {
  overview: AcademicOverview | null; card: StudentCard | null; portal: PortalData; cardUnavailable: boolean; detailsLoading: boolean; back(): void;
}) {
  const rows = buildSafeDiagnostics(overview, card, portal, cardUnavailable, detailsLoading);
  return (
    <View style={styles.page}>
      <BackHeader label="Perfil" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Diagnóstico seguro" subtitle="Contagens e estados, sem valores pessoais" styles={styles} />
      <Surface styles={styles} style={styles.listSurface}>
        {rows.map((item, index) => {
          const color = item.state === "ok" ? theme.success : item.state === "warning" ? theme.warning : theme.danger;
          return (
            <View key={item.label} style={[styles.diagnosticRow, index > 0 && styles.topBorder]}>
              <View style={[styles.diagnosticDot, { backgroundColor: color }]} />
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{item.label}</Text>
                <Text style={styles.caption}>{item.detail}</Text>
              </View>
            </View>
          );
        })}
      </Surface>
      <InlineNotice text="Esta tela nunca mostra cookie, senha, nome, RGA, nota, saldo, URL ou corpo bruto de resposta." styles={styles} />
      <Text style={styles.footnote}>O diagnóstico existe somente em memória e é recalculado a cada carga.</Text>
    </View>
  );
}

function HistoryScreen({ portal, loading, theme, styles, back }: ScreenProps & { portal: PortalData; loading: boolean; back(): void }) {
  const [typeFilter, setTypeFilter] = useState<CourseTypeFilter>("all");
  const averages = useMemo(() => officialAveragesByType(portal.history), [portal.history]);
  const groups = useMemo(
    () => groupHistory(portal.history.filter((course) => matchesCourseType(course.type, typeFilter))),
    [portal.history, typeFilter],
  );
  return (
    <View style={styles.page}>
      <BackHeader label="Perfil" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Histórico" subtitle={workloadLine(portal)} styles={styles} />
      <TypeFilter value={typeFilter} onChange={setTypeFilter} styles={styles} />
      {averages.length ? (
        <View style={styles.fourMetrics}>
          {averages.map((item) => (
            <TinyMetric key={item.type} label={item.label} value={formatGrade(item.average)} styles={styles} />
          ))}
        </View>
      ) : null}
      {groups.length ? groups.map(([term, courses]) => (
        <View key={term} style={styles.sectionGap}><Eyebrow styles={styles}>{term}</Eyebrow><Surface styles={styles} style={styles.listSurface}>{courses.map((course, index) => <HistoryRow key={course.id} course={course} index={index} styles={styles} />)}</Surface></View>
      )) : loading ? <LoadingNotice label="Carregando histórico" theme={theme} styles={styles} /> : <EmptyState label={portal.history.length ? "Nenhuma disciplina neste filtro." : "Histórico indisponível nesta sessão."} styles={styles} />}
    </View>
  );
}

function CurriculumScreen({ portal, loading, theme, styles, back }: ScreenProps & { portal: PortalData; loading: boolean; back(): void }) {
  const [typeFilter, setTypeFilter] = useState<CourseTypeFilter>("all");
  const semesters = useMemo(
    () => chunk(portal.curriculum, 6)
      .map((courses, index) => ({ index, courses: courses.filter((course) => matchesCourseType(course.type, typeFilter)) }))
      .filter((section) => section.courses.length),
    [portal.curriculum, typeFilter],
  );
  return (
    <View style={styles.page}>
      <BackHeader label="Perfil" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Grade do curso" subtitle={`${formatCourseName(portal.profile?.course) ?? "Estrutura curricular"}${portal.profile?.structure ? ` · ${portal.profile.structure}` : ""}`} styles={styles} />
      <TypeFilter value={typeFilter} onChange={setTypeFilter} styles={styles} />
      <View style={styles.legend}><Legend color={theme.success} label="Cursada" styles={styles} /><Legend color={theme.primary} label="Cursando" styles={styles} /><Legend color={theme.border} label="Pendente" styles={styles} /></View>
      {semesters.length ? semesters.map((section) => <CurriculumSemester key={section.index} index={section.index} courses={section.courses} theme={theme} styles={styles} />) : loading ? <LoadingNotice label="Carregando estrutura curricular" theme={theme} styles={styles} /> : <EmptyState label={portal.curriculum.length ? "Nenhuma disciplina neste filtro." : "Estrutura curricular indisponível nesta sessão."} styles={styles} />}
      {portal.workload ? <Surface styles={styles}><Eyebrow styles={styles}>CARGA HORÁRIA</Eyebrow><WorkloadLine label="Obrigatória" done={portal.workload.requiredDone} total={portal.workload.requiredTotal} styles={styles} /><WorkloadLine label="Optativa" done={portal.workload.optionalDone} total={portal.workload.optionalTotal} styles={styles} /><WorkloadLine label="Extensão" done={portal.workload.extensionDone} total={portal.workload.extensionTotal} styles={styles} /></Surface> : null}
    </View>
  );
}

function EnrollmentScreen({ portal, period, loading, theme, styles, back }: ScreenProps & { portal: PortalData; period: string; loading: boolean; back(): void }) {
  const window = portal.enrollmentWindows[0];
  return (
    <View style={styles.page}>
      <BackHeader label="Início" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Matrícula" subtitle={`${period} · situação das solicitações`} styles={styles} />
      {window ? <View style={styles.successBox}><Eyebrow styles={styles}>ETAPA ABERTA</Eyebrow><Text style={styles.cardTitle}>{window.label}</Text><Text style={styles.caption}>De {window.startsAt || "—"} até {window.endsAt || "—"}</Text></View> : null}
      <Eyebrow styles={styles}>SOLICITAÇÕES</Eyebrow>
      <Surface styles={styles} style={styles.listSurface}>
        {portal.enrollments.length ? portal.enrollments.map((item, index) => <EnrollmentRow key={item.id} item={item} index={index} styles={styles} />) : loading ? <LoadingNotice label="Carregando solicitações" theme={theme} styles={styles} compact /> : <EmptyInline styles={styles}>Nenhuma matrícula encontrada para este período.</EmptyInline>}
      </Surface>
    </View>
  );
}

function NotificationsScreen({ overview, portal, loading, theme, styles, back }: ScreenProps & { overview: AcademicOverview; portal: PortalData; loading: boolean; back(): void }) {
  const grades = overview.courses.flatMap((course) => course.assessments.filter(hasPublishedValue).map((assessment) => ({ course, assessment })));
  return (
    <View style={styles.page}>
      <BackHeader label="Perfil" onPress={back} theme={theme} styles={styles} />
      <TitleBlock title="Notas e matrícula" subtitle={`${overview.period.nome} · dados atuais`} styles={styles} />
      {portal.enrollmentWindows.map((item) => <NotificationItem key={`window-${item.id}`} kind="MATRÍCULA" title={`${item.label} · até ${item.endsAt || "data não informada"}`} color={theme.primary} styles={styles} />)}
      {grades.map(({course, assessment}, index) => <NotificationItem key={`${courseKey(course)}-${assessment.name}-${index}`} kind="NOTA LANÇADA" title={`${assessment.name} de ${formatAcademicName(course.name)}: ${formatGrade(assessment.value)}`} color={theme.success} styles={styles} />)}
      {!portal.enrollmentWindows.length && !grades.length ? loading ? <LoadingNotice label="Carregando notas e matrícula" theme={theme} styles={styles} /> : <EmptyState label="Nenhuma nota lançada ou janela aberta." styles={styles} /> : null}
    </View>
  );
}

function PriorityLoadingScreen({ card, profile, cardError, theme, styles }: ScreenProps & {
  card: StudentCard | null; profile: AcademicProfile | null; cardError: string | null;
}) {
  const name = firstName(profile?.name ?? card?.name);
  return (
    <View style={styles.loadingScreen}>
      <Hero theme={theme} styles={styles} period="…" title={`${greeting()}, ${name}`} subtitle={profileLine(profile, card)} />
      <View style={styles.page}>
        <Surface styles={styles} style={styles.studentCardSurface}>
          <View style={styles.cardIdentity}>
            <StudentPhoto card={card} styles={styles} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{formatPersonName(profile?.name ?? card?.name) ?? "Estudante UFGD"}</Text>
              <Text style={styles.caption}>{formatCourseName(profile?.course ?? card?.course) ?? "Curso não informado"}</Text>
            </View>
          </View>
        </Surface>
        <View style={styles.balanceTabs}>
          <Surface styles={styles} style={styles.metricCard}><BalanceLine label="RU" value={cleanMoney(card?.ruBalance)} styles={styles} /></Surface>
          <Surface styles={styles} style={styles.metricCard}><BalanceLine label="CANTINA" value={cleanMoney(card?.canteenBalance)} styles={styles} /></Surface>
        </View>
        {cardError ? <InlineNotice text={`${cardError} O app tentará novamente em segundo plano.`} danger styles={styles} /> : null}
        <Surface styles={styles}>
          <Eyebrow styles={styles}>CARREGANDO</Eyebrow>
          <Skeleton width="76%" height={16} styles={styles} />
          <Skeleton width="58%" height={12} styles={styles} />
        </Surface>
      </View>
    </View>
  );
}

function LoadingScreen({ styles }: ScreenProps) {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.skeletonHero}><View style={styles.rowBetween}><Text style={styles.logoSmall}>SIGECAD</Text><Skeleton width={52} height={20} dark styles={styles} /></View><Skeleton width={160} height={22} dark styles={styles} /><Skeleton width={210} height={13} dark styles={styles} /></View>
      <View style={styles.page}>
        <SkeletonCard styles={styles} />
        <View style={styles.metricGrid}><SkeletonCard styles={styles} small /><SkeletonCard styles={styles} small /></View>
        <SkeletonCard styles={styles} tall />
      </View>
    </View>
  );
}

function PortalUnavailableScreen({ theme, styles, onRetry, onLogin }: ScreenProps & { onRetry(): void; onLogin(): void }) {
  return (
    <View>
      <Hero theme={theme} styles={styles} period="—" title="SIGECAD" subtitle="Dados locais protegidos" />
      <View style={styles.page}>
        <View style={styles.warningBanner}><WifiOff size={19} color={theme.warning} /><View style={styles.flex}><Text style={styles.itemTitle}>Portal da UFGD indisponível</Text><Text style={styles.caption}>Não foi possível carregar seus dados agora.</Text></View></View>
        <PrimaryAction label="Tentar agora" onPress={onRetry} styles={styles} />
        <SecondaryAction icon={LogOut} label="Reabrir login" onPress={onLogin} theme={theme} styles={styles} />
      </View>
    </View>
  );
}

function OfflineBanner({ theme, styles, onRetry }: ScreenProps & { onRetry(): void }) {
  return <Pressable onPress={onRetry} style={styles.offlineBanner}><WifiOff size={17} color={theme.warning} /><View style={styles.flex}><Text style={styles.noticeTitle}>Portal temporariamente indisponível</Text><Text style={styles.noticeCopy}>Toque para tentar novamente</Text></View></Pressable>;
}

function BottomTabs({ value, onChange, theme, styles, bottomInset }: ScreenProps & { value: MainRoute; onChange(route: MainRoute): void; bottomInset: number }) {
  const tabs: Array<{ key: MainRoute; label: string; icon: LucideIcon }> = [
    { key: "home", label: "Início", icon: Home }, { key: "grades", label: "Notas", icon: FileText },
    { key: "schedule", label: "Horários", icon: CalendarDays }, { key: "card", label: "Cartão", icon: CreditCard },
    { key: "profile", label: "Perfil", icon: User },
  ];
  return <View style={[styles.tabBar, { minHeight: 68 + bottomInset, paddingBottom: 9 + bottomInset }]}>{tabs.map((tab) => { const active = value === tab.key; const Icon = tab.icon; return <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tab}><Icon size={22} color={active ? theme.primary : theme.faint} strokeWidth={1.8} /><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text></Pressable>; })}</View>;
}

function Hero({ period, title, subtitle, styles }: ScreenProps & { period: string; title: string; subtitle: string }) {
  return <View style={styles.hero}><View style={styles.rowBetween}><View style={styles.brandLockup}><Image source={require("../../../assets/brand/ufgd-symbol-negative-1024.png")} style={styles.brandSymbol} /><Text style={styles.logoSmall}>SIGECAD</Text></View><Text style={styles.heroPeriod}>{period}</Text></View><Text style={styles.heroTitle}>{title}</Text><Text style={styles.heroSubtitle}>{subtitle}</Text></View>;
}

function TitleBlock({ title, subtitle, styles }: { title: string; subtitle: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.titleBlock}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.caption}>{subtitle}</Text></View>;
}

const TYPE_FILTERS: Array<{ id: CourseTypeFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "OBR", label: "Obrigatórias" },
  { id: "OPT", label: "Optativas" },
  { id: "ELT", label: "Eletivas" },
];

function TypeFilter({ value, onChange, styles }: { value: CourseTypeFilter; onChange(value: CourseTypeFilter): void; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.segmented}>
      {TYPE_FILTERS.map((item) => {
        const active = value === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.id)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BackHeader({ label, onPress, theme, styles }: ScreenProps & { label: string; onPress(): void }) {
  return <Pressable onPress={onPress} style={styles.backHeader}><ChevronLeft size={20} color={theme.primary} /><Text style={styles.backText}>{label}</Text></Pressable>;
}

function Surface({ children, styles, style }: { children: React.ReactNode; styles: ReturnType<typeof createStyles>; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

function Eyebrow({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) { return <Text style={styles.eyebrow}>{children}</Text>; }
function EmptyInline({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) { return <Text style={styles.emptyInline}>{children}</Text>; }
function EmptyState({ label, styles }: { label: string; styles: ReturnType<typeof createStyles> }) { return <Surface styles={styles}><Text style={styles.emptyInline}>{label}</Text></Surface>; }

function Metric({ label, value, detail, styles, muted }: { label: string; value: string; detail?: string; styles: ReturnType<typeof createStyles>; muted?: boolean }) {
  return <Surface styles={styles} style={styles.metricCard}><Eyebrow styles={styles}>{label}</Eyebrow><Text style={[styles.monoMetric, muted && styles.faintText]}>{value}</Text>{detail ? <Text style={styles.caption}>{detail}</Text> : null}</Surface>;
}

function HeroMetric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) { return <View><Text style={styles.heroMetricLabel}>{label}</Text><Text style={styles.heroMetricValue}>{value}</Text></View>; }
function TinyMetric({ label, value, danger, styles }: { label: string; value: string; danger?: boolean; styles: ReturnType<typeof createStyles> }) { return <View style={styles.tinyMetric}><Text style={styles.eyebrow}>{label}</Text><Text style={[styles.monoValue, danger && styles.dangerText]}>{value}</Text></View>; }
function BalanceLine({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) { return <View style={styles.rowBetween}><Eyebrow styles={styles}>{label}</Eyebrow><Text style={styles.monoValue}>{value}</Text></View>; }

function RiskBar({ course, theme, styles, detailed }: ScreenProps & { course: AcademicCourse; detailed?: boolean }) {
  const ratio = absenceRatio(course);
  const color = ratio >= .75 ? theme.danger : ratio >= .5 ? theme.warning : theme.primary;
  return <View style={styles.riskItem}><View style={styles.rowBetween}><Text style={styles.itemTitle}>{formatAcademicName(course.name)}</Text><Text style={[styles.monoCaption, { color }]}>{absenceText(course)}</Text></View>{detailed ? <Text style={styles.caption}>{absenceRemaining(course)}</Text> : null}<Progress value={ratio} color={color} styles={styles} /></View>;
}

function Progress({ value, color, styles }: { value: number; color: string; styles: ReturnType<typeof createStyles> }) { return <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} /></View>; }

function LinkRow({ label, icon: Icon, onPress, theme, styles }: ScreenProps & { label: string; icon: LucideIcon; onPress(): void }) { return <Pressable onPress={onPress} style={({pressed}) => [styles.linkRow, pressed && styles.pressed]}><Icon size={17} color={theme.primary} /><Text style={styles.linkText}>{label}</Text><ChevronRight size={16} color={theme.faint} /></Pressable>; }

function TimelineEntry({ entry, active, last, theme, styles }: ScreenProps & { entry: ScheduleEntry; active: boolean; last: boolean }) { return <View style={styles.timelineRow}><View style={styles.timelineRail}><Text style={[styles.monoTime, active && styles.primaryText]}>{entry.slot.split(/[–-]/)[0]?.trim()}</Text><View style={[styles.timelineDot, active && {backgroundColor: theme.primary}]} />{!last ? <View style={styles.timelineStem} /> : null}</View><View style={[styles.timelineCard, active && styles.timelineActive]}><Text style={[styles.itemTitle, active && styles.timelineActiveText]}>{formatAcademicName(entry.course)}</Text><Text style={[styles.caption, active && styles.timelineActiveCaption]}>{locationLine(entry)} · {entry.slot}</Text></View></View>; }

function StudentPhoto({ card, large, styles, onRenderError }: { card: StudentCard | null; large?: boolean; styles: ReturnType<typeof createStyles>; onRenderError?: () => void }) {
  const [renderFailed, setRenderFailed] = useState(false);
  useEffect(() => setRenderFailed(false), [card?.photoDataUrl]);
  const style = large ? styles.photoLarge : styles.photo;
  if (card?.photoDataUrl && !renderFailed) {
    return <Image source={{ uri: card.photoDataUrl }} style={style} onError={() => { setRenderFailed(true); onRenderError?.(); }} />;
  }
  return <View style={[style, styles.photoFallback]}><User size={large ? 32 : 23} color="#FFFFFF" /></View>;
}

function HomeAcademicCard({ card, loading, profile, onPress, theme, styles }: ScreenProps & {
  card: StudentCard | null; loading: boolean; profile: AcademicProfile | null; onPress(): void;
}) {
  const ru = buildSpendingInsight(card?.ruBalance, card?.ruTransactions ?? [], "ru");
  const canteen = buildSpendingInsight(card?.canteenBalance, card?.canteenTransactions ?? [], "canteen");
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Surface styles={styles} style={styles.homeCardSurface}>
        <View style={styles.rowBetween}>
          <Eyebrow styles={styles}>CARTÃO ACADÊMICO</Eyebrow>
          <Text style={styles.monoLink}>ver extrato</Text>
        </View>
        <View style={styles.cardIdentity}>
          <StudentPhoto card={card} styles={styles} />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{formatPersonName(profile?.name ?? card?.name) ?? "Estudante UFGD"}</Text>
          </View>
          <CreditCard size={22} color={theme.primary} strokeWidth={1.7} />
        </View>
        <View style={styles.homeBalances}>
          <HomeBalance label="RU" balance={card?.ruBalance} insight={ru} loading={loading} styles={styles} />
          <View style={styles.homeBalanceDivider} />
          <HomeBalance label="CANTINA" balance={card?.canteenBalance} insight={canteen} loading={loading} styles={styles} />
        </View>
        <BarcodeStrip value={card?.barcodeValue} compact styles={styles} />
      </Surface>
    </Pressable>
  );
}

function HomeBalance({ label, balance, insight, loading, styles }: {
  label: string;
  balance: string | null | undefined;
  insight: ReturnType<typeof buildSpendingInsight>;
  loading: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.homeBalanceItem}>
      <Text style={styles.eyebrow}>{label}</Text>
      {loading && !balance
        ? <Skeleton width="70%" height={18} styles={styles} />
        : <Text style={styles.homeBalanceValue}>{balance ?? "—"}</Text>}
      <Text style={styles.balanceEstimate}>
        {loading && !balance
          ? "Carregando saldo"
          : insight.estimatedUses !== null
          ? `${insight.estimatedUses} refeições`
          : "— refeições"}
      </Text>
    </View>
  );
}

function SpendingPanel({ card, source, theme, styles }: ScreenProps & {
  card: StudentCard | null; source: SpendingSource;
}) {
  const transactions = source === "ru" ? card?.ruTransactions ?? [] : card?.canteenTransactions ?? [];
  const balance = source === "ru" ? card?.ruBalance : card?.canteenBalance;
  const insight = buildSpendingInsight(balance, transactions, source);
  const noun = "refeições";
  if (insight.typicalCents === null) {
    return null;
  }
  const exact = insight.exactTopUpCents !== null
    ? insight.exactTopUpCents === 0
      ? "Já está exato"
      : formatMoneyCents(insight.exactTopUpCents)
    : "—";
  const exactDetail = insight.exactTopUpCents === 0
    ? `${insight.estimatedUses ?? 0} refeições completas`
    : `${insight.usesAfterTopUp ?? 0} refeições completas`;
  return (
    <Surface styles={styles} style={styles.spendingPanel}>
      <Eyebrow styles={styles}>SEU SALDO RENDE</Eyebrow>
      <View style={styles.spendingGrid}>
        <View style={styles.spendingMetric}>
          <Text style={styles.eyebrow}>POR REFEIÇÃO</Text>
          <Text style={styles.monoValue}>{formatMoneyCents(insight.typicalCents)}</Text>
        </View>
        <View style={styles.spendingMetric}>
          <Text style={styles.eyebrow}>AINDA DÁ PARA</Text>
          <Text style={styles.monoValue}>{insight.estimatedUses ?? "—"} {noun}</Text>
        </View>
      </View>
      <View style={styles.topBorder} />
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>RECARGA EXATA</Text>
          <Text style={styles.cardTitle}>{exact}</Text>
          <Text style={styles.caption}>{exactDetail}</Text>
        </View>
        <CreditCard size={22} color={theme.primary} />
      </View>
    </Surface>
  );
}

function BarcodeStrip({ value, compact = false, styles }: {
  value: string | null | undefined;
  compact?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const [barcode, setBarcode] = useState<{ width: number; height: number; uri: string } | null>(null);
  useEffect(() => {
    let active = true;
    setBarcode(null);
    if (!value) return () => { active = false; };
    void bwipjs.toDataURL({
      // Confirmed against the authenticated UFGD print view on 2026-07-16:
      // the official symbol is Code 128 and its complete bar-width sequence matches.
      bcid: "code128",
      text: value,
      scaleX: 3,
      scaleY: 2,
      height: compact ? 8 : 11,
      includetext: false,
      paddingwidth: 8,
      paddingheight: 4,
      backgroundcolor: "FFFFFF",
      barcolor: "000000",
    }).then((next) => {
      if (active) setBarcode(next);
    }).catch(() => {
      if (active) setBarcode(null);
    });
    return () => { active = false; };
  }, [compact, value]);

  if (!value) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Código de barras do cartão acadêmico"
      style={[styles.barcodePanel, compact && styles.barcodePanelCompact]}
    >
      {barcode ? (
        <Image source={{ uri: barcode.uri }} resizeMode="contain" style={[styles.barcodeImage, compact && styles.barcodeImageCompact]} />
      ) : (
        <View style={[styles.barcodePlaceholder, compact && styles.barcodeImageCompact]} />
      )}
    </View>
  );
}

function BalanceTab({ label, value, active, onPress, styles }: { label: string; value: string; active: boolean; onPress(): void; styles: ReturnType<typeof createStyles> }) { return <Pressable onPress={onPress} style={[styles.balanceTab, active && styles.balanceTabActive]}><Text style={styles.eyebrow}>{label}</Text><Text style={styles.monoValue}>{value}</Text></Pressable>; }
function Transaction({ item, index, styles }: { item: CardTransaction; index: number; styles: ReturnType<typeof createStyles> }) { const incoming = /recarga|cr[eé]dito|entrada/i.test(item.type) || /^\+/.test(item.value); const details=[item.date,item.time,item.merchant?item.type:null].filter(Boolean).join(" · "); return <View style={[styles.transaction, index > 0 && styles.topBorder]}><View style={styles.flex}><Text style={styles.itemTitle}>{item.merchant || item.type}</Text><Text style={styles.caption}>{details}</Text></View><Text style={[styles.monoValue, incoming && styles.successText]}>{item.value}</Text></View>; }

function InfoRow({ label, value, border, styles }: { label: string; value: string; border?: boolean; styles: ReturnType<typeof createStyles> }) { return <View style={[styles.infoRow, border && styles.topBorder]}><Text style={styles.caption}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }

function PreferenceGroup({ label, values, selected, onChange, styles }: { label: string; values: Array<{key:string;label:string}>; selected: string; onChange(value:string):void; styles: ReturnType<typeof createStyles> }) { return <View><Text style={styles.preferenceLabel}>{label}</Text><View style={styles.segmented}>{values.map((item) => <Pressable key={item.key} onPress={() => onChange(item.key)} style={[styles.segment, selected === item.key && styles.segmentActive]}><Text style={[styles.segmentText, selected === item.key && styles.segmentTextActive]}>{item.label}</Text></Pressable>)}</View></View>; }

function MenuRow({ label, icon: Icon, onPress, theme, styles, border }: ScreenProps & { label: string; icon: LucideIcon; onPress():void; border?:boolean }) { return <Pressable onPress={onPress} style={({pressed}) => [styles.menuRow, border && styles.topBorder, pressed && styles.pressed]}><Icon size={19} color={theme.primary} /><Text style={[styles.itemTitle, styles.flex]}>{label}</Text><ChevronRight size={17} color={theme.faint} /></Pressable>; }

function SecondaryAction({ icon: Icon, label, onPress, theme, styles, danger }: ScreenProps & { icon: LucideIcon; label:string; onPress():void; danger?:boolean }) { return <Pressable onPress={onPress} style={({pressed}) => [styles.secondaryAction, danger && styles.dangerAction, pressed && styles.pressed]}><Icon size={18} color={danger ? theme.danger : theme.primary} /><Text style={[styles.secondaryActionText, danger && styles.dangerText]}>{label}</Text></Pressable>; }
function PrimaryAction({ label, onPress, styles }: { label:string; onPress():void; styles: ReturnType<typeof createStyles> }) { return <Pressable onPress={onPress} style={({pressed}) => [styles.primaryAction, pressed && styles.pressed]}><Text style={styles.primaryActionText}>{label}</Text></Pressable>; }

function InlineNotice({ text, danger, styles }: { text:string; danger?:boolean; styles: ReturnType<typeof createStyles> }) { return <View style={[styles.inlineNotice, danger && styles.inlineDanger]}><Text style={[styles.noticeCopy, danger && styles.dangerText]}>{text}</Text></View>; }
function LoadingNotice({ label, compact = false, theme, styles }: ScreenProps & { label:string;compact?:boolean }) { return <View style={[styles.loadingNotice, compact && styles.loadingNoticeCompact]}><ActivityIndicator size="small" color={theme.primary} /><Text style={styles.noticeCopy}>{label}</Text></View>; }
function MiniAbsenceHistory({ entries, styles }: { entries: AbsenceEntry[]; styles: ReturnType<typeof createStyles> }) { if (!entries.length) return null; const visible=entries.slice(-3).reverse(); return <View style={styles.absenceDates}>{visible.map((entry,index) => <Text key={`${entry.date}-${entry.time}-${index}`} style={styles.monoCaption}>{entry.date}{entry.time ? ` · ${entry.time}` : ""}</Text>)}{entries.length>visible.length?<Text style={styles.faintCaption}>+{entries.length-visible.length} registros</Text>:null}</View>; }

function HistoryRow({ course, index, styles }: { course: HistoryCourse; index:number; styles: ReturnType<typeof createStyles> }) { const failed = /reprov/i.test(course.result ?? ""); const details=[course.code,course.hours?`${course.hours}h`:null,course.absences!==null?`${course.absences} faltas`:null].filter(Boolean).join(" · "); return <View style={[styles.historyRow, index > 0 && styles.topBorder]}><View style={styles.flex}><Text style={styles.itemTitle}>{formatAcademicName(course.name)}</Text><Text style={styles.monoCaption}>{details}</Text></View><View style={styles.historyResult}><Text style={styles.monoValue}>{formatGrade(course.grade)}</Text><Text style={[styles.caption, failed && styles.dangerText]}>{course.result ?? "—"}</Text></View></View>; }

function Legend({ color, label, styles }: { color:string; label:string; styles: ReturnType<typeof createStyles> }) { return <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:color}]} /><Text style={styles.caption}>{label}</Text></View>; }
function CurriculumSemester({ index, courses, theme, styles }: ScreenProps & { index:number; courses:CurriculumCourse[] }) { const done = courses.filter((c)=>c.status==="done").length; return <Surface styles={styles}><View style={styles.rowBetween}><Eyebrow styles={styles}>{index+1}º SEMESTRE</Eyebrow><Text style={styles.monoLink}>{done}/{courses.length}</Text></View><View style={styles.courseGrid}>{courses.map((course) => { const color = course.status === "done" ? theme.success : course.status === "current" ? theme.primary : theme.border; const details=[course.code,course.hours?`${course.hours}h`:null,course.type].filter(Boolean).join(" · "); return <View key={course.id} style={styles.curriculumItem}><View style={[styles.curriculumMark,{backgroundColor:color}]} /><View style={styles.flex}><Text style={[styles.curriculumText, course.status === "pending" && styles.faintText]} numberOfLines={2}>{formatAcademicName(course.name)}</Text><Text style={styles.faintCaption} numberOfLines={1}>{details}</Text></View></View>; })}</View></Surface>; }
function WorkloadLine({ label, done, total, styles }: { label:string;done:number;total:number;styles:ReturnType<typeof createStyles> }) { return <View style={styles.workloadRow}><Text style={styles.body}>{label}</Text><Text style={styles.monoValue}>{done.toLocaleString("pt-BR")}/{total.toLocaleString("pt-BR")}</Text></View>; }
function EnrollmentRow({ item, index, styles }: { item:EnrollmentEntry;index:number;styles:ReturnType<typeof createStyles> }) { const danger=item.status==="Cancelada"; const details=[item.code,item.section,item.stage||null,item.requestedAt].filter(Boolean).join(" · "); return <View style={[styles.enrollmentRow,index>0&&styles.topBorder]}><View style={styles.flex}><Text style={styles.itemTitle}>{formatAcademicName(item.course)}</Text><Text style={styles.monoCaption}>{details}</Text></View><Text style={[styles.statusText,danger&&styles.dangerText]}>{item.status}</Text></View>; }
function NotificationItem({ kind, title, color, styles }: {kind:string;title:string;color:string;styles:ReturnType<typeof createStyles>}) { return <Surface styles={styles}><Text style={[styles.eyebrow,{color}]}>{kind}</Text><Text style={styles.itemTitle}>{title}</Text></Surface>; }
function Skeleton({width,height,dark,styles}:{width:number|string;height:number;dark?:boolean;styles:ReturnType<typeof createStyles>}) { return <View style={[styles.skeleton,{width:width as number,height},dark&&styles.skeletonDark]} />; }
function SkeletonCard({small,tall,styles}:{small?:boolean;tall?:boolean;styles:ReturnType<typeof createStyles>}) { return <View style={[styles.skeletonCard,small&&styles.skeletonSmall,tall&&styles.skeletonTall]}><Skeleton width="36%" height={10} styles={styles}/><Skeleton width="70%" height={18} styles={styles}/><Skeleton width="52%" height={12} styles={styles}/></View>; }

function createStyles(theme: DesignTheme) {
  return StyleSheet.create({
    safeShell:{flex:1},shell:{flex:1,backgroundColor:theme.background},scroll:{flex:1},scrollContent:{paddingBottom:28},scrollContentWithTabs:{paddingBottom:96},page:{paddingHorizontal:16,paddingTop:16,gap:12},flex:{flex:1},pressed:{opacity:.68},pressableFlex:{flex:1},rowBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12},topBorder:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:theme.border},
    hero:{backgroundColor:theme.dark?theme.background:"#174F3D",paddingHorizontal:20,paddingTop:18,paddingBottom:18,gap:3,borderBottomWidth:theme.dark?1:0,borderBottomColor:theme.border},brandLockup:{flexDirection:"row",alignItems:"center",gap:7},brandSymbol:{width:21,height:21},logoSmall:{fontFamily:fonts.monoMedium,fontSize:12,letterSpacing:1,paddingRight:6,flexShrink:0,color:theme.dark?theme.muted:"#FFFFFF",opacity:.9},heroPeriod:{fontFamily:fonts.mono,fontSize:11,color:theme.dark?theme.body:"#FFFFFF",backgroundColor:theme.dark?theme.surfaceMuted:"rgba(255,255,255,.14)",paddingHorizontal:8,paddingVertical:4,borderRadius:4},heroTitle:{fontFamily:fonts.sansSemibold,fontSize:22,color:theme.dark?theme.ink:"#FFFFFF",marginTop:9},heroSubtitle:{fontFamily:fonts.sans,fontSize:12,color:theme.dark?theme.muted:"#FFFFFF",opacity:.72},
    denseHero:{backgroundColor:theme.dark?theme.background:"#174F3D",padding:20,gap:18,borderBottomWidth:theme.dark?1:0,borderBottomColor:theme.border},periodOnGreen:{fontFamily:fonts.monoSemibold,fontSize:12,color:theme.dark?theme.ink:"#FFFFFF"},monoOnGreen:{fontFamily:fonts.mono,fontSize:11,color:theme.dark?theme.muted:"#FFFFFF",opacity:.75},denseMetrics:{flexDirection:"row",justifyContent:"space-between"},heroMetricLabel:{fontFamily:fonts.sansSemibold,fontSize:9.5,letterSpacing:.7,paddingRight:6,flexShrink:0,color:theme.dark?theme.muted:"#FFFFFF",opacity:.65},heroMetricValue:{fontFamily:fonts.monoSemibold,fontSize:16,color:theme.dark?theme.primary:"#FFFFFF",marginTop:2},
    agendaHeader:{paddingHorizontal:20,paddingTop:18,paddingBottom:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},periodPill:{fontFamily:fonts.monoMedium,fontSize:11,color:"#FFFFFF",backgroundColor:theme.dark?"#315848":"#174F3D",paddingHorizontal:9,paddingVertical:5,borderRadius:4},
    surface:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:10,padding:14,gap:8},listSurface:{padding:0,overflow:"hidden"},metricGrid:{flexDirection:"row",gap:10},metricCard:{flex:1,minHeight:112,justifyContent:"space-between"},fourMetrics:{flexDirection:"row",gap:7},tinyMetric:{flex:1,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:10,padding:10,gap:4},
    eyebrow:{fontFamily:fonts.sansSemibold,fontSize:10.5,letterSpacing:.75,paddingRight:6,flexShrink:0,color:theme.muted},pageTitle:{fontFamily:fonts.sansSemibold,fontSize:26,lineHeight:31,color:theme.ink},cardTitle:{fontFamily:fonts.sansMedium,fontSize:14,lineHeight:19,color:theme.ink},itemTitle:{fontFamily:fonts.sansMedium,fontSize:14,lineHeight:19,color:theme.ink},body:{fontFamily:fonts.sans,fontSize:13,lineHeight:20,color:theme.body},bodyStrong:{fontFamily:fonts.sansSemibold,color:theme.ink},caption:{fontFamily:fonts.sans,fontSize:11.5,lineHeight:17,color:theme.muted},faintCaption:{fontFamily:fonts.sans,fontSize:10.5,lineHeight:15,color:theme.faint},footnote:{fontFamily:fonts.sans,fontSize:10.5,lineHeight:16,color:theme.faint,textAlign:"center",paddingHorizontal:10},monoCaption:{fontFamily:fonts.mono,fontSize:10.5,lineHeight:16,color:theme.muted},monoLarge:{fontFamily:fonts.monoSemibold,fontSize:17,color:theme.ink},monoMetric:{fontFamily:fonts.monoSemibold,fontSize:26,color:theme.ink},monoValue:{fontFamily:fonts.monoSemibold,fontSize:14,color:theme.ink},monoAssessment:{fontFamily:fonts.monoSemibold,fontSize:17,color:theme.ink},monoLink:{fontFamily:fonts.monoSemibold,fontSize:11.5,color:theme.primary},monoTime:{fontFamily:fonts.monoMedium,fontSize:12,color:theme.muted},primaryText:{color:theme.primary},dangerText:{color:theme.danger},successText:{color:theme.success},faintText:{color:theme.faint},emptyInline:{fontFamily:fonts.sans,fontSize:13,lineHeight:19,color:theme.muted,textAlign:"center",paddingVertical:18},
    titleBlock:{gap:2},backHeader:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:2,minHeight:34},backText:{fontFamily:fonts.sans,fontSize:12,color:theme.primary},
    riskItem:{gap:6,paddingVertical:4},progressTrack:{height:5,borderRadius:3,backgroundColor:theme.surfaceMuted,overflow:"hidden"},progressFill:{height:"100%",borderRadius:3},linkRow:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:theme.border,paddingTop:11,marginTop:3,flexDirection:"row",alignItems:"center",gap:8},linkText:{fontFamily:fonts.sansMedium,fontSize:12,color:theme.primary,flex:1},
    denseCourse:{minHeight:62,paddingHorizontal:14,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:12},inlineValues:{flexDirection:"row",alignItems:"center",gap:10},linkCard:{backgroundColor:theme.primarySoft,borderWidth:1,borderColor:theme.dark?theme.border:"#CFE0D7",borderRadius:10,padding:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},gradeCourse:{minHeight:68,paddingHorizontal:14,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:10},gradeSide:{alignItems:"flex-end",gap:2},assessmentRow:{minHeight:64,paddingHorizontal:14,paddingVertical:10,flexDirection:"row",alignItems:"center",gap:12},infoBox:{backgroundColor:theme.primarySoft,borderWidth:1,borderColor:theme.border,borderRadius:10,padding:14,gap:7},riskSurface:{borderColor:theme.danger,backgroundColor:theme.dangerSoft},simpleRow:{minHeight:50,paddingHorizontal:14,paddingVertical:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12},absenceDates:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:theme.border,paddingTop:8,gap:3},
    dayTabs:{flexDirection:"row",backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:10,overflow:"hidden"},dayTab:{flex:1,alignItems:"center",paddingVertical:8,gap:2},dayTabActive:{backgroundColor:theme.primary},dayName:{fontFamily:fonts.sansSemibold,fontSize:9.5,color:theme.muted},dayNumber:{fontFamily:fonts.monoMedium,fontSize:11,color:theme.ink},dayNameActive:{color:"#FFFFFF"},scheduleRow:{minHeight:78,padding:14,flexDirection:"row",alignItems:"flex-start",gap:10},scheduleLine:{width:2,alignSelf:"stretch",backgroundColor:theme.primary,borderRadius:1},
    timelineSurface:{paddingVertical:14},timelineRow:{flexDirection:"row",minHeight:86},timelineRail:{width:56,alignItems:"center",position:"relative"},timelineDot:{width:8,height:8,borderRadius:4,backgroundColor:theme.border,marginTop:8},timelineStem:{position:"absolute",width:1,backgroundColor:theme.border,top:31,bottom:-5},timelineCard:{flex:1,backgroundColor:theme.surfaceMuted,borderRadius:10,padding:14,marginBottom:10,gap:3},timelineActive:{backgroundColor:theme.dark?"#315848":"#174F3D"},timelineActiveText:{color:"#FFFFFF"},timelineActiveCaption:{color:"rgba(255,255,255,.72)"},
    studentCardSurface:{gap:13},homeCardSurface:{gap:14,padding:16},cardIdentity:{flexDirection:"row",alignItems:"center",gap:12},photo:{width:54,height:66,borderRadius:7,backgroundColor:theme.primary},photoLarge:{width:76,height:92,borderRadius:9,backgroundColor:theme.primary},photoFallback:{alignItems:"center",justifyContent:"center"},homeBalances:{flexDirection:"row",backgroundColor:theme.surfaceMuted,borderRadius:9,paddingVertical:12},homeBalanceItem:{flex:1,paddingHorizontal:13,gap:3},homeBalanceDivider:{width:StyleSheet.hairlineWidth,backgroundColor:theme.border},homeBalanceValue:{fontFamily:fonts.monoSemibold,fontSize:20,color:theme.ink},balanceEstimate:{fontFamily:fonts.sansMedium,fontSize:10.5,color:theme.primary},balanceTabs:{flexDirection:"row",gap:8},balanceTab:{flex:1,borderWidth:1,borderColor:theme.border,borderRadius:10,padding:12,gap:5,backgroundColor:theme.surface},balanceTabActive:{borderColor:theme.primary,backgroundColor:theme.primarySoft},spendingPanel:{gap:12},spendingGrid:{flexDirection:"row",gap:8},spendingMetric:{flex:1,backgroundColor:theme.surfaceMuted,borderRadius:8,padding:11,gap:4},barcodePanel:{height:104,backgroundColor:"#FFFFFF",borderRadius:8,paddingHorizontal:10,paddingVertical:8,alignItems:"center",justifyContent:"center",overflow:"hidden"},barcodePanelCompact:{height:70},barcodeImage:{width:"100%",height:88},barcodeImageCompact:{height:54},barcodePlaceholder:{width:"100%",height:88,backgroundColor:"#F2F2F2",borderRadius:4},transaction:{minHeight:62,padding:14,flexDirection:"row",alignItems:"center",gap:12},
    profileHeader:{alignItems:"center",gap:4,paddingVertical:4},rgaCopy:{minHeight:38,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:11,borderRadius:8,backgroundColor:theme.primarySoft,borderWidth:1,borderColor:theme.border},rgaCopyHint:{fontFamily:fonts.sansMedium,fontSize:10.5,color:theme.primary},infoRow:{paddingHorizontal:14,paddingVertical:11,gap:3},infoValue:{fontFamily:fonts.sansMedium,fontSize:13.5,color:theme.ink},preferenceLabel:{fontFamily:fonts.sansMedium,fontSize:12,color:theme.ink,marginBottom:6},segmented:{flexDirection:"row",backgroundColor:theme.surfaceMuted,borderRadius:8,padding:3},segment:{flex:1,minHeight:38,alignItems:"center",justifyContent:"center",borderRadius:6,paddingHorizontal:4},segmentActive:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},segmentText:{fontFamily:fonts.sansMedium,fontSize:10.5,color:theme.muted,textAlign:"center"},segmentTextActive:{color:theme.primary},menuRow:{minHeight:52,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:11},secondaryAction:{minHeight:48,borderWidth:1,borderColor:theme.border,borderRadius:9,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,backgroundColor:theme.surface},dangerAction:{borderColor:theme.danger},secondaryActionText:{fontFamily:fonts.sansSemibold,fontSize:13,color:theme.primary},
    documentListContent:{paddingHorizontal:16,paddingTop:16},documentHeader:{gap:12,marginBottom:12},documentSectionTitle:{gap:2,marginTop:2},documentSemesterHeader:{gap:2,paddingTop:8,paddingBottom:8},documentPlanSurface:{padding:0,overflow:"hidden",marginBottom:8},documentActionRow:{minHeight:64,paddingHorizontal:14,paddingVertical:10,flexDirection:"row",alignItems:"center",gap:11},searchBox:{minHeight:48,borderWidth:1,borderColor:theme.border,borderRadius:9,backgroundColor:theme.surface,justifyContent:"center"},searchInput:{fontFamily:fonts.sans,fontSize:13,color:theme.ink,paddingHorizontal:14,paddingVertical:11},
    diagnosticRow:{minHeight:62,paddingHorizontal:14,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:11},diagnosticDot:{width:9,height:9,borderRadius:5},
    primaryAction:{minHeight:48,borderRadius:8,backgroundColor:theme.dark?"#315848":"#174F3D",alignItems:"center",justifyContent:"center",paddingHorizontal:18},primaryActionText:{fontFamily:fonts.sansSemibold,fontSize:14,color:"#FFFFFF"},inlineNotice:{backgroundColor:theme.primarySoft,borderWidth:1,borderColor:theme.border,borderRadius:9,padding:12},inlineDanger:{backgroundColor:theme.dangerSoft,borderColor:theme.danger},loadingNotice:{minHeight:48,backgroundColor:theme.surfaceMuted,borderRadius:9,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:9},loadingNoticeCompact:{margin:10},noticeTitle:{fontFamily:fonts.sansSemibold,fontSize:12,color:theme.ink},noticeCopy:{fontFamily:fonts.sans,fontSize:11.5,lineHeight:17,color:theme.body},offlineBanner:{margin:12,marginBottom:0,backgroundColor:theme.warningSoft,borderWidth:1,borderColor:theme.warning,borderRadius:9,padding:11,flexDirection:"row",alignItems:"center",gap:9},warningBanner:{backgroundColor:theme.warningSoft,borderWidth:1,borderColor:theme.warning,borderRadius:9,padding:12,flexDirection:"row",alignItems:"center",gap:10},successBox:{backgroundColor:theme.successSoft,borderWidth:1,borderColor:theme.success,borderRadius:10,padding:14,gap:4},
    historyRow:{minHeight:68,padding:14,flexDirection:"row",alignItems:"center",gap:12},historyResult:{alignItems:"flex-end"},sectionGap:{gap:7},legend:{flexDirection:"row",gap:14,flexWrap:"wrap"},legendItem:{flexDirection:"row",alignItems:"center",gap:6},legendDot:{width:8,height:8,borderRadius:4},courseGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},curriculumItem:{width:"48%",minHeight:50,flexDirection:"row",alignItems:"center",gap:7},curriculumMark:{width:5,alignSelf:"stretch",borderRadius:3},curriculumText:{fontFamily:fonts.sansMedium,fontSize:11.5,lineHeight:15,color:theme.ink},workloadRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingTop:7},enrollmentRow:{minHeight:68,padding:14,flexDirection:"row",alignItems:"center",gap:10},statusText:{fontFamily:fonts.sansSemibold,fontSize:11.5,color:theme.success},
    loadingScreen:{flex:1,minHeight:720},skeletonHero:{backgroundColor:theme.dark?theme.background:"#174F3D",padding:20,gap:10,borderBottomWidth:theme.dark?1:0,borderBottomColor:theme.border},skeleton:{backgroundColor:theme.surfaceMuted,borderRadius:5},skeletonDark:{backgroundColor:"rgba(255,255,255,.16)"},skeletonCard:{minHeight:96,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:10,padding:14,gap:11},skeletonSmall:{flex:1},skeletonTall:{minHeight:150},
    tabBar:{position:"absolute",left:0,right:0,bottom:0,minHeight:68,paddingTop:8,paddingBottom:9,backgroundColor:theme.dark?"#141B17":theme.surface,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:theme.border,flexDirection:"row"},tab:{flex:1,alignItems:"center",justifyContent:"center",gap:3},tabLabel:{fontFamily:fonts.sans,fontSize:9.5,color:theme.muted},tabLabelActive:{fontFamily:fonts.sansSemibold,color:theme.primary},
  });
}

function firstName(value: string | null | undefined): string { return formatPersonName(value)?.split(/\s+/)[0] || "estudante"; }
function normalizeSearch(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim(); }
function profileLine(profile: AcademicProfile | null, card: StudentCard | null): string { const course = formatCourseName(profile?.course ?? card?.course) ?? "Curso não informado"; return profile?.facultyCode ? `${course} · ${profile.facultyCode}` : course; }
function greeting(): string { const hour = new Date().getHours(); return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"; }
function numericGrade(value: number | string | null | undefined): number | null { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value !== "string") return null; const parsed=Number(value.replace(",",".")); return Number.isFinite(parsed)?parsed:null; }
function formatGrade(value: number | string | null | undefined): string { const number=numericGrade(value); return number===null?(value===null||value===undefined||value===""?"—":String(value)):number.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2}); }
function absenceRatio(course: AcademicCourse): number { if(!course.absenceLimit)return 0; return Math.max(0,(course.absences??0)/course.absenceLimit); }
function absenceText(course: AcademicCourse): string { return course.absenceLimit?`${course.absences??0}/${course.absenceLimit}`:`${course.absences??0}`; }
function absenceRemaining(course: AcademicCourse): string { if(!course.absenceLimit)return `${course.absences??0} faltas registradas`; const remaining=Math.max(0,course.absenceLimit-(course.absences??0)); return remaining?`Restam ${remaining} faltas até o limite`:`Limite de faltas atingido`; }
function cleanMoney(value: string | null | undefined): string { return value?.replace(/^R\$\s*/,"")??"—"; }
function mergeTransactions(current: CardTransaction[], next: CardTransaction[]): CardTransaction[] {
  const seen = new Set(current.map(transactionKey));
  return [...current, ...next.filter((item) => {
    const key = transactionKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })].slice(0, 400);
}
function transactionKey(item: CardTransaction): string { return `${item.date}|${item.time}|${item.type}|${item.value}|${item.merchant}`; }
function isCurrentEntry(entry:ScheduleEntry):boolean { return currentSchedule([entry])===entry; }
function locationLine(entry:ScheduleEntry):string { return [entry.room,entry.building,entry.unit].filter(Boolean).join(" · ")||"Local não informado"; }
function dayName(day:number):string { return ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"][day]??"—"; }
function weekDate(day:number):number { const now=new Date(); const delta=day-now.getDay(); const date=new Date(now); date.setDate(now.getDate()+delta); return date.getDate(); }
function dateHeading(date:Date):string { return date.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"short"}).toUpperCase().replace(".",""); }
function groupHistory(items:HistoryCourse[]):Array<[string,HistoryCourse[]]> { const map=new Map<string,HistoryCourse[]>(); for(const item of items)map.set(item.term,[...(map.get(item.term)??[]),item]); return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0])); }
function earliestHistoryTerm(items:HistoryCourse[]):string|null { const terms=items.map(item=>item.term).filter(term=>/^(?:19|20)\d{2}\/[12]$/.test(term)).sort(); return terms[0]??null; }
function chunk<T>(items:T[],size:number):T[][] { const result:T[][]=[]; for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size)); return result; }
function workloadLine(portal:PortalData):string { const w=portal.workload; return w?`${w.totalDone.toLocaleString("pt-BR")}h cumpridas · ${Math.max(0,w.totalRequired-w.totalDone).toLocaleString("pt-BR")}h restantes · extensão ${w.extensionDone}h de ${w.extensionTotal}h`:"Carga horária não disponível"; }
function messageOf(cause:unknown):string { return cause instanceof Error&&cause.message?cause.message:"Não foi possível atualizar os dados da UFGD."; }
function reportLoadTiming(stage:string,startedAt:number):void { console.info(`[SIGECAD tempo] ${stage}: ${Date.now()-startedAt}ms`); }
