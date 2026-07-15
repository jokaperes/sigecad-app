import functions from "@react-native-firebase/functions";
import type { Reporter } from "../sentinel/cycle";

/** Envia o report ao backend. O selo App Check vai junto automaticamente. */
export const reporter: Reporter = {
  async report(payload) {
    await functions().httpsCallable("reportEvent")(payload);
  },
};

/** Cadastro: manda só { pushToken, email, turmas } (nunca token/nota). */
export async function registerUser(payload: {
  pushToken: string;
  email: string | null;
  turmas: string[];
}): Promise<void> {
  await functions().httpsCallable("registerUser")(payload);
}

/** LGPD: apaga o usuário e o desvincula das turmas no servidor. */
export async function deleteMe(): Promise<void> {
  await functions().httpsCallable("deleteMe")({});
}
