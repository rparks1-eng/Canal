import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Animated as NativeAnimated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";
import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";

import Animated, {
  FadeInRight,
  FadeInUp,
  FadeOutRight,
} from "react-native-reanimated";

import { Ionicons } from "@expo/vector-icons";
import {
  SnapshotComposition,
} from "../../components/snapshot-composition";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  CanalHeaderActions,
} from "../../components/canal-ui/canal-header-actions";

import {
  scenePresentation,
} from "../../components/canal-ui/scene-signature";

import {
  SceneCardBackdrop,
  ScenePaletteMark,
} from "../../components/canal-ui/scene-card-visual";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  deleteScene,
  readScenes,
  sceneDurationMinutes,
} from "../../lib/scenes";

import type {
  SceneVisibility,
  StoredScene,
} from "../../lib/scenes";

import {
  syncScenesWithCloud,
} from "../../lib/scene-sync";

import {
  deleteSnapshotWithStatus,
  readSnapshotsWithStatus,
  updateSnapshotWithStatus,
} from "../../lib/snapshots";

import type {
  Snapshot,
} from "../../lib/snapshots";

import {
  removeSavedSceneCompletely,
} from "../../lib/saved-scene-management";

import {
  setOwnSceneVisibility,
} from "../../lib/social";

import {
  shareSnapshot,
} from "../../lib/canal-share";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

type LibraryFilter =
  | "all"
  | "created"
  | "saved"
  | "favorites";

type LibraryLayout =
  | "list"
  | "grid";

type LibrarySection =
  | "scenes"
  | "snapshots";

type SnapshotFilter =
  | "all"
  | "public"
  | "private"
  | "photo"
  | "video";

const LIBRARY_MENU_SCROLL_DISMISS_DISTANCE = 12;

type OpenLibraryActions = {
  kind: "scene" | "snapshot";
  id: string;
} | null;

type LibraryLedgeAction = {
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
};

function LibraryActionLedge(props: {
  label: string;
  actions: LibraryLedgeAction[];
}) {
  return (
    <Animated.View
      accessibilityLabel={props.label}
      accessibilityRole="menu"
      entering={FadeInRight.duration(170)}
      exiting={FadeOutRight.duration(130)}
      onTouchStart={(event) => event.stopPropagation()}
      style={styles.actionLedge}
    >
      {props.actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityLabel={action.label}
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.actionLedgeButton,
            pressed && styles.actionLedgeButtonPressed,
          ]}
        >
          <Ionicons
            color={action.destructive ? "#FF655F" : canalDynamicColors.text}
            name={action.icon as never}
            size={17}
          />
        </Pressable>
      ))}
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    scenes,
    setScenes,
  ] =
    useState<
      StoredScene[]
    >([]);

  const [
    snapshots,
    setSnapshots,
  ] = useState<Snapshot[]>([]);

  const [
    section,
    setSection,
  ] = useState<LibrarySection>("scenes");

  const [
    snapshotFilter,
    setSnapshotFilter,
  ] = useState<SnapshotFilter>("all");

  const [
    snapshotWarning,
    setSnapshotWarning,
  ] = useState("");

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    filter,
    setFilter,
  ] =
    useState<LibraryFilter>(
      "all",
    );

  const [
    layout,
    setLayout,
  ] = useState<LibraryLayout>(
    "list",
  );

  const [
    animationRevision,
    setAnimationRevision,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busySceneId,
    setBusySceneId,
  ] = useState("");

  const [openActions, setOpenActions] = useState<OpenLibraryActions>(null);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    loadIssue,
    setLoadIssue,
  ] =
    useState<RecoveryIssue | null>(
      null,
    );

  const cardMotion = useRef(
    new Map<string, NativeAnimated.Value>(),
  ).current;
  const scrollStartY = useRef<number | null>(null);

  const motionForScene = useCallback(
    (sceneId: string): NativeAnimated.Value => {
      const existing = cardMotion.get(sceneId);

      if (existing) {
        return existing;
      }

      const value = new NativeAnimated.Value(0);
      cardMotion.set(sceneId, value);
      return value;
    },
    [cardMotion],
  );

  const animateSceneCard = useCallback(
    (
      sceneId: string,
      target: number,
    ): void => {
      NativeAnimated.spring(
        motionForScene(sceneId),
        {
          toValue: target,
          damping: 18,
          stiffness: 190,
          mass: 0.7,
          useNativeDriver: true,
        },
      ).start();
    },
    [motionForScene],
  );

  const load =
    useCallback(
      async (): Promise<void> => {
        setLoading(
          true,
        );

        setLoadIssue(
          null,
        );

        try {
          try {
            await syncScenesWithCloud();
          } catch (syncError) {
            console.warn(
              "Canal could not refresh cross-device Scenes; showing the latest local Library instead:",
              syncError,
            );
          }

          const [
            nextScenes,
            snapshotResult,
          ] = await Promise.all([
            readScenes(),
            readSnapshotsWithStatus(),
          ]);

          setScenes(nextScenes);
          setSnapshots(snapshotResult.value);
          setSnapshotWarning(snapshotResult.warning ?? "");
        } catch (error) {
          setLoadIssue(
            classifyRecoveryIssue(
              error,
              {
                service:
                  "canal",
                connectivityStatus,
              },
            ),
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        connectivityStatus,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();
      },
      [
        load,
      ],
    ),
  );

  useReconnectReload(
    load,
  );

  const recoverLoad =
    async (): Promise<void> => {
      if (
        loadIssue?.action ===
        "sign-in"
      ) {
        router.replace(
          "/login" as never,
        );

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus !==
        "offline"
      ) {
        await load();
      }
    };

  const filteredScenes =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        return scenes.filter(
          (scene) => {
            const matchesFilter =
              filter ===
                "all" ||
              (
                filter ===
                  "created" &&
                scene.libraryType !==
                  "saved"
              ) ||
              (
                filter ===
                  "saved" &&
                scene.libraryType ===
                  "saved"
              ) ||
              (
                filter ===
                  "favorites" &&
                Boolean(
                  scene.favorite,
                )
              );

            if (
              !matchesFilter
            ) {
              return false;
            }

            if (!needle) {
              return true;
            }

            return [
              scene.name,
              scene.activity,
              scene.emotions,
              scene.genres,
              scene.artists,
              ...scene.tracks.map(
                (track) =>
                  `${track.title} ${track.artist}`,
              ),
            ]
              .join(
                " ",
              )
              .toLowerCase()
              .includes(
                needle,
              );
          },
        );
      },
      [
        filter,
        query,
        scenes,
      ],
    );

  const filteredSnapshots =
    useMemo(
      () => {
        const needle = query.trim().toLowerCase();

        return snapshots.filter((snapshot) => {
          const matchesFilter =
            snapshotFilter === "all" ||
            snapshot.visibility === snapshotFilter ||
            snapshot.mediaType === snapshotFilter;

          if (!matchesFilter) {
            return false;
          }

          if (!needle) {
            return true;
          }

          return [
            snapshot.sceneName,
            snapshot.sceneActivity,
            snapshot.trackTitle,
            snapshot.trackArtist,
            snapshot.note,
            snapshot.mood,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle);
        });
      },
      [query, snapshotFilter, snapshots],
    );

  const changeVisibility =
    async (
      scene: StoredScene,
      visibility: SceneVisibility,
    ): Promise<void> => {
      if (
        scene.visibility ===
        visibility ||
        scene.libraryType ===
        "saved"
      ) {
        return;
      }

      setBusySceneId(
        scene.id,
      );

      setMessage("");
      setErrorMessage("");

      try {
        const updated =
          await setOwnSceneVisibility(
            scene.id,
            visibility,
          );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.id ===
                updated.id
                  ? updated
                  : candidate,
            ),
        );

        setMessage(
          `"${updated.name}" is now ${visibility}.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not change Scene visibility.",
        );
      } finally {
        setBusySceneId(
          "",
        );
      }
    };

  const performDelete =
    async (
      scene: StoredScene,
    ): Promise<void> => {
      setBusySceneId(
        scene.id,
      );

      setMessage("");
      setErrorMessage("");

      try {
        if (
          scene.libraryType ===
          "saved"
        ) {
          await removeSavedSceneCompletely(
            scene,
          );
        } else {
          await deleteScene(
            scene.id,
          );
        }

        setScenes(
          (current) =>
            current.filter(
              (candidate) =>
                candidate.id !==
                scene.id,
            ),
        );

        setMessage(
          scene.libraryType ===
          "saved"
            ? `"${scene.name}" was removed from your Library and saved list.`
            : `"${scene.name}" was deleted.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not delete this Scene.",
        );
      } finally {
        setBusySceneId(
          "",
        );
      }
    };

  const openSceneActions = (scene: StoredScene): void => {
    setOpenActions((current) =>
      current?.kind === "scene" && current.id === scene.id
        ? null
        : { kind: "scene", id: scene.id },
    );
  };

  const updateSnapshotVisibility = async (
    snapshot: Snapshot,
  ): Promise<void> => {
    setMessage("");
    setErrorMessage("");

    try {
      const result = await updateSnapshotWithStatus(snapshot.id, {
        visibility: snapshot.visibility === "public" ? "private" : "public",
      });

      if (result.value) {
        setSnapshots((current) => current.map((candidate) =>
          candidate.id === result.value?.id ? result.value : candidate,
        ));
        setMessage(`"${snapshot.sceneName}" is now ${result.value.visibility}.`);
      }

      setSnapshotWarning(result.warning ?? "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Canal could not update this Snapshot.");
    }
  };

  const deleteLibrarySnapshot = async (snapshot: Snapshot): Promise<void> => {
    setMessage("");
    setErrorMessage("");

    try {
      const result = await deleteSnapshotWithStatus(snapshot.id);
      setSnapshots((current) => current.filter((candidate) => candidate.id !== snapshot.id));
      setSnapshotWarning(result.warning ?? "");
      setMessage(`"${snapshot.sceneName}" was deleted.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Canal could not delete this Snapshot.");
    }
  };

  const confirmSnapshotDelete = (snapshot: Snapshot): void => {
    Alert.alert(
      "Delete Snapshot?",
      `"${snapshot.sceneName}" will be permanently removed from your account and Soundscape.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void deleteLibrarySnapshot(snapshot) },
      ],
    );
  };

  const openSnapshotActions = (snapshot: Snapshot): void => {
    setOpenActions((current) =>
      current?.kind === "snapshot" && current.id === snapshot.id
        ? null
        : { kind: "snapshot", id: snapshot.id },
    );
  };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
      ]}
    >
      <CanalAmbientBackground />
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          if (
            openActions &&
            scrollStartY.current !== null &&
            Math.abs(event.nativeEvent.contentOffset.y - scrollStartY.current) >=
              LIBRARY_MENU_SCROLL_DISMISS_DISTANCE
          ) {
            setOpenActions(null);
          }
        }}
        onScrollBeginDrag={(event) => {
          scrollStartY.current = event.nativeEvent.contentOffset.y;
        }}
        onScrollEndDrag={() => {
          scrollStartY.current = null;
        }}
        onTouchStart={() => {
          if (openActions) setOpenActions(null);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={
          false
        }
      >
        <Animated.View
          entering={FadeInUp.duration(260)}
          style={
            styles.header
          }
        >
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
            <Text
              style={
                styles.title
              }
            >
              Your Library
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Scenes and Snapshots you made, saved, and returned to—kept in one living collection.
            </Text>
          </View>

            <CanalHeaderActions />
        </Animated.View>

        <View accessibilityRole="tablist" style={styles.sectionToggle}>
          {(["scenes", "snapshots"] as LibrarySection[]).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === value }}
              accessibilityLabel={`${value === "scenes" ? "Scenes" : "Snapshots"} Library`}
              onPress={() => {
                setSection(value);
                setQuery("");
                setAnimationRevision((current) => current + 1);
              }}
              style={[
                styles.sectionButton,
                section === value && styles.sectionButtonSelected,
              ]}
            >
              <Ionicons
                name={value === "scenes" ? "musical-notes-outline" : "camera-outline"}
                size={17}
                color={section === value ? canalDynamicColors.text : canalDynamicColors.muted}
              />
              <Text style={[
                styles.sectionButtonText,
                section === value && styles.sectionButtonTextSelected,
              ]}>
                {value === "scenes" ? `Scenes ${scenes.length}` : `Snapshots ${snapshots.length}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {section === "scenes" ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Scene collaboration"
          accessibilityHint="Review collaboration invitations and shared Scenes."
          onPress={() =>
            router.push(
              "/scene-collaboration" as never,
            )
          }
          style={({ pressed }) => [
            styles.collaborationButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <View>
            <Text
              style={
                styles.collaborationTitle
              }
            >
              Scene collaboration
            </Text>

            <Text
              style={
                styles.collaborationText
              }
            >
              Invitations, shared edits, and revision conflicts
            </Text>
          </View>

          <Text
            style={
              styles.arrow
            }
          >
            ›
          </Text>
        </Pressable> : null}

        <TextInput
          accessibilityLabel="Search your Library"
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder={section === "scenes" ? "Search Scenes" : "Search Snapshots"}
          placeholderTextColor={canalDynamicColors.muted}
          autoCapitalize="none"
          autoCorrect={
            false
          }
          style={
            styles.searchInput
          }
        />

        <View
          style={
            styles.filters
          }
        >
          {(section === "scenes"
            ? (["all", "created", "saved", "favorites"] as const)
            : (["all", "public", "private", "photo", "video"] as const)
          ).map(
            (value) => (
              <Pressable
                key={
                  value
                }
                accessibilityRole="button"
                accessibilityState={{
                  selected: section === "scenes"
                    ? filter === value
                    : snapshotFilter === value,
                }}
                onPress={() => {
                  if (section === "scenes") {
                    setFilter(value as LibraryFilter);
                  } else {
                    setSnapshotFilter(value as SnapshotFilter);
                  }
                  setAnimationRevision(
                    (current) =>
                      current + 1,
                  );
                }}
                style={[
                  styles.filterButton,

                  (section === "scenes" ? filter === value : snapshotFilter === value) &&
                    styles.filterSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,

                    (section === "scenes" ? filter === value : snapshotFilter === value) &&
                      styles.filterTextSelected,
                  ]}
                >
                  {value
                    .charAt(
                      0,
                    )
                    .toUpperCase() +
                    value.slice(
                      1,
                    )}
                </Text>
              </Pressable>
            ),
          )}

          <View style={styles.filterSpacer} />

          <View
            accessibilityRole="tablist"
            style={styles.layoutToggle}
          >
            {(
              [
                ["list", "list-outline"],
                ["grid", "grid-outline"],
              ] as const
            ).map(([value, icon]) => (
              <Pressable
                key={value}
                accessibilityLabel={`${value} view`}
                accessibilityRole="tab"
                accessibilityState={{ selected: layout === value }}
                onPress={() => setLayout(value)}
                style={[
                  styles.layoutButton,
                  layout === value && styles.layoutButtonSelected,
                ]}
              >
                <Ionicons
                  color={layout === value ? "#123F54" : canalDynamicColors.muted}
                  name={icon}
                  size={17}
                />
              </Pressable>
            ))}
          </View>
        </View>

        {message ? (
          <Notice
            success
            text={
              message
            }
          />
        ) : null}

        {errorMessage ? (
          <Notice
            text={
              errorMessage
            }
          />
        ) : null}

        {section === "snapshots" && snapshotWarning ? (
          <Notice text={snapshotWarning} />
        ) : null}

        {loadIssue ? (
          <RecoveryNotice
            busy={
              loading
            }
            issue={
              loadIssue
            }
            onAction={
              recoverLoad
            }
          />
        ) : null}

        {loading ? (
          <View
            style={
              styles.loadingCard
            }
          >
            <ActivityIndicator
              size="large"
            />
          </View>
        ) : loadIssue &&
          (section === "scenes" ? scenes.length : snapshots.length) ===
            0 ? null : (section === "scenes" ? filteredScenes.length : filteredSnapshots.length) ===
          0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              {query.trim() || (section === "scenes" ? filter !== "all" : snapshotFilter !== "all")
                ? `No matching ${section === "scenes" ? "Scenes" : "Snapshots"}`
                : `No ${section === "scenes" ? "Scenes" : "Snapshots"} yet`}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {query.trim() || (section === "scenes" ? filter !== "all" : snapshotFilter !== "all")
                ? "Try another search or filter."
                : section === "scenes"
                  ? "Create a Scene or save one from Explore. Saved work remains available when you’re offline."
                  : "Capture a Snapshot from a Scene or Stage. Private and public moments will both appear here."}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.list,
              layout === "grid" && styles.grid,
            ]}
          >
            {section === "scenes" ? filteredScenes.map(
              (scene, index) => {
                const busy =
                  busySceneId ===
                  scene.id;

                const presentation =
                  scenePresentation(scene);

                const sourceHandle =
                  typeof scene
                    .sourceCreatorHandle ===
                    "string"
                    ? scene
                        .sourceCreatorHandle
                    : "";

                const motion =
                  motionForScene(
                    scene.id,
                  );

                const actionsOpen =
                  openActions?.kind === "scene" && openActions.id === scene.id;

                return (
                  <Animated.View
                    key={`${animationRevision}:${scene.id}`}
                    entering={FadeInUp.duration(300).delay(Math.min(index, 7) * 42)}
                    style={[
                      styles.sceneWrapper,
                      layout === "grid" && styles.sceneWrapperGrid,
                      actionsOpen && styles.libraryWrapperMenuOpen,
                    ]}
                  >
                    <NativeAnimated.View
                      style={[
                        styles.sceneCard,
                        layout === "grid" && styles.sceneCardGrid,
                      {
                        backgroundColor:
                          presentation.colors[2],
                        borderColor:
                          `${presentation.accent}44`,
                      },
                        {
                          transform: [
                            {
                              translateY:
                                motion.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, -3],
                                }),
                            },
                            {
                              scale:
                                motion.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 1.018],
                                }),
                            },
                          ],
                        },
                      ]}
                    >
                    <SceneCardBackdrop presentation={presentation} />
                    <Pressable
                      accessibilityRole="button"
                      onHoverIn={() =>
                        animateSceneCard(
                          scene.id,
                          1,
                        )
                      }
                      onHoverOut={() =>
                        animateSceneCard(
                          scene.id,
                          0,
                        )
                      }
                      onPressIn={() =>
                        animateSceneCard(
                          scene.id,
                          0.6,
                        )
                      }
                      onPressOut={() =>
                        animateSceneCard(
                          scene.id,
                          0,
                        )
                      }
                      onPress={() =>
                        router.push({
                          pathname:
                            "/scenes/[sceneId]",

                          params: {
                            sceneId:
                              scene.id,
                          },
                        } as never)
                      }
                      style={[
                        styles.sceneMain,
                        layout === "grid" && styles.sceneMainGrid,
                      ]}
                    >
                      <ScenePaletteMark
                        presentation={presentation}
                        style={layout === "grid" ? styles.scenePaletteMarkGrid : styles.scenePaletteMark}
                      />
                      <View
                        style={[
                          styles.sceneText,
                          layout === "grid" && styles.sceneTextGrid,
                        ]}
                      >
                        <Text
                          numberOfLines={
                            1
                          }
                          style={[
                            styles.sceneName,
                            {
                              color:
                                "#FFFFFF",
                            },
                          ]}
                        >
                          {scene.name}
                        </Text>

                        <Text
                          numberOfLines={
                            1
                          }
                          style={[styles.sceneMeta, { color: `${presentation.accent}CC` }]}
                        >
                          {scene.activity ||
                            "Any activity"}{" "}
                          ·{" "}
                          {sceneDurationMinutes(
                            scene,
                          )}{" "}
                          min ·{" "}
                          {scene.tracks.length}{" "}
                          tracks
                        </Text>

                        <Text
                          numberOfLines={
                            1
                          }
                          style={[styles.sourceText, { color: "rgba(255,255,255,0.64)" }]}
                        >
                          {scene.libraryType ===
                          "saved"
                            ? `Saved from ${sourceHandle || "another creator"}`
                            : "Created by you"}
                        </Text>
                      </View>

                      <Pressable
                        accessibilityLabel={`Manage ${scene.name}`}
                        accessibilityHint="Shows Scene actions"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: actionsOpen }}
                        disabled={busy}
                        onTouchStart={(event) => event.stopPropagation()}
                        onPress={(event) => {
                          event.stopPropagation();
                          openSceneActions(scene);
                        }}
                        style={({ pressed }) => [
                          styles.manageButton,
                          layout === "grid" && styles.manageButtonGrid,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons color={presentation.accent} name="ellipsis-horizontal" size={18} />
                      </Pressable>
                    </Pressable>
                    </NativeAnimated.View>
                    {actionsOpen ? (
                      <LibraryActionLedge
                        label={`${scene.name} actions`}
                        actions={[
                          {
                            label: `Open ${scene.name}`,
                            icon: "arrow-forward-circle-outline",
                            onPress: () => {
                              setOpenActions(null);
                              router.push({
                                pathname: "/scenes/[sceneId]",
                                params: { sceneId: scene.id },
                              } as never);
                            },
                          },
                          ...(scene.libraryType === "saved" ? [] : [{
                            label: scene.visibility === "public" ? "Make Private" : "Make Public",
                            icon: scene.visibility === "public" ? "eye-off-outline" : "eye-outline",
                            onPress: () => {
                              setOpenActions(null);
                              void changeVisibility(
                                scene,
                                scene.visibility === "public" ? "private" : "public",
                              );
                            },
                          }]),
                          {
                            label: scene.libraryType === "saved" ? "Remove from Library" : "Delete Scene",
                            icon: "trash-outline",
                            destructive: true,
                            onPress: () => {
                              setOpenActions(null);
                              void performDelete(scene);
                            },
                          },
                        ]}
                      />
                    ) : null}
                  </Animated.View>
                );
              },
            ) : filteredSnapshots.map((snapshot, index) => (
              <Animated.View
                key={`${animationRevision}:${snapshot.id}`}
                entering={FadeInUp.duration(300).delay(Math.min(index, 7) * 42)}
                style={[
                  styles.snapshotWrapper,
                  layout === "grid" && styles.snapshotWrapperGrid,
                  openActions?.kind === "snapshot" && openActions.id === snapshot.id && styles.libraryWrapperMenuOpen,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${snapshot.sceneName} Snapshot`}
                  onPress={() => router.push({
                    pathname: "/snapshots/[snapshotId]",
                    params: { snapshotId: snapshot.id },
                  } as never)}
                  style={({ pressed }) => [
                    styles.snapshotCard,
                    layout === "grid" && styles.snapshotCardGrid,
                    pressed && styles.pressed,
                  ]}
                >
                  <SnapshotComposition
                    compact
                    height={layout === "grid" ? 176 : 116}
                    snapshot={snapshot}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${snapshot.sceneName} Snapshot`}
                    accessibilityHint="Shows visibility, share, and delete options"
                    accessibilityState={{
                      expanded: openActions?.kind === "snapshot" && openActions.id === snapshot.id,
                    }}
                    onTouchStart={(event) => event.stopPropagation()}
                    onPress={(event) => {
                      event.stopPropagation();
                      openSnapshotActions(snapshot);
                    }}
                    style={({ pressed }) => [styles.snapshotManageButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="ellipsis-horizontal" size={19} color={canalDynamicColors.text} />
                  </Pressable>
                </Pressable>
                {openActions?.kind === "snapshot" && openActions.id === snapshot.id ? (
                  <LibraryActionLedge
                    label={`${snapshot.sceneName} Snapshot actions`}
                    actions={[
                      {
                        label: snapshot.visibility === "public" ? "Make Private" : "Make Public",
                        icon: snapshot.visibility === "public" ? "eye-off-outline" : "eye-outline",
                        onPress: () => {
                          setOpenActions(null);
                          void updateSnapshotVisibility(snapshot);
                        },
                      },
                      {
                        label: "Share Snapshot",
                        icon: "share-outline",
                        onPress: () => {
                          setOpenActions(null);
                          void shareSnapshot(snapshot).catch((error: unknown) => {
                            setErrorMessage(error instanceof Error ? error.message : "Canal could not share this Snapshot.");
                          });
                        },
                      },
                      {
                        label: "Delete Snapshot",
                        icon: "trash-outline",
                        destructive: true,
                        onPress: () => {
                          setOpenActions(null);
                          confirmSnapshotDelete(snapshot);
                        },
                      },
                    ]}
                  />
                ) : null}
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Notice(
  props: {
    text: string;
    success?: boolean;
  },
) {
  return (
    <View
      style={[
        styles.notice,

        props.success
          ? styles.successNotice
          : styles.errorNotice,
      ]}
    >
      <Text
        style={
          props.success
            ? styles.successText
            : styles.errorText
        }
      >
        {props.text}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "transparent",
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 120,
      gap: 11,
    },

    header: {
      position: "relative",
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 2,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 104,
    },

    headerActions: {
      position: "absolute",
      top: 0,
      right: 0,
    },

    eyebrow: {
      color: canalDynamicColors.text,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2.1,
      marginBottom: 8,
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 34,
      fontWeight: "500",
      letterSpacing: -1.1,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      marginTop: 3,
      lineHeight: 19,
      maxWidth: 325,
    },

    createButton: {
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 14,
      paddingVertical: 11,
    },

    createButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    collaborationButton: {
      minHeight: 72,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 14,
      paddingHorizontal:
        18,
      paddingVertical:
        14,
      borderWidth: 1,
      borderColor:
        canalDynamicColors.line,
      borderRadius:
        20,
      backgroundColor:
        canalDynamicColors.surface,
      boxShadow: "0 14px 34px rgba(2, 31, 46, 0.14)",
    },

    sectionToggle: {
      minHeight: 52,
      flexDirection: "row",
      padding: 4,
      borderRadius: 17,
      backgroundColor: canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    sectionButton: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: 13,
    },

    sectionButtonSelected: {
      backgroundColor: canalDynamicColors.warningSurface,
    },

    sectionButtonText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "800",
    },

    sectionButtonTextSelected: {
      color: canalDynamicColors.text,
    },

    collaborationTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight:
        "900",
    },

    collaborationText: {
      marginTop: 3,
      color: canalDynamicColors.muted,
      fontSize: 12,
    },

    pressed: {
      opacity: 0.76,
    },

    searchInput: {
      minHeight: 48,
      borderWidth: 1,
      borderColor:
        canalDynamicColors.line,
      borderRadius: 13,
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      paddingHorizontal: 14,
    },

    filters: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      marginTop: 0,
      marginBottom: 0,
    },

    filterButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 13,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },

    filterSpacer: {
      flex: 1,
    },

    layoutToggle: {
      flexDirection: "row",
      borderRadius: 13,
      backgroundColor: canalDynamicColors.surface,
      padding: 3,
    },

    layoutButton: {
      width: 34,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },

    layoutButtonSelected: {
      backgroundColor: "rgba(222, 255, 248, 0.92)",
    },

    filterSelected: {
      borderColor:
        "#F47A24",
      backgroundColor: canalDynamicColors.warningSurface,
    },

    filterText: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
    },

    filterTextSelected: {
      color: canalDynamicColors.gold,
    },

    list: {
      gap: 7,
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    sceneWrapper: {
      width: "100%",
      position: "relative",
    },

    sceneWrapperGrid: {
      width: "48.6%",
    },

    snapshotWrapper: {
      width: "100%",
      position: "relative",
    },

    libraryWrapperMenuOpen: {
      zIndex: 20,
    },

    actionLedge: {
      position: "absolute",
      right: 48,
      top: 4,
      zIndex: 30,
      maxWidth: 156,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      overflow: "hidden",
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      boxShadow: "0 8px 24px rgba(2, 30, 45, 0.2)",
    },

    actionLedgeButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    actionLedgeButtonPressed: {
      backgroundColor: canalDynamicColors.elevated,
    },

    snapshotWrapperGrid: {
      width: "48.6%",
    },

    snapshotCard: {
      minHeight: 116,
      borderRadius: 19,
      overflow: "hidden",
    },

    snapshotCardGrid: {
      minHeight: 176,
    },

    snapshotManageButton: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },

    sceneCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 21,
      borderCurve: "continuous",
      borderWidth: 1,
      overflow: "hidden",
      padding: 14,
      boxShadow: "0 14px 34px rgba(2, 30, 45, 0.13)",
    },

    sceneCardGrid: {
      width: "100%",
      minHeight: 164,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },

    featuredSceneCard: {
      minHeight: 230,
      justifyContent: "flex-end",
      overflow: "hidden",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 27,
      padding: 18,
      boxShadow: "0 19px 45px rgba(2, 28, 47, 0.22)",
    },

    featuredManageButton: {
      position: "absolute",
      zIndex: 3,
      top: 12,
      right: 12,
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
      backgroundColor: canalDynamicColors.surface,
    },

    featuredSceneMain: {
      minHeight: 190,
      alignItems: "flex-start",
      justifyContent: "flex-end",
    },

    featuredSceneText: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
    },

    featuredSceneName: {
      fontFamily: "Georgia",
      fontSize: 30,
      fontWeight: "500",
      letterSpacing: -0.6,
    },

    sceneMain: {
      flexDirection: "row",
      alignItems:
        "center",
      minHeight: 58,
      zIndex: 1,
    },

    sceneMainGrid: {
      flex: 1,
      alignItems: "flex-end",
    },

    sceneTextGrid: {
      alignSelf: "flex-end",
      paddingBottom: 2,
      paddingRight: 0,
    },

    artwork: {
      width: 76,
      height: 50,
      borderRadius: 12,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.warningSurface,
      marginRight: 12,
    },

    featuredArtwork: {
      position: "absolute",
      width: 210,
      height: 210,
      borderRadius: 105,
      right: -64,
      top: -74,
      backgroundColor: "rgba(206, 255, 245, 0.2)",
      marginRight: 0,
    },

    artworkText: {
      color: canalDynamicColors.gold,
      fontSize: 23,
      fontWeight: "900",
    },

    sceneText: {
      flex: 1,
    },

    scenePaletteMark: {
      marginRight: 12,
    },

    scenePaletteMarkGrid: {
      position: "absolute",
      left: 0,
      top: 0,
      width: 40,
      height: 40,
      borderRadius: 13,
    },

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    sceneMeta: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 4,
    },

    sourceText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 4,
    },

    arrow: {
      color: canalDynamicColors.muted,
      fontSize: 25,
      marginLeft: 8,
    },

    manageButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
    },

    manageButtonGrid: {
      position: "absolute",
      top: -3,
      right: -3,
      width: 40,
      height: 40,
      backgroundColor: "rgba(5, 15, 34, 0.34)",
    },

    actionRow: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      borderTopWidth: 1,
      borderTopColor:
        "#29332F",
      marginTop: 13,
      paddingTop: 11,
    },

    visibilityButtons: {
      flexDirection: "row",
      borderRadius: 12,
      backgroundColor:
        "#151D1B",
      padding: 3,
    },

    visibilityButton: {
      minWidth: 66,
      minHeight: 33,
      borderRadius: 9,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    privateSelected: {
      backgroundColor:
        "#A991E8",
    },

    publicSelected: {
      backgroundColor:
        "#F47A24",
    },

    visibilityText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontWeight: "900",
    },

    visibilityTextSelected: {
      color: "#FFFFFF",
    },

    privateBadge: {
      borderRadius: 11,
      backgroundColor:
        "#151D1B",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },

    privateBadgeText: {
      color: "#756E68",
      fontSize: 10,
      fontWeight: "800",
    },

    deleteButton: {
      minWidth: 70,
      minHeight: 36,
      borderWidth: 1,
      borderColor:
        "#E4B8B4",
      borderRadius: 12,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginLeft: 10,
    },

    deleteText: {
      color: canalDynamicColors.danger,
      fontSize: 10,
      fontWeight: "900",
    },

    notice: {
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    successNotice: {
      backgroundColor:
        "#10241E",
    },

    errorNotice: {
      backgroundColor:
        "#261716",
    },

    successText: {
      color: canalDynamicColors.mint,
      fontSize: 12,
      lineHeight: 18,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
    },

    loadingCard: {
      minHeight: 180,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    emptyCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      padding: 22,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 7,
    },
  });
