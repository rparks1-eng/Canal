import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, View } from "react-native";

type Props = { uri: string; type: "photo" | "video"; height?: number; background?: boolean; autoPlay?: boolean };

function SnapshotVideo({ uri, background = false, autoPlay = false }: { uri: string; background?: boolean; autoPlay?: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = background;
    if (background || autoPlay) instance.play();
  });
  return <VideoView player={player} style={styles.media} nativeControls={!background} contentFit="cover" />;
}

export function SnapshotMediaPreview({ uri, type, height = 360, background = false, autoPlay = false }: Props) {
  return (
    <View style={background ? styles.backgroundFrame : [styles.frame, { height }]}>
      {type === "video" ? (
        <SnapshotVideo uri={uri} background={background} autoPlay={autoPlay} />
      ) : (
        <Image source={{ uri }} style={styles.media} contentFit="cover" transition={180} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", overflow: "hidden", borderRadius: 24, backgroundColor: "#10151D" },
  backgroundFrame: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  media: { width: "100%", height: "100%" },
});
