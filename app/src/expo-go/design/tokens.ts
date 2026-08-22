export const fonts = {
  sans: "IBMPlexSans_400Regular",
  sansMedium: "IBMPlexSans_500Medium",
  sansSemibold: "IBMPlexSans_600SemiBold",
  sansBold: "IBMPlexSans_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoSemibold: "IBMPlexMono_600SemiBold",
} as const;

export interface DesignTheme {
  dark: boolean;
  background: string;
  surface: string;
  surfaceMuted: string;
  primary: string;
  primarySoft: string;
  ink: string;
  body: string;
  muted: string;
  faint: string;
  border: string;
  white: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  overlay: string;
}

export const lightTheme: DesignTheme = {
  dark: false,
  background: "#F6F7F5",
  surface: "#FFFFFF",
  surfaceMuted: "#EFF1ED",
  primary: "#174F3D",
  primarySoft: "#EFF4F1",
  ink: "#17201C",
  body: "#3D4A43",
  muted: "#5C6B63",
  faint: "#8A968E",
  border: "#E3E6E1",
  white: "#FFFFFF",
  danger: "#B3362B",
  dangerSoft: "#FCECEA",
  warning: "#B45309",
  warningSoft: "#FFF4E5",
  success: "#2F6B4F",
  successSoft: "#EFF7F2",
  overlay: "rgba(23,32,28,0.25)",
};

export const darkTheme: DesignTheme = {
  dark: true,
  background: "#101613",
  surface: "#18211C",
  surfaceMuted: "#1E2822",
  primary: "#8FCDA9",
  primarySoft: "#1E2822",
  ink: "#E8ECE8",
  body: "#A8B5AC",
  muted: "#7C8C82",
  faint: "#7C8C82",
  border: "#253129",
  white: "#FFFFFF",
  danger: "#E08A7C",
  dangerSoft: "#3D2624",
  warning: "#D9A66A",
  warningSoft: "#3C3020",
  success: "#8FCDA9",
  successSoft: "#20382C",
  overlay: "rgba(0,0,0,0.55)",
};

export const layout = {
  phoneWidth: 390,
  radius: 10,
  spacing: 16,
  tabHeight: 68,
} as const;
