export type RuntimeMode = "expo-go" | "native-build";

/** Pure runtime detection kept separate so it can be tested outside React Native. */
export function detectRuntimeMode(
  executionEnvironment: unknown,
  appOwnership: unknown,
  storeClientValue: unknown = "storeClient",
): RuntimeMode {
  return executionEnvironment === storeClientValue ||
    executionEnvironment === "storeClient" || appOwnership === "expo"
    ? "expo-go"
    : "native-build";
}
