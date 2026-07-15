import messaging from "@react-native-firebase/messaging";
import { getToken } from "../auth/token";
import { collectSnapshot, SigecadClient } from "../core/client";
import { turmaCodesOf, turmaGradeItems } from "../core/snapshot";
import { ensureAnonAuth } from "../backend/firebase";
import { registerUser } from "../backend/reporter";
import {
  saveRegistration,
  storage,
  type Registration,
} from "../storage/asyncStorage";

/**
 * Cadastro do device (Fase 1 do ARCHITECTURE.md):
 *  1. auth anônimo (uid) + permissão de push + pushToken (FCM)
 *  2. descobre as turmas do aluno pollando UMA vez com o token local
 *  3. manda ao servidor SÓ { pushToken, email, turmas } — sem token, sem nota
 */
export async function registerDevice(email: string | null): Promise<Registration> {
  await ensureAnonAuth();
  const permission = await messaging().requestPermission();
  const allowed = permission === messaging.AuthorizationStatus.AUTHORIZED ||
    permission === messaging.AuthorizationStatus.PROVISIONAL;
  if (!allowed) throw new Error("Permissão de notificações recusada.");
  const pushToken = await messaging().getToken();
  if (!pushToken) throw new Error("Não foi possível obter o token de push.");

  const cookie = await getToken();
  if (!cookie) throw new Error("Sem token UFGDNET — faça login primeiro.");
  const { items, labels } = await collectSnapshot(new SigecadClient(cookie));
  const turmas = turmaCodesOf(items);

  await registerUser({ pushToken, email, turmas });
  // Registration already fetched a complete snapshot. Seed it as the baseline
  // so the first background wake does not manufacture "new evaluation" events.
  await Promise.all(turmas.map(async (code) => {
    const state = turmaGradeItems(items, labels, code);
    if (Object.keys(state.items).length) await storage.setTurmaState(code, state);
  }));
  const registration = {
    turmas,
    email,
    registeredAt: new Date().toISOString(),
  } satisfies Registration;
  await saveRegistration(registration);
  return registration;
}
