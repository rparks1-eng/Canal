import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";

export function VerifiedAccountBadge({ size = 18 }: { size?: number }) {
  return (
    <Ionicons
      accessibilityLabel="Verified music account"
      color="#168AF4"
      name="checkmark-circle"
      size={size}
      style={styles.badge}
    />
  );
}

const styles = StyleSheet.create({ badge: { flexShrink: 0 } });
