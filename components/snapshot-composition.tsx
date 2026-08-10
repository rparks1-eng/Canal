import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { forwardRef, type RefObject } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Snapshot } from "../lib/snapshots";
import type { SnapshotTemplateTheme } from "../lib/snapshot-templates";
import { LivingCover } from "./living-cover";
import { SnapshotMediaPreview } from "./snapshot-media-preview";

type SnapshotCompositionProps = {
  snapshot: Snapshot;
  height?: number;
  compact?: boolean;
  exportBrand?: boolean;
  overlayRef?: RefObject<View | null>;
};

export const SnapshotComposition = forwardRef<View, SnapshotCompositionProps>(function SnapshotComposition({
  snapshot,
  height = 430,
  compact = false,
  exportBrand = false,
  overlayRef,
}, ref) {
  const palette = snapshotPalette(snapshot.templateTheme);

  return (
    <View
      ref={ref}
      collapsable={false}
      accessibilityLabel={`${snapshot.sceneName} Snapshot composition`}
      style={[
        styles.frame,
        { height, backgroundColor: palette.backgroundColor },
      ]}
    >
      {snapshot.mediaUri && snapshot.mediaType ? (
        <SnapshotMediaPreview
          uri={snapshot.mediaUri}
          type={snapshot.mediaType}
          background
        />
      ) : (
        <LivingCover
          activity={snapshot.sceneActivity}
          capturedAt={snapshot.createdAt}
          mood={snapshot.mood}
          showCopy={false}
          style={styles.livingCover}
          title={snapshot.sceneName}
        />
      )}

      <View ref={overlayRef} collapsable={false} pointerEvents="none" style={styles.overlayCanvas}>
      <View style={snapshot.mediaUri ? styles.scrim : styles.coverScrim} />

      {exportBrand ? (
        <Text
          numberOfLines={1}
          style={[
            styles.brand,
            compact && styles.compactBrand,
            { color: palette.textColor },
          ]}
        >
          canal
        </Text>
      ) : null}

      <View style={[styles.bottom, compact && styles.compactBottom]}>
        {snapshot.sceneActivity ? (
          <Text
            numberOfLines={1}
            style={[
              styles.activity,
              compact && styles.compactActivity,
              { color: palette.accentColor },
            ]}
          >
            {snapshot.sceneActivity}
          </Text>
        ) : null}

        <Text
          numberOfLines={compact ? 1 : 2}
          style={[
            styles.sceneName,
            compact && styles.compactSceneName,
            { color: palette.textColor },
          ]}
        >
          {snapshot.sceneName}
        </Text>

        {snapshot.mood ? (
          <Text
            numberOfLines={1}
            style={[
              styles.mood,
              compact && styles.compactMood,
              { color: palette.mutedTextColor },
            ]}
          >
            {snapshot.mood}
          </Text>
        ) : null}

        {snapshot.trackTitle ? (
          <View style={[styles.track, compact && styles.compactTrack]}>
            {snapshot.trackImageUrl ? (
              <Image
                accessibilityLabel={`${snapshot.trackTitle} artwork`}
                source={{ uri: snapshot.trackImageUrl }}
                style={[styles.artwork, compact && styles.compactArtwork]}
                contentFit="cover"
                transition={160}
              />
            ) : (
              <View style={[styles.artwork, styles.artworkFallback, compact && styles.compactArtwork]}>
                <Ionicons name="musical-note" size={compact ? 11 : 18} color={palette.accentColor} />
              </View>
            )}

            <View style={styles.trackCopy}>
              <Text
                numberOfLines={1}
                style={[
                  styles.trackTitle,
                  compact && styles.compactTrackTitle,
                  { color: palette.textColor },
                ]}
              >
                {snapshot.trackTitle}
              </Text>
              {snapshot.trackArtist ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.trackArtist,
                    compact && styles.compactTrackArtist,
                    { color: palette.mutedTextColor },
                  ]}
                >
                  {snapshot.trackArtist}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {snapshot.note ? (
          <Text
            numberOfLines={1}
            style={[
              styles.note,
              compact && styles.compactNote,
              { color: palette.textColor },
            ]}
          >
            {snapshot.note}
          </Text>
        ) : null}
      </View>
      </View>
    </View>
  );
});

function snapshotPalette(theme?: SnapshotTemplateTheme) {
  if (theme === "paper") {
    return {
      backgroundColor: "#F6EFE5",
      textColor: "#241D19",
      mutedTextColor: "#5F554E",
      accentColor: "#B74F2A",
    };
  }

  if (theme === "midnight") {
    return {
      backgroundColor: "#111825",
      textColor: "#FFFFFF",
      mutedTextColor: "#D7DFEA",
      accentColor: "#75D7C3",
    };
  }

  return {
    backgroundColor: "#C95B34",
    textColor: "#FFFFFF",
    mutedTextColor: "#FBE3D8",
    accentColor: "#FFD080",
  };
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  livingCover: {
    ...StyleSheet.absoluteFillObject,
    aspectRatio: undefined,
    borderRadius: 0,
    minHeight: 0,
  },
  coverScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 8, 9, 0.18)",
  },
  overlayCanvas: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 10, 15, 0.28)",
  },
  brand: {
    position: "absolute",
    top: 22,
    left: 22,
    right: 22,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  compactBrand: {
    top: 8,
    left: 9,
    right: 9,
    fontSize: 7,
    letterSpacing: 0.7,
  },
  bottom: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 22,
    gap: 5,
  },
  compactBottom: {
    left: 9,
    right: 9,
    bottom: 8,
    gap: 1,
  },
  activity: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  compactActivity: { fontSize: 7 },
  sceneName: {
    fontFamily: "Georgia",
    fontSize: 31,
    fontWeight: "700",
    lineHeight: 35,
  },
  compactSceneName: { fontSize: 14, lineHeight: 16 },
  mood: { fontSize: 14, fontWeight: "600" },
  compactMood: { fontSize: 8 },
  track: {
    minHeight: 58,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  compactTrack: {
    minHeight: 28,
    marginTop: 3,
    gap: 5,
  },
  artwork: { width: 44, height: 44, borderRadius: 10 },
  compactArtwork: { width: 22, height: 22, borderRadius: 5 },
  artworkFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  trackCopy: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14, fontWeight: "800" },
  compactTrackTitle: { fontSize: 8 },
  trackArtist: { paddingTop: 2, fontSize: 12, fontWeight: "600" },
  compactTrackArtist: { paddingTop: 0, fontSize: 7 },
  note: {
    paddingLeft: 54,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  compactNote: {
    paddingLeft: 27,
    fontSize: 8,
    lineHeight: 10,
  },
});
