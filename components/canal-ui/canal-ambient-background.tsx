import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";

import {
  usePathname,
} from "expo-router";

import {
  CanalAtmosphereContext,
  CANAL_ATMOSPHERE_TRANSITION_MS,
} from "../../theme/canal-atmosphere-context";

import {
  canalDynamicColors,
} from "../../theme/canal-dynamic-colors";

import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type Atmosphere = {
  base: string;
  glowOne: string;
  glowTwo: string;
  glowThree: string;
};

function atmosphereForPath(
  pathname: string,
  isDark: boolean,
): Atmosphere {
  if (pathname.startsWith("/explore") || pathname.startsWith("/snapshots")) {
    return isDark
      ? { base: "#263D72", glowOne: "rgba(238,154,144,0.54)", glowTwo: "rgba(156,98,141,0.55)", glowThree: "rgba(81,92,164,0.42)" }
      : { base: "#F0E2EC", glowOne: "rgba(255,180,167,0.34)", glowTwo: "rgba(215,153,198,0.28)", glowThree: "rgba(171,181,231,0.30)" };
  }

  if (pathname.startsWith("/library")) {
    return isDark
      ? { base: "#162849", glowOne: "rgba(104,217,198,0.54)", glowTwo: "rgba(47,137,154,0.52)", glowThree: "rgba(49,88,135,0.46)" }
      : { base: "#D6EEF0", glowOne: "rgba(104,223,201,0.34)", glowTwo: "rgba(119,194,204,0.28)", glowThree: "rgba(163,181,225,0.28)" };
  }

  if (pathname.startsWith("/settings") || pathname.startsWith("/appearance") || pathname.startsWith("/data-controls") || pathname.startsWith("/music-services")) {
    return isDark
      ? { base: "#193A54", glowOne: "rgba(168,161,239,0.48)", glowTwo: "rgba(94,120,181,0.5)", glowThree: "rgba(76,197,180,0.32)" }
      : { base: "#DDE8F4", glowOne: "rgba(190,181,255,0.34)", glowTwo: "rgba(151,173,222,0.28)", glowThree: "rgba(140,224,207,0.25)" };
  }

  if (pathname.startsWith("/profile") || pathname.startsWith("/friend") || pathname.startsWith("/creator") || pathname.startsWith("/friends") || pathname.startsWith("/following")) {
    return isDark
      ? { base: "#1D3658", glowOne: "rgba(107,216,189,0.5)", glowTwo: "rgba(57,127,147,0.52)", glowThree: "rgba(89,87,158,0.37)" }
      : { base: "#D8EEF0", glowOne: "rgba(112,226,199,0.34)", glowTwo: "rgba(132,196,216,0.28)", glowThree: "rgba(184,174,232,0.26)" };
  }

  if (pathname.startsWith("/scenes") || pathname.startsWith("/scene-") || pathname.startsWith("/public-scene") || pathname.startsWith("/now-playing")) {
    return isDark
      ? { base: "#18376B", glowOne: "rgba(116,224,207,0.58)", glowTwo: "rgba(61,133,204,0.55)", glowThree: "rgba(115,102,210,0.4)" }
      : { base: "#D9E8F7", glowOne: "rgba(117,228,207,0.34)", glowTwo: "rgba(133,178,226,0.30)", glowThree: "rgba(190,175,236,0.26)" };
  }

  if (pathname.startsWith("/live-stage") || pathname.startsWith("/stage-") || pathname.startsWith("/create-stage") || pathname.startsWith("/managed-stages")) {
    return isDark
      ? { base: "#24345D", glowOne: "rgba(139,111,210,0.52)", glowTwo: "rgba(61,185,174,0.48)", glowThree: "rgba(220,129,113,0.32)" }
      : { base: "#E7E2F1", glowOne: "rgba(175,151,232,0.32)", glowTwo: "rgba(149,222,207,0.28)", glowThree: "rgba(242,183,170,0.28)" };
  }

  return isDark
    ? { base: "#15354F", glowOne: "rgba(112,221,199,0.54)", glowTwo: "rgba(58,108,199,0.48)", glowThree: "rgba(139,104,232,0.36)" }
    : { base: "#D8E9F4", glowOne: "rgba(117,228,207,0.36)", glowTwo: "rgba(133,178,226,0.30)", glowThree: "rgba(190,175,236,0.24)" };
}

export function CanalAmbientBackground() {
  const {
    override,
  } = use(CanalAtmosphereContext);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const isDark = useColorScheme() === "dark";
  const previousSchemeRef = useRef(isDark);
  const appearanceChanged = previousSchemeRef.current !== isDark;
  const atmosphere = useMemo(
    () => override ?? atmosphereForPath(pathname, isDark),
    [isDark, override, pathname],
  );
  const ambientPhase = useSharedValue(0);
  const baseColor = useSharedValue(atmosphere.base);
  const gradientProgress = useSharedValue(1);
  const targetAtmosphereRef = useRef(atmosphere);
  const [gradientLayers, setGradientLayers] = useState(() => ({
    from: atmosphere,
    to: atmosphere,
  }));

  useEffect(() => {
    previousSchemeRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    if (
      reduceMotion ||
      process.env.NODE_ENV === "test"
    ) {
      ambientPhase.value = 0;
      return;
    }

    ambientPhase.value = withRepeat(
      withTiming(1, {
        duration: 12_000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [ambientPhase, reduceMotion]);

  useEffect(() => {
    if (
      reduceMotion ||
      process.env.NODE_ENV === "test"
    ) {
      baseColor.value = atmosphere.base;
      return;
    }

    const timing = {
      duration: appearanceChanged
        ? 240
        : override?.transitionMs ?? CANAL_ATMOSPHERE_TRANSITION_MS,
      easing: Easing.inOut(Easing.sin),
    };

    baseColor.value = withTiming(atmosphere.base, timing);
  }, [
    atmosphere.base,
    appearanceChanged,
    baseColor,
    override?.transitionMs,
    reduceMotion,
  ]);

  useEffect(() => {
    const previous = targetAtmosphereRef.current;
    targetAtmosphereRef.current = atmosphere;
    setGradientLayers({
      from: previous,
      to: atmosphere,
    });

    if (
      reduceMotion ||
      process.env.NODE_ENV === "test"
    ) {
      gradientProgress.value = 1;
      return;
    }

    gradientProgress.value = 0;
    gradientProgress.value = withTiming(1, {
      duration: appearanceChanged
        ? 240
        : override?.transitionMs ?? CANAL_ATMOSPHERE_TRANSITION_MS,
      easing: Easing.inOut(Easing.sin),
    });
  }, [
    atmosphere,
    appearanceChanged,
    gradientProgress,
    override?.transitionMs,
    reduceMotion,
  ]);

  const baseTransitionStyle = useAnimatedStyle(() => ({
    backgroundColor: baseColor.value,
  }));

  const upperGradientStyle = useAnimatedStyle(() => ({
    // One circular phase keeps the loop's first and last frame identical.
    // `swell` produces the heartbeat while `sway` keeps the light moving.
    transform: [
      {
        translateX: reduceMotion
          ? 0
          : Math.sin(ambientPhase.value * Math.PI * 2) * 22,
      },
      {
        translateY: reduceMotion
          ? 0
          : Math.sin(ambientPhase.value * Math.PI * 2 - Math.PI / 2) * 14 + 14,
      },
      {
        scale:
          reduceMotion
            ? 1
            : 1.02 +
              ((1 - Math.cos(ambientPhase.value * Math.PI * 2)) / 2) *
                0.06,
      },
    ],
  }));

  const lowerGradientStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduceMotion
          ? 0
          : Math.sin(ambientPhase.value * Math.PI * 2) * -24,
      },
      {
        translateY: reduceMotion
          ? 0
          : Math.sin(ambientPhase.value * Math.PI * 2 - Math.PI / 2) * -16 - 16,
      },
      {
        scale:
          reduceMotion
            ? 1
            : 1.08 -
              ((1 - Math.cos(ambientPhase.value * Math.PI * 2)) / 2) *
                0.05,
      },
    ],
  }));

  const outgoingUpperStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0
      : (1 - gradientProgress.value) *
        (0.62 +
          ((1 - Math.cos(ambientPhase.value * Math.PI * 2)) / 2) * 0.12),
  }));

  const incomingUpperStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0.72
      : gradientProgress.value *
        (0.62 +
          ((1 - Math.cos(ambientPhase.value * Math.PI * 2)) / 2) * 0.12),
  }));

  const outgoingLowerStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0
      : (1 - gradientProgress.value) *
        (0.58 +
          ((1 - Math.cos(ambientPhase.value * Math.PI * 2)) / 2) * 0.1),
  }));

  const incomingLowerStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0.68
      : gradientProgress.value *
        (0.58 +
          ((1 - Math.cos(ambientPhase.value * Math.PI * 2)) / 2) * 0.1),
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, baseTransitionStyle]}
    >
      <Animated.View
        style={[
          styles.gradientCanvas,
          gradientStyle(gradientLayers.from, "upper"),
          upperGradientStyle,
          outgoingUpperStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.gradientCanvas,
          gradientStyle(gradientLayers.from, "lower"),
          lowerGradientStyle,
          outgoingLowerStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.gradientCanvas,
          gradientStyle(gradientLayers.to, "upper"),
          upperGradientStyle,
          incomingUpperStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.gradientCanvas,
          gradientStyle(gradientLayers.to, "lower"),
          lowerGradientStyle,
          incomingLowerStyle,
        ]}
      />
      <View style={styles.depthWash} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gradientCanvas: {
    position: "absolute",
    width: "132%",
    height: "132%",
    top: "-16%",
    left: "-16%",
  },
  depthWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: canalDynamicColors.ambientWash,
  },
});

function gradientStyle(
  atmosphere: Atmosphere,
  layer: "upper" | "lower",
) {
  const backgroundImage = layer === "upper"
    ? `linear-gradient(148deg, ${atmosphere.glowOne} 0%, ${atmosphere.glowTwo} 100%)`
    : `linear-gradient(322deg, ${atmosphere.glowThree} 0%, ${atmosphere.glowTwo} 100%)`;

  return {
    experimental_backgroundImage: backgroundImage,
  } as const;
}
