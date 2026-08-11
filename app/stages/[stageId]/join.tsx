import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { CanalAlert } from "../../../lib/canal-alert";

import { PublicPreviewActions, PublicPreviewState } from "../../../components/public-preview";
import { getPublicStageLinkPreview, type PublicLinkPreview } from "../../../lib/public-link-previews";
import { redeemStageInviteToken } from "../../../lib/stage-invite-tokens";
import { useAuth } from "../../../providers/auth-provider";
import { canalDynamicColors } from "../../../theme/canal-dynamic-colors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export default function StageInvitePreviewScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ stageId?: string; invite?: string }>();
  const stageId = typeof params.stageId === "string" ? params.stageId : "";
  const invite = typeof params.invite === "string" ? params.invite : "";
  const destination = `/stages/${stageId}/join?invite=${encodeURIComponent(invite)}`;
  const [preview, setPreview] = useState<PublicLinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    let active = true;
    if (!UUID_PATTERN.test(stageId) || !TOKEN_PATTERN.test(invite)) {
      setLoading(false);
      return () => { active = false; };
    }
    void getPublicStageLinkPreview(stageId)
      .then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setPreview(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [invite, stageId]);

  const join = async () => {
    if (!user || redeeming) return;
    setRedeeming(true);
    try {
      await redeemStageInviteToken(stageId, invite);
      router.replace({ pathname: "/live-stage/[stageId]", params: { stageId } });
    } catch (error) {
      setExpired(true);
      CanalAlert.alert("Invitation unavailable", error instanceof Error ? error.message : "This Stage invitation is unavailable.");
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.safe}><PublicPreviewState status="loading" /></SafeAreaView>;
  if (expired) return <SafeAreaView style={styles.safe}><PublicPreviewState status="expired" /></SafeAreaView>;
  if (!TOKEN_PATTERN.test(invite)) return <SafeAreaView style={styles.safe}><PublicPreviewState status="not-found" /></SafeAreaView>;

  if (!preview) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>PRIVATE CANAL INVITATION</Text>
          <Text accessibilityRole="header" style={styles.title}>You’re invited into a Stage.</Text>
          <Text style={styles.body}>Stage details stay private until this invitation is safely redeemed.</Text>
          <PublicPreviewActions destination={destination} signedIn={Boolean(user)} primaryLabel={redeeming ? "Opening Stage…" : "Join Stage"} onPrimary={() => void join()} />
        </View>
      </SafeAreaView>
    );
  }

  const name = typeof preview.name === "string" ? preview.name : "Live Stage";
  const host = typeof preview.hostDisplayName === "string" ? preview.hostDisplayName : "Canal host";
  const activity = typeof preview.activity === "string" ? preview.activity : "Listening together";
  if (preview.status !== "live") return <SafeAreaView style={styles.safe}><PublicPreviewState status="expired" /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>LIVE ON CANAL</Text>
        <Text accessibilityRole="header" style={styles.title}>{name}</Text>
        <Text style={styles.body}>Hosted by {host} · {activity}</Text>
        <PublicPreviewActions destination={destination} signedIn={Boolean(user)} primaryLabel={redeeming ? "Opening Stage…" : "Join Stage"} onPrimary={() => void join()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#0A2030", flex: 1 },
  content: { flex: 1, gap: 16, justifyContent: "center", padding: 28 },
  eyebrow: { color: "#72D8C4", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, fontWeight: "700" },
  body: { color: canalDynamicColors.muted, fontSize: 15, lineHeight: 23, marginBottom: 8 },
});
