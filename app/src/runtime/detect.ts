export type RuntimeMode = "expo-go" | "native-build";


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
