/**
 * Backend do Notificador de Notas UFGD — modelo device-sentinela.
 *
 * O servidor NUNCA vê token nem nota. Guarda só: quem está em qual turma, como
 * acordar cada device (pushToken), e o último `stateHash` conhecido por turma.
 * O device faz o poll com o token LOCAL, calcula o diff/stateHash e reporta.
 *
 * Segurança:
 *   - App Check obrigatório nas callables  -> mata curl/APK adulterado (camada 2)
 *   - quórum de K devices no mesmo stateHash -> mata app-genuíno-mentindo (camada 3)
 *   - Firestore rules negam escrita direta do cliente (só via estas functions)
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  InputValidationError,
  effectiveQuorum,
  normalizeEmail as normalizeEmailInput,
  normalizeEvents as normalizeEventsInput,
  normalizeTurmaCodes as normalizeTurmaCodesInput,
  positiveInteger,
  reportId,
} from "./policy";

initializeApp();
const db = getFirestore();

// Quórum: nº de devices independentes que precisam concordar antes do fan-out.
// Cai pra nº de sentinelas disponíveis quando a turma é pequena (senão nunca dispara).
const QUORUM_K = positiveInteger(process.env.QUORUM_K, 2);
const QUORUM_WINDOW_MS = 30 * 60 * 1000; // 30 min
const SENTINELS_PER_TURMA = 3; // quantos devices cutucar por ciclo
const PUSH_TOKEN_FRESH_MS = 48 * 60 * 60 * 1000; // considera "acordável" se visto <48h
function normalizeTurmaCodes(value: unknown): string[] {
  try {
    return normalizeTurmaCodesInput(value);
  } catch (error) {
    if (error instanceof InputValidationError) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
}

function normalizeEvents(value: unknown): string[] {
  try {
    return normalizeEventsInput(value);
  } catch (error) {
    if (error instanceof InputValidationError) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
}

function normalizeEmail(value: unknown): string | null {
  try {
    return normalizeEmailInput(value);
  } catch (error) {
    if (error instanceof InputValidationError) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
}

// ---------- helpers ----------
function requireAuth(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login (anônimo) primeiro.");
  return auth.uid;
}

async function getUserDocs(uids: string[]): Promise<DocumentSnapshot[]> {
  const unique = [...new Set(uids)];
  const documents: DocumentSnapshot[] = [];
  for (let i = 0; i < unique.length; i += 400) {
    documents.push(...await db.getAll(
      ...unique.slice(i, i + 400).map((uid) => db.doc(`users/${uid}`)),
    ));
  }
  return documents;
}

async function fanOut(turmaCode: string, events: string[]): Promise<void> {
  const turmaSnap = await db.doc(`turmas/${turmaCode}`).get();
  const members: string[] = turmaSnap.get("members") ?? [];
  if (!members.length || !events.length) return;

  const users = await getUserDocs(members);
  const tokens = [...new Set(users
    .map((user) => user.get("pushToken"))
    .filter((token): token is string => typeof token === "string" && Boolean(token)))];
  if (!tokens.length) return;

  const body = events.slice(0, 3).join("\n");
  for (let i = 0; i < tokens.length; i += 500) {
    const response = await getMessaging().sendEachForMulticast({
      tokens: tokens.slice(i, i + 500),
      notification: { title: "Atualização acadêmica UFGD", body },
      data: { turmaCode, kind: "grade-update" },
      apns: { payload: { aps: { sound: "default" } } },
      android: { priority: "high" },
    });
    if (response.failureCount) {
      logger.warn(`fanOut turma=${turmaCode} pushFailures=${response.failureCount}`);
    }
  }
  logger.info(`fanOut turma=${turmaCode} tokens=${tokens.length} events=${events.length}`);
}

// ---------- registerUser ----------
export const registerUser = onCall({ enforceAppCheck: true }, async (req) => {
  const uid = requireAuth(req.auth);
  const { pushToken, email, turmas } = req.data ?? {};
  if (typeof pushToken !== "string" || pushToken.length < 20 || pushToken.length > 4096) {
    throw new HttpsError("invalid-argument", "Esperado { pushToken, email, turmas[] }.");
  }
  const normalizedEmail = normalizeEmail(email);
  const turmaCodes = normalizeTurmaCodes(turmas);
  const userRef = db.doc(`users/${uid}`);
  const previousUser = await userRef.get();
  const previousTurmas: string[] = previousUser.get("turmas") ?? [];

  const batch = db.batch();
  const userData: Record<string, unknown> = {
    pushToken,
    email: normalizedEmail,
    turmas: turmaCodes,
    updatedAt: FieldValue.serverTimestamp(),
    pushSeenAt: FieldValue.serverTimestamp(),
  };
  if (!previousUser.exists) userData.consentAt = FieldValue.serverTimestamp();
  batch.set(
    userRef,
    userData,
    { merge: true },
  );
  for (const tc of turmaCodes) {
    batch.set(
      db.doc(`turmas/${tc}`),
      { members: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  for (const tc of previousTurmas.filter((tc) => !turmaCodes.includes(tc))) {
    batch.set(
      db.doc(`turmas/${tc}`),
      { members: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  return { ok: true, turmas: turmaCodes.length };
});

// ---------- reportEvent ----------
export const reportEvent = onCall({ enforceAppCheck: true }, async (req) => {
  const uid = requireAuth(req.auth);
  const { turmaCode, stateHash, events } = req.data ?? {};
  const normalizedTurma = normalizeTurmaCodes([turmaCode]);
  if (typeof stateHash !== "string" || !/^[a-f0-9]{64}$/.test(stateHash)) {
    throw new HttpsError("invalid-argument", "Esperado { turmaCode, stateHash, events[] }.");
  }
  const tc = normalizedTurma[0];
  const evts = normalizeEvents(events);

  // camada 1: só aceita report de turma que o uid cursa
  const user = await db.doc(`users/${uid}`).get();
  const userTurmas: string[] = user.get("turmas") ?? [];
  if (!userTurmas.includes(tc)) {
    throw new HttpsError("permission-denied", "Você não cursa essa turma.");
  }
  // renova o "acordável"
  await db.doc(`users/${uid}`).set({ pushSeenAt: FieldValue.serverTimestamp() }, { merge: true });

  const turmaRef = db.doc(`turmas/${tc}`);
  const turma = await turmaRef.get();
  if (turma.get("lastHash") === stateHash) {
    return { ok: true, status: "known" }; // nada novo
  }

  // registra o report (janela de quórum)
  await db.collection("reports").doc(reportId(tc, uid)).set({
    turmaCode: tc,
    uid,
    stateHash,
    events: evts,
    ts: FieldValue.serverTimestamp(),
  });

  // conta uids DISTINTOS reportando o mesmo stateHash dentro da janela
  const since = new Date(Date.now() - QUORUM_WINDOW_MS);
  const recent = await db
    .collection("reports")
    .where("turmaCode", "==", tc)
    .where("stateHash", "==", stateHash)
    .where("ts", ">=", since)
    .get();
  const votes = new Map<string, { events: string[]; uids: Set<string> }>();
  for (const doc of recent.docs) {
    let reportEvents: string[];
    try {
      reportEvents = normalizeEventsInput(doc.get("events"));
    } catch {
      logger.warn(`report inválido ignorado id=${doc.id}`);
      continue;
    }
    const signature = JSON.stringify(reportEvents);
    const vote = votes.get(signature) ?? { events: reportEvents, uids: new Set<string>() };
    vote.uids.add(doc.get("uid"));
    votes.set(signature, vote);
  }
  const winner = [...votes.values()].sort((a, b) => b.uids.size - a.uids.size)[0];

  const members: string[] = turma.get("members") ?? [];
  const fresh = new Date(Date.now() - PUSH_TOKEN_FRESH_MS);
  const memberDocs = await getUserDocs(members);
  const eligibleDevices = memberDocs.filter((member) => {
    const token = member.get("pushToken");
    const seen = member.get("pushSeenAt")?.toDate?.();
    return typeof token === "string" && seen instanceof Date && seen >= fresh;
  }).length;
  const effectiveK = effectiveQuorum(QUORUM_K, eligibleDevices);
  if (!winner || winner.uids.size < effectiveK) {
    return { ok: true, status: "pending-quorum", have: winner?.uids.size ?? 0, need: effectiveK };
  }

  // quórum de hash + eventos batido. A transação impede fan-out duplicado.
  const committed = await db.runTransaction(async (tx) => {
    const latest = await tx.get(turmaRef);
    if (latest.get("lastHash") === stateHash) return false;
    tx.set(
      turmaRef,
      { lastHash: stateHash, lastEvents: winner.events, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return true;
  });
  if (!committed) return { ok: true, status: "known" };
  await fanOut(tc, winner.events);
  // limpa os reports consumidos
  await Promise.all(recent.docs.map((d) => d.ref.delete()));
  return { ok: true, status: "fanned-out", to: members.length };
});

// ---------- scheduledPoll (cutuca os sentinelas ~6x/dia) ----------
export const scheduledPoll = onSchedule(
  { schedule: "0 7,10,13,16,19,22 * * *", timeZone: "America/Campo_Grande" },
  async () => {
    await cleanupExpiredReports();
    const turmas = await db.collection("turmas").get();
    const fresh = new Date(Date.now() - PUSH_TOKEN_FRESH_MS);
    const memberIds = new Set<string>();
    for (const turma of turmas.docs) {
      const members: string[] = turma.get("members") ?? [];
      members.forEach((uid) => memberIds.add(uid));
    }
    const userDocs = await getUserDocs([...memberIds]);
    const users = new Map(userDocs.map((doc) => [doc.id, doc]));
    const selectedTokens = new Set<string>();

    for (const t of turmas.docs) {
      const members: string[] = t.get("members") ?? [];
      let selected = 0;
      for (const uid of members) {
        if (selected >= SENTINELS_PER_TURMA) break;
        const u = users.get(uid);
        if (!u) continue;
        const tk = u.get("pushToken");
        const seen = u.get("pushSeenAt")?.toDate?.();
        if (typeof tk === "string" && seen instanceof Date && seen >= fresh) {
          selectedTokens.add(tk);
          selected += 1;
        }
      }
    }

    const tokens = [...selectedTokens];
    for (let i = 0; i < tokens.length; i += 500) {
      // One wake checks all of this student's classes, avoiding repeated full
      // SIGECAD snapshots when the same device is sentinel for many classes.
      const response = await getMessaging().sendEachForMulticast({
        tokens: tokens.slice(i, i + 500),
        data: { kind: "check" },
        apns: {
          headers: { "apns-push-type": "background", "apns-priority": "5" },
          payload: { aps: { "content-available": 1 } },
        },
        android: { priority: "high" },
      });
      if (response.failureCount) {
        logger.warn(`scheduledPoll pushFailures=${response.failureCount}`);
      }
    }
    logger.info(`scheduledPoll: cutucou ${tokens.length} device(s) para ${turmas.size} turma(s)`);
  },
);

async function cleanupExpiredReports(): Promise<void> {
  const cutoff = new Date(Date.now() - QUORUM_WINDOW_MS);
  let removed = 0;
  while (true) {
    const expired = await db.collection("reports").where("ts", "<", cutoff).limit(500).get();
    if (expired.empty) break;
    const batch = db.batch();
    expired.docs.forEach((report) => batch.delete(report.ref));
    await batch.commit();
    removed += expired.size;
    if (expired.size < 500) break;
  }
  if (removed) logger.info(`cleanupExpiredReports: removeu ${removed} report(s)`);
}

// ---------- deleteMe (LGPD) ----------
export const deleteMe = onCall({ enforceAppCheck: true }, async (req) => {
  const uid = requireAuth(req.auth);
  const user = await db.doc(`users/${uid}`).get();
  const turmas: string[] = user.get("turmas") ?? [];
  const batch = db.batch();
  for (const tc of turmas) {
    batch.set(
      db.doc(`turmas/${tc}`),
      { members: FieldValue.arrayRemove(uid) },
      { merge: true },
    );
  }
  batch.delete(db.doc(`users/${uid}`));
  await batch.commit();
  const reports = await db.collection("reports").where("uid", "==", uid).get();
  for (let i = 0; i < reports.docs.length; i += 500) {
    const cleanup = db.batch();
    for (const report of reports.docs.slice(i, i + 500)) cleanup.delete(report.ref);
    await cleanup.commit();
  }
  await getAuth().deleteUser(uid);
  return { ok: true };
});
