import Constants, { ExecutionEnvironment } from "expo-constants";
import { detectRuntimeMode, type RuntimeMode } from "./detect";

export type { RuntimeMode } from "./detect";

export const runtimeMode: RuntimeMode = detectRuntimeMode(
  Constants.executionEnvironment,
  Constants.appOwnership,
  ExecutionEnvironment.StoreClient,
);

export const isExpoGo = runtimeMode === "expo-go";

export const capabilities = {
  liveForegroundGrades: true,
  secureNativeCookieAccess: !isExpoGo,
  firebaseAppCheck: !isExpoGo,
  remotePush: !isExpoGo,
  backgroundChecks: !isExpoGo,
} as const;
