import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  SoundscapeArchive,
  SoundscapeCommonGroundProjection,
  SoundscapeCommonGroundState,
} from "../../lib/soundscape-types";
import {
  availableShareFormats,
  soundscapeChapterIndex,
  soundscapeDailyPhases,
  soundscapeMonths,
  soundscapeSeasons,
} from "./soundscape-view-model";

type Props = {
  archive: SoundscapeArchive;
  displayName: string;
  username: string;
  featuredSnapshotIds: string[];
  error: string | null;
  refreshing: boolean;
  commonGround: SoundscapeCommonGroundState | null;
  commonProjection: SoundscapeCommonGroundProjection | null;
  onBack: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onCreateScene: (activity: string, mood: string) => void;
  onOpenScene: (sceneId: string) => void;
  onOpenStage: (stageId: string) => void;
  onRebuildStage?: (stageId: string) => void;
  onOpenSnapshot: (snapshotId: string) => void;
  onRemoveSnapshot: (snapshotId: string) => Promise<void>;
  onApproveCommonGround?: (approved: boolean) => Promise<void>;
  onSetVisibility?: (
    visibility: "private" | "connections" | "public",
  ) => Promise<void>;
  onShare: () => Promise<void>;
};

const CHAPTERS = [
  "Opening",
  "Daily rhythm",
  "Your seasons",
  "Discovery",
  "Signatures",
  "History",
  "Stages",
  "Common ground",
  "Scenes",
  "Share",
] as const;
const CHAPTER_PALETTES = [
  ["#101923", "rgba(193,95,89,0.22)", "rgba(70,128,145,0.18)"],
  ["#142027", "rgba(225,142,86,0.20)", "rgba(66,139,139,0.20)"],
  ["#17202a", "rgba(177,95,117,0.22)", "rgba(117,139,94,0.18)"],
  ["#111d29", "rgba(68,130,160,0.24)", "rgba(207,114,114,0.17)"],
  ["#181a27", "rgba(137,92,155,0.22)", "rgba(57,132,144,0.18)"],
  ["#152026", "rgba(200,137,88,0.20)", "rgba(72,111,147,0.20)"],
  ["#101d25", "rgba(53,138,147,0.22)", "rgba(202,102,103,0.18)"],
  ["#171b28", "rgba(162,94,140,0.22)", "rgba(82,124,150,0.18)"],
  ["#132128", "rgba(87,145,134,0.20)", "rgba(205,126,89,0.20)"],
  ["#171a24", "rgba(193,104,94,0.24)", "rgba(92,112,155,0.20)"],
] as const;

export function SoundscapeExperience(props: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 720;
  const [chapter, setChapter] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const breath = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const entry = useRef(new Animated.Value(1)).current;
  const content = props.archive.content;
  const activity = content.topActivities[0]?.label ?? "Listening";
  const mood = content.topMoods[0]?.label ?? "Open";
  const chapterBody = useMemo(
    () => getChapterBody(chapter, props.archive),
    [chapter, props.archive],
  );
  const dailyPhases = useMemo(
    () => soundscapeDailyPhases(props.archive),
    [props.archive],
  );
  const seasons = useMemo(
    () => soundscapeSeasons(props.archive),
    [props.archive],
  );
  const months = useMemo(
    () => soundscapeMonths(props.archive),
    [props.archive],
  );
  const palette = CHAPTER_PALETTES[chapter];

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    breath.stopAnimation();
    drift.stopAnimation();
    shine.stopAnimation();
    if (reducedMotion) {
      breath.setValue(0);
      drift.setValue(0);
      shine.setValue(0);
      return;
    }
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const drifting = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 7200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 7200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    const shining = Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(shine, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.delay(3699),
      ]),
    );
    breathing.start();
    drifting.start();
    shining.start();
    return () => {
      breathing.stop();
      drifting.stop();
      shining.stop();
    };
  }, [breath, drift, reducedMotion, shine]);

  useEffect(() => {
    if (reducedMotion) {
      entry.setValue(1);
      return;
    }
    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chapter, entry, reducedMotion]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette[0] }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowA,
          {
            backgroundColor: palette[1],
            transform: [
              {
                scale: breath.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1.12],
                }),
              },
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 24],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowB,
          {
            backgroundColor: palette[2],
            transform: [
              {
                scale: breath.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.08, 0.94],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, -24],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shine,
          {
            opacity: shine.interpolate({
              inputRange: [0, 0.45, 1],
              outputRange: [0, 0.12, 0],
            }),
            transform: [
              {
                translateX: shine.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-260, 960],
                }),
              },
              { rotate: "-12deg" },
            ],
          },
        ]}
      />
      <View style={styles.header}>
        <IconButton icon="chevron-back" label="Back" onPress={props.onBack} />
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>C</Text>
          </View>
          <Text style={styles.brandName}>CANAL</Text>
        </View>
        <Text style={styles.periodLabel} numberOfLines={1}>
          Soundscape · {props.archive.period.key}
        </Text>
        <IconButton
          icon={props.refreshing ? "hourglass-outline" : "refresh"}
          label="Refresh Soundscape"
          disabled={props.refreshing}
          onPress={props.onRefresh}
        />
      </View>
      <View accessibilityRole="tablist" style={styles.progressRail}>
        <View style={styles.progressRailInner}>
          {CHAPTERS.map((label, index) => (
            <Pressable
              key={label}
              accessibilityRole="tab"
              accessibilityLabel={`${String(index + 1).padStart(2, "0")}, ${label}`}
              accessibilityState={{ selected: chapter === index }}
              onPress={() =>
                setChapter((current) => soundscapeChapterIndex(current, index))
              }
              hitSlop={6}
              style={styles.progressTarget}
            >
              <View
                style={[
                  styles.progressSegment,
                  index < chapter && styles.progressSegmentComplete,
                  index === chapter && styles.progressSegmentActive,
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.shell}>
        <ScrollView
          style={styles.story}
          contentContainerStyle={[
            styles.storyContent,
            !compact && styles.storyContentWide,
            { minHeight: Math.max(620, height - 128) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: entry,
              transform: [
                {
                  translateY: entry.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            }}
          >
            {props.error ? (
              <Notice
                text={props.error}
                action="Retry"
                onPress={props.onRetry}
              />
            ) : null}
            <Text style={styles.kicker}>{CHAPTERS[chapter]}</Text>
            <Text style={styles.title}>{chapterBody.title}</Text>
            <Text style={styles.subtitle}>{chapterBody.subtitle}</Text>
            {props.archive.historyState === "insufficient_history" ? (
              <Notice
                text={
                  props.archive.insufficientReason ??
                  "Keep listening to build this chapter."
                }
              />
            ) : null}
            {chapter === 0 ? (
              <Opening
                archive={props.archive}
                username={props.username}
                onNext={() => setChapter(1)}
              />
            ) : null}
            {chapter === 1 ? (
              <DailyPhases
                archive={props.archive}
                phases={dailyPhases}
                onCreate={() => props.onCreateScene(activity, mood)}
              />
            ) : null}
            {chapter === 2 ? (
              <Seasons
                seasons={seasons}
                onOpen={props.onOpenScene}
                onCreate={() => props.onCreateScene(activity, mood)}
              />
            ) : null}
            {chapter === 3 ? (
              <Discovery
                archive={props.archive}
                onCreate={() => props.onCreateScene(activity, mood)}
              />
            ) : null}
            {chapter === 4 ? <SongDna archive={props.archive} /> : null}
            {chapter === 5 ? (
              <History
                months={months}
                archive={props.archive}
                onCreate={() => props.onCreateScene(activity, mood)}
              />
            ) : null}
            {chapter === 6 ? (
              <Stages
                archive={props.archive}
                onOpen={props.onOpenStage}
                onRebuild={props.onRebuildStage}
              />
            ) : null}
            {chapter === 7 ? (
              <CommonGround
                state={props.commonGround}
                projection={props.commonProjection}
                onApprove={props.onApproveCommonGround}
              />
            ) : null}
            {chapter === 8 ? (
              <Scenes archive={props.archive} onOpen={props.onOpenScene} />
            ) : null}
            {chapter === 9 ? (
              <Share
                archive={props.archive}
                snapshotIds={props.featuredSnapshotIds}
                onOpen={props.onOpenSnapshot}
                onRemove={props.onRemoveSnapshot}
                onShare={props.onShare}
                onSetVisibility={props.onSetVisibility}
              />
            ) : null}
            <View style={styles.pager}>
              <IconButton
                icon="chevron-back"
                label="Previous chapter"
                disabled={chapter === 0}
                onPress={() =>
                  setChapter((value) =>
                    soundscapeChapterIndex(value, value - 1),
                  )
                }
              />
              <View style={styles.pagerCopy}>
                <Text style={styles.pagerTitle}>{CHAPTERS[chapter]}</Text>
                <Text style={styles.pagerCount}>
                  {chapter + 1} of {CHAPTERS.length}
                </Text>
              </View>
              <IconButton
                icon="chevron-forward"
                label="Next chapter"
                disabled={chapter === 9}
                onPress={() =>
                  setChapter((value) =>
                    soundscapeChapterIndex(value, value + 1),
                  )
                }
              />
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Opening({
  archive,
  username,
  onNext,
}: {
  archive: SoundscapeArchive;
  username: string;
  onNext: () => void;
}) {
  return (
    <View>
      <View accessibilityLabel={`A flowing ribbon portrait of ${username}'s Soundscape`} style={styles.ribbonPortrait}>
        <View style={[styles.ribbon, styles.ribbonMint]}><View style={[styles.ribbonSegment, { width: "34%", transform: [{ rotate: "12deg" }] }]} /><View style={[styles.ribbonSegment, { width: "33%", transform: [{ rotate: "-9deg" }] }]} /><View style={[styles.ribbonSegment, { width: "36%", transform: [{ rotate: "8deg" }] }]} /></View>
        <View style={[styles.ribbon, styles.ribbonBlue]}><View style={[styles.ribbonSegment, { width: "40%", transform: [{ rotate: "-6deg" }] }]} /><View style={[styles.ribbonSegment, { width: "29%", transform: [{ rotate: "14deg" }] }]} /><View style={[styles.ribbonSegment, { width: "35%", transform: [{ rotate: "-12deg" }] }]} /></View>
        <View style={[styles.ribbon, styles.ribbonGold]}><View style={[styles.ribbonSegment, { width: "31%", transform: [{ rotate: "5deg" }] }]} /><View style={[styles.ribbonSegment, { width: "37%", transform: [{ rotate: "-14deg" }] }]} /><View style={[styles.ribbonSegment, { width: "36%", transform: [{ rotate: "12deg" }] }]} /></View>
        <View style={[styles.ribbon, styles.ribbonRose]}><View style={[styles.ribbonSegment, { width: "39%", transform: [{ rotate: "-10deg" }] }]} /><View style={[styles.ribbonSegment, { width: "31%", transform: [{ rotate: "9deg" }] }]} /><View style={[styles.ribbonSegment, { width: "34%", transform: [{ rotate: "-16deg" }] }]} /></View>
      </View>
      <View style={styles.metricRow}>
        <Metric value={archive.content.totals.scenes} label="Scenes shaped around real life" />
        <Metric value={archive.content.totals.stages} label="Stages built with other people" />
        <Metric
          value={archive.content.totals.discoveries}
          label="new artists that became keepers"
        />
      </View>
      <Action
        label="Enter your Soundscape"
        icon="arrow-forward"
        onPress={onNext}
      />
    </View>
  );
}

function DailyPhases({
  archive,
  phases,
  onCreate,
}: {
  archive: SoundscapeArchive;
  phases: ReturnType<typeof soundscapeDailyPhases>;
  onCreate: () => void;
}) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const phaseLabels = ["Morning", "Day", "Evening", "Late night"];
  const counts = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  for (const session of archive.content.playbackTrail) {
    const date = new Date(session.startedAt);
    if (Number.isNaN(date.getTime())) continue;
    const hour = date.getHours();
    const phase = hour < 11 ? 0 : hour < 17 ? 1 : hour < 22 ? 2 : 3;
    counts[date.getDay()][phase] += 1;
  }
  const maximum = Math.max(1, ...counts.flat());
  const strongest = counts.flat().reduce((best, count, index, values) => count > values[best] ? index : best, 0);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(strongest % 4);
  const selectedPhase = phases[selectedPhaseIndex];
  return (
    <View>
      <View style={styles.weekPanel}>
        <View style={styles.weekHeader}><Text style={styles.cardEyebrow}>YOUR WEEK IN SOUND</Text><Text style={styles.rowDetail}>brighter cells = more complete sessions</Text></View>
        <View style={styles.heatmap}><View style={styles.heatmapRow}><View style={styles.dayLabel} />{phaseLabels.map((label, index) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: selectedPhaseIndex === index }} onPress={() => setSelectedPhaseIndex(index)} style={styles.phaseLabelButton}><Text style={[styles.phaseLabel, selectedPhaseIndex === index && styles.railTextActive]}>{label}</Text></Pressable>)}</View>{days.map((day, dayIndex) => <View key={day} style={styles.heatmapRow}><Text style={styles.dayLabel}>{day}</Text>{counts[dayIndex].map((count, phaseIndex) => <Pressable key={phaseIndex} accessibilityRole="button" accessibilityLabel={`${day} ${phaseLabels[phaseIndex]}: ${count} sessions`} onPress={() => setSelectedPhaseIndex(phaseIndex)} style={[styles.heatCell, { opacity: count ? .34 + .66 * count / maximum : .16 }, phaseIndex === selectedPhaseIndex && count > 0 && styles.heatCellActive]} />)}</View>)}</View>
        <View style={styles.selectedPattern}><Text style={styles.cardEyebrow}>SELECTED PATTERN · {phaseLabels[selectedPhaseIndex].toUpperCase()}</Text><Text style={styles.cardTitle}>{archive.content.playbackTrail.length ? `${selectedPhase?.signals[0]?.label ?? "Recorded listening"} returned in this part of your day.` : "A weekly pattern has not been recorded yet."}</Text><Text style={styles.cardDetail}>{archive.content.playbackTrail.length ? `${counts.reduce((sum, row) => sum + row[selectedPhaseIndex], 0)} complete sessions shaped this phase story.` : "Canal will not infer a weekly routine from Scene creation alone."}</Text></View>
      </View>
      <Action label="Build this kind of Scene" icon="add" onPress={onCreate} />
    </View>
  );
}

function Seasons({
  seasons,
  onOpen,
  onCreate,
}: {
  seasons: ReturnType<typeof soundscapeSeasons>;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const current = seasons[selected];
  return (
    <View>
      <View style={styles.cardGrid}>
        {seasons.map((season, index) => (
          <Pressable
            key={season.key}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === index }}
            onPress={() => setSelected(index)}
            style={({ pressed }) => [
              styles.seasonCard,
              selected === index && styles.seasonCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cardEyebrow}>{season.label.toUpperCase()}</Text>
            <Text style={styles.cardTitle}>
              {season.scenes[0]?.name ?? "Still forming"}
            </Text>
            <Text style={styles.cardDetail}>
              {season.scenes.length
                ? `${season.scenes.length} Scenes changed in this period`
                : "No verified Scene changes in this period."}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.seasonDrawer}>
        <View style={styles.rowCopy}>
          <Text style={styles.cardEyebrow}>{current.label.toUpperCase()}</Text>
          <Text style={styles.cardTitle}>
            {current.scenes[0]?.name ?? "This season is still forming"}
          </Text>
          <Text style={styles.cardDetail}>
            {current.scenes.length
              ? `${current.scenes.length} recorded Scene versions define this period.`
              : "Keep listening; Canal will not invent a seasonal story."}
          </Text>
        </View>
        <View style={styles.actions}>
          {current.scenes[0] ? (
            <Action
              compact
              label="Open defining Scene"
              icon="arrow-forward"
              onPress={() => onOpen(current.scenes[0].sceneId)}
            />
          ) : null}
          <Action
            compact
            label="Recreate this feeling"
            icon="refresh"
            onPress={onCreate}
          />
        </View>
      </View>
    </View>
  );
}

function SongDna({ archive }: { archive: SoundscapeArchive }) {
  const items = archive.content.songDna.slice(0, 8);
  const [selected, setSelected] = useState(0);
  const item = items[selected];
  const maximum = Math.max(1, ...items.map((value) => value.playCount));
  if (!item)
    return (
      <Empty
        title="Song DNA needs observed tracks."
        detail="Canal will not label moods, genres, or decades that were not present in recorded source data."
      />
    );
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectorRow}
      >
        {items.map((value, index) => (
          <Pressable
            key={value.trackId}
            accessibilityRole="tab"
            accessibilityState={{ selected: selected === index }}
            onPress={() => setSelected(index)}
            style={[styles.selector, selected === index && styles.formatActive]}
          >
            <Text style={styles.rowTitle} numberOfLines={1}>
              {value.title}
            </Text>
            <Text style={styles.rowDetail} numberOfLines={1}>
              {value.artist}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.signaturePanel}>
        <Text style={styles.cardEyebrow}>SELECTED SOUND SIGNATURE</Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDetail}>
          {item.artist}
          {item.decade ? ` · ${item.decade}` : ""}
        </Text>
        <Text style={styles.sectionLabel}>EMOTIONAL CONTOUR</Text>
        <View style={styles.contour}>
          {[0.24, 0.5, 0.38, 0.76, 0.58, 0.9, 0.62, 0.34].map(
            (height, index) => (
              <View
                key={index}
                style={[styles.contourBar, { height: 18 + height * 72 }]}
              />
            ),
          )}
        </View>
        <Text style={styles.sectionLabel}>MOODS</Text>
        <Text style={styles.rowDetail}>
          {item.moods.join(" · ") || "No observed mood labels"}
        </Text>
        <Text style={styles.sectionLabel}>GENRE CURRENTS</Text>
        <Text style={styles.rowDetail}>
          {item.genres.join(" → ") || "No observed genre labels"}
        </Text>
        <Text style={styles.sectionLabel}>SOURCE CONFIDENCE</Text>
        <View style={styles.confidenceTrack}>
          <View
            style={[
              styles.confidenceFill,
              {
                width: `${Math.max(8, Math.round((item.playCount / maximum) * 100))}%`,
              },
            ]}
          />
        </View>
      </View>
      <DisabledAction label="Full provider song context is not available here" />
    </View>
  );
}

function History({
  months,
  archive,
  onCreate,
}: {
  months: ReturnType<typeof soundscapeMonths>;
  archive: SoundscapeArchive;
  onCreate: () => void;
}) {
  const [selected, setSelected] = useState(new Date().getUTCMonth());
  const month = months[selected];
  return (
    <View>
      <View accessibilityRole="tablist" style={styles.months}>
        {months.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: selected === item.index }}
            onPress={() => setSelected(item.index)}
            style={[
              styles.month,
              selected === item.index && styles.monthActive,
            ]}
          >
            <Text
              style={[
                styles.monthLabel,
                selected === item.index && styles.railTextActive,
              ]}
            >
              {item.label}
            </Text>
            <View
              style={[
                styles.monthBar,
                {
                  height: Math.max(
                    5,
                    Math.min(42, (item.scenes.length + item.playbackCount) * 8),
                  ),
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.featureCard}>
        <Text style={styles.cardEyebrow}>
          {month.label.toUpperCase()} · RECORDED HISTORY
        </Text>
        <Text style={styles.cardTitle}>
          {month.scenes[0]?.name ?? "No defining Scene"}
        </Text>
        <Text style={styles.cardDetail}>
          {month.scenes.length} Scene changes · {month.playbackCount} complete
          playback sessions
        </Text>
      </View>
      <View style={styles.actions}>
        <Action
          compact
          label="Recreate period"
          icon="refresh"
          onPress={onCreate}
        />
        {archive.content.playbackTrail.length ? (
          <DisabledAction label="Playback trail player is not available" />
        ) : (
          <DisabledAction label="Comparison needs recorded sessions" />
        )}
      </View>
    </View>
  );
}

export function Tracks({
  items,
  empty,
  footer,
}: {
  items: { id: string; title: string; detail: string }[];
  empty: string;
  footer?: React.ReactNode;
}) {
  return (
    <View>
      {items.length ? (
        items.slice(0, 10).map((item, index) => (
          <View key={`${item.id}:${index}`} style={styles.row}>
            <Text style={styles.rowNumber}>
              {String(index + 1).padStart(2, "0")}
            </Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowDetail}>{item.detail}</Text>
            </View>
          </View>
        ))
      ) : (
        <Empty title={empty} />
      )}
      {footer}
    </View>
  );
}

function Discovery({
  archive,
  onCreate,
}: {
  archive: SoundscapeArchive;
  onCreate: () => void;
}) {
  const items = archive.content.discoveries.slice(0, 6);
  const [selected, setSelected] = useState(0);
  const item = items[selected];
  const sourceCounts = items.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value.source]: (counts[value.source] ?? 0) + 1 }), {});
  return (
    <View>
      {items.length ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>{items.map((value, index) => <Pressable key={`${value.trackId}:${value.discoveredAt}`} accessibilityRole="tab" accessibilityState={{ selected: selected === index }} onPress={() => setSelected(index)} style={[styles.selector, selected === index && styles.formatActive]}><Text style={styles.rowTitle} numberOfLines={1}>{value.title}</Text><Text style={styles.rowDetail} numberOfLines={1}>{value.artist}</Text></Pressable>)}</ScrollView><View style={styles.discoveryStory}><Text style={styles.cardEyebrow}>SELECTED DISCOVERY</Text><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardDetail}>{item.artist}</Text>{[
        ["1", "FIRST HEARD", `${new Date(item.discoveredAt).toLocaleDateString()} · ${item.source}`],
        ["2", "WHY IT FIT", "Unavailable: the retained discovery event has no intent-fit explanation."],
        ["3", "WHERE IT PROVED ITSELF", item.saved ? "Saved after discovery." : "No retained save or Scene acceptance event."],
        ["4", "WHAT IT UNLOCKED", "Unavailable: Canal has not retained a causal taste-change event."],
      ].map(([number, label, detail]) => <View key={number} style={styles.causalityStep}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View><View style={styles.rowCopy}><Text style={styles.cardEyebrow}>{label}</Text><Text style={styles.rowTitle}>{detail}</Text></View></View>)}</View><View style={styles.sourcePanel}><Text style={styles.sectionLabel}>WHERE KEEPERS CAME FROM</Text>{Object.entries(sourceCounts).map(([source, count]) => <View key={source} style={styles.sourceRow}><Text style={styles.rowDetail}>{source}</Text><View style={styles.sourceTrack}><View style={[styles.sourceFill, { width: `${Math.round(count / items.length * 100)}%` }]} /></View><Text style={styles.rowDetail}>{Math.round(count / items.length * 100)}%</Text></View>)}</View></> : (
          <Empty
            title="No verified discovery path yet."
            detail="Canal will not turn a candidate pool into fictional discovery history."
          />
        )}
      <Action
        label="Create a discovery Scene"
        icon="sparkles-outline"
        onPress={onCreate}
      />
    </View>
  );
}

function Stages({
  archive,
  onOpen,
  onRebuild,
}: {
  archive: SoundscapeArchive;
  onOpen: (id: string) => void;
  onRebuild?: (id: string) => void;
}) {
  const items = archive.content.stageArchive;
  return (
    <View>
      <View style={styles.blendFlow}>
        <View style={styles.blendColumn}>
          <Text style={styles.cardEyebrow}>YOUR INPUT</Text>
          <Text style={styles.cardTitle}>
            {archive.content.topMoods[0]?.label ?? "Insufficient signal"}
          </Text>
        </View>
        <View style={styles.flowLines}>
          <View style={styles.flowLine} />
          <View style={[styles.flowLine, styles.flowLineAlt]} />
        </View>
        <View style={styles.blendColumn}>
          <Text style={styles.cardEyebrow}>CONTRIBUTOR BLEND</Text>
          <Text style={styles.cardTitle}>
            {items.length
              ? `${Math.max(...items.map((item) => item.participantCount))} people`
              : "Not recorded"}
          </Text>
          <Text style={styles.cardDetail}>
            Only bounded Stage participation is shown.
          </Text>
        </View>
      </View>
      {items.length ? (
        items.slice(0, 8).map((item) => (
          <View key={item.stageId} style={styles.featureCard}>
            <Text style={styles.cardEyebrow}>
              {item.endedAt ? "ARCHIVED STAGE" : "LIVE STAGE"} ·{" "}
              {item.role.toUpperCase()}
            </Text>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardDetail}>
              {item.participantCount} people · {item.trackCount} tracks ·{" "}
              {item.activity}
            </Text>
            <View style={styles.actions}>
              <Action
                compact
                label="Open archive"
                icon="archive-outline"
                onPress={() => onOpen(item.stageId)}
              />
              {onRebuild ? (
                <Action
                  compact
                  label="Rebuild"
                  icon="refresh"
                  onPress={() => onRebuild(item.stageId)}
                />
              ) : (
                <DisabledAction label="Rebuild needs retained participant consent" />
              )}
            </View>
          </View>
        ))
      ) : (
        <Empty
          title="No Stage archive exists for this period."
          detail="Host or join a Stage and it will appear after the activity is safely recorded."
        />
      )}
    </View>
  );
}

function CommonGround({
  state,
  projection,
  onApprove,
}: {
  state: SoundscapeCommonGroundState | null;
  projection: SoundscapeCommonGroundProjection | null;
  onApprove?: (approved: boolean) => Promise<void>;
}) {
  if (!state)
    return (
      <View>
        <CommonGroundMap members={[]} />
        <Empty
          title="Common Ground stays private by default."
          detail="Open Soundscape from a connection’s profile to review approval. A shared view never appears without a mutual connection."
          action="Choose a connection from their profile"
        />
      </View>
    );
  if (state.status === "ineligible")
    return (
      <View>
        <CommonGroundMap members={[]} />
        <Empty
          title="Common Ground is not available."
          detail="Both people must be connected before either can approve a shared projection."
        />
      </View>
    );
  if (state.status === "awaiting_you")
    return (
      <View style={styles.featureCard}>
        <Text style={styles.cardEyebrow}>APPROVAL REQUIRED</Text>
        <Text style={styles.cardTitle}>
          Make a private bridge between your tastes?
        </Text>
        <Text style={styles.cardDetail}>
          Approval reveals only bounded Soundscape projections after the other
          person approves too. You can revoke it here.
        </Text>
        {onApprove ? (
          <Action
            label="Approve Common Ground"
            icon="checkmark"
            onPress={() => void onApprove(true)}
          />
        ) : (
          <DisabledAction label="Approval is unavailable" />
        )}
      </View>
    );
  if (state.status === "awaiting_peer")
    return (
      <View style={styles.featureCard}>
        <Text style={styles.cardEyebrow}>WAITING FOR THE OTHER PERSON</Text>
        <Text style={styles.cardTitle}>Your side is approved.</Text>
        <Text style={styles.cardDetail}>
          No shared taste data is visible until both approvals exist.
        </Text>
        {onApprove ? (
          <Action
            compact
            label="Revoke approval"
            icon="close"
            onPress={() => void onApprove(false)}
          />
        ) : null}
      </View>
    );
  const members = projection?.members ?? [];
  return (
    <View>
      <CommonGroundMap members={members} />
      <View style={styles.featureCard}>
        <Text style={styles.cardEyebrow}>APPROVED COMMON GROUND</Text>
        <Text style={styles.cardTitle}>
          A relationship between tastes—not a score.
        </Text>
        <Text style={styles.cardDetail}>
          {members.length === 2
            ? "Both bounded projections are ready."
            : "The approved projection is not available yet."}
        </Text>
      </View>
      {members.map((member) => (
        <View key={member.userId} style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>
              {member.soundscape.highlights.sceneNames[0] ??
                "Soundscape member"}
            </Text>
            <Text style={styles.rowDetail}>
              {member.soundscape.topMoods
                .slice(0, 3)
                .map((item) => item.label)
                .join(" · ") || "No shared mood signal"}
            </Text>
          </View>
        </View>
      ))}
      {onApprove ? (
        <Action
          compact
          label="Revoke Common Ground"
          icon="close"
          onPress={() => void onApprove(false)}
        />
      ) : null}
    </View>
  );
}

function CommonGroundMap({
  members,
}: {
  members: SoundscapeCommonGroundProjection["members"];
}) {
  const firstMoods =
    members[0]?.soundscape.topMoods.map((item) => item.label) ?? [];
  const secondMoods =
    members[1]?.soundscape.topMoods.map((item) => item.label) ?? [];
  const shared = firstMoods
    .filter((value) => secondMoods.includes(value))
    .slice(0, 4);
  return (
    <View style={styles.commonMap}>
      <View style={styles.commonStream}>
        <Text style={styles.cardEyebrow}>YOU</Text>
        <Text style={styles.rowDetail}>
          {firstMoods.slice(0, 3).join(" · ") || "Private until approved"}
        </Text>
      </View>
      <View style={styles.bridgeCore}>
        <View style={styles.bridgeRing}>
          <Ionicons name="git-merge-outline" size={28} color="#dffdf5" />
        </View>
        <Text style={styles.cardEyebrow}>SHARED LANGUAGE</Text>
        <Text style={styles.cardTitle}>
          {shared.join(" · ") || "Insufficient approved overlap"}
        </Text>
      </View>
      <View style={styles.commonStream}>
        <Text style={styles.cardEyebrow}>CONNECTION</Text>
        <Text style={styles.rowDetail}>
          {secondMoods.slice(0, 3).join(" · ") || "Private until approved"}
        </Text>
      </View>
      <View style={styles.commonRows}>
        <Text style={styles.sectionLabel}>PRODUCTIVE DIFFERENCE</Text>
        <Text style={styles.rowDetail}>
          {members.length === 2
            ? "The safe projection does not expose enough detail to name a difference."
            : "Unavailable until both approvals exist."}
        </Text>
        <Text style={styles.sectionLabel}>TRUSTED BRIDGE SONGS</Text>
        <Text style={styles.rowDetail}>
          Unavailable: exact songs are intentionally excluded from Common Ground
          projections.
        </Text>
      </View>
    </View>
  );
}

function Scenes({
  archive,
  onOpen,
}: {
  archive: SoundscapeArchive;
  onOpen: (id: string) => void;
}) {
  const items = archive.content.sceneEvolution;
  const [selected, setSelected] = useState(0);
  const current = items[selected];
  return (
    <View>
      <View
        style={styles.atlas}
        accessibilityLabel="Scene atlas from intimate to social and still to kinetic"
      >
        <View style={styles.atlasVertical} />
        <View style={styles.atlasHorizontal} />
        <Text style={[styles.atlasAxis, styles.atlasStill]}>STILL</Text>
        <Text style={[styles.atlasAxis, styles.atlasKinetic]}>KINETIC</Text>
        <Text style={[styles.atlasAxis, styles.atlasIntimate]}>INTIMATE</Text>
        <Text style={[styles.atlasAxis, styles.atlasSocial]}>SOCIAL</Text>
        {items.slice(0, 12).map((item, index) => (
          <Pressable
            key={item.sceneId}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === index }}
            accessibilityLabel={`Select ${item.name}`}
            onPress={() => setSelected(index)}
            style={[
              styles.atlasPoint,
              {
                left: `${16 + ((index * 31) % 68)}%`,
                top: `${15 + ((index * 23) % 67)}%`,
              },
              selected === index && styles.atlasPointActive,
            ]}
          >
            <Text style={styles.atlasPointText}>{index + 1}</Text>
          </Pressable>
        ))}
      </View>
      {items.length ? (
        <View style={styles.sceneDetail}>
          <Text style={styles.cardEyebrow}>
            {current.activity || "SCENE FAMILY"}
          </Text>
          <Text style={styles.cardTitle}>{current.name}</Text>
          <Text style={styles.cardDetail}>
            {[...current.moods, ...current.genres].slice(0, 5).join(" · ") ||
              "No descriptive metadata"}
          </Text>
          <Text style={styles.sectionLabel}>ENERGY RIDGE</Text>
          <View style={styles.ridge}>
            {[0.24, 0.36, 0.32, 0.58, 0.82, 0.61, 0.44, 0.72, 0.39].map(
              (height, index) => (
                <View
                  key={index}
                  style={[styles.ridgeBar, { height: 16 + height * 72 }]}
                />
              ),
            )}
          </View>
          <Text style={styles.sectionLabel}>EVOLUTION</Text>
          <View style={styles.timeline}>
            <View style={styles.timelineStep}>
              <Text style={styles.cardEyebrow}>FIRST VERSION</Text>
              <Text style={styles.rowDetail}>
                {new Date(current.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="arrow-forward" color="#bcdad7" size={18} />
            <View style={styles.timelineStep}>
              <Text style={styles.cardEyebrow}>NOW</Text>
              <Text style={styles.rowDetail}>
                {current.playCount} plays{current.favorite ? " · favorite" : ""}
              </Text>
            </View>
          </View>
          <Action
            compact
            label="Open Scene"
            icon="arrow-forward"
            onPress={() => onOpen(current.sceneId)}
          />
        </View>
      ) : (
        <Empty title="Create a Scene to begin your atlas." />
      )}
    </View>
  );
}

function Share({
  archive,
  snapshotIds,
  onOpen,
  onRemove,
  onShare,
  onSetVisibility,
}: {
  archive: SoundscapeArchive;
  snapshotIds: string[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onShare: () => Promise<void>;
  onSetVisibility?: (
    visibility: "private" | "connections" | "public",
  ) => Promise<void>;
}) {
  const [format, setFormat] = useState("link");
  const [slide, setSlide] = useState(0);
  const [aspect, setAspect] = useState("link");
  const [motion, setMotion] = useState("still");
  const [showSongs, setShowSongs] = useState(false);
  const [showStages, setShowStages] = useState(true);
  const [shareError, setShareError] = useState("");
  const formats = availableShareFormats(archive);
  const canShare = formats.some((item) => item.key === format && item.enabled);
  const slides = [
    "Portrait",
    "Discovery",
    "Scene language",
    "Stage worlds",
    "Common Ground",
  ];
  const shareCards = [
    { eyebrow: "SOUNDSCAPE PORTRAIT", title: `${archive.content.totals.scenes} Scenes shaped this period.`, detail: archive.content.topMoods.slice(0, 3).map((item) => item.label).join(" · ") || "More history is needed for a mood portrait." },
    { eyebrow: "DISCOVERY THAT STAYED", title: `${archive.content.totals.discoveries} verified discoveries.`, detail: archive.content.discoveries[0] ? `${archive.content.discoveries[0].title} · ${archive.content.discoveries[0].artist}` : "No verified discovery story is available." },
    { eyebrow: "SCENE LANGUAGE", title: archive.content.sceneEvolution[0]?.name ?? "No Scene language yet.", detail: archive.content.topGenres.slice(0, 3).map((item) => item.label).join(" → ") || "No observed genre current." },
    { eyebrow: "STAGE WORLDS", title: `${archive.content.totals.stages} Stage${archive.content.totals.stages === 1 ? "" : "s"} in this period.`, detail: archive.content.stageArchive[0]?.name ?? "No Stage archive is available." },
    { eyebrow: "COMMON GROUND · PRIVATE", title: "A relationship between tastes—not a score.", detail: "Included only through a separately approved Common Ground projection." },
  ];
  const shareCard = shareCards[slide];
  const performShare = async () => {
    setShareError("");
    try {
      await onShare();
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : "Canal could not share this Soundscape.",
      );
    }
  };
  return (
    <View>
      <View style={styles.shareCard}>
        <Text style={styles.cardEyebrow}>
          {shareCard.eyebrow} · {archive.period.key}
        </Text>
        <Text style={styles.shareQuote}>
          {shareCard.title}
        </Text>
        <Text style={styles.cardDetail}>
          {shareCard.detail} · {archive.visibility}
        </Text>
      </View>
      <Text style={styles.sectionLabel}>STORY DECK</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectorRow}
      >
        {slides.map((label, index) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: slide === index }}
            onPress={() => setSlide(index)}
            style={[styles.selector, slide === index && styles.formatActive]}
          >
            <Text style={styles.rowTitle}>
              {String(index + 1).padStart(2, "0")}
            </Text>
            <Text style={styles.rowDetail}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.sectionLabel}>ARCHIVE VISIBILITY</Text>
      <View style={styles.actions}>
        {(["private", "connections", "public"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{
              checked: archive.visibility === value,
              disabled: !onSetVisibility,
            }}
            disabled={!onSetVisibility}
            onPress={() => void onSetVisibility?.(value)}
            style={[
              styles.format,
              archive.visibility === value && styles.formatActive,
              !onSetVisibility && styles.iconDisabled,
            ]}
          >
            <Text style={styles.rowTitle}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.sectionLabel}>FRAME</Text>
      <View style={styles.actions}>
        {["story", "square", "link"].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{
              checked: aspect === value,
              disabled: value !== "link",
            }}
            disabled={value !== "link"}
            onPress={() => setAspect(value)}
            style={[
              styles.selector,
              aspect === value && styles.formatActive,
              value !== "link" && styles.iconDisabled,
            ]}
          >
            <Text style={styles.rowTitle}>
              {value === "link" ? "Link preview" : value}
            </Text>
            <Text style={styles.rowDetail}>
              {value === "link"
                ? "Safe projection"
                : "Needs finished composition"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.sectionLabel}>MOTION</Text>
      <View style={styles.actions}>
        {["motion", "still"].map((value) => {
          const enabled =
            value === "still" ||
            archive.content.snapshots.some(
              (item) => item.mediaType === "video" && item.shareable,
            );
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{
                checked: motion === value,
                disabled: !enabled,
              }}
              disabled={!enabled}
              onPress={() => setMotion(value)}
              style={[
                styles.selector,
                motion === value && styles.formatActive,
                !enabled && styles.iconDisabled,
              ]}
            >
              <Text style={styles.rowTitle}>
                {value === "motion" ? "Living motion" : "Still"}
              </Text>
              <Text style={styles.rowDetail}>
                {enabled ? "Available" : "Needs a verified finished video"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sectionLabel}>WHAT LEAVES CANAL</Text>
      <View style={styles.disclosures}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: showSongs }} onPress={() => setShowSongs((value) => !value)} style={styles.disclosure}><Ionicons name={showSongs ? "checkbox" : "square-outline"} color="#e9d9ca" size={22} /><Text style={styles.rowTitle}>Show exact songs</Text></Pressable>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: showStages }} onPress={() => setShowStages((value) => !value)} style={styles.disclosure}><Ionicons name={showStages ? "checkbox" : "square-outline"} color="#e9d9ca" size={22} /><Text style={styles.rowTitle}>Show Stage summary</Text></Pressable>
        <View accessibilityRole="checkbox" accessibilityState={{ checked: false, disabled: true }} style={[styles.disclosure, styles.iconDisabled]}><Ionicons name="square-outline" color="#e9d9ca" size={22} /><View><Text style={styles.rowTitle}>Include Common Ground</Text><Text style={styles.rowDetail}>Requires the other person’s explicit approval.</Text></View></View>
      </View>
      <View accessibilityRole="tablist" style={styles.actions}>
        {formats.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{
              selected: format === item.key,
              disabled: !item.enabled,
            }}
            disabled={!item.enabled}
            onPress={() => setFormat(item.key)}
            style={[
              styles.format,
              format === item.key && styles.formatActive,
              !item.enabled && styles.iconDisabled,
            ]}
          >
            <Text style={styles.rowTitle}>{item.label}</Text>
            <Text style={styles.rowDetail}>
              {item.enabled
                ? "Available"
                : item.key === "link"
                  ? "Make this archive shareable first"
                  : "Needs a finished composition"}
            </Text>
          </Pressable>
        ))}
      </View>
      {shareError ? <Notice text={shareError} /> : null}
      {canShare ? (
        <Action
          label="Open share sheet"
          icon="share-outline"
          onPress={() => void performShare()}
        />
      ) : (
        <DisabledAction label="This format is not ready to share" />
      )}
      {snapshotIds.length ? (
        <View>
          <Text style={styles.sectionLabel}>FEATURED SNAPSHOTS</Text>
          {snapshotIds.map((id) => (
            <View key={id} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Snapshot</Text>
                <Text style={styles.rowDetail}>
                  Legacy Soundscape membership preserved
                </Text>
              </View>
              <IconButton
                icon="eye-outline"
                label="Open Snapshot"
                onPress={() => onOpen(id)}
              />
              <IconButton
                icon="close"
                label="Remove from Soundscape"
                onPress={() => void onRemove(id)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.footnote}>
          Finished image and video cards appear here only when their verified
          composition is shareable.
        </Text>
      )}
    </View>
  );
}

function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: string;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name="pulse-outline" color="#ead6c5" size={26} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
      {action ? <Text style={styles.footnote}>{action}</Text> : null}
    </View>
  );
}
function Notice({
  text,
  action,
  onPress,
}: {
  text: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.noticeButton}
        >
          <Text style={styles.noticeAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}
function Action({
  label,
  icon,
  onPress,
  compact = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        compact && styles.actionCompact,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
      <Ionicons name={icon} color="#18202a" size={18} />
    </Pressable>
  );
}
function DisabledAction({ label }: { label: string }) {
  return (
    <View
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={[styles.action, styles.actionDisabled]}
    >
      <Text style={styles.disabledText}>{label}</Text>
      <Ionicons name="lock-closed-outline" color="#a9a49d" size={16} />
    </View>
  );
}
function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.iconDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} color="#f8f2ea" size={20} />
    </Pressable>
  );
}

function getChapterBody(index: number, archive: SoundscapeArchive) {
  const year = archive.period.key.split("-")[0];
  return [
    {
      title: "The year you made sound situational.",
      subtitle:
        "A living portrait built only from your recorded Canal history.",
    },
    {
      title: "Your day had different musical jobs.",
      subtitle: "Activities reveal when and why your listening changed.",
    },
    {
      title: "Your taste didn’t change. Its purpose did.",
      subtitle: "Moods show the currents that returned across the year.",
    },
    {
      title: "The songs that earned their way into your taste.",
      subtitle:
        "Only verified discoveries appear—never invented listening history.",
    },
    {
      title: "Your taste is not a genre.",
      subtitle:
        "Song DNA collects the artists and signals already present in your Scenes.",
    },
    {
      title: `A ${year} trail you can return to.`,
      subtitle:
        "Playback history is shown only when Canal captured a complete session.",
    },
    {
      title: "What happened when your taste became a room.",
      subtitle: "Open a Stage archive or rebuild the same gathering.",
    },
    {
      title: "A relationship between tastes—not a percentage.",
      subtitle:
        "Common Ground requires mutual connection and two explicit approvals.",
    },
    {
      title: "Your Scenes formed distinct worlds.",
      subtitle:
        "Open the Scene itself to see its current detail and evolution.",
    },
    {
      title: "Build the finished version people will actually see.",
      subtitle:
        "Share a safe summary and manage the Snapshots already featured on your Soundscape.",
    },
  ][index];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101923", overflow: "hidden" },
  glowA: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: "rgba(193,95,89,0.20)",
    top: -230,
    right: -180,
  },
  glowB: {
    position: "absolute",
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: "rgba(70,128,145,0.18)",
    bottom: -340,
    left: -260,
  },
  shine: {
    position: "absolute",
    top: -180,
    bottom: -180,
    width: 160,
    backgroundColor: "#fff8eb",
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#cceae5",
  },
  brandMarkText: {
    color: "#15202b",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 16,
    fontWeight: "700",
  },
  brandName: {
    color: "#f7f4ed",
    fontSize: 13,
    letterSpacing: 0.8,
    fontWeight: "800",
  },
  periodLabel: {
    flex: 1,
    color: "#c7c6c7",
    fontSize: 13,
    textAlign: "right",
  },
  progressRail: {
    minHeight: 40,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  progressRailInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  progressTarget: {
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
  },
  progressSegment: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.14)",
  },
  progressSegmentComplete: { backgroundColor: "rgba(156,218,209,.42)" },
  progressSegmentActive: { backgroundColor: "#bde9e2" },
  shell: { flex: 1 },
  railTextActive: { color: "#fff8ee", fontWeight: "700" },
  story: { flex: 1 },
  storyContent: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 24,
  },
  storyContentWide: { paddingHorizontal: 40, paddingTop: 44 },
  kicker: {
    color: "#efb489",
    fontSize: 11,
    letterSpacing: 2.1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  title: {
    color: "#fff8f0",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 40,
    lineHeight: 45,
    maxWidth: 700,
    marginTop: 13,
  },
  subtitle: {
    color: "#c7c0b9",
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 650,
    marginTop: 14,
    marginBottom: 32,
  },
  ribbonPortrait: { height: 150, justifyContent: "center", overflow: "hidden", marginVertical: 10 },
  ribbon: { position: "absolute", left: 4, right: 4, height: 8, flexDirection: "row", alignItems: "center", opacity: .74 },
  ribbonSegment: { height: 7, borderRadius: 8, marginHorizontal: -3, backgroundColor: "rgba(255,255,255,.12)" },
  ribbonMint: { top: 56, backgroundColor: "rgba(90,205,184,.78)", transform: [{ rotate: "2deg" }] },
  ribbonBlue: { top: 62, backgroundColor: "rgba(100,102,215,.66)", transform: [{ rotate: "-5deg" }] },
  ribbonGold: { top: 71, backgroundColor: "rgba(218,164,88,.67)", transform: [{ rotate: "4deg" }] },
  ribbonRose: { top: 77, backgroundColor: "rgba(221,91,150,.74)", transform: [{ rotate: "-2deg" }] },
  metricRow: { flexDirection: "row", flexWrap: "wrap", marginVertical: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,.18)" },
  metric: {
    flexGrow: 1, flexBasis: "46%", minHeight: 102, paddingVertical: 15, paddingRight: 15,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,.18)",
  },
  metricValue: { color: "#fff8ef", fontSize: 25, fontWeight: "700" },
  metricLabel: { color: "#bcb5ae", marginTop: 5, fontSize: 12 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  signalCard: {
    minWidth: 150,
    flexGrow: 1,
    flexBasis: "40%",
    minHeight: 126,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,.07)",
    overflow: "hidden",
  },
  signalCardPrimary: { backgroundColor: "rgba(197,113,89,.22)" },
  signalCount: { color: "#e9c09d", fontSize: 12 },
  signalName: {
    color: "#fff8ef",
    fontSize: 20,
    marginTop: 9,
    fontWeight: "600",
  },
  signalBar: {
    height: 3,
    backgroundColor: "#e8ad80",
    borderRadius: 2,
    marginTop: 22,
  },
  phaseMap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  weekPanel: { borderRadius: 28, padding: 16, backgroundColor: "rgba(3,20,35,.30)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.15)" }, weekHeader: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 7, marginBottom: 10 }, heatmap: { gap: 7 }, heatmapRow: { flexDirection: "row", alignItems: "center", gap: 7 }, dayLabel: { width: 34, color: "#eef9f7", fontSize: 10, fontWeight: "700" }, phaseLabelButton: { flex: 1, minHeight: 48, justifyContent: "center" }, phaseLabel: { color: "#aebcbe", fontSize: 9, textAlign: "center" }, heatCell: { flex: 1, aspectRatio: 1.25, minHeight: 36, maxHeight: 46, borderRadius: 12, backgroundColor: "#61cdbb" }, heatCellActive: { backgroundColor: "#e889ad", borderWidth: 1, borderColor: "rgba(255,255,255,.5)" }, selectedPattern: { marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,.16)" },
  phase: {
    flexGrow: 1,
    flexBasis: "21%",
    minWidth: 150,
    minHeight: 190,
    padding: 17,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,.06)",
  },
  phaseLine: {
    height: 50,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(238,181,139,.45)",
    marginLeft: 6,
    marginBottom: 8,
  },
  phaseNode: {
    width: 13,
    height: 13,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: "#64727a",
  },
  phaseNodeActive: { backgroundColor: "#f1b88b" },
  seasonCard: {
    minWidth: 230,
    flexGrow: 1,
    flexBasis: "42%",
    minHeight: 190,
    borderRadius: 26,
    padding: 20,
    backgroundColor: "rgba(121,143,151,.13)",
  },
  seasonCardActive: {
    backgroundColor: "rgba(102,177,166,.25)",
    transform: [{ translateY: -4 }],
  },
  seasonDrawer: {
    marginTop: 13,
    paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,.16)",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    alignItems: "center",
  },
  signaturePanel: {
    borderRadius: 28,
    padding: 22,
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,.065)",
  },
  contour: {
    height: 108,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  contourBar: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "rgba(114,214,199,.58)",
  },
  discoveryRiver: { position: "relative", gap: 12 },
  riverLine: {
    position: "absolute",
    left: "50%",
    top: 12,
    bottom: 12,
    width: 2,
    backgroundColor: "rgba(114,214,199,.28)",
  },
  discoveryStop: {
    width: "48%",
    minHeight: 130,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,.06)",
  },
  discoveryStopRight: { alignSelf: "flex-end" },
  riverNode: {
    position: "absolute",
    right: -10,
    top: 24,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#70d1c2",
  },
  discoveryStory: { borderRadius: 28, padding: 18, marginTop: 14, backgroundColor: "rgba(2,20,24,.32)" },
  causalityStep: { minHeight: 96, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,.12)" },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#5896be" },
  stepNumberText: { color: "white", fontWeight: "800" },
  sourcePanel: { borderRadius: 24, padding: 18, marginTop: 12, backgroundColor: "rgba(255,255,255,.05)" },
  sourceRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  sourceTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,.1)" },
  sourceFill: { height: 8, borderRadius: 4, backgroundColor: "#55bfad" },
  blendFlow: {
    minHeight: 180,
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,.055)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  blendColumn: { flex: 1 },
  flowLines: { width: 55, gap: 13 },
  flowLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#70d1c2",
    transform: [{ rotate: "8deg" }],
  },
  flowLineAlt: { backgroundColor: "#d78da8", transform: [{ rotate: "-8deg" }] },
  commonMap: {
    borderRadius: 28,
    padding: 18,
    marginBottom: 15,
    backgroundColor: "rgba(255,255,255,.055)",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  commonStream: { flex: 1, minWidth: 100 },
  bridgeCore: { alignItems: "center", flex: 1.3, minWidth: 145 },
  bridgeRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107,210,193,.18)",
    borderWidth: 1,
    borderColor: "rgba(180,255,239,.36)",
  },
  commonRows: { width: "100%" },
  atlas: {
    position: "relative",
    minHeight: 350,
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,.055)",
    marginBottom: 14,
  },
  atlasVertical: {
    position: "absolute",
    left: "50%",
    top: 38,
    bottom: 38,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,.18)",
  },
  atlasHorizontal: {
    position: "absolute",
    left: 38,
    right: 38,
    top: "50%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,.18)",
  },
  atlasAxis: {
    position: "absolute",
    color: "#aaaeb0",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  atlasStill: { top: 12, alignSelf: "center" },
  atlasKinetic: { bottom: 12, alignSelf: "center" },
  atlasIntimate: { left: 8, top: "48%" },
  atlasSocial: { right: 8, top: "48%" },
  atlasPoint: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(106,195,184,.5)",
  },
  atlasPointActive: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginLeft: -6,
    marginTop: -6,
    backgroundColor: "#e99aaa",
  },
  atlasPointText: { color: "white", fontWeight: "800" },
  sceneDetail: {
    borderRadius: 26,
    padding: 20,
    backgroundColor: "rgba(255,255,255,.06)",
  },
  ridge: { height: 100, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  ridgeBar: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "rgba(195,255,243,.68)",
  },
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  timelineStep: {
    flex: 1,
    minHeight: 70,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,.05)",
  },
  dnaCard: {
    minHeight: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,.13)",
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  confidence: { width: 132 },
  confidenceLabel: { color: "#9e9892", fontSize: 8, letterSpacing: 1.1 },
  confidenceTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.12)",
    marginTop: 8,
  },
  confidenceFill: { height: 4, borderRadius: 2, backgroundColor: "#eab084" },
  months: {
    minHeight: 120,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    marginBottom: 20,
  },
  month: {
    flex: 1,
    minHeight: 80,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 8,
    borderRadius: 12,
  },
  monthActive: { backgroundColor: "rgba(255,255,255,.08)" },
  monthLabel: { color: "#9b9690", fontSize: 9 },
  monthBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: "#d99a78",
    marginTop: 6,
  },
  format: {
    minWidth: 145,
    flexGrow: 1,
    flexBasis: "28%",
    minHeight: 76,
    borderRadius: 18,
    padding: 13,
    backgroundColor: "rgba(255,255,255,.055)",
  },
  formatActive: {
    backgroundColor: "rgba(236,180,139,.17)",
    borderWidth: 1,
    borderColor: "rgba(245,205,171,.34)",
  },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,.13)",
    gap: 13,
    paddingVertical: 10,
  },
  rowNumber: { color: "#a7a09b", fontSize: 11, width: 24 },
  rowCopy: { flex: 1 },
  rowTitle: { color: "#fff8ef", fontSize: 16, fontWeight: "600" },
  rowDetail: { color: "#b7b0aa", fontSize: 12, lineHeight: 18, marginTop: 3 },
  featureCard: {
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,.07)",
    padding: 21,
    marginBottom: 13,
  },
  cardEyebrow: {
    color: "#d2a887",
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "800",
  },
  cardTitle: {
    color: "#fff8ef",
    fontSize: 21,
    fontWeight: "600",
    marginTop: 8,
  },
  cardDetail: { color: "#c1b9b1", fontSize: 13, lineHeight: 19, marginTop: 7 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 17 },
  sceneCard: {
    flexGrow: 1,
    flexBasis: "42%",
    minWidth: 210,
    minHeight: 145,
    borderRadius: 25,
    padding: 19,
    backgroundColor: "rgba(114,150,155,.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.10)",
  },
  sceneMeta: { color: "#e0b28d", fontSize: 11, marginTop: "auto" },
  shareCard: {
    minHeight: 280,
    borderRadius: 32,
    padding: 26,
    justifyContent: "flex-end",
    backgroundColor: "rgba(184,103,91,.22)",
    borderWidth: 1,
    borderColor: "rgba(255,222,196,.19)",
  },
  shareQuote: {
    color: "#fff7ee",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 31,
    lineHeight: 38,
    maxWidth: 570,
    marginVertical: 15,
  },
  sectionLabel: {
    color: "#d4ab8d",
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: "800",
    marginTop: 28,
  },
  selectorRow: { gap: 9, paddingTop: 17, paddingRight: 20 },
  selector: {
    minWidth: 132,
    minHeight: 62,
    borderRadius: 18,
    padding: 13,
    backgroundColor: "rgba(255,255,255,.055)",
  },
  disclosures: { gap: 8, marginTop: 14 }, disclosure: { minHeight: 48, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,255,255,.045)" },
  action: {
    alignSelf: "flex-start",
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: "#f3d1ad",
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
  },
  actionCompact: {
    minHeight: 46,
    marginTop: 0,
    backgroundColor: "rgba(243,209,173,.92)",
  },
  actionText: { color: "#18202a", fontWeight: "700", fontSize: 13 },
  actionDisabled: { backgroundColor: "rgba(255,255,255,.07)" },
  disabledText: { color: "#aaa49e", fontSize: 12 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconDisabled: { opacity: 0.25 },
  pressed: { opacity: 0.66, transform: [{ scale: 0.985 }] },
  empty: {
    minHeight: 170,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,.055)",
    padding: 23,
    justifyContent: "center",
  },
  emptyTitle: { color: "#f5ede5", fontSize: 17, lineHeight: 23, marginTop: 12 },
  emptyDetail: { color: "#b9b2ac", lineHeight: 20, marginTop: 8 },
  footnote: { color: "#aaa39d", fontSize: 12, lineHeight: 18, marginTop: 16 },
  notice: {
    borderRadius: 17,
    backgroundColor: "rgba(238,174,120,.12)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  noticeText: { color: "#eadfd4", flex: 1, lineHeight: 19 },
  noticeButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  noticeAction: { color: "#f0b885", fontWeight: "700" },
  pager: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 36,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,.16)",
    borderRadius: 24,
    backgroundColor: "rgba(4,12,24,.54)",
  },
  pagerCopy: { flex: 1, alignItems: "center", gap: 3 },
  pagerTitle: { color: "#fff8ef", fontSize: 14, fontWeight: "700" },
  pagerCount: {
    color: "#b3b5ba",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
