import messaging from "@react-native-firebase/messaging";
import { getToken } from "../auth/token";
import { SigecadClient } from "../core/client";
import { runSentinelCycle } from "../sentinel/cycle";
import { storage } from "../storage/asyncStorage";
import { reporter } from "../backend/reporter";

/**
 * Registra o handler de SILENT push (data-only, kind="check"). O SO acorda o app
 * em background, ele faz o poll com o token LOCAL e reporta o que mudou. Deve ser
 * chamado no topo do módulo (fora de qualquer componente), antes de registerRootComponent.
 */
export function setupBackgroundHandler(): void {
  messaging().setBackgroundMessageHandler(async (msg) => {
    if (msg.data?.kind !== "check") return;
    const cookie = await getToken();
    if (!cookie) return; // sem token -> este device não é sentinela útil agora

    const client = new SigecadClient(cookie);
    const turmaCode = msg.data.turmaCode as string | undefined;
    await runSentinelCycle(
      { client, storage, reporter },
      turmaCode ? [turmaCode] : undefined,
    );
  });
}
