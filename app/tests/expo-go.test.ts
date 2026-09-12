import { loadAcademicOverview } from "../src/core/academic";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_CHANNEL,
  BRIDGE_BOOTSTRAP,
  CARD_BRIDGE_BOOTSTRAP,
  MAX_BRIDGE_MESSAGE_BYTES,
  PortalBridgeError,
  buildBridgeCommand,
  parseBridgeResponse,
} from "../src/expo-go/bridge";
import { loadStudentCardPage, loadStudentCardSummary, mergeStudentCardSummary, parseStudentCard } from "../src/expo-go/card";
import { buildSpendingInsight, formatMoneyCents, parseMoneyCents } from "../src/expo-go/cardInsights";
import { activeScheduleEntries, isFinishedCourse } from "../src/expo-go/academicStatus";
import { createBatchedPortalRequest, ExpoGoPollClient, hydrateAcademicNotes, loadAcademicOverviewFast, loadAcademicStartupFast, type PortalBatchRequest, type PortalRequest } from "../src/expo-go/client";
import { buildSafeDiagnostics } from "../src/expo-go/diagnostics";
import {
  DOCUMENT_BRIDGE_CHANNEL,
  base64DecodedBytes,
  buildDocumentBridgeCommand,
  isAllowedSignedDocumentUrl,
  isPdfHeaderBase64,
  orderTeachingPlanSections,
  parseDocumentBridgeMessage,
  parseDocumentCatalog,
  parseTeachingPlans,
} from "../src/expo-go/documents";
import { courseDisplayValue, formatAcademicName, formatCourseName, formatPersonName, formatScheduleRoom, formatScheduleSlot, hasPublishedValue, nextClassContext, publishedAssessmentsCount } from "../src/expo-go/design/format";
import { currentSchedule, nextSchedule } from "../src/expo-go/design/schedule";
import { emptyPortalData, loadPortalData, matchesCourseType, officialAveragesByType, portalDataFromStartup, resolveCourseProgress } from "../src/expo-go/portalData";
import { detectRuntimeMode } from "../src/runtime/detect";
import { DataValidationError, parseNotas, parsePeriodos, parseTurmas } from "../src/expo-go/validation";

let failures = 0;
let total = 0;
const portalSessionSourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/expo-go/PortalSession.tsx");
const designSourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/expo-go/design/DesignExpoGoApp.tsx");
const appSourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "../App.tsx");
const expoGoEntryPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/expo-go/ExpoGoApp.tsx");

async function check(name: string, test: () => void | Promise<void>) {
  total += 1;
  try {
    await test();
    console.log(`  ok   ${name}`);
  } catch (cause) {
    failures += 1;
    console.log(`  FAIL ${name}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function assert(condition: unknown, message = "assert falhou"): asserts condition {
  if (!condition) throw new Error(message);
}

function rejects(fn: () => unknown, type: new (...args: never[]) => Error) {
  try {
    fn();
  } catch (cause) {
    assert(cause instanceof type, `erro inesperado: ${String(cause)}`);
    return;
  }
  throw new Error("operação perigosa foi aceita");
}

async function main() {
await check("bridge aceita somente envelope esperado", () => {
  const response = parseBridgeResponse(JSON.stringify({
    channel: BRIDGE_CHANNEL,
    id: "req-42",
    ok: true,
    status: 200,
    data: [{ id: 1 }],
  }));
  assert(response.id === "req-42" && response.ok && response.status === 200);
});

await check("detecção mantém Firebase fora do Expo Go", () => {
  assert(detectRuntimeMode("storeClient", null) === "expo-go");
  assert(detectRuntimeMode(undefined, "expo") === "expo-go");
  assert(detectRuntimeMode("standalone", "standalone") === "native-build");
});

await check("entrada só monta o dashboard e não apaga a sessão no boot", () => {
  const app = readFileSync(appSourcePath, "utf8");
  const entry = readFileSync(expoGoEntryPath, "utf8");
  assert(app.includes("<ExpoGoApp />"));
  assert(!app.includes("NativeApp"), "App.tsx ainda monta NativeApp");
  assert(!app.includes("isExpoGo"), "App.tsx ainda escolhe runtime nativo");
  assert(!app.includes("wipeAcademicPersistence"), "App.tsx ainda limpa persistência no boot");
  assert(!app.includes("clearToken"), "App.tsx ainda zera token no boot");
  assert(!app.includes("useEffect"), "App.tsx não deve ter efeito de boot");
  assert(entry.includes("DesignExpoGoApp as ExpoGoApp"));
  assert(!entry.includes("ExpoGoDashboard"));
});

await check("dashboard fica acima da WebView oculta no Android", () => {
  const source = readFileSync(portalSessionSourcePath, "utf8");
  assert(source.includes('<View style={styles.contentLayer}>{children}</View>'));
  assert(source.includes('contentLayer: { flex: 1, position: "relative", zIndex: 1 }'));
  assert(source.includes('hiddenBrowser: { ...StyleSheet.absoluteFill, opacity: 0.01, zIndex: 0 }'));
  assert(source.includes('Platform.OS === "android"'));
  assert(source.includes('hiddenBrowserAndroid: { position: "absolute", width: 2, height: 2, left: 0'));
  assert(source.includes('bottom: 0, opacity: 0.01, zIndex: 0'));
  assert(source.includes('pointerEvents={showLoginChrome ? "auto" : "none"}'));
});

await check("telas secundárias distinguem carregamento e não truncam notas", () => {
  const source = readFileSync(designSourcePath, "utf8");
  assert(source.includes('secondaryPhase === "loading"'));
  assert(source.includes('dados acadêmicos detalhados'));
  assert(!source.includes('))).slice(0, 6)'), "notas atuais continuam truncadas");
  assert(source.includes('item.stage||null'), "etapa da matrícula não é exibida");
});

await check("ponte recarrega a mesma origem após restauração", () => {
  const source = readFileSync(portalSessionSourcePath, "utf8");
  assert(source.includes('if (browserUri === destination) webView.current?.reload()'));
  assert(source.includes('}, [browserUri]);'));
});

await check("login começa no CAS e só conecta depois do SIGECAD", () => {
  const source = readFileSync(portalSessionSourcePath, "utf8");
  assert(source.includes("const [browserUri, setBrowserUri] = useState(CAS_URL);"));
  assert(!source.includes("const [browserUri, setBrowserUri] = useState(SIGECAD_HOME);"));
  assert(!source.includes("function onNavigation"));
  assert(!source.includes("onNavigationStateChange={onNavigation}"));
  assert(source.includes("isStableAcademicUrl(url)"));
  assert(source.includes("hasCasServiceTicket(url)"));
  assert(source.includes("abortInFlightBridge"));
  assert(source.includes("coveringPortal"));
  assert(source.includes("onOpenWindow={onOpenWindow}"));
  assert(source.includes("setSupportMultipleWindows={false}"));
  assert(!source.includes("          setSupportMultipleWindows\n"));
  assert(source.includes("rewriteSessionNavigationUrl"));
  assert(source.includes("KEEP_SESSION_NAVIGATION_SCRIPT"));
  assert(source.includes('root.style.setProperty("visibility", "hidden", "important")'));
  assert(source.includes("Entrando no SIGECAD"));
  assert(source.includes("A sessão fica só neste aparelho"));
  assert(source.includes('loginBrandText}>SIGECAD</Text>'));
  assert(source.includes("loginBrandText: { color: \"#17201C\", fontFamily: fonts.monoSemibold, fontSize: 15, letterSpacing: 0.8, paddingRight: 6, flexShrink: 0 }"));
});

await check("letterSpacing no Android não corta a última letra", () => {
  const design = readFileSync(designSourcePath, "utf8");
  const ui = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/ui/components.tsx"), "utf8");
  const session = readFileSync(portalSessionSourcePath, "utf8");
  for (const blob of [design, ui, session]) {
    const hits = blob.match(/letterSpacing:[^,}]+/g) || [];
    for (const hit of hits) {
      const blockStart = blob.lastIndexOf("{", blob.indexOf(hit));
      const block = blob.slice(blockStart, blob.indexOf("}", blockStart) + 1);
      assert(block.includes("paddingRight"), `letterSpacing sem paddingRight: ${hit}`);
    }
  }
  assert(design.includes('logoSmall}>SIGECAD</Text>'));
});

await check("sessão reutiliza períodos e instala cada bridge uma vez por página", () => {
  const source = readFileSync(portalSessionSourcePath, "utf8");
  assert(source.includes("PERIOD_CACHE_TTL_MS = 5 * 60_000"));
  assert(source.includes("Date.now() - cachedPeriods.cachedAt < PERIOD_CACHE_TTL_MS"));
  assert(source.includes("const needsBootstrap = installedBridge.current !== revision"));
  assert(source.includes('installedBridge.current = null'));
  assert(source.includes("await execute(pendingIndices.shift() as number)"));
  assert(source.includes("Math.min(6, pendingIndices.length)"));
  assert(source.includes("[SIGECAD request] ${stage}: ${Date.now() - item.startedAt}ms"));
  assert(!source.includes("[SIGECAD request] ${numericId}"));
});

await check("bridge rejeita canal e JSON desconhecidos", () => {
  rejects(() => parseBridgeResponse("not-json"), PortalBridgeError);
  rejects(() => parseBridgeResponse(JSON.stringify({
    channel: "attacker",
    id: "req-1",
    ok: true,
    status: 200,
  })), PortalBridgeError);
});

await check("bridge limita tamanho de mensagem", () => {
  rejects(() => parseBridgeResponse("x".repeat(MAX_BRIDGE_MESSAGE_BYTES + 1)), PortalBridgeError);
});

await check("comando de bridge não aceita ID nem parâmetro injetável", () => {
  const command = buildBridgeCommand("req-7", "turmas", 12);
  assert(command.includes('"numericId":12'));
  rejects(() => buildBridgeCommand("req-1);alert(1)//", "periodos"), Error);
  rejects(() => buildBridgeCommand("req-1", "notas", -1), Error);
  assert(buildBridgeCommand("req-8", "card").includes('"kind":"card"'));
  assert(buildBridgeCommand("req-13", "card-summary").includes('"kind":"card-summary"'));
  rejects(() => buildBridgeCommand("req-14", "card-summary", 1), Error);
  assert(buildBridgeCommand("req-10", "card", 2).includes('"numericId":2'));
  rejects(() => buildBridgeCommand("req-11", "card", 0), Error);
  rejects(() => buildBridgeCommand("req-12", "card", 51), Error);
  assert(buildBridgeCommand("req-9", "historico").includes('"kind":"historico"'));
});

await check("ponte acadêmica mantém allowlist GET e nunca aceita caminho do chamador", () => {
  for (const path of [
    "/rest/periodosletivos", "/rest/turmas", "/rest/notas", "/rest/faltas",
    "/rest/matriculas", "/rest/horarios", "/rest/historico", "/rest/estrutura",
    "/rest/chcursada", "/rest/cursadascursando", "/rest/dadosacademico", "/rest/notificacoes",
    "/rest/planosensino",
  ]) assert(BRIDGE_BOOTSTRAP.includes(path), `rota ausente: ${path}`);
  assert(BRIDGE_BOOTSTRAP.includes('method: "GET"'));
  assert(!BRIDGE_BOOTSTRAP.includes("document.cookie"));
  assert(!BRIDGE_BOOTSTRAP.includes("request.path"));
  assert(!BRIDGE_BOOTSTRAP.includes("request.url"));
  assert(BRIDGE_BOOTSTRAP.includes('searchParams.get("documento")'));
  for (const discarded of ["endereco", "telefone", "nome_mae", "justificativa_aluno"]) {
    assert(!BRIDGE_BOOTSTRAP.includes(`"${discarded}"`), `campo pessoal atravessa a ponte: ${discarded}`);
  }
});

await check("documentos aceitam somente catálogo e planos devolvidos pela sessão", () => {
  const catalog = parseDocumentCatalog({
    enrollmentCertificate: { available: true, supportsSocialName: true },
    schoolTranscript: { available: true, supportsSocialName: false },
    teachingPlans: { available: true, supportsSocialName: false },
  });
  assert(catalog.enrollmentCertificate.supportsSocialName);
  const plans = parseTeachingPlans([
    { id: 17, codigo: "0700", disciplina: "ENGENHARIA DE SOFTWARE" },
  ]);
  assert(plans[0].id === 17 && plans[0].course === "ENGENHARIA DE SOFTWARE");
  rejects(() => parseTeachingPlans([{ id: 17, codigo: "A", disciplina: "A" }, { id: 17, codigo: "B", disciplina: "B" }]), Error);
  rejects(() => parseTeachingPlans(new Array(301).fill({ id: 1, codigo: "A", disciplina: "B" })), Error);
});

await check("planos são agrupados com semestre atual primeiro", () => {
  const ordered = orderTeachingPlanSections([
    { periodId: 10, periodName: "2025/2", current: false, plans: [] },
    { periodId: 12, periodName: "2026/2", current: false, plans: [] },
    { periodId: 11, periodName: "2026/1", current: true, plans: [] },
    { periodId: 9, periodName: "2025/1", current: false, plans: [] },
  ], 11);
  assert(ordered.map((section) => section.periodName).join(",") === "2026/1,2026/2,2025/2,2025/1");
});

await check("histórico expõe tipo da disciplina e ignora conceito na média oficial", () => {
  assert(BRIDGE_BOOTSTRAP.includes('"tipo_disciplina", "avaliacao"'));
  assert(matchesCourseType("OBRIGATÓRIA", "OBR"));
  assert(matchesCourseType("optativa", "OPT"));
  assert(matchesCourseType("ELT", "ELT"));
  assert(matchesCourseType("LEG", "all"));
  assert(!matchesCourseType("OPT", "OBR"));
  const averages = officialAveragesByType([
    { id: 1, term: "2025/1", code: "A", name: "A", hours: 72, grade: 8, result: "AP", absences: 0, type: "OBR", evaluation: "nota" },
    { id: 2, term: "2025/1", code: "B", name: "B", hours: 72, grade: 6, result: "AP", absences: 0, type: "OBR", evaluation: "nota" },
    { id: 3, term: "2025/1", code: "C", name: "C", hours: 72, grade: 10, result: "AP", absences: 0, type: "OPT", evaluation: "nota" },
    { id: 4, term: "2025/1", code: "D", name: "D", hours: 144, grade: 0, result: "AP", absences: 0, type: "OBR", evaluation: "conceito" },
    { id: 5, term: "2025/1", code: "E", name: "E", hours: 72, grade: 9.1, result: "AP", absences: 0, type: "ELT", evaluation: "nota" },
  ]);
  assert(averages.map((item) => `${item.type}:${item.average}:${item.count}`).join(",") === "OBR:7:2,OPT:10:1,ELT:9.1:1");
});

await check("planos de ensino antigos não carregam na abertura da tela", () => {
  const design = readFileSync(designSourcePath, "utf8");
  assert(design.includes("pendingPlanPeriods"));
  assert(design.includes("onEndReached"));
  assert(design.includes("Mais semestres"));
  assert(!design.includes("offset += 4"));
});

await check("comando de PDF não aceita caminho, ID ou plano injetável", () => {
  const command = buildDocumentBridgeCommand("doc-7", {
    kind: "teaching-plan", planId: 17, nameMode: "civil",
  });
  assert(command.includes('"kind":"teaching-plan"') && command.includes('"planId":17'));
  rejects(() => buildDocumentBridgeCommand("doc-7);alert(1)//", {
    kind: "school-transcript", nameMode: "civil",
  }), Error);
  rejects(() => buildDocumentBridgeCommand("doc-8", {
    kind: "teaching-plan", planId: -1, nameMode: "civil",
  }), Error);
});

await check("canal de PDF valida ordem e tamanho dos fragmentos", () => {
  const start = parseDocumentBridgeMessage(JSON.stringify({
    channel: DOCUMENT_BRIDGE_CHANNEL, id: "doc-2", type: "start", totalBytes: 5, totalChunks: 1,
  }));
  const chunk = parseDocumentBridgeMessage(JSON.stringify({
    channel: DOCUMENT_BRIDGE_CHANNEL, id: "doc-2", type: "chunk", index: 0, data: "JVBERg==",
  }));
  assert(start?.type === "start" && chunk?.type === "chunk");
  assert(base64DecodedBytes("JVBERg==") === 4);
  assert(parseDocumentBridgeMessage(JSON.stringify({
    channel: "attacker", id: "doc-2", type: "complete",
  })) === null);
  assert(parseDocumentBridgeMessage(JSON.stringify({
    channel: DOCUMENT_BRIDGE_CHANNEL, id: "doc-2", type: "chunk", index: -1, data: "JVBERg==",
  })) === null);
});

await check("download assinado aceita somente o Webdoc oficial e parâmetros estritos", () => {
  const valid = "https://webdoc.app.ufgd.edu.br/gerar?documento=Documento_12345678&hash=" + "a".repeat(32);
  assert(isAllowedSignedDocumentUrl(valid));
  const signed = parseDocumentBridgeMessage(JSON.stringify({
    channel: DOCUMENT_BRIDGE_CHANNEL, id: "doc-9", type: "signed-url", url: valid,
  }));
  assert(signed?.type === "signed-url" && signed.url === valid);
  assert(parseDocumentBridgeMessage(JSON.stringify({
    channel: DOCUMENT_BRIDGE_CHANNEL, id: "doc-9", type: "signed-url",
    url: valid.replace("webdoc.app.ufgd.edu.br", "attacker.invalid"),
  })) === null);
  assert(!isAllowedSignedDocumentUrl(valid.replace("webdoc.app.ufgd.edu.br", "attacker.invalid")));
  assert(!isAllowedSignedDocumentUrl(valid + "&next=https://attacker.invalid"));
  assert(!isAllowedSignedDocumentUrl(valid.replace("a".repeat(32), "not-a-hash")));
  assert(isPdfHeaderBase64("JVBERi0="));
  assert(!isPdfHeaderBase64("PGh0bWw="));
});

await check("ponte de documentos usa GET, PDF autenticado e registros internos", () => {
  assert(BRIDGE_BOOTSTRAP.includes("var documentLinks = null"));
  assert(BRIDGE_BOOTSTRAP.includes("var teachingPlanIds"));
  assert(BRIDGE_BOOTSTRAP.includes('request.kind === "document-catalog"'));
  assert(BRIDGE_BOOTSTRAP.includes('request.kind === "planosensino"'));
  assert(BRIDGE_BOOTSTRAP.includes('method: "GET"'));
  assert(BRIDGE_BOOTSTRAP.includes("bytes[0] !== 0x25") && BRIDGE_BOOTSTRAP.includes("bytes[4] !== 0x2d"));
  assert(BRIDGE_BOOTSTRAP.includes("totalChunks"));
  assert(BRIDGE_BOOTSTRAP.includes("captureSignedDocument"));
  assert(BRIDGE_BOOTSTRAP.includes("isSignedWebdoc"));
  assert(BRIDGE_BOOTSTRAP.includes("type: \"signed-url\""));
  assert(BRIDGE_BOOTSTRAP.includes("__SIGECAD_BRIDGE_VERSION__ = 5"));
  assert(BRIDGE_BOOTSTRAP.includes('"/graduacao/relatorios/planoensino?peID=" + request.planId'));
  assert(BRIDGE_BOOTSTRAP.includes("teachingPlanIds.has(request.planId)"));
  assert(!BRIDGE_BOOTSTRAP.includes("postOnlyPlan"));
  assert(!BRIDGE_BOOTSTRAP.includes("document.cookie"));
  assert(!BRIDGE_BOOTSTRAP.includes("request.path"));
  assert(!BRIDGE_BOOTSTRAP.includes("request.url"));
});

await check("Webdoc assinado é interceptado sem navegar nem expor parâmetros", () => {
  const source = readFileSync(portalSessionSourcePath, "utf8");
  assert(source.includes("isAllowedSignedDocumentUrl(url)"));
  assert(source.includes("shareSignedAcademicDocument(item.kind, url)"));
  assert(source.includes('item.kind === "teaching-plan"'));
  assert(source.includes("return false;"));
  assert(source.includes("consumeSignedDocumentUrl"));
  assert(source.includes("documentBrowserAndroid"));
  assert(source.includes("Preparando o PDF oficial"));
  assert(source.includes("onFileDownload={(event) => { consumeSignedDocumentUrl(event.nativeEvent.downloadUrl); }}"));
  assert(!source.includes("console.log(url)") && !source.includes("console.info(url)"));
});

await check("Home pinta antes de cartão, foto, extrato e dados secundários", () => {
  const source = readFileSync(designSourcePath, "utf8");
  const painted = source.indexOf('reportLoadTiming("home-painted"');
  const cardSummary = source.indexOf('loadStudentCardSummary(request)');
  const fullCard = source.indexOf('loadStudentCard(request)');
  const secondary = source.indexOf('hydrateAcademicNotes(academicRequest, startup)');
  assert(painted > 0 && painted < cardSummary && cardSummary < secondary && secondary < fullCard);
  assert(!source.includes("25 * (index % 4)"), "atraso artificial de notas voltou");
  assert(source.includes("<SectionList"));
  assert(source.includes('route === "documents"'));
});

await check("Documentos não cancelam a própria carga e consultam em um lote", () => {
  const source = readFileSync(designSourcePath, "utf8");
  assert(source.includes('{ kind: "document-catalog" }'));
  assert(source.includes('{ kind: "periodos" }'));
  assert(source.includes('{ kind: "planosensino", numericId: overview.period.id }'));
  assert(source.includes('}, [documentsLoaded, overview, requestBatch, route]);'));
  assert(!source.includes('[documentsLoaded, documentsLoading, overview, request, route]'));
  assert(source.includes("const plansAvailability: DocumentAvailability = totalPlans"));
  assert(source.includes("<SectionList"));
  assert(source.includes('section.current ? " · ATUAL"'));
  assert(source.includes("pendingPlanPeriods"));
  assert(source.includes("onEndReached"));
  assert(!source.includes("offset += 4"));
  assert(!source.includes("await nextFrame()"));
  assert(source.includes('reportLoadTiming("documents-current"'));
  assert(source.includes('reportLoadTiming("documents-complete"'));
});

await check("bridges injetados são JavaScript sintaticamente válido", () => {
  // `tsc` valida a string TypeScript, mas não compila o JavaScript que será
  // injetado no WKWebView. Este teste captura escapes inválidos em regexes.
  new Function(BRIDGE_BOOTSTRAP);
  new Function(CARD_BRIDGE_BOOTSTRAP);
});

await check("ponte de cartão deriva recursos da página e nunca lê cookie", () => {
  assert(CARD_BRIDGE_BOOTSTRAP.includes("visualiza_pessoa"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("var person = document"));
  assert(!CARD_BRIDGE_BOOTSTRAP.includes('checked("/cartoes_usuario/visualiza_pessoa"'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("statusBalance(statusDoc"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("waitForCardLink(person)"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("attempt < 40"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('optionalChecked(link, false, "")'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("cartao-status-fallback"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("cartao-saldos-fallback"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("listagem_extrato_ajax_ru"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("listagem_extrato_ajax_cantina"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('"&pagina=" + page'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("bytes[0] === 0xff"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('new Blob([best.bytes], { type: best.jpeg ? "image/jpeg" : "image/png" })'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('response.body.getReader()'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('total > MAX_PHOTO_BYTES'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('"/foto/" + match[1]'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('"/2048/2048"'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('"/1024/1024"'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("imageDimensions"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("b.width * b.height"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("optionalChecked(ruPath"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("optionalChecked(canteenPath"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("message === \"AUTH\" || message === \"ORIGIN\""));
  assert(CARD_BRIDGE_BOOTSTRAP.includes('request.kind === "card-summary"'));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("var summaryContext = null"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("cartao-contexto-reutilizado"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("perfStartedAt = Date.now()"));
  assert(CARD_BRIDGE_BOOTSTRAP.includes("barcodeValue: number ? number[0] : null"));
  for (const status of ["not-found", "invalid-url", "http-error", "too-large", "invalid-image", "read-error", "not-requested"]) {
    assert(CARD_BRIDGE_BOOTSTRAP.includes(`"${status}"`), `status de foto ausente: ${status}`);
  }
  assert(!CARD_BRIDGE_BOOTSTRAP.includes("document.cookie"));
  assert(!CARD_BRIDGE_BOOTSTRAP.includes("request.statusId"));
  assert(!CARD_BRIDGE_BOOTSTRAP.includes("request.resourceHash"));
});

await check("nomes em caixa alta são normalizados só para exibição", () => {
  assert(formatPersonName("  JOÃO   DA SILVA JÚNIOR ") === "João da Silva Júnior");
  assert(formatPersonName(null) === null);
  assert(formatAcademicName("BANCO DE DADOS I") === "Banco de Dados I");
  assert(formatAcademicName("TÓPICOS EM IA") === "Tópicos em IA");
  assert(formatCourseName("0712 - ENGENHARIA DE COMPUTAÇÃO - BACHARELADO") === "Engenharia de Computação · Bacharelado");
  assert(formatScheduleSlot(" 15:00 - 16:40 ") === "15:00–16:40");
  assert(formatScheduleRoom("208") === "Sala 208");
  assert(formatScheduleRoom("Sala 208") === "Sala 208");
  assert(formatScheduleRoom("") === null);
  assert(nextClassContext(5, 4) === "PRÓXIMA AULA · AMANHÃ");
  assert(nextClassContext(1, 4) === "PRÓXIMA AULA · SEG");
});

await check("próxima aula mostra sala e intervalo completo", () => {
  const source = readFileSync(designSourcePath, "utf8");
  assert(source.includes("formatScheduleRoom(next?.room)"));
  assert(source.includes("formatScheduleSlot(next?.slot)"));
  assert(!source.includes("next?.slot.split(/[–-]/)[0]?.trim()"));
});

await check("próxima aula respeita fim real e virada da semana", () => {
  const entry = (day: number, slot: string, course: string) => ({
    day, slot, course, section: "T1", room: "", building: "", unit: "", professor: "",
  });
  const thursday = new Date(2026, 6, 16, 15, 30);
  const current = entry(4, "15:00–16:40", "Atual");
  const friday = entry(5, "07:20–09:00", "Amanhã");
  const monday = entry(1, "09:00–10:40", "Segunda");
  assert(currentSchedule([current], thursday) === current);
  assert(currentSchedule([entry(4, "15:00–15:20", "Encerrada")], thursday) === null);
  assert(nextSchedule([monday, friday, current], current, thursday) === friday);
  const afterFriday = new Date(2026, 6, 17, 18, 0);
  assert(nextSchedule([friday, monday], null, afterFriday) === monday);
});

await check("avaliação publicada sem valor não vira notificação", () => {
  assert(!hasPublishedValue({ published: true, value: null }));
  assert(!hasPublishedValue({ published: true, value: "" }));
  assert(!hasPublishedValue({ published: true, value: "—" }));
  assert(!hasPublishedValue({ published: false, value: 8 }));
  assert(hasPublishedValue({ published: true, value: 8 }));
  assert(hasPublishedValue({ published: true, value: "8,5" }));
});

await check("UI não inventa média simples sem pesos", () => {
  const assessments = [
    { published: true, value: 4 },
    { published: true, value: 10 },
  ];
  assert(courseDisplayValue({ finalGrade: null, assessments }) === 10);
  assert(courseDisplayValue({ finalGrade: 7.5, assessments }) === 7.5);
  assert(publishedAssessmentsCount([{ assessments }]) === 2);
});

await check("resultado final encerra faltas e horários, MAT continua ativo", () => {
  for (const result of ["AP", "RP", "APE", "RPF", "ap - aprovado"]) {
    assert(isFinishedCourse({ result }), `resultado final não reconhecido: ${result}`);
  }
  assert(!isFinishedCourse({ result: "MAT" }));
  assert(!isFinishedCourse({ result: null }));
  const base = {
    enrollmentId: 1, code: "A", name: "Cálculo II", section: "T1",
    absences: 2, absenceLimit: 18, totalHours: 72, approvalAverage: 6,
    finalGrade: null, formula: null, assessments: [],
  };
  const schedule = [{ day: 2, slot: "15:00–16:40", course: "Calculo II", section: "T1", room: "1", building: "", unit: "", professor: "" }];
  assert(activeScheduleEntries(schedule, [{ ...base, result: "AP" }]).length === 0);
  assert(activeScheduleEntries(schedule, [{ ...base, result: "AP" }, { ...base, enrollmentId: 2, result: "MAT" }]).length === 1);
});

await check("refeições do cartão ignoram recargas e fixam Cantina em R$ 2", () => {
  const transactions = [
    { date: "1", time: "", type: "Almoço", value: "− 3,50", merchant: "RU" },
    { date: "2", time: "", type: "Jantar", value: "R$ 3,50", merchant: "RU" },
    { date: "3", time: "", type: "Débito", value: "3,50", merchant: "RU" },
    { date: "4", time: "", type: "Recarga", value: "+ 20,00", merchant: "RU" },
  ];
  const ru = buildSpendingInsight("R$ 23,50", transactions, "ru");
  assert(ru.typicalCents === 350 && ru.estimatedUses === 6);
  assert(ru.exactTopUpCents === 100 && ru.usesAfterTopUp === 7);
  const canteen = buildSpendingInsight("R$ 10,00", [
    { date: "1", time: "", type: "Compra", value: "2,00", merchant: "Cantina" },
    { date: "2", time: "", type: "Compra", value: "5,00", merchant: "Cantina" },
    { date: "3", time: "", type: "Compra", value: "8,00", merchant: "Cantina" },
  ], "canteen");
  assert(canteen.typicalCents === 200 && canteen.estimatedUses === 5);
  assert(canteen.exactTopUpCents === 0 && canteen.usesAfterTopUp === 5);
  assert(parseMoneyCents("R$ 1.234,56") === 123456 && formatMoneyCents(100).replace(/\s/g, "") === "R$1,00");
});

await check("validadores normalizam respostas reais", () => {
  const periods = parsePeriodos([{ id: "9", nome: "2026 - 1", data_inicio: "2026-01-01T00:00:00" }]);
  const courses = parseTurmas([{
    id: "3",
    matricula_id: 44,
    codigo: 700,
    turma: "T1",
    disciplina: "Segurança",
    resultado: null,
    faltas: "2",
    limite_faltas: 18,
    ch_total: 72,
    tem_notas: 1,
  }]);
  const notes = parseNotas({ media_aprovacao: 6, formula: "(P1+P2)/2", notas: [{ nome: "P1", valor: 9.5, publicar: 1 }] });
  assert(periods[0].id === 9 && periods[0].nome === "2026/1");
  assert(courses[0].faltas === 2 && courses[0].tem_notas && courses[0].ch_total === 72);
  assert(notes.notas[0].publicar && notes.notas[0].valor === 9.5 && notes.media_aprovacao === 6);
});

await check("validadores recusam payloads abusivos", () => {
  rejects(() => parsePeriodos(new Array(101).fill({ id: 1, nome: "X" })), DataValidationError);
  rejects(() => parseTurmas([{ id: 1, matricula_id: 2, codigo: "X", turma: "T", disciplina: "\u0000", tem_notas: false }] ), DataValidationError);
  rejects(() => parseNotas({ notas: [{ nome: "P1", valor: "x".repeat(101), publicar: true }] }), DataValidationError);
});

await check("cliente acadêmico usa apenas as três operações REST permitidas", async () => {
  const calls: string[] = [];
  const client = new ExpoGoPollClient(async (kind, id) => {
    calls.push(`${kind}:${id ?? ""}`);
    if (kind === "periodos") return [{ id: 1, nome: "2026/1" }];
    if (kind === "turmas") return [];
    return { notas: [] };
  });
  await client.periodos();
  await client.turmas(1);
  await client.notas(2);
  assert(calls.join(",") === "periodos:,turmas:1,notas:2", calls.join(","));
});

await check("carga rápida agrupa notas e consultas acadêmicas simultâneas", async () => {
  const batches: string[][] = [];
  const direct: PortalRequest = async (kind) => {
    if (kind === "periodos") return [{ id: 1, nome: "2026/1" }];
    if (kind === "turmas") return [
      { id: 1, matricula_id: 11, codigo: "A", turma: "T1", disciplina: "A", tem_notas: true },
      { id: 2, matricula_id: 12, codigo: "B", turma: "T1", disciplina: "B", tem_notas: true },
    ];
    return { notas: [] };
  };
  const batch: PortalBatchRequest = async (items) => {
    batches.push(items.map((item) => `${item.kind}:${item.numericId ?? ""}`));
    return items.map(() => ({ status: "fulfilled", value: { notas: [] } }) as PromiseFulfilledResult<unknown>);
  };
  const overview = await loadAcademicOverviewFast(direct, batch);
  assert(overview.courses.length === 2);
  assert(batches[0].join(",") === "notas:11,notas:12");

  const coalesced = createBatchedPortalRequest(batch);
  await Promise.all([coalesced("horarios", 1), coalesced("matriculas", 1)]);
  assert(batches[1].join(",") === "horarios:1,matriculas:1");
});

await check("startup mostra Home sem esperar pelas notas", async () => {
  const batches: string[][] = [];
  const direct: PortalRequest = async (kind) => {
    assert(kind === "periodos");
    return [{ id: 9, nome: "2026/1" }];
  };
  const batch: PortalBatchRequest = async (items) => {
    batches.push(items.map((item) => `${item.kind}:${item.numericId ?? ""}`));
    return items.map((item) => {
      let value: unknown;
      if (item.kind === "dadosacademico") value = { nome: "ALUNO TESTE", curso: "Computação" };
      else if (item.kind === "turmas") value = [
        { id: 1, matricula_id: 11, codigo: "A", turma: "T1", disciplina: "A", tem_notas: true },
      ];
      else if (item.kind === "horarios") value = [];
      else if (item.kind === "notificacoes") value = { operacoes: [] };
      else value = { notas: [] };
      return { status: "fulfilled", value } as PromiseFulfilledResult<unknown>;
    });
  };
  const startup = await loadAcademicStartupFast(direct, batch);
  const portal = portalDataFromStartup(startup.portal);
  assert(batches[0].join(",") === "dadosacademico:,turmas:9,horarios:9,notificacoes:");
  assert(batches.length === 1, `lote inesperado no caminho crítico: ${batches.slice(1).join("|")}`);
  assert(startup.overview.courses.length === 1 && portal.profile?.name === "ALUNO TESTE");
  assert(startup.overview.courses[0].assessments.length === 0);

  const academic = createBatchedPortalRequest(batch);
  const [notes, history] = await Promise.all([
    hydrateAcademicNotes(academic, startup),
    academic("historico"),
  ]);
  assert(batches[1].join(",") === "notas:11,historico:");
  assert(notes.complete && notes.overview.courses.length === 1);
  assert(history !== null);
});

await check("falha parcial de notas não produz snapshot completo", async () => {
  const startup = {
    overview: {
      period: { id: 9, nome: "2026/1" }, courses: [], items: {}, labels: {}, checkedAt: new Date(0).toISOString(),
    },
    courses: [
      { id: 1, matricula_id: 11, codigo: "A", turma: "T1", disciplina: "A", resultado: null, faltas: null, tem_notas: true },
      { id: 2, matricula_id: 12, codigo: "B", turma: "T1", disciplina: "B", resultado: null, faltas: null, tem_notas: true },
    ],
  };
  const result = await hydrateAcademicNotes(async (_kind, id) => {
    if (id === 12) throw new Error("portal indisponível");
    return { notas: [{ nome: "P1", valor: 8, publicar: true }] };
  }, startup);
  assert(!result.complete);
  assert(result.overview.courses[0].assessments.length === 1);
  assert(result.overview.courses[1].assessments.length === 0);
});

await check("telas adicionais consultam somente período e matrículas devolvidos pela sessão", async () => {
  const calls: string[] = [];
  const data = await loadPortalData(async (kind, id) => {
    calls.push(`${kind}:${id ?? ""}`);
    if (kind === "faltas") return [{ mes: "Julho", faltas: [{ id: 1, data: "15/07/2026", hora: "15:00" }] }];
    if (kind === "horarios") return [{ horario: "15:00–16:40", segunda: [{ disciplina: "Teste", turma: "T1", sala: "208" }], terca: [], quarta: [], quinta: [], sexta: [], sabado: [] }];
    if (kind === "matriculas") return [{ id: 7, codigo: "FCE-1", disciplina: "Teste", turma: "T1", situacao: 1, etapa: "M1" }];
    if (kind === "historico") return [{ ano_semestre: "2025/2", historico: [{ id: 8, ano: 2025, semestre: 2, codigo_disciplina: "FCE-0", nome_disciplina: "Anterior", nota: 8, resultado: "Aprovado" }] }];
    if (kind === "estrutura") return { curso: "Teste", estrutura: "2022", faculdade: "Faculdade", grades: [{ id: 9, disciplina_id: 9, codigo_disciplina: "FCE-0", nome_disciplina: "Anterior", ch_total: 72 }] };
    if (kind === "chcursada") return { ch_total_academico: 72, ch_total_curso: 2400 };
    if (kind === "cursadascursando") return { cursadas: [{ disciplina_id: 9 }], cursando: [] };
    if (kind === "dadosacademico") return { nome: "Aluno", rga: "20251904021300", curso: "Teste", ano_ultima_ocorrencia: 2026, semestre_ultima_ocorrencia: 1, percentual_concluido: 3 };
    if (kind === "notificacoes") return { operacoes: [{ id: 10, etapa_matricula: "MATRICULAETAPA4", data_inicio: "15/07/2026", data_fim: "18/07/2026" }] };
    throw new Error(`operação inesperada: ${kind}`);
  }, {
    period: { id: 222, nome: "2026/1" },
    courses: [{
      enrollmentId: 1691172, code: "FCE-1", name: "Teste", section: "T1",
      result: null, absences: 0, absenceLimit: 18, totalHours: 72,
      approvalAverage: 6, finalGrade: null, formula: null, assessments: [],
    }, {
      enrollmentId: 1691173, code: "FCE-2", name: "Encerrada", section: "T1",
      result: "AP", absences: 2, absenceLimit: 18, totalHours: 72,
      approvalAverage: 6, finalGrade: 8, formula: null, assessments: [],
    }],
    items: {}, labels: {}, checkedAt: new Date(0).toISOString(),
  });
  assert(calls.includes("horarios:222") && calls.includes("matriculas:222"));
  assert(calls.includes("faltas:1691172"));
  assert(!calls.some((call) => /administrador|faltas:1691173/.test(call)), calls.join(","));
  assert(data.profile?.name === "Aluno" && data.profile.admission === "2025/2");
  assert(data.enrollmentWindows[0].label === "Matrícula · etapa 4", `rótulo: ${data.enrollmentWindows[0]?.label}`);
  assert(data.schedule[0].room === "208" && data.enrollments[0].status === "Deferida");
  assert(data.history[0].grade === 8 && data.curriculum[0].status === "done");
  assert(data.absences["FCE-1::T1"][0].time === "15:00");
});

await check("progresso prioriza a carga oficial do histórico", () => {
  const workload = {
    requiredDone: 0, requiredTotal: 0, optionalDone: 0, optionalTotal: 0,
    extensionDone: 0, extensionTotal: 0, totalDone: 1480, totalRequired: 2400,
  };
  assert(resolveCourseProgress(12, workload) === 1480 / 2400 * 100);
  assert(resolveCourseProgress(62, null) === 62);
  assert(resolveCourseProgress(null, { ...workload, totalDone: 0, totalRequired: 0 }) === null);
  assert(resolveCourseProgress(150, null) === 100);
});

await check("cartão aceita somente dados sanitizados e código numérico", () => {
  const card = parseStudentCard({
    name: "ALUNO TESTE",
    course: "COMPUTAÇÃO",
    active: "Sim",
    cardLast4: "7890",
    barcodeValue: "1234567890",
    version: "Via 1",
    page: 2,
    ruBalance: "R$ 5,80",
    canteenBalance: "R$ 4,00",
    photoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    photoStatus: "ok",
    photoWidth: 1200,
    photoHeight: 1600,
    photoVariant: "original",
    ruTransactions: [{ date: "15/07/2026", time: "12:30", type: "Débito", value: "R$ 1,00", merchant: "RU" }],
    canteenTransactions: [],
  });
  assert(card.cardLast4 === "7890" && card.barcodeValue === "1234567890");
  assert(card.ruTransactions[0].merchant === "RU" && card.page === 2 && card.photoStatus === "ok");
  rejects(() => parseStudentCard({
    cardLast4: "1234567890",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
  for (const barcodeValue of ["12345", "1234<script>", "1".repeat(25)]) {
    rejects(() => parseStudentCard({
      barcodeValue,
      ruTransactions: [],
      canteenTransactions: [],
    }), DataValidationError);
  }
});

await check("paginação do cartão só aceita páginas limitadas", async () => {
  let requestedPage = 0;
  const page = await loadStudentCardPage(async (kind, id) => {
    assert(kind === "card");
    requestedPage = id ?? 0;
    return { page: id, ruTransactions: [], canteenTransactions: [] };
  }, 3);
  assert(requestedPage === 3 && page.page === 3);
  let rejected = false;
  try { await loadStudentCardPage(async () => ({}), 51); } catch (cause) { rejected = cause instanceof DataValidationError; }
  assert(rejected, "página acima do limite foi aceita");
});

await check("resumo prioritário do cartão não espera foto nem extrato", async () => {
  let requested = "";
  const card = await loadStudentCardSummary(async (kind) => {
    requested = kind;
    return { ruBalance: "R$ 12,34", photoStatus: "not-requested", ruTransactions: [], canteenTransactions: [] };
  });
  assert(requested === "card-summary");
  assert(card.ruBalance === "R$ 12,34" && card.photoDataUrl === null && card.ruTransactions.length === 0);
});

await check("resumo do cartão preserva mídia e extrato já hidratados", () => {
  const hydrated = parseStudentCard({
    name: "Aluno", course: "Curso", active: "Ativo", cardLast4: "1234",
    barcodeValue: "20220001234", version: "Via 1", ruBalance: "R$ 5,80",
    canteenBalance: "R$ 4,00", photoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    photoStatus: "ok", photoWidth: 1, photoHeight: 1, photoVariant: "original",
    page: 1, ruTransactions: [{ date: "1", time: "", type: "RU", value: "- 3,50", merchant: "RU" }],
    canteenTransactions: [],
  });
  const summary = parseStudentCard({
    name: "Aluno Atualizado", course: null, active: null, cardLast4: null,
    barcodeValue: null, version: null, ruBalance: "R$ 9,30", canteenBalance: null,
    photoDataUrl: null, photoStatus: "not-requested", photoWidth: null,
    photoHeight: null, photoVariant: null, page: 1, ruTransactions: [],
    canteenTransactions: [],
  });
  const merged = mergeStudentCardSummary(hydrated, summary);
  assert(merged.name === "Aluno Atualizado" && merged.ruBalance === "R$ 9,30");
  assert(merged.photoDataUrl === hydrated.photoDataUrl && merged.barcodeValue === hydrated.barcodeValue);
  assert(merged.ruTransactions.length === 1, "resumo apagou extrato hidratado");
});

await check("cartão limita extrato e rejeita imagem externa", () => {
  rejects(() => parseStudentCard({
    photoDataUrl: "https://attacker.invalid/photo.jpg",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
  rejects(() => parseStudentCard({
    ruTransactions: new Array(41).fill({ date: "15/07/2026" }),
    canteenTransactions: [],
  }), DataValidationError);
  rejects(() => parseStudentCard({
    photoStatus: "ok",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
  rejects(() => parseStudentCard({
    photoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    photoStatus: "not-found",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
  rejects(() => parseStudentCard({
    photoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    photoStatus: "ok",
    photoWidth: 20000,
    photoHeight: 100,
    photoVariant: "external",
    ruTransactions: [],
    canteenTransactions: [],
  }), DataValidationError);
});

await check("diagnóstico agregado não expõe dados pessoais nem valores", () => {
  const secretName = "PRIVATE-NAME-SENTINEL";
  const secretGrade = "PRIVATE-GRADE-SENTINEL";
  const secretBalance = "R$ 987.654,32";
  const secretBarcode = "987654321098";
  const overview = {
    period: { id: 10, nome: "2026/1" },
    courses: [{
      enrollmentId: 99, code: "SECRET-CODE", name: "SECRET-COURSE", section: "T1",
      result: null, absences: 1, absenceLimit: 18, totalHours: 72,
      approvalAverage: 6, finalGrade: secretGrade, formula: null,
      assessments: [{ name: "SECRET-ASSESSMENT", value: secretGrade, published: true }],
    }],
    items: {}, labels: {}, checkedAt: new Date(0).toISOString(),
  };
  const portal = emptyPortalData();
  portal.profile = { name: secretName, rga: "SECRET-RGA", course: "SECRET-COURSE", faculty: null, facultyCode: null, admission: null, status: null, progress: null, structure: null };
  const card = parseStudentCard({
    name: secretName, course: "SECRET-COURSE", ruBalance: secretBalance, barcodeValue: secretBarcode,
    photoStatus: "not-found", ruTransactions: [], canteenTransactions: [],
  });
  const serialized = JSON.stringify(buildSafeDiagnostics(overview, card, portal, false));
  for (const sensitive of [secretName, secretGrade, secretBalance, secretBarcode, "SECRET-RGA", "SECRET-CODE", "SECRET-COURSE", "SECRET-ASSESSMENT"]) {
    assert(!serialized.includes(sensitive), `diagnóstico vazou: ${sensitive}`);
  }
  assert(serialized.includes("1 disciplina(s) validada(s)"));
  for (const label of ["Notas", "Carga horária", "Saldos do cartão", "Extratos", "Código de barras"]) {
    assert(serialized.includes(label), `diagnóstico não cobre: ${label}`);
  }
  assert(serialized.includes("Persistência sensível"));
});

await check("visão mostra nota em memória mas snapshot persiste só hash", async () => {
  const sensitiveGrade = "9.75-SENSITIVE";
  const overview = await loadAcademicOverview({
    async periodos() {
      return [{ id: 10, nome: "2026/1", data_inicio: "2020-01-01", data_fim: "2099-12-31" }];
    },
    async turmas() {
      return [{
        id: 1,
        matricula_id: 99,
        codigo: "0700",
        turma: "T1",
        disciplina: "Testes",
        resultado: null,
        faltas: 1,
        limite_faltas: 18,
        tem_notas: true,
      }];
    },
    async notas() {
      return { notas: [{ nome: "P1", valor: sensitiveGrade, publicar: true }] };
    },
  }, async () => undefined);

  assert(overview.courses[0].assessments[0].value === sensitiveGrade);
  const persistedShape = JSON.stringify({ items: overview.items, labels: overview.labels });
  assert(!persistedShape.includes(sensitiveGrade), "snapshot vazou o valor da nota");
  assert(Object.values(overview.items).every((item) => /^[a-f0-9]{16}$/.test(item.hash)));
});

console.log(`\n${total - failures}/${total} passaram`);
process.exit(failures ? 1 : 0);
}

void main();
