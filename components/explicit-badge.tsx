import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type ExplicitBadgeProps = {
  explicit?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Apple-style explicit-content mark used beside track artwork throughout Canal. */
export function ExplicitBadge({ explicit, style }: ExplicitBadgeProps) {
  if (!explicit) return null;

  return (
    <View
      accessibilityLabel="Explicit content"
      accessibilityRole="text"
      style={[styles.badge, style]}
    >
      <Text allowFontScaling={false} style={styles.badgeGlyph}>E</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderColor: "rgba(255,255,255,0.42)",
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  badgeGlyph: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
});
