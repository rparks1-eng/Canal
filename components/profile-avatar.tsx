import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { canalProfileAvatarImageSource } from "../lib/canal-profile-avatars";

type ProfileAvatarProps = {
  avatarUrl?: string | null;
  displayName: string;
  size?: number;
};

function profileInitials(displayName: string): string {
  return displayName.trim().split(/\s+/u).filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("") || "C";
}

export function ProfileAvatar({ avatarUrl, displayName, size = 48 }: ProfileAvatarProps) {
  const dimension = Math.max(24, size);
  const imageSource = canalProfileAvatarImageSource(avatarUrl);

  return (
    <View
      accessibilityLabel={`${displayName} profile picture`}
      style={[styles.avatar, { width: dimension, height: dimension, borderRadius: dimension / 2 }]}
    >
      {imageSource ? (
        <Image contentFit="cover" source={imageSource} style={styles.image} transition={140} />
      ) : (
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[styles.initials, { fontSize: Math.max(11, Math.round(dimension * 0.3)) }]}
        >
          {profileInitials(displayName)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: canalDynamicColors.elevated,
  },
  image: { width: "100%", height: "100%" },
  initials: {
    maxWidth: "78%",
    color: canalDynamicColors.gold,
    fontWeight: "800",
    textAlign: "center",
  },
});
