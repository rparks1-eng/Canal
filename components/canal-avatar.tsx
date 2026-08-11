import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Image,
} from "expo-image";

import {
  CANAL_AVATARS,
  parseCanalAvatarId,
} from "../lib/profile-avatar";

import { canalDynamicColors } from "../theme/canal-dynamic-colors";

export function CanalAvatar(
  props: {
    avatarUrl?: string | null;
    fallbackText: string;
    size?: number;
  },
) {
  const size =
    props.size ?? 78;
  const avatarId =
    parseCanalAvatarId(
      props.avatarUrl,
    );
  const definition =
    CANAL_AVATARS.find(
      (avatar) =>
        avatar.id ===
        avatarId,
    );
  const circleStyle = {
    width: size,
    height: size,
    borderRadius:
      size / 2,
  };

  if (
    props.avatarUrl &&
    !definition
  ) {
    return (
      <Image
        accessibilityLabel="Profile picture"
        contentFit="cover"
        source={{
          uri:
            props.avatarUrl,
        }}
        style={[
          styles.image,
          circleStyle,
        ]}
      />
    );
  }

  if (definition) {
    return (
      <View
        accessibilityLabel={`${definition.name} Canal profile picture`}
        style={[
          styles.generated,
          circleStyle,
          {
            backgroundColor:
              definition.colors[1],
          },
        ]}
      >
        <View
          style={[
            styles.generatedTop,
            {
              backgroundColor:
                definition.colors[0],
            },
          ]}
        />

        <View
          style={[
            styles.generatedMiddle,
            {
              backgroundColor:
                definition.colors[2],
            },
          ]}
        />

        <View
          style={[
            styles.generatedBottom,
            {
              backgroundColor:
                definition.colors[3],
            },
          ]}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="Profile picture"
      style={[
        styles.fallback,
        circleStyle,
      ]}
    >
      <Text
        style={[
          styles.fallbackText,
          {
            fontSize:
              size * 0.32,
          },
        ]}
      >
        {props.fallbackText}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    image: {
      backgroundColor:
        "#D8E8F0",
    },
    generated: {
      overflow:
        "hidden",
      boxShadow:
        "inset 0 0 0 1px rgba(255,255,255,0.38)",
    },
    generatedTop: {
      position:
        "absolute",
      width: "112%",
      height: "64%",
      left: "-28%",
      top: "-9%",
      borderRadius: 999,
      opacity: 0.88,
      transform: [
        {
          rotate:
            "-20deg",
        },
      ],
    },
    generatedMiddle: {
      position:
        "absolute",
      width: "74%",
      height: "55%",
      left: "17%",
      top: "37%",
      borderRadius: 999,
      opacity: 0.48,
      transform: [
        {
          rotate:
            "-13deg",
        },
      ],
    },
    generatedBottom: {
      position:
        "absolute",
      width: "102%",
      height: "76%",
      right: "-35%",
      bottom: "-21%",
      borderRadius: 999,
      opacity: 0.82,
      transform: [
        {
          rotate:
            "21deg",
        },
      ],
    },
    fallback: {
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow:
        "hidden",
      backgroundColor:
        canalDynamicColors.lavender,
    },
    fallbackText: {
      color: canalDynamicColors.onAccent,
      fontWeight:
        "500",
    },
  });
