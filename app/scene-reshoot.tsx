import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";
import { SceneCardBackdrop } from "../components/canal-ui/scene-card-visual";
import { scenePresentation } from "../components/canal-ui/scene-signature";
import { readScenes, type StoredScene } from "../lib/scenes";
import { loadPublicScene, type PublicCanalScene } from "../lib/social";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { useAuth } from "../providers/auth-provider";

export default function SceneReshootScreen(): React.JSX.Element {
  const { user, accountEpoch, sessionGeneration } = useAuth();
  const accountKey = `${user?.id ?? ""}:${accountEpoch}:${sessionGeneration}`;
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;
  const params = useLocalSearchParams<{ ownerId?: string; sceneId?: string }>();
  const ownerId = typeof params.ownerId === "string" ? params.ownerId : "";
  const sceneId = typeof params.sceneId === "string" ? params.sceneId : "";
  const [source, setSource] = useState<PublicCanalScene | null>(null);
  const [library, setLibrary] = useState<StoredScene[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const operationAccountKey = accountKey;
    void Promise.all([loadPublicScene(ownerId, sceneId), readScenes()]).then(([publicScene, scenes]) => {
      if (!active || operationAccountKey !== accountKeyRef.current) return;
      setSource(publicScene);
      setLibrary(scenes.filter((scene) => scene.libraryType === "created").slice(0, 30));
    }).catch((cause: unknown) => { if (active && operationAccountKey === accountKeyRef.current) setError(cause instanceof Error ? cause.message : "Canal could not prepare this Reshoot."); }).finally(() => { if (active && operationAccountKey === accountKeyRef.current) setLoading(false); });
    return () => { active = false; };
  }, [accountKey, ownerId, sceneId]);

  const begin = (): void => {
    router.push({ pathname: "/scene-studio", params: { mode: "new", reset: `${Date.now()}`, reshootOwnerId: ownerId, reshootSceneId: sceneId, combineSceneIds: selected.join(",") } } as never);
  };
  const presentation = source ? scenePresentation(source.scene) : null;
  return <SafeAreaView edges={["top", "bottom"]} style={styles.screen}><CanalAmbientBackground /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityLabel="Back from Reshoot" accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/explore")} style={styles.iconButton}><Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} /></Pressable><View style={styles.headerCopy}><Text style={styles.kicker}>MAKE IT YOURS</Text><Text accessibilityRole="header" style={styles.title}>Reshoot this Scene</Text></View></View>
    {loading ? <ActivityIndicator color={canalDynamicColors.mint} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {source && presentation ? <View style={[styles.source, { backgroundColor: presentation.colors[2] }]}><SceneCardBackdrop presentation={presentation} scene={source.scene} /><Text style={styles.sourceLabel}>INSPIRATION</Text><Text style={styles.sourceName}>{source.scene.name}</Text><Text style={styles.sourceMeta}>{source.scene.activity} · {source.scene.emotions || "Open mood"}</Text></View> : null}
    {source ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Blend with your Library</Text><Text style={styles.sectionMeta}>{selected.length}/4</Text></View><Text style={styles.helper}>Optional. Choose up to four personal Scenes, or continue with only your music taste.</Text><View style={styles.sceneGrid}>{library.map((scene) => { const isSelected = selected.includes(scene.id); const colors = scenePresentation(scene); return <Pressable accessibilityLabel={`Blend ${scene.name}`} accessibilityRole="button" accessibilityState={{ selected: isSelected }} key={scene.id} onPress={() => setSelected((current) => isSelected ? current.filter((id) => id !== scene.id) : current.length < 4 ? [...current, scene.id] : current)} style={[styles.sceneChoice, isSelected && { borderColor: colors.accent }]}><View style={[styles.sceneSwatch, { backgroundColor: colors.colors[2] }]} /><View style={styles.sceneCopy}><Text numberOfLines={1} style={styles.sceneName}>{scene.name}</Text><Text numberOfLines={1} style={styles.sceneMeta}>{scene.activity} · {scene.emotions || scene.genres}</Text></View>{isSelected ? <Ionicons color={colors.accent} name="checkmark-circle" size={20} /> : null}</Pressable>; })}</View><Pressable accessibilityLabel="Open Reshoot in Scene Studio" accessibilityRole="button" onPress={begin} style={styles.begin}><Text style={styles.beginText}>{selected.length > 0 ? "Blend and open Studio" : "Reshoot with my taste"}</Text><Ionicons color="#103C46" name="arrow-forward" size={19} /></Pressable></> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ screen:{backgroundColor:"transparent",flex:1},content:{gap:14,paddingBottom:120,paddingHorizontal:18},header:{alignItems:"center",flexDirection:"row",gap:8},iconButton:{alignItems:"center",height:48,justifyContent:"center",width:48},headerCopy:{flex:1},kicker:{color:canalDynamicColors.mint,fontSize:9,fontWeight:"900",letterSpacing:1.3},title:{color:canalDynamicColors.text,fontFamily:"Georgia",fontSize:28},source:{borderRadius:24,minHeight:160,overflow:"hidden",padding:18,justifyContent:"flex-end"},sourceLabel:{color:"rgba(255,255,255,.65)",fontSize:9,fontWeight:"900",letterSpacing:1.3},sourceName:{color:"#FFFFFF",fontFamily:"Georgia",fontSize:28,fontWeight:"700"},sourceMeta:{color:"rgba(255,255,255,.74)",fontSize:11,marginTop:3},sectionHeader:{alignItems:"center",flexDirection:"row",justifyContent:"space-between"},sectionTitle:{color:canalDynamicColors.text,fontFamily:"Georgia",fontSize:20},sectionMeta:{color:canalDynamicColors.mint,fontSize:11,fontWeight:"900"},helper:{color:canalDynamicColors.muted,fontSize:12,lineHeight:17},sceneGrid:{gap:5},sceneChoice:{alignItems:"center",borderBottomColor:canalDynamicColors.line,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:"row",gap:10,minHeight:58,paddingHorizontal:2},sceneSwatch:{borderRadius:8,height:34,width:34},sceneCopy:{flex:1,minWidth:0},sceneName:{color:canalDynamicColors.text,fontSize:13,fontWeight:"800"},sceneMeta:{color:canalDynamicColors.muted,fontSize:10,marginTop:2},begin:{alignItems:"center",backgroundColor:"#DFFFF7",borderRadius:17,flexDirection:"row",gap:8,justifyContent:"center",minHeight:52,paddingHorizontal:18},beginText:{color:"#103C46",fontSize:14,fontWeight:"900"},error:{color:canalDynamicColors.danger,fontSize:13} });
