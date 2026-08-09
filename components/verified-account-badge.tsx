import { Image } from "expo-image";
import { StyleSheet } from "react-native";

export function VerifiedAccountBadge({ size = 18 }: { size?: number }) {
  return <Image accessibilityLabel="Verified music account" contentFit="contain" source={require("../assets/badges/verified-music.png")} style={[styles.badge, { width: size, height: size }]} />;
}

const styles = StyleSheet.create({ badge: { flexShrink: 0 } });
