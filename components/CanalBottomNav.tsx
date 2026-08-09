import { use, useEffect, useMemo, useRef } from "react";

import {
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";

import {
  router,
  usePathname,
} from "expo-router";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  BlurView,
} from "expo-blur";

import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  CanalAtmosphereContext,
  CANAL_ATMOSPHERE_TRANSITION_MS,
} from "../theme/canal-atmosphere-context";

const ITEMS = [
  {
    label: "Home",
    symbol: "home-outline",
    route: "/(tabs)",
    activePath: "/",
    primary: false,
  },
  {
    label: "Explore",
    symbol: "compass-outline",
    route: "/(tabs)/explore",
    activePath: "/explore",
    primary: false,
  },
  {
    label: "Create",
    symbol: "add",
    route: "/scene-studio",
    activePath: "/scene-studio",
    primary: true,
  },
  {
    label: "Library",
    symbol: "albums-outline",
    route: "/(tabs)/library",
    activePath: "/library",
    primary: false,
  },
  {
    label: "Profile",
    symbol: "person-outline",
    route: "/(tabs)/profile",
    activePath: "/profile",
    primary: false,
  },
] as const;

function isItemSelected(pathname: string, activePath: string): boolean {
  if (activePath === "/") {
    return pathname === "/" || pathname === "/(tabs)";
  }

  if (activePath === "/scene-studio") {
    return pathname.startsWith("/scene-") || pathname.startsWith("/snapshot-");
  }

  return pathname === activePath || pathname.startsWith(`${activePath}/`);
}

function selectedSymbol(symbol: string): string {
  return symbol.endsWith("-outline")
    ? symbol.slice(0, -8)
    : symbol;
}

function navigationAtmosphere(pathname: string, isDark: boolean) {
  if (pathname.startsWith("/explore") || pathname.startsWith("/snapshots")) {
    return {
      glass: isDark ? "rgba(53, 28, 65, 0.88)" : "rgba(252, 239, 247, 0.92)",
      accent: "#FFD1C9",
      accentText: "#522F54",
      selected: isDark ? "#FFE6E1" : "#65385E",
      border: isDark ? "rgba(255, 223, 218, 0.34)" : "rgba(82, 47, 84, 0.22)",
      shadow: "0 15px 42px rgba(44, 17, 57, 0.38)",
    };
  }
  if (pathname.startsWith("/library")) {
    return {
      glass: isDark ? "rgba(7, 48, 65, 0.88)" : "rgba(229, 250, 248, 0.92)",
      accent: "#D6FFF5",
      accentText: "#143F52",
      selected: isDark ? "#C7FFF2" : "#164B55",
      border: isDark ? "rgba(213, 255, 246, 0.34)" : "rgba(20, 63, 82, 0.20)",
      shadow: "0 15px 42px rgba(2, 39, 50, 0.36)",
    };
  }
  if (pathname.startsWith("/settings") || pathname.startsWith("/appearance") || pathname.startsWith("/data-controls") || pathname.startsWith("/music-services")) {
    return {
      glass: isDark ? "rgba(24, 41, 70, 0.9)" : "rgba(239, 241, 255, 0.93)",
      accent: "#E3DBFF",
      accentText: "#36345F",
      selected: isDark ? "#ECE7FF" : "#373C68",
      border: isDark ? "rgba(229, 222, 255, 0.34)" : "rgba(54, 52, 95, 0.20)",
      shadow: "0 15px 42px rgba(27, 30, 73, 0.38)",
    };
  }
  if (pathname.startsWith("/scenes") || pathname.startsWith("/scene-") || pathname.startsWith("/public-scene") || pathname.startsWith("/now-playing")) {
    return {
      glass: isDark ? "rgba(8, 43, 68, 0.9)" : "rgba(231, 247, 252, 0.93)",
      accent: "#C8FFF3",
      accentText: "#0C4157",
      selected: isDark ? "#D8FFF7" : "#124658",
      border: isDark ? "rgba(203, 255, 244, 0.36)" : "rgba(12, 65, 87, 0.20)",
      shadow: "0 15px 42px rgba(2, 33, 55, 0.38)",
    };
  }
  if (pathname.startsWith("/live-stage") || pathname.startsWith("/stage-") || pathname.startsWith("/create-stage") || pathname.startsWith("/managed-stages")) {
    return {
      glass: isDark ? "rgba(52, 39, 76, 0.9)" : "rgba(250, 240, 249, 0.93)",
      accent: "#FFD4C5",
      accentText: "#57374B",
      selected: isDark ? "#FFE2D8" : "#5D3B55",
      border: isDark ? "rgba(255, 218, 204, 0.34)" : "rgba(87, 55, 75, 0.20)",
      shadow: "0 15px 42px rgba(43, 25, 65, 0.38)",
    };
  }
  if (pathname.startsWith("/profile") || pathname.startsWith("/creator") || pathname.startsWith("/friend")) {
    return {
      glass: isDark ? "rgba(12, 45, 64, 0.9)" : "rgba(230, 249, 247, 0.93)",
      accent: "#C8FFF3",
      accentText: "#0D4354",
      selected: isDark ? "#D8FFF7" : "#134957",
      border: isDark ? "rgba(203, 255, 244, 0.34)" : "rgba(13, 67, 84, 0.20)",
      shadow: "0 15px 42px rgba(2, 34, 49, 0.38)",
    };
  }
  return {
    glass: isDark ? "rgba(3, 30, 50, 0.9)" : "rgba(230, 248, 249, 0.93)",
    accent: "#D9FFF6",
    accentText: "#0C4157",
    selected: isDark ? "#C8FFF3" : "#124756",
    border: isDark ? "rgba(217, 255, 246, 0.34)" : "rgba(12, 65, 87, 0.20)",
    shadow: "0 15px 42px rgba(0, 29, 44, 0.38)",
  };
}

export default function CanalBottomNav() {
  const { override } = use(CanalAtmosphereContext);
  const pathname = usePathname();
  const isDark = useColorScheme() === "dark";
  const reduceMotion = useReducedMotion();
  const navigationInFlightRef = useRef<string | null>(null);
  const navAtmosphere = useMemo(
    () => override ? {
      glass: override.navigation,
      accent: override.accent,
      accentText: override.accentText,
      selected: override.selected,
      border: override.border,
      shadow: override.shadow,
    } : navigationAtmosphere(pathname, isDark),
    [isDark, override, pathname],
  );
  const glassColor = useSharedValue(navAtmosphere.glass);
  const accentColor = useSharedValue(navAtmosphere.accent);
  const selectedColor = useSharedValue(navAtmosphere.selected);

  useEffect(() => {
    const timing = {
      duration: reduceMotion
        ? 0
        : override?.transitionMs ?? CANAL_ATMOSPHERE_TRANSITION_MS,
      easing: Easing.inOut(Easing.sin),
    };
    glassColor.value = withTiming(navAtmosphere.glass, timing);
    accentColor.value = withTiming(navAtmosphere.accent, timing);
    selectedColor.value = withTiming(navAtmosphere.selected, timing);
  }, [accentColor, glassColor, navAtmosphere, override?.transitionMs, reduceMotion, selectedColor]);

  useEffect(() => {
    navigationInFlightRef.current = null;
  }, [pathname]);

  const glassTintStyle = useAnimatedStyle(() => ({ backgroundColor: glassColor.value }));
  const createSurfaceStyle = useAnimatedStyle(() => ({ backgroundColor: accentColor.value }));
  const selectedTextStyle = useAnimatedStyle(() => ({ color: selectedColor.value }));
  const selectedMarkerStyle = useAnimatedStyle(() => ({ backgroundColor: selectedColor.value }));
  const neutralForeground = isDark
    ? "rgba(232, 250, 247, 0.74)"
    : "rgba(16, 54, 67, 0.72)";

  const navigationItems = (
    <View style={styles.itemsRow}>
      {ITEMS.map((item) => {
        const selected = isItemSelected(pathname, item.activePath);
        return (
          <Pressable
            key={item.label}
            accessibilityRole={item.primary ? "button" : "tab"}
            accessibilityLabel={item.primary ? "Create a new Scene" : item.label}
            accessibilityHint={item.primary ? "Opens Scene Studio." : `Opens your ${item.label.toLowerCase()} tab.`}
            accessibilityState={{ selected }}
            onPress={() => {
              if ((selected && !item.primary) || navigationInFlightRef.current) return;
              navigationInFlightRef.current = item.route;
              if (item.primary) {
                router.push({ pathname: item.route, params: { mode: "new", reset: String(Date.now()) } } as never);
              } else {
                router.replace(item.route);
              }
            }}
            style={({ pressed }) => [styles.item, item.primary && styles.primaryItem, pressed && styles.pressed]}
          >
            <Animated.View style={[styles.symbolContainer, item.primary && styles.primarySymbolContainer, item.primary && createSurfaceStyle]}>
              <Ionicons
                color={item.primary ? "rgba(7, 39, 51, 0.86)" : selected ? navAtmosphere.selected : neutralForeground}
                name={(selected ? selectedSymbol(item.symbol) : item.symbol) as never}
                size={item.primary ? 26 : 21}
              />
            </Animated.View>
            <Animated.Text numberOfLines={1} style={[styles.label, { color: neutralForeground }, selected && [styles.selectedLabel, selectedTextStyle]]}>
              {item.label}
            </Animated.Text>
            {selected ? <Animated.View pointerEvents="none" style={[styles.selectedMarker, selectedMarkerStyle]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
  const shellContents = <>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassTint, glassTintStyle]} />
    {navigationItems}
  </>;
  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <View accessibilityRole="tablist" style={styles.container}>
        <BlurView
          intensity={72}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.blurShell]}
          tint={isDark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
        />
        {shellContents}
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "transparent",
    },

    container: {
      minHeight: 70,
      marginHorizontal: 12,
      marginTop: 6,
      marginBottom: 4,
      borderRadius: 30,
      borderCurve: "continuous",
      overflow: "visible",
      boxShadow: "0 14px 40px rgba(0, 18, 34, 0.24)",
    },

    blurShell: {
      borderRadius: 30,
      borderCurve: "continuous",
      overflow: "hidden",
    },

    glassTint: {
      borderRadius: 28,
      overflow: "hidden",
      opacity: 0.34,
    },

    itemsRow: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingTop: 6,
      paddingBottom: 6,
    },

    item: {
      flex: 1,
      minWidth: 48,
      minHeight: 56,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },

    primaryItem: {
      overflow: "visible",
    },

    symbolContainer: {
      position: "absolute",
      top: 4,
      width: 32,
      height: 25,
      alignItems: "center",
      justifyContent: "center",
    },

    primarySymbolContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "#D9FFF6",
      top: -18,
      borderWidth: 2,
      borderColor: "rgba(217, 255, 246, 0.34)",
      boxShadow: "0 5px 16px rgba(0, 22, 36, 0.16)",
    },

    label: {
      position: "absolute",
      bottom: 6,
      fontSize: 10,
      fontWeight: "600",
    },

    selectedLabel: {
      fontWeight: "800",
    },

    selectedMarker: {
      position: "absolute",
      bottom: 0,
      width: 16,
      height: 2,
      borderRadius: 1,
      backgroundColor: "#C8FFF3",
    },

    pressed: {
      opacity: 0.65,
    },
  });
