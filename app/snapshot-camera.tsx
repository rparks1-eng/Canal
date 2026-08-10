import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type CameraMode, type CameraType } from "expo-camera";
import { Image } from "expo-image";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SnapshotMediaPreview } from "../components/snapshot-media-preview";
import {
  cleanupSnapshotMediaDraft,
  persistSnapshotCaptureDraft,
  reapExpiredSnapshotMediaDrafts,
} from "../lib/snapshot-media-production";
import { useAuth } from "../providers/auth-provider";

type Capture = { uri: string; type: "photo" | "video" };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default function SnapshotCameraScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();
  const draftScope = `${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`;
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const captureRef = useRef<Capture | null>(null);
  const handedOffRef = useRef(false);
  const [mode, setMode] = useState<CameraMode>("picture");
  const [facing, setFacing] = useState<CameraType>("back");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { reapExpiredSnapshotMediaDrafts(); } catch { /* Draft cleanup retries on the next camera launch. */ }
    return () => {
      if (!handedOffRef.current) cleanupSnapshotMediaDraft(captureRef.current?.uri, draftScope);
    };
  }, [draftScope]);

  useEffect(() => { captureRef.current = capture; }, [capture]);

  useFocusEffect(
    useCallback(() => {
      if (captureRef.current) handedOffRef.current = false;
    }, []),
  );

  useEffect(() => {
    if (!recording || recordingPaused) return;
    const timer = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => clearInterval(timer);
  }, [recording, recordingPaused]);

  useEffect(() => {
    if (recording && secondsRemaining === 0) camera.current?.stopRecording();
  }, [recording, secondsRemaining]);

  const returnToSource = () => router.canGoBack() ? router.back() : router.replace("/(tabs)");

  const cancelPreview = () => {
    cleanupSnapshotMediaDraft(capture?.uri, draftScope);
    captureRef.current = null;
    setCapture(null);
    handedOffRef.current = false;
    returnToSource();
  };

  async function takePhoto() {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const result = await camera.current.takePictureAsync({ quality: 0.85 });
      if (result?.uri) setCapture(persistSnapshotCaptureDraft({ uri: result.uri, type: "photo" }, draftScope));
    } catch { Alert.alert("Camera unavailable", "Canal could not take that photo. Try again."); }
    finally { setBusy(false); }
  }

  async function toggleRecording() {
    if (!camera.current) return;
    if (recording) {
      const supportsPause = camera.current.getSupportedFeatures().toggleRecordingAsyncAvailable;
      if (!supportsPause) {
        Alert.alert("Pause unavailable", "This device cannot pause a recording. Finish this clip or record a new one.");
        return;
      }
      try {
        await camera.current.toggleRecordingAsync();
        setRecordingPaused((current) => !current);
      } catch {
        Alert.alert("Video unavailable", "Canal could not pause or resume that video. Try finishing the clip.");
      }
      return;
    }
    if (busy) return;
    setSecondsRemaining(10);
    setRecordingPaused(false);
    setRecording(true);
    setBusy(true);
    try {
      const result = await camera.current.recordAsync({ maxDuration: 10 });
      if (result?.uri) setCapture(persistSnapshotCaptureDraft({ uri: result.uri, type: "video" }, draftScope));
    } catch { Alert.alert("Video unavailable", "Canal could not record that video. Try again."); }
    finally { setRecording(false); setRecordingPaused(false); setBusy(false); setSecondsRemaining(10); }
  }

  function finishRecording() {
    if (!recording) return;
    camera.current?.stopRecording();
  }

  function useCapture() {
    if (!capture) return;
    handedOffRef.current = true;
    router.push({
      pathname: "/scene-snapshot",
      params: {
        stageId: first(params.stageId), sceneId: first(params.sceneId), sceneName: first(params.sceneName), source: first(params.source),
        trackId: first(params.trackId), trackTitle: first(params.trackTitle), trackArtist: first(params.trackArtist),
        trackImageUrl: first(params.trackImageUrl),
        spotifyUrl: first(params.spotifyUrl), mood: first(params.mood), mediaUri: capture.uri, mediaType: capture.type,
      },
    });
  }

  if (!permission) return <SafeAreaView style={styles.center}><ActivityIndicator color="#75E5CE" /></SafeAreaView>;
  if (!permission.granted) return (
    <SafeAreaView style={styles.permission}>
      <Stack.Screen options={{ headerShown: false }} />
      <Ionicons name="camera-outline" size={38} color={canalDynamicColors.mint} />
      <Text style={styles.title}>Camera access</Text>
      <Text style={styles.copy}>Allow Canal to capture a photo or short video for this Snapshot. Your media is saved only when you post the Snapshot.</Text>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={() => permission.canAskAgain ? void requestPermission() : void Linking.openSettings()}>
        <Text style={styles.primaryText}>{permission.canAskAgain ? "Allow camera" : "Open Settings"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={returnToSource}><Text style={styles.secondaryText}>Go back</Text></Pressable>
    </SafeAreaView>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {capture ? (
        <SafeAreaView style={styles.preview}>
          <SnapshotMediaPreview uri={capture.uri} type={capture.type} height={520} autoPlay />
          <View style={styles.songCard}>
            {first(params.trackImageUrl) ? (
              <Image
                accessibilityLabel={`${first(params.trackTitle) || "Snapshot song"} artwork`}
                contentFit="cover"
                source={{ uri: first(params.trackImageUrl) }}
                style={styles.songArtwork}
                transition={160}
              />
            ) : (
              <View style={styles.songArtworkFallback}>
                <Ionicons name="musical-note" size={17} color={canalDynamicColors.mint} />
              </View>
            )}
            <View style={styles.songText}><Text style={styles.songTitle}>{first(params.trackTitle) || first(params.sceneName) || "Scene Snapshot"}</Text><Text style={styles.songArtist}>{first(params.trackArtist) || "Canal"}</Text></View>
          </View>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel Snapshot" style={styles.cancel} onPress={cancelPreview}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Retake" style={styles.secondary} onPress={() => { cleanupSnapshotMediaDraft(capture.uri, draftScope); setCapture(null); }}><Text style={styles.secondaryText}>Retake</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Use in Snapshot" style={styles.primary} onPress={useCapture}><Text style={styles.primaryText}>Use in Snapshot</Text></Pressable>
          </View>
        </SafeAreaView>
      ) : (
        <View style={styles.camera}>
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} mode={mode} mute={false} />
          <SafeAreaView pointerEvents="box-none" style={styles.cameraChrome}>
            <View style={styles.topRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconHit} onPress={returnToSource}><Ionicons name="chevron-back" size={26} color="white" /></Pressable>
              <Text style={styles.cameraTitle}>{first(params.sceneName) || "Snapshot"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Flip camera" accessibilityState={{ disabled: recording }} disabled={recording} style={[styles.iconHit, recording && styles.disabled]} onPress={() => setFacing((value) => value === "back" ? "front" : "back")}><Ionicons name="camera-reverse-outline" size={25} color="white" /></Pressable>
            </View>
            <View style={styles.bottom}>
              <View style={styles.modeRow}>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: recording }} disabled={recording} onPress={() => setMode("picture")} style={styles.modeHit}><Text style={[styles.modeText, mode === "picture" && styles.modeActive]}>PHOTO</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: recording }} disabled={recording} onPress={() => setMode("video")} style={styles.modeHit}><Text style={[styles.modeText, mode === "video" && styles.videoModeActive]}>VIDEO</Text></Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={recording ? recordingPaused ? "Resume video recording" : "Pause video recording" : mode === "picture" ? "Take photo" : "Start video recording"}
                disabled={busy && !recording}
                style={[styles.shutter, mode === "video" && styles.videoShutter, recording && styles.shutterRecording]}
                onPress={() => mode === "picture" ? void takePhoto() : void toggleRecording()}
              >
                {recording ? (
                  <Ionicons name={recordingPaused ? "play" : "pause"} size={27} color="white" />
                ) : (
                  <View style={[styles.shutterCore, mode === "video" && styles.videoShutterCore]} />
                )}
              </Pressable>
              {recording ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Finish video clip" style={styles.finishRecording} onPress={finishRecording}>
                  <Ionicons name="stop" size={16} color="white" />
                  <Text style={styles.finishRecordingText}>Finish clip</Text>
                </Pressable>
              ) : null}
              <Text accessibilityLiveRegion="polite" style={styles.hint}>
                {mode === "video" ? recording ? `${recordingPaused ? "Paused" : "Recording"} • ${secondsRemaining} sec left` : "10 second video" : "Capture the moment with the music"}
              </Text>
            </View>
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#090D12"},center:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#090D12"},permission:{flex:1,backgroundColor:"#090D12",padding:28,justifyContent:"center",alignItems:"center",gap:16},title:{fontSize:28,fontWeight:"700",color:"#F7FAFC"},copy:{fontSize:16,lineHeight:24,textAlign:"center",color:"#BCC8D5",maxWidth:360},primary:{minHeight:52,paddingHorizontal:22,borderRadius:18,backgroundColor:"#75E5CE",alignItems:"center",justifyContent:"center"},primaryText:{color:"#09201C",fontSize:16,fontWeight:"700"},secondary:{minHeight:52,paddingHorizontal:18,borderRadius:18,borderWidth:1,borderColor:"#52606D",alignItems:"center",justifyContent:"center"},cancel:{minHeight:52,paddingHorizontal:10,alignItems:"center",justifyContent:"center"},secondaryText:{color:"#F7FAFC",fontSize:16,fontWeight:"600"},camera:{flex:1},cameraChrome:{flex:1,justifyContent:"space-between",paddingHorizontal:18,paddingBottom:24},topRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},iconHit:{width:48,height:48,alignItems:"center",justifyContent:"center",borderRadius:24,backgroundColor:"rgba(0,0,0,.42)"},disabled:{opacity:.48},cameraTitle:{color:"white",fontSize:17,fontWeight:"700",maxWidth:"65%"},bottom:{alignItems:"center",gap:14},modeRow:{flexDirection:"row",gap:12,backgroundColor:"rgba(0,0,0,.46)",borderRadius:22,paddingHorizontal:8},modeHit:{minHeight:44,paddingHorizontal:16,justifyContent:"center"},modeText:{color:"#D2D8DF",fontSize:12,fontWeight:"700",letterSpacing:1},modeActive:{color: canalDynamicColors.mint},videoModeActive:{color:"#FF5757"},shutter:{width:78,height:78,borderRadius:39,borderWidth:5,borderColor:"white",alignItems:"center",justifyContent:"center"},videoShutter:{borderColor:"#FF5757"},shutterCore:{width:60,height:60,borderRadius:30,backgroundColor:"white"},videoShutterCore:{backgroundColor:"#FF3B30"},shutterRecording:{backgroundColor:"#FF3B30",borderColor:"white"},finishRecording:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderRadius:18,backgroundColor:"rgba(0,0,0,.58)",paddingHorizontal:18},finishRecordingText:{color:"white",fontSize:13,fontWeight:"700"},hint:{color:"white",fontSize:13,fontWeight:"600",textShadowColor:"black",textShadowRadius:4},preview:{flex:1,padding:16,gap:14,justifyContent:"center"},songCard:{minHeight:64,flexDirection:"row",alignItems:"center",gap:12,padding:10},songArtwork:{width:48,height:48,borderRadius:10},songArtworkFallback:{width:48,height:48,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(255,255,255,.1)"},songText:{flex:1},songTitle:{color:"#F7FAFC",fontSize:16,fontWeight:"700"},songArtist:{color:"#AEBBC8",fontSize:14,marginTop:3},row:{flexDirection:"row",gap:8,justifyContent:"flex-end"},
});
