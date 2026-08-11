import type {
  ReactNode,
} from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

import Animated, {
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

export type OnboardingPalette =
  | "tidal"
  | "violet"
  | "verdant"
  | "ember"
  | "rose";

type PaletteDefinition = {
  base: string;
  gradient: string;
  glowA: string;
  glowB: string;
  ink: string;
  muted: string;
  line: string;
  glass: string;
  glassStrong: string;
};

const LIGHT_PALETTES: Record<
  OnboardingPalette,
  PaletteDefinition
> = {
  tidal: {
    base: "#D8F0EF",
    gradient:
      "linear-gradient(145deg, #D3F2EE 0%, #B6DCE8 48%, #E7D4E6 100%)",
    glowA: "rgba(56, 202, 192, 0.44)",
    glowB: "rgba(193, 101, 198, 0.34)",
    ink: "#102F3E",
    muted: "rgba(16, 47, 62, 0.68)",
    line: "rgba(16, 47, 62, 0.14)",
    glass: "rgba(247, 255, 253, 0.58)",
    glassStrong: "rgba(250, 255, 254, 0.82)",
  },
  violet: {
    base: "#E7DEF4",
    gradient:
      "linear-gradient(145deg, #E9DDF5 0%, #C5D8EC 50%, #E7D5E1 100%)",
    glowA: "rgba(112, 91, 218, 0.38)",
    glowB: "rgba(232, 124, 163, 0.30)",
    ink: "#24314D",
    muted: "rgba(36, 49, 77, 0.68)",
    line: "rgba(36, 49, 77, 0.14)",
    glass: "rgba(251, 250, 255, 0.58)",
    glassStrong: "rgba(253, 251, 255, 0.82)",
  },
  verdant: {
    base: "#D9EFE4",
    gradient:
      "linear-gradient(145deg, #D6F1E1 0%, #B9DCD8 51%, #C8DDED 100%)",
    glowA: "rgba(63, 198, 127, 0.40)",
    glowB: "rgba(56, 145, 190, 0.32)",
    ink: "#123A3A",
    muted: "rgba(18, 58, 58, 0.68)",
    line: "rgba(18, 58, 58, 0.14)",
    glass: "rgba(248, 255, 251, 0.58)",
    glassStrong: "rgba(251, 255, 253, 0.82)",
  },
  ember: {
    base: "#F3E3D7",
    gradient:
      "linear-gradient(145deg, #F5E5D3 0%, #EFC7C1 49%, #D9D4EC 100%)",
    glowA: "rgba(237, 144, 76, 0.40)",
    glowB: "rgba(214, 87, 126, 0.32)",
    ink: "#452D34",
    muted: "rgba(69, 45, 52, 0.68)",
    line: "rgba(69, 45, 52, 0.14)",
    glass: "rgba(255, 252, 248, 0.58)",
    glassStrong: "rgba(255, 253, 250, 0.84)",
  },
  rose: {
    base: "#F2DDE4",
    gradient:
      "linear-gradient(145deg, #F3DDE4 0%, #D7CFEB 48%, #C8DFE8 100%)",
    glowA: "rgba(233, 114, 150, 0.38)",
    glowB: "rgba(102, 91, 205, 0.30)",
    ink: "#3C2D47",
    muted: "rgba(60, 45, 71, 0.68)",
    line: "rgba(60, 45, 71, 0.14)",
    glass: "rgba(255, 249, 253, 0.58)",
    glassStrong: "rgba(255, 251, 254, 0.84)",
  },
};

const DARK_PALETTES: Record<
  OnboardingPalette,
  PaletteDefinition
> = {
  tidal: {
    base: "#071725",
    gradient:
      "linear-gradient(145deg, #071725 0%, #102B39 50%, #211B38 100%)",
    glowA: "rgba(38, 173, 167, 0.38)",
    glowB: "rgba(151, 82, 188, 0.34)",
    ink: "#F1FFFC",
    muted: "rgba(241, 255, 252, 0.70)",
    line: "rgba(241, 255, 252, 0.15)",
    glass: "rgba(9, 27, 42, 0.46)",
    glassStrong: "rgba(6, 22, 36, 0.76)",
  },
  violet: {
    base: "#111328",
    gradient:
      "linear-gradient(145deg, #101326 0%, #262043 48%, #302033 100%)",
    glowA: "rgba(103, 78, 212, 0.40)",
    glowB: "rgba(204, 85, 139, 0.30)",
    ink: "#F8F4FF",
    muted: "rgba(248, 244, 255, 0.70)",
    line: "rgba(248, 244, 255, 0.15)",
    glass: "rgba(17, 18, 42, 0.48)",
    glassStrong: "rgba(12, 13, 34, 0.78)",
  },
  verdant: {
    base: "#071D1A",
    gradient:
      "linear-gradient(145deg, #071D1A 0%, #10302C 50%, #102B3C 100%)",
    glowA: "rgba(51, 173, 111, 0.38)",
    glowB: "rgba(42, 131, 175, 0.32)",
    ink: "#F1FFF9",
    muted: "rgba(241, 255, 249, 0.70)",
    line: "rgba(241, 255, 249, 0.15)",
    glass: "rgba(7, 31, 28, 0.48)",
    glassStrong: "rgba(5, 24, 23, 0.78)",
  },
  ember: {
    base: "#241516",
    gradient:
      "linear-gradient(145deg, #241516 0%, #3B2625 49%, #2C203A 100%)",
    glowA: "rgba(224, 122, 59, 0.38)",
    glowB: "rgba(196, 65, 111, 0.30)",
    ink: "#FFF8F3",
    muted: "rgba(255, 248, 243, 0.70)",
    line: "rgba(255, 248, 243, 0.15)",
    glass: "rgba(40, 20, 21, 0.48)",
    glassStrong: "rgba(31, 14, 17, 0.78)",
  },
  rose: {
    base: "#25151F",
    gradient:
      "linear-gradient(145deg, #25151F 0%, #33203A 48%, #162D3B 100%)",
    glowA: "rgba(216, 87, 133, 0.36)",
    glowB: "rgba(83, 78, 190, 0.32)",
    ink: "#FFF6FB",
    muted: "rgba(255, 246, 251, 0.70)",
    line: "rgba(255, 246, 251, 0.15)",
    glass: "rgba(37, 17, 31, 0.48)",
    glassStrong: "rgba(29, 12, 26, 0.78)",
  },
};

export function useOnboardingPalette(
  palette: OnboardingPalette,
): PaletteDefinition & {
  danger: string;
  success: string;
} {
  const colorScheme =
    useColorScheme();
  const dark =
    colorScheme ===
    "dark";
  const colors =
    dark
      ? DARK_PALETTES[
          palette
        ]
      : LIGHT_PALETTES[
          palette
        ];

  return {
    ...colors,
    danger:
      dark
        ? "#FFB4C4"
        : "#7B1735",
    success:
      dark
        ? "#86E9BB"
        : "#17613D",
  };
}

export function OnboardingAtmosphere(
  props: {
    palette: OnboardingPalette;
  },
) {
  const colors =
    useOnboardingPalette(
      props.palette,
    );

  return (
    <View
      pointerEvents="none"
      style={[
        styles.atmosphere,
        {
          backgroundColor:
            colors.base,
          experimental_backgroundImage:
            colors.gradient,
        },
      ]}
    >
      <View
        style={[
          styles.glow,
          styles.glowOne,
          {
            backgroundColor:
              colors.glowA,
          },
        ]}
      />

      <View
        style={[
          styles.glow,
          styles.glowTwo,
          {
            backgroundColor:
              colors.glowB,
          },
        ]}
      />
    </View>
  );
}

export function OnboardingHeader(
  props: {
    palette: OnboardingPalette;
    step?: number;
    totalSteps?: number;
    stepLabel?: string;
    skipLabel?: string;
    onSkip?: () => void;
  },
) {
  const colors =
    useOnboardingPalette(
      props.palette,
    );
  const total =
    props.totalSteps ?? 0;
  const step =
    props.step ?? 0;

  return (
    <View>
      <View
        style={
          styles.header
        }
      >
        <View
          style={
            styles.brandRow
          }
        >
          <View
            style={[
              styles.mark,
              {
                backgroundColor:
                  colors.ink,
              },
            ]}
          >
            <Text
              style={[
                styles.markText,
                {
                  color:
                    colors.base,
                },
              ]}
            >
              c
            </Text>
          </View>

          <Text
            style={[
              styles.brandText,
              {
                color:
                  colors.ink,
              },
            ]}
          >
            canal
          </Text>
        </View>

        {total > 0 ? (
          <View
            accessibilityLabel={`Onboarding step ${step + 1} of ${total}`}
            style={
              styles.progress
            }
          >
            {Array.from(
              {
                length:
                  total,
              },
              (_, index) => (
                <View
                  key={
                    index
                  }
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor:
                        index <=
                        step
                          ? colors.ink
                          : colors.line,
                      opacity:
                        index ===
                        step
                          ? 1
                          : 0.62,
                    },
                  ]}
                />
              ),
            )}
          </View>
        ) : (
          <View />
        )}

        {props.onSkip ? (
          <Pressable
            accessibilityLabel={
              props.skipLabel ??
              "Finish onboarding later"
            }
            accessibilityRole="button"
            onPress={
              props.onSkip
            }
            style={({
              pressed,
            }) => [
              styles.skipButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.skipText,
                {
                  color:
                    colors.ink,
                },
              ]}
            >
              {props.skipLabel ??
                "Later"}
            </Text>
          </Pressable>
        ) : (
          <View
            style={
              styles.headerSpacer
            }
          />
        )}
      </View>

      {props.stepLabel ? (
        <Text
          accessibilityLiveRegion="polite"
          selectable
          style={[
            styles.stepLabel,
            {
              color:
                colors.muted,
            },
          ]}
        >
          {props.stepLabel}
        </Text>
      ) : null}
    </View>
  );
}

export function OnboardingPanel(
  props: {
    palette: OnboardingPalette;
    children: ReactNode;
    strong?: boolean;
    style?: object;
    accessibilityLabel?: string;
  },
) {
  const colors =
    useOnboardingPalette(
      props.palette,
    );

  return (
    <Animated.View
      accessibilityLabel={
        props.accessibilityLabel
      }
      entering={
        FadeIn.duration(
          220,
        )
      }
      exiting={
        FadeOut.duration(
          160,
        )
      }
      style={[
        styles.panel,
        {
          backgroundColor:
            props.strong
              ? colors.glassStrong
              : colors.glass,
          borderColor:
            colors.line,
        },
        props.style,
      ]}
    >
      {props.children}
    </Animated.View>
  );
}

export function OnboardingButton(
  props: {
    palette: OnboardingPalette;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    secondary?: boolean;
    accessibilityHint?: string;
    icon?: keyof typeof Ionicons.glyphMap;
  },
) {
  const colors =
    useOnboardingPalette(
      props.palette,
    );

  return (
    <Pressable
      accessibilityHint={
        props.accessibilityHint
      }
      accessibilityLabel={
        props.label
      }
      accessibilityRole="button"
      accessibilityState={{
        busy:
          props.loading,
        disabled:
          props.disabled,
      }}
      disabled={
        props.disabled
      }
      onPress={
        props.onPress
      }
      style={({
        pressed,
      }) => [
        styles.actionButton,
        {
          backgroundColor:
            props.secondary
              ? colors.glass
              : colors.ink,
          borderColor:
            props.secondary
              ? colors.line
              : "transparent",
          opacity:
            props.disabled
              ? 0.48
              : pressed
                ? 0.72
                : 1,
        },
      ]}
    >
      {props.icon ? (
        <Ionicons
          color={
            props.secondary
              ? colors.ink
              : colors.base
          }
          name={
            props.icon
          }
          size={18}
        />
      ) : null}

      <Text
        style={[
          styles.actionText,
          {
            color:
              props.secondary
                ? colors.ink
                : colors.base,
          },
        ]}
      >
        {props.loading
          ? "Working…"
          : props.label}
      </Text>
    </Pressable>
  );
}

export function OnboardingChoice(
  props: {
    palette: OnboardingPalette;
    label: string;
    selected: boolean;
    onPress: () => void;
    accessibilityHint?: string;
  },
) {
  const colors =
    useOnboardingPalette(
      props.palette,
    );

  return (
    <Pressable
      accessibilityHint={
        props.accessibilityHint
      }
      accessibilityLabel={
        props.label
      }
      accessibilityRole="button"
      accessibilityState={{
        selected:
          props.selected,
      }}
      onPress={
        props.onPress
      }
      style={({
        pressed,
      }) => [
        styles.choice,
        {
          backgroundColor:
            props.selected
              ? colors.ink
              : colors.glass,
          borderColor:
            props.selected
              ? colors.ink
              : colors.line,
          opacity:
            pressed
              ? 0.72
              : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.choiceText,
          {
            color:
              props.selected
                ? colors.base
                : colors.ink,
          },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export const authOnboardingStyles =
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    atmosphere: {
      ...StyleSheet.absoluteFillObject,
      overflow:
        "hidden",
    },
    glow: {
      position:
        "absolute",
      width: 430,
      height: 430,
      borderRadius: 999,
      filter:
        "blur(64px)",
    },
    glowOne: {
      left: -210,
      top: 80,
    },
    glowTwo: {
      right: -220,
      bottom: -40,
    },
    header: {
      minHeight: 52,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 14,
    },
    brandRow: {
      width: 92,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
    },
    mark: {
      width: 31,
      height: 31,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    markText: {
      fontFamily:
        "Georgia",
      fontSize: 20,
      fontWeight:
        "500",
      marginTop: -2,
    },
    brandText: {
      fontSize: 16,
      fontWeight:
        "500",
      letterSpacing:
        -0.5,
    },
    progress: {
      flex: 1,
      maxWidth: 280,
      flexDirection:
        "row",
      gap: 5,
    },
    progressSegment: {
      flex: 1,
      height: 3,
      borderRadius: 3,
    },
    skipButton: {
      width: 92,
      minHeight: 48,
      alignItems:
        "flex-end",
      justifyContent:
        "center",
    },
    headerSpacer: {
      width: 92,
      minHeight: 48,
    },
    skipText: {
      fontSize: 12,
      fontWeight:
        "500",
    },
    stepLabel: {
      minHeight: 18,
      fontSize: 10,
      textAlign:
        "center",
      fontVariant: [
        "tabular-nums",
      ],
    },
    panel: {
      borderWidth: 1,
      borderRadius: 28,
      borderCurve:
        "continuous",
      padding: 18,
      overflow:
        "hidden",
    },
    actionButton: {
      minHeight: 54,
      borderWidth: 1,
      borderRadius: 18,
      borderCurve:
        "continuous",
      paddingHorizontal: 18,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 8,
    },
    actionText: {
      fontSize: 15,
      fontWeight:
        "500",
      textAlign:
        "center",
    },
    choice: {
      minHeight: 48,
      borderWidth: 1,
      borderRadius: 18,
      borderCurve:
        "continuous",
      paddingHorizontal: 14,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    choiceText: {
      fontSize: 12,
      fontWeight:
        "500",
    },
    pressed: {
      opacity: 0.72,
    },
  });

const styles =
  authOnboardingStyles;
