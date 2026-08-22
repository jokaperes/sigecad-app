import type { AcademicOverview } from "../core/academic";
import type { PhotoStatus, StudentCard } from "./card";
import type { PortalData } from "./portalData";

export interface SafeDiagnosticRow {
  label: string;
  state: "ok" | "warning" | "error";
  detail: string;
}


export function buildSafeDiagnostics(
  overview: AcademicOverview | null,
  card: StudentCard | null,
  portal: PortalData,
  cardUnavailable: boolean,
  detailsLoading = false,
): SafeDiagnosticRow[] {
  const absenceCount = Object.values(portal.absences)
    .reduce((total, entries) => total + entries.length, 0);
  const assessmentCount = overview?.courses.reduce(
    (total, course) => total + course.assessments.length, 0,
  ) ?? 0;
  const balanceCount = card ? Number(Boolean(card.ruBalance)) + Number(Boolean(card.canteenBalance)) : 0;
  const transactionCount = card ? card.ruTransactions.length + card.canteenTransactions.length : 0;
  const notesUnavailable = portal.unavailable.includes("notas") ||
    portal.unavailable.includes("dados acadêmicos detalhados");
  const partialFailures = portal.unavailable.length;
  return [
    row("Sessão acadêmica", Boolean(overview), overview ? "respostas principais validadas" : "sem visão acadêmica"),
    row("Turmas", Boolean(overview), overview ? `${overview.courses.length} disciplina(s) validada(s)` : "indisponível"),
    {
      label: "Notas",
      state: detailsLoading ? "warning" : notesUnavailable ? "error" : overview ? "ok" : "error",
      detail: detailsLoading ? "carregando respostas detalhadas" : notesUnavailable
        ? "resposta parcial ou indisponível"
        : `${assessmentCount} avaliação(ões) validada(s)`,
    },
    row("Horários", portal.schedule.length > 0, `${portal.schedule.length} bloco(s) validado(s)`, true),
    row("Faltas detalhadas", absenceCount > 0, `${absenceCount} registro(s) validado(s)`, true),
    row("Histórico", portal.history.length > 0, `${portal.history.length} item(ns) validado(s)`, true),
    row("Estrutura curricular", portal.curriculum.length > 0, `${portal.curriculum.length} disciplina(s) validada(s)`, true),
    row("Carga horária", Boolean(portal.workload), portal.workload ? "totais validados" : "ainda sem resposta", true),
    row("Matrícula", portal.enrollments.length > 0 || portal.enrollmentWindows.length > 0,
      `${portal.enrollments.length} solicitação(ões); ${portal.enrollmentWindows.length} janela(s)`, true),
    {
      label: "Portal Cartão",
      state: cardUnavailable ? "error" : card ? "ok" : "warning",
      detail: cardUnavailable ? "indisponível nesta tentativa" : card ? "resposta sanitizada validada" : "ainda sem resposta",
    },
    row("Saldos do cartão", balanceCount > 0, `${balanceCount}/2 saldo(s) validado(s)`, true),
    row("Extratos", transactionCount > 0, `${transactionCount} movimentação(ões) validada(s)`, true),
    row("Código de barras", Boolean(card?.barcodeValue), card?.barcodeValue ? "sequência numérica validada" : "indisponível", true),
    {
      label: "Foto",
      state: card?.photoStatus === "ok" ? "ok" : card ? "warning" : "error",
      detail: photoStatusLabel(card?.photoStatus ?? "not-requested"),
    },
    {
      label: "Falhas parciais",
      state: partialFailures === 0 ? "ok" : "warning",
      detail: partialFailures === 0 ? "nenhuma nesta carga" : `${partialFailures} conjunto(s) indisponível(is)`,
    },
    { label: "Persistência sensível", state: "ok", detail: "nenhum dado acadêmico gravado" },
  ];
}

export function photoStatusLabel(status: PhotoStatus): string {
  switch (status) {
    case "ok": return "imagem validada e carregada";
    case "not-found": return "a página não informou uma foto";
    case "invalid-url": return "a URL retornada não passou na validação";
    case "http-error": return "o servidor da foto não respondeu";
    case "too-large": return "imagem vazia ou acima do limite seguro";
    case "invalid-image": return "conteúdo sem assinatura JPEG/PNG";
    case "read-error": return "falha ao converter a imagem em memória";
    case "render-error": return "o aparelho não conseguiu renderizar a imagem";
    case "not-requested": return "foto ainda não consultada";
  }
}

function row(
  label: string,
  available: boolean,
  detail: string,
  emptyCanBeValid = false,
): SafeDiagnosticRow {
  return {
    label,
    state: available ? "ok" : emptyCanBeValid ? "warning" : "error",
    detail,
  };
}
