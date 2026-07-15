import React, { type ComponentType } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ExpoGoApp } from "./src/expo-go/ExpoGoApp";
import { isExpoGo } from "./src/runtime/capabilities";

// Native Firebase modules do not exist inside Expo Go. Keep the require behind
// a runtime capability check so that Expo Go never evaluates those modules.
const NativeApp: ComponentType | null = isExpoGo
  ? null
  : (require("./src/native/NativeApp") as { default: ComponentType }).default;

export default function App() {
  return (
    <SafeAreaProvider>
      {isExpoGo ? <ExpoGoApp /> : NativeApp ? <NativeApp /> : null}
    </SafeAreaProvider>
  );
}
