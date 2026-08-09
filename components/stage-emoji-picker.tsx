import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { normalizeLiveStageMessageReaction } from "../lib/live-stages";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

type EmojiItem = { emoji: string; keywords: string; category: "Faces" | "Gestures" | "Hearts" | "Music" | "Moments" };

const EMOJI_ITEMS: readonly EmojiItem[] = [
  { emoji: "😀", keywords: "happy smile grin", category: "Faces" }, { emoji: "😂", keywords: "laugh funny tears", category: "Faces" },
  { emoji: "🥹", keywords: "tears touched", category: "Faces" }, { emoji: "😍", keywords: "love eyes", category: "Faces" },
  { emoji: "🤩", keywords: "star excited", category: "Faces" }, { emoji: "😎", keywords: "cool shades", category: "Faces" },
  { emoji: "🤯", keywords: "mind blown", category: "Faces" }, { emoji: "😭", keywords: "cry emotional", category: "Faces" },
  { emoji: "😮", keywords: "wow surprised", category: "Faces" }, { emoji: "😌", keywords: "calm relieved", category: "Faces" },
  { emoji: "🫡", keywords: "salute respect", category: "Faces" }, { emoji: "🤔", keywords: "thinking", category: "Faces" },
  { emoji: "👍", keywords: "like yes good", category: "Gestures" }, { emoji: "👎", keywords: "dislike no", category: "Gestures" },
  { emoji: "👏", keywords: "clap applause", category: "Gestures" }, { emoji: "🙌", keywords: "celebrate raised hands", category: "Gestures" },
  { emoji: "🤝", keywords: "deal together", category: "Gestures" }, { emoji: "🤘", keywords: "rock hand", category: "Gestures" },
  { emoji: "✌️", keywords: "peace two", category: "Gestures" }, { emoji: "👌", keywords: "okay perfect", category: "Gestures" },
  { emoji: "🫶", keywords: "heart hands love", category: "Gestures" }, { emoji: "💪", keywords: "strong muscle", category: "Gestures" },
  { emoji: "❤️", keywords: "heart love red", category: "Hearts" }, { emoji: "🧡", keywords: "heart orange", category: "Hearts" },
  { emoji: "💛", keywords: "heart yellow", category: "Hearts" }, { emoji: "💚", keywords: "heart green", category: "Hearts" },
  { emoji: "💙", keywords: "heart blue", category: "Hearts" }, { emoji: "💜", keywords: "heart purple", category: "Hearts" },
  { emoji: "🖤", keywords: "heart black", category: "Hearts" }, { emoji: "🤍", keywords: "heart white", category: "Hearts" },
  { emoji: "💔", keywords: "heart broken", category: "Hearts" }, { emoji: "💖", keywords: "heart sparkle", category: "Hearts" },
  { emoji: "🎵", keywords: "music note song", category: "Music" }, { emoji: "🎶", keywords: "music notes songs", category: "Music" },
  { emoji: "🎧", keywords: "headphones listen", category: "Music" }, { emoji: "🎤", keywords: "microphone sing", category: "Music" },
  { emoji: "🎸", keywords: "guitar rock", category: "Music" }, { emoji: "🎹", keywords: "piano keys", category: "Music" },
  { emoji: "🥁", keywords: "drums beat", category: "Music" }, { emoji: "🎷", keywords: "sax jazz", category: "Music" },
  { emoji: "🔥", keywords: "fire hot", category: "Moments" }, { emoji: "✨", keywords: "sparkles magic", category: "Moments" },
  { emoji: "⭐", keywords: "star", category: "Moments" }, { emoji: "💯", keywords: "hundred perfect", category: "Moments" },
  { emoji: "🚀", keywords: "rocket launch", category: "Moments" }, { emoji: "🌊", keywords: "wave water vibe", category: "Moments" },
  { emoji: "🌙", keywords: "moon night", category: "Moments" }, { emoji: "☀️", keywords: "sun day", category: "Moments" },
  { emoji: "🎉", keywords: "party celebrate", category: "Moments" }, { emoji: "🪩", keywords: "disco dance", category: "Moments" },
];

export function StageEmojiPicker(props: {
  accountKey: string;
  messageLabel: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const recentKey = `@canal/stage-emoji-recents:${props.accountKey || "signed-out"}`;

  useEffect(() => {
    if (!props.visible) return;
    void AsyncStorage.getItem(recentKey).then((value) => {
      try {
        const parsed = value ? JSON.parse(value) : [];
        setRecents(Array.isArray(parsed) ? parsed.filter((item) => normalizeLiveStageMessageReaction(item)).slice(0, 18) : []);
      } catch { setRecents([]); }
    });
  }, [props.visible, recentKey]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const typedEmoji = normalizeLiveStageMessageReaction(query);
    const recentItems = recents.map((emoji) => ({ emoji, keywords: "recent", category: "Moments" as const }));
    const catalog = [...recentItems, ...EMOJI_ITEMS].filter((item, index, items) => items.findIndex((candidate) => candidate.emoji === item.emoji) === index);
    const filtered = catalog.filter((item) => !normalizedQuery || item.emoji.includes(normalizedQuery) || item.keywords.includes(normalizedQuery));
    return typedEmoji && !filtered.some((item) => item.emoji === typedEmoji)
      ? [{ emoji: typedEmoji, keywords: "typed", category: "Moments" as const }, ...filtered]
      : filtered;
  }, [query, recents]);

  async function choose(value: string) {
    const emoji = normalizeLiveStageMessageReaction(value);
    if (!emoji) return;
    const nextRecents = [emoji, ...recents.filter((item) => item !== emoji)].slice(0, 18);
    setRecents(nextRecents);
    await AsyncStorage.setItem(recentKey, JSON.stringify(nextRecents));
    props.onSelect(emoji);
    props.onClose();
  }

  if (!props.visible) return null;

  return (
      <View accessibilityViewIsModal style={styles.backdrop}>
        <Pressable accessibilityLabel="Close emoji picker" accessibilityRole="button" onPress={props.onClose} style={styles.dismissArea} />
        <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>Add a reaction</Text>
              <Text numberOfLines={1} style={styles.messageLabel}>{props.messageLabel}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close emoji picker" onPress={props.onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <TextInput
            accessibilityLabel="Search emojis"
            autoCapitalize="none"
            value={query}
            onChangeText={setQuery}
            placeholder="Search or paste an emoji"
            placeholderTextColor={canalDynamicColors.muted}
            style={styles.search}
          />

          <FlatList
            data={results}
            keyExtractor={(item) => `${item.category}:${item.emoji}`}
            numColumns={8}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No matching emoji.</Text>}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`React with ${item.emoji}`} onPress={() => void choose(item.emoji)} style={styles.emojiButton}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", zIndex: 20, top: 0, right: 0, bottom: 0, left: 0, justifyContent: "flex-end", backgroundColor: "rgba(12, 9, 21, 0.36)" },
  dismissArea: { flex: 1 },
  safeArea: { height: "38%", minHeight: 280, maxHeight: 360, overflow: "hidden", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#5F4A78" }, flex: { flex: 1 },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 7 },
  headerCopy: { flex: 1, minWidth: 0 }, title: { color: canalDynamicColors.text, fontSize: 19, fontWeight: "800" },
  messageLabel: { color: canalDynamicColors.muted, fontSize: 12, marginTop: 3 },
  closeButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }, closeText: { color: canalDynamicColors.mint, fontSize: 25, lineHeight: 27, fontWeight: "500" },
  search: { minHeight: 44, marginHorizontal: 16, borderRadius: 14, backgroundColor: "rgba(7, 43, 63, 0.34)", color: canalDynamicColors.text, paddingHorizontal: 14, fontSize: 15 },
  grid: { paddingHorizontal: 10, paddingTop: 5, paddingBottom: 14 }, emojiButton: { width: "12.5%", minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12 }, emoji: { fontSize: 24 },
  empty: { color: canalDynamicColors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", padding: 24 },
});
