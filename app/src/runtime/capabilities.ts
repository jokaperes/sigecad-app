import Constants, { ExecutionEnvironment } from "expo-constants";

export type RuntimeMode = "expo-go" | "native-build";

export const runtimeMode: RuntimeMode =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? "expo-go"
    : "native-build";

export const isExpoGo = runtimeMode === "expo-go";

export const capabilities = {
  liveForegroundGrades: true,
  secureNativeCookieAccess: !isExpoGo,
  firebaseAppCheck: !isExpoGo,
  remotePush: !isExpoGo,
  backgroundChecks: !isExpoGo,
} as const;
