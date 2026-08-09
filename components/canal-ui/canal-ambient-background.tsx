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
      : { base: "#6A527F", glowOne: "rgba(255,180,167,0.62)", glowTwo: "rgba(174,100,154,0.56)", glowThree: "rgba(85,104,171,0.52)" };
  }

  if (pathname.startsWith("/library")) {
    return isDark
      ? { base: "#162849", glowOne: "rgba(104,217,198,0.54)", glowTwo: "rgba(47,137,154,0.52)", glowThree: "rgba(49,88,135,0.46)" }
      : { base: "#245B72", glowOne: "rgba(104,223,201,0.64)", glowTwo: "rgba(53,151,164,0.56)", glowThree: "rgba(61,94,151,0.52)" };
  }

  if (pathname.startsWith("/settings") || pathname.startsWith("/appearance") || pathname.startsWith("/data-controls") || pathname.startsWith("/music-services")) {
    return isDark
      ? { base: "#193A54", glowOne: "rgba(168,161,239,0.48)", glowTwo: "rgba(94,120,181,0.5)", glowThree: "rgba(76,197,180,0.32)" }
      : { base: "#365A7A", glowOne: "rgba(190,181,255,0.62)", glowTwo: "rgba(102,132,193,0.56)", glowThree: "rgba(84,204,185,0.42)" };
  }

  if (pathname.startsWith("/profile") || pathname.startsWith("/friend") || pathname.startsWith("/creator") || pathname.startsWith("/friends") || pathname.startsWith("/following")) {
    return isDark
      ? { base: "#1D3658", glowOne: "rgba(107,216,189,0.5)", glowTwo: "rgba(57,127,147,0.52)", glowThree: "rgba(89,87,158,0.37)" }
      : { base: "#315F7A", glowOne: "rgba(112,226,199,0.62)", glowTwo: "rgba(83,151,181,0.58)", glowThree: "rgba(130,119,206,0.42)" };
  }

  if (pathname.startsWith("/scenes") || pathname.startsWith("/scene-") || pathname.startsWith("/public-scene") || pathname.startsWith("/now-playing")) {
    return isDark
      ? { base: "#18376B", glowOne: "rgba(116,224,207,0.58)", glowTwo: "rgba(61,133,204,0.55)", glowThree: "rgba(115,102,210,0.4)" }
      : { base: "#315F8F", glowOne: "rgba(117,228,207,0.68)", glowTwo: "rgba(70,132,205,0.60)", glowThree: "rgba(139,119,220,0.40)" };
  }

  if (pathname.startsWith("/live-stage") || pathname.startsWith("/stage-") || pathname.startsWith("/create-stage") || pathname.startsWith("/managed-stages")) {
    return isDark
      ? { base: "#24345D", glowOne: "rgba(139,111,210,0.52)", glowTwo: "rgba(61,185,174,0.48)", glowThree: "rgba(220,129,113,0.32)" }
      : { base: "#536590", glowOne: "rgba(175,151,232,0.61)", glowTwo: "rgba(105,217,199,0.54)", glowThree: "rgba(242,167,151,0.40)" };
  }

  return isDark
    ? { base: "#15354F", glowOne: "rgba(112,221,199,0.54)", glowTwo: "rgba(58,108,199,0.48)", glowThree: "rgba(139,104,232,0.36)" }
    : { base: "#315F8F", glowOne: "rgba(117,228,207,0.74)", glowTwo: "rgba(70,132,205,0.58)", glowThree: "rgba(139,119,220,0.34)" };
}

export function CanalAmbientBackground() {
  const {
    override,
  } = use(CanalAtmosphereContext);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const isDark = useColorScheme() === "dark";
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
      duration: CANAL_ATMOSPHERE_TRANSITION_MS,
      easing: Easing.inOut(Easing.sin),
    };

    baseColor.value = withTiming(atmosphere.base, timing);
  }, [
    atmosphere.base,
    baseColor,
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
      duration: CANAL_ATMOSPHERE_TRANSITION_MS,
      easing: Easing.inOut(Easing.sin),
    });
  }, [
    atmosphere,
    gradientProgress,
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
    backgroundColor: "rgba(4, 23, 39, 0.08)",
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
