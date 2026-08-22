import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ExpoGoApp } from "./src/expo-go/ExpoGoApp";

export default function App() {
  return (
    <SafeAreaProvider>
      <ExpoGoApp />
    </SafeAreaProvider>
  );
}
