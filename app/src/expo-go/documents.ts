export const DOCUMENT_BRIDGE_CHANNEL = "sigecad-document-v1";
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_CHUNK_BASE64 = 300_000;

export type AcademicDocumentKind =
  | "enrollment-certificate"
  | "school-transcript"
  | "teaching-plan";

export type DocumentNameMode = "civil" | "social";

export interface DocumentAvailability {
  available: boolean;
  supportsSocialName: boolean;
}

export interface AcademicDocumentCatalog {
  enrollmentCertificate: DocumentAvailability;
  schoolTranscript: DocumentAvailability;
  teachingPlans: DocumentAvailability;
}

export interface TeachingPlanSummary {
  id: number;
  code: string;
  course: string;
}

export interface TeachingPlanSection {
  periodId: number;
  periodName: string;
  current: boolean;
  plans: TeachingPlanSummary[];
}

export function orderTeachingPlanSections(
  sections: TeachingPlanSection[],
  currentPeriodId: number,
): TeachingPlanSection[] {
  return [...sections].sort((left, right) => {
    if (left.periodId === currentPeriodId) return -1;
    if (right.periodId === currentPeriodId) return 1;
    const rankDifference = teachingPeriodRank(right.periodName, right.periodId) -
      teachingPeriodRank(left.periodName, left.periodId);
    return rankDifference || right.periodId - left.periodId;
  });
}

export interface AcademicDocumentRequest {
  kind: AcademicDocumentKind;
  planId?: number;
  nameMode: DocumentNameMode;
}

export type DocumentBridgeMessage =
  | {
    channel: typeof DOCUMENT_BRIDGE_CHANNEL;
    id: string;
    type: "start";
    totalBytes: number;
    totalChunks: number;
  }
  | {
    channel: typeof DOCUMENT_BRIDGE_CHANNEL;
    id: string;
    type: "chunk";
    index: number;
    data: string;
  }
  | {
    channel: typeof DOCUMENT_BRIDGE_CHANNEL;
    id: string;
    type: "complete";
  }
  | {
    channel: typeof DOCUMENT_BRIDGE_CHANNEL;
    id: string;
    type: "error";
    error: "auth" | "unavailable" | "invalid" | "too-large" | "network";
  };

export function parseDocumentCatalog(value: unknown): AcademicDocumentCatalog {
  const root = record(value, "catálogo de documentos");
  return {
    enrollmentCertificate: availability(root.enrollmentCertificate),
    schoolTranscript: availability(root.schoolTranscript),
    teachingPlans: availability(root.teachingPlans),
  };
}

export function parseTeachingPlans(value: unknown): TeachingPlanSummary[] {
  if (!Array.isArray(value) || value.length > 300) {
    throw new Error("Lista de planos de ensino inválida.");
  }
  const seen = new Set<number>();
  return value.map((raw) => {
    const item = record(raw, "plano de ensino");
    const id = positiveInteger(item.id, "Plano de ensino sem identificador válido.");
    if (seen.has(id)) throw new Error("Plano de ensino duplicado.");
    seen.add(id);
    return {
      id,
      code: requiredText(item.codigo, 80, "Código de plano de ensino inválido."),
      course: requiredText(item.disciplina, 300, "Disciplina de plano de ensino inválida."),
    };
  });
}

export function buildDocumentBridgeCommand(
  id: string,
  request: AcademicDocumentRequest,
): string {
  if (!/^doc-[0-9]{1,10}$/.test(id)) throw new Error("ID de documento inválido.");
  const allowedKinds: AcademicDocumentKind[] = [
    "enrollment-certificate",
    "school-transcript",
    "teaching-plan",
  ];
  if (!allowedKinds.includes(request.kind)) throw new Error("Documento inválido.");
  if (request.nameMode !== "civil" && request.nameMode !== "social") {
    throw new Error("Modo de nome inválido.");
  }
  if (request.kind === "teaching-plan") {
    if (!Number.isSafeInteger(request.planId) || (request.planId ?? 0) <= 0) {
      throw new Error("Plano de ensino inválido.");
    }
  } else if (request.planId !== undefined) {
    throw new Error("Documento não aceita plano de ensino.");
  }
  const payload = JSON.stringify({
    id,
    kind: request.kind,
    planId: request.planId ?? null,
    nameMode: request.nameMode,
  });
  return `window.__SIGECAD_DOCUMENT__(${payload}); true;`;
}

export function parseDocumentBridgeMessage(raw: string): DocumentBridgeMessage | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_DOCUMENT_CHUNK_BASE64 + 2_000) {
    return null;
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.channel !== DOCUMENT_BRIDGE_CHANNEL ||
    typeof item.id !== "string" || !/^doc-[0-9]{1,10}$/.test(item.id)) return null;
  if (item.type === "start") {
    if (!Number.isSafeInteger(item.totalBytes) || (item.totalBytes as number) <= 0 ||
      (item.totalBytes as number) > MAX_DOCUMENT_BYTES ||
      !Number.isSafeInteger(item.totalChunks) || (item.totalChunks as number) <= 0 ||
      (item.totalChunks as number) > 64) return null;
    return item as unknown as DocumentBridgeMessage;
  }
  if (item.type === "chunk") {
    if (!Number.isSafeInteger(item.index) || (item.index as number) < 0 ||
      typeof item.data !== "string" || item.data.length === 0 ||
      item.data.length > MAX_DOCUMENT_CHUNK_BASE64 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)) return null;
    return item as unknown as DocumentBridgeMessage;
  }
  if (item.type === "complete") return item as unknown as DocumentBridgeMessage;
  if (item.type === "error" && typeof item.error === "string" &&
    ["auth", "unavailable", "invalid", "too-large", "network"].includes(item.error)) {
    return item as unknown as DocumentBridgeMessage;
  }
  return null;
}

export function base64DecodedBytes(value: string): number {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return -1;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return value.length / 4 * 3 - padding;
}

export function isPdfHeaderBase64(value: string): boolean {
  return value === "JVBERi0=";
}

export function isAllowedSignedDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "webdoc.app.ufgd.edu.br" || url.pathname !== "/gerar") {
      return false;
    }
    const keys = [...url.searchParams.keys()].sort();
    if (keys.join(",") !== "documento,hash") return false;
    const documentId = url.searchParams.get("documento") ?? "";
    const hash = url.searchParams.get("hash") ?? "";
    return documentId.length >= 8 && documentId.length <= 40 && /^[A-Za-z0-9_-]+$/.test(documentId) &&
      /^[a-f0-9]{32}$/i.test(hash);
  } catch {
    return false;
  }
}

export async function cleanupAcademicDocumentCache(): Promise<void> {
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const root = documentCacheRoot(FileSystem.cacheDirectory);
    const info = await FileSystem.getInfoAsync(root);
    if (!info.exists) return;
    const names = await FileSystem.readDirectoryAsync(root);
    await Promise.all(names.filter((name) => /^[a-z-]+-[0-9]+-[a-z0-9]+\.pdf$/.test(name))
      .map((name) => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true })));
  } catch { /* Cache cleanup is best-effort and never blocks login. */ }
}

export async function shareAcademicDocument(
  kind: AcademicDocumentKind,
  base64: string,
): Promise<void> {
  const Sharing = await import("expo-sharing");
  const FileSystem = await import("expo-file-system/legacy");
  const root = documentCacheRoot(FileSystem.cacheDirectory);
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const uri = documentCacheUri(root, kind);
  try {
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await sharePdfUri(Sharing, uri);
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

export async function shareSignedAcademicDocument(
  kind: AcademicDocumentKind,
  signedUrl: string,
): Promise<void> {
  if (!isAllowedSignedDocumentUrl(signedUrl)) throw new Error("URL de documento inválida.");
  const Sharing = await import("expo-sharing");
  const FileSystem = await import("expo-file-system/legacy");
  const root = documentCacheRoot(FileSystem.cacheDirectory);
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const uri = documentCacheUri(root, kind);
  try {
    const response = await FileSystem.downloadAsync(signedUrl, uri);
    if (response.status !== 200) throw new Error("Documento indisponível.");
    const info = await FileSystem.getInfoAsync(uri);
    const size = info.exists && "size" in info ? info.size : 0;
    if (!Number.isFinite(size) || size <= 5 || size > MAX_DOCUMENT_BYTES) {
      throw new Error("Tamanho de documento inválido.");
    }
    const header = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 5,
    });
    if (!isPdfHeaderBase64(header)) {
      throw new Error("O portal não retornou um PDF válido.");
    }
    await sharePdfUri(Sharing, uri);
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

function documentCacheRoot(cacheDirectory: string | null): string {
  if (!cacheDirectory) throw new Error("Cache do aparelho indisponível.");
  return `${cacheDirectory}sigecad-documents/`;
}

function documentCacheUri(root: string, kind: AcademicDocumentKind): string {
  const stem = kind === "enrollment-certificate"
    ? "atestado-matricula"
    : kind === "school-transcript"
      ? "historico-escolar"
      : "plano-ensino";
  return `${root}${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
}

async function sharePdfUri(
  Sharing: typeof import("expo-sharing"),
  uri: string,
): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error("Compartilhamento indisponível.");
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Compartilhar ou salvar documento",
  });
}

function availability(value: unknown): DocumentAvailability {
  const item = record(value, "disponibilidade de documento");
  return {
    available: item.available === true,
    supportsSocialName: item.supportsSocialName === true,
  };
}

function teachingPeriodRank(name: string, fallbackId: number): number {
  const match = name.match(/((?:19|20)\d{2})\s*[\/-]\s*([12])/);
  return match ? Number(match[1]) * 10 + Number(match[2]) : fallbackId;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Formato inválido para ${label}.`);
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, message: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(message);
  return parsed;
}

function requiredText(value: unknown, max: number, message: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(message);
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || text.length > max || /[\u0000-\u001f]/.test(text)) throw new Error(message);
  return text;
}
