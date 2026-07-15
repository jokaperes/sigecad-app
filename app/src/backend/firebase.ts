import { firebase } from "@react-native-firebase/app-check";
import auth from "@react-native-firebase/auth";

/**
 * Inicializa o App Check (attestation). No device genuíno gera o selo assinado
 * pelo SO (Play Integrity / App Attest) que as callables exigem; curl/APK
 * adulterado não gera → o backend rejeita. Chamar uma vez no boot do app.
 */
let appCheckInitialization: Promise<void> | null = null;

async function initializeAppCheck(): Promise<void> {
  const provider = firebase.appCheck().newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: __DEV__ ? "debug" : "playIntegrity" },
    apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
  });
  await firebase.appCheck().initializeAppCheck({
    provider,
    isTokenAutoRefreshEnabled: true,
  });
}

export function initAppCheck(): Promise<void> {
  if (!appCheckInitialization) {
    appCheckInitialization = initializeAppCheck().catch((error) => {
      appCheckInitialization = null;
      throw error;
    });
  }
  return appCheckInitialization;
}

/** Auth anônimo só pra ter um uid estável por device (sem pedir dado nenhum). */
export async function ensureAnonAuth(): Promise<string> {
  if (!auth().currentUser) await auth().signInAnonymously();
  return auth().currentUser!.uid;
}
