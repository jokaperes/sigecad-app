import React from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { colors, radius, spacing } from "./theme";

export function Screen({ children, centered = false }: ViewProps & { centered?: boolean }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.screen, centered && styles.centered]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Brand() {
  return (
    <View style={styles.brand} accessibilityRole="header">
      <View style={styles.logo}><Text style={styles.logoText}>S</Text></View>
      <View>
        <Text style={styles.brandTitle}>SIGECAD Alerta</Text>
        <Text style={styles.brandSubtitle}>Notas UFGD, sem entregar sua senha</Text>
      </View>
    </View>
  );
}

export function Card({ children, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

type ActionProps = PressableProps & { label: string; busy?: boolean; danger?: boolean };

export function PrimaryButton({ label, busy, danger, disabled, style, ...props }: ActionProps) {
  const inactive = disabled || busy;
  return (
    <Pressable
      {...props}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.button,
        danger && styles.dangerButton,
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ label, busy, disabled, style, ...props }: ActionProps) {
  const inactive = disabled || busy;
  return (
    <Pressable
      {...props}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && !inactive && styles.secondaryPressed,
        inactive && styles.buttonDisabled,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>{label}</Text>}
    </Pressable>
  );
}

export function Notice({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <View accessibilityRole="alert" style={[styles.notice, danger && styles.dangerNotice]}>
      <Text style={[styles.noticeText, danger && styles.dangerText]}>{children}</Text>
    </View>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg },
  centered: { justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  logoText: { color: colors.white, fontSize: 24, fontWeight: "800" },
  brandTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  brandSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  dangerButton: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  secondaryPressed: { backgroundColor: colors.soft },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  notice: { borderRadius: radius.sm, padding: spacing.md, backgroundColor: colors.soft },
  dangerNotice: { backgroundColor: colors.dangerSoft },
  noticeText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  dangerText: { color: colors.danger },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});
