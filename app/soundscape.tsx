import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { canalColors } from "../theme/canal-colors";
import { canalTypography } from "../theme/canal-typography";

import {
  shareSoundscape,
} from "../lib/canal-share";
import {
  readSnapshots,
  Snapshot,
} from "../lib/snapshots";
import {
  normalizeUsername,
  readSoundscape,
  saveSoundscape,
  SoundscapeProfile,
} from "../lib/soundscape";

export default function SoundscapeScreen() {
  const [
    profile,
    setProfile,
  ] =
    useState<SoundscapeProfile | null>(
      null,
    );

  const [
    snapshots,
    setSnapshots,
  ] = useState<Snapshot[]>([]);

  const [isEditing, setIsEditing] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);
  const savingInFlightRef =
    useRef(false);

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [username, setUsername] =
    useState("");

  const [bio, setBio] =
    useState("");

  const [genres, setGenres] =
    useState("");

  const [
    favoriteArtists,
    setFavoriteArtists,
  ] = useState("");

  const loadSoundscape =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const [
          storedProfile,
          storedSnapshots,
        ] = await Promise.all([
          readSoundscape(),
          readSnapshots(),
        ]);

        setProfile(
          storedProfile,
        );

        setSnapshots(
          storedSnapshots,
        );

        populateForm(
          storedProfile,
        );
      } catch (error) {
        console.error(
          "Unable to load Soundscape:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load your Soundscape.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSoundscape();
    }, [loadSoundscape]),
  );

  const featuredSnapshots =
    useMemo(() => {
      if (!profile) {
        return [];
      }

      return profile.snapshotIds
        .map((snapshotId) =>
          snapshots.find(
            (snapshot) =>
              snapshot.id ===
              snapshotId,
          ),
        )
        .filter(
          (
            snapshot,
          ): snapshot is Snapshot =>
            snapshot !== undefined,
        );
    }, [
      profile,
      snapshots,
    ]);

  function populateForm(
    soundscape:
      SoundscapeProfile,
  ) {
    setDisplayName(
      soundscape.displayName,
    );

    setUsername(
      soundscape.username,
    );

    setBio(soundscape.bio);

    setGenres(
      soundscape.genres.join(
        ", ",
      ),
    );

    setFavoriteArtists(
      soundscape.favoriteArtists.join(
        ", ",
      ),
    );
  }

  function cancelEditing() {
    if (profile) {
      populateForm(profile);
    }

    setIsEditing(false);
  }

  async function saveProfile() {
    if (
      savingInFlightRef.current ||
      !profile
    ) {
      return;
    }

    const cleanedDisplayName =
      displayName.trim();

    const cleanedUsername =
      normalizeUsername(
        username,
      );

    if (!cleanedDisplayName) {
      Alert.alert(
        "Display name required",
        "Add a name to your Soundscape.",
      );

      return;
    }

    if (!cleanedUsername) {
      Alert.alert(
        "Username required",
        "Choose a valid Canal username.",
      );

      return;
    }

    try {
      savingInFlightRef.current =
        true;
      setIsSaving(true);

      const savedProfile =
        await saveSoundscape({
          ...profile,

          displayName:
            cleanedDisplayName,

          username:
            cleanedUsername,

          bio:
            bio.trim(),

          genres:
            parseCommaList(
              genres,
            ),

          favoriteArtists:
            parseCommaList(
              favoriteArtists,
            ),
        });

      setProfile(
        savedProfile,
      );

      populateForm(
        savedProfile,
      );

      setIsEditing(false);

      Alert.alert(
        "Soundscape saved",
        "Your music identity was updated.",
      );
    } catch (error) {
      console.error(
        "Unable to save Soundscape:",
        error,
      );

      Alert.alert(
        "Unable to save",
        "Canal could not update your Soundscape.",
      );
    } finally {
      savingInFlightRef.current =
        false;
      setIsSaving(false);
    }
  }

  async function toggleVisibility(
    makePublic: boolean,
  ) {
    if (!profile) {
      return;
    }

    try {
      const savedProfile =
        await saveSoundscape({
          ...profile,

          visibility:
            makePublic
              ? "public"
              : "private",
        });

      setProfile(
        savedProfile,
      );
    } catch (error) {
      console.error(
        "Unable to update privacy:",
        error,
      );

      Alert.alert(
        "Unable to update",
        "Canal could not change your Soundscape visibility.",
      );
    }
  }

  async function removeFeaturedSnapshot(
    snapshotId: string,
  ) {
    if (!profile) {
      return;
    }

    try {
      const savedProfile =
        await saveSoundscape({
          ...profile,

          snapshotIds:
            profile.snapshotIds.filter(
              (id) =>
                id !==
                snapshotId,
            ),
        });

      setProfile(
        savedProfile,
      );
    } catch (error) {
      console.error(
        "Unable to remove Snapshot:",
        error,
      );

      Alert.alert(
        "Unable to update",
        "Canal could not remove this Snapshot from your Soundscape.",
      );
    }
  }

  async function handleShare() {
    if (!profile) {
      return;
    }

    try {
      const result =
        await shareSoundscape({
          username:
            profile.username,

          displayName:
            profile.displayName,

          bio:
            profile.bio,

          genres:
            profile.genres,

          favoriteArtists:
            profile.favoriteArtists,

          visibility:
            profile.visibility,
        });

      if (
        result.method ===
        "clipboard"
      ) {
        Alert.alert(
          "Soundscape copied",
          "Your Soundscape was copied to your clipboard.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error
          ? error.message
          : "Canal could not share your Soundscape.",
      );
    }
  }

  if (
    isLoading ||
    !profile
  ) {
    return (
      <SafeAreaView
        style={styles.screen}
      >
        <View
          style={styles.centered}
        >
          <ActivityIndicator
            size="large"
            color="#ff7a1a"
          />

          <Text
            style={styles.loadingText}
          >
            Loading Soundscape...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <KeyboardAvoidingView
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
        style={styles.layout}
      >
        <ScrollView
          contentContainerStyle={
            styles.page
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isEditing ? "Cancel Soundscape editing" : "Back to profile"}
              onPress={() =>
                isEditing
                  ? cancelEditing()
                  : router.replace(
                      "/(tabs)/profile",
                    )
              }
              style={({ pressed }) => [
                styles.headerButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={styles.backText}
              >
                {isEditing
                  ? "‹ Cancel"
                  : "‹ You"}
              </Text>
            </Pressable>

            <Text
              style={
                styles.headerTitle
              }
            >
              Soundscape
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isEditing ? "Save Soundscape" : "Edit Soundscape"}
              accessibilityState={{ disabled: isSaving, busy: isSaving }}
              disabled={isSaving}
              onPress={() => {
                if (isEditing) {
                  void saveProfile();
                } else {
                  setIsEditing(true);
                }
              }}
              style={({ pressed }) => [
                styles.headerButton,
                isSaving &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator
                  size="small"
                  color="#ff9a50"
                />
              ) : (
                <Text
                  style={
                    styles.headerAction
                  }
                >
                  {isEditing
                    ? "Save"
                    : "Edit"}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text
                style={styles.avatarText}
              >
                {getInitials(
                  profile.displayName,
                )}
              </Text>
            </View>

            {!isEditing ? (
              <>
                <Text
                  style={
                    styles.displayName
                  }
                >
                  {profile.displayName}
                </Text>

                <Text
                  style={
                    styles.username
                  }
                >
                  @{profile.username}
                </Text>

                <View
                  style={[
                    styles.visibilityBadge,
                    profile.visibility ===
                      "public" &&
                      styles.publicBadge,
                  ]}
                >
                  <Ionicons
                    name={
                      profile.visibility ===
                      "public"
                        ? "globe-outline"
                        : "lock-closed-outline"
                    }
                    size={12}
                    color={
                      profile.visibility ===
                      "public"
                        ? "#9ff3b5"
                        : "#c5cbc6"
                    }
                  />

                  <Text
                    style={
                      styles.visibilityBadgeText
                    }
                  >
                    {profile.visibility}
                  </Text>
                </View>

                {profile.bio ? (
                  <Text
                    style={styles.bio}
                  >
                    {profile.bio}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>

          {isEditing ? (
            <View
              style={styles.formCard}
            >
              <ProfileField
                label="Display name"
                value={
                  displayName
                }
                onChangeText={
                  setDisplayName
                }
                placeholder="Your name"
                maxLength={60}
              />

              <ProfileField
                label="Username"
                value={username}
                onChangeText={(value) =>
                  setUsername(
                    normalizeUsername(
                      value,
                    ),
                  )
                }
                placeholder="username"
                autoCapitalize="none"
                maxLength={30}
              />

              <View style={styles.field}>
                <Text
                  style={styles.label}
                >
                  Bio
                </Text>

                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Describe your music identity"
                  placeholderTextColor={canalDynamicColors.muted}
                  multiline
                  textAlignVertical="top"
                  maxLength={240}
                  style={[
                    styles.input,
                    styles.bioInput,
                  ]}
                />

                <Text
                  style={styles.counter}
                >
                  {bio.length}/240
                </Text>
              </View>

              <ProfileField
                label="Genres"
                value={genres}
                onChangeText={
                  setGenres
                }
                placeholder="R&B, Hip-Hop, Afrobeats"
              />

              <ProfileField
                label="Favorite artists"
                value={
                  favoriteArtists
                }
                onChangeText={
                  setFavoriteArtists
                }
                placeholder="SZA, Frank Ocean, Tems"
              />
            </View>
          ) : (
            <>
              <View
                style={
                  styles.visibilityCard
                }
              >
                <View
                  style={
                    styles.visibilityCopy
                  }
                >
                  <Text
                    style={
                      styles.visibilityTitle
                    }
                  >
                    Public Soundscape
                  </Text>

                  <Text
                    style={
                      styles.visibilityText
                    }
                  >
                    Public Soundscapes
                    can be viewed and
                    shared by other
                    Canal users.
                  </Text>
                </View>

                <Switch
                  accessibilityLabel="Public Soundscape"
                  accessibilityRole="switch"
                  value={
                    profile.visibility ===
                    "public"
                  }
                  onValueChange={(value) => {
                    void toggleVisibility(
                      value,
                    );
                  }}
                  trackColor={{
                    false: "#3c4540",
                    true: "#ff7a1a",
                  }}
                  thumbColor="#ffffff"
                />
              </View>

              <View
                style={
                  styles.informationCard
                }
              >
                <Text
                  style={styles.cardTitle}
                >
                  Music identity
                </Text>

                <ChipSection
                  label="Genres"
                  values={
                    profile.genres
                  }
                />

                <ChipSection
                  label="Favorite artists"
                  values={
                    profile.favoriteArtists
                  }
                />
              </View>

              <View
                style={styles.section}
              >
                <View
                  style={
                    styles.sectionHeader
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.sectionTitle
                      }
                    >
                      Featured Snapshots
                    </Text>

                    <Text
                      style={
                        styles.sectionDescription
                      }
                    >
                      Moments displayed
                      on your Soundscape.
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Manage featured Snapshots"
                    onPress={() =>
                      router.push(
                        "/snapshots",
                      )
                    }
                  >
                    <Text
                      style={
                        styles.seeAllText
                      }
                    >
                      Manage
                    </Text>
                  </Pressable>
                </View>

                {featuredSnapshots.length ===
                0 ? (
                  <View
                    style={
                      styles.emptyCard
                    }
                  >
                    <Ionicons
                      name="camera-outline"
                      size={29}
                      color={canalDynamicColors.gold}
                    />

                    <Text
                      style={
                        styles.emptyTitle
                      }
                    >
                      No featured
                      Snapshots
                    </Text>

                    <Text
                      style={
                        styles.emptyText
                      }
                    >
                      Open a Snapshot
                      and add it to your
                      Soundscape.
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="View Snapshots"
                      onPress={() =>
                        router.push(
                          "/snapshots",
                        )
                      }
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      <Text
                        style={
                          styles.secondaryButtonText
                        }
                      >
                        View Snapshots
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View
                    style={
                      styles.snapshotList
                    }
                  >
                    {featuredSnapshots.map(
                      (snapshot) => (
                        <View
                          key={
                            snapshot.id
                          }
                          style={
                            styles.snapshotCard
                          }
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Open Snapshot ${snapshot.sceneName}`}
                            onPress={() =>
                              router.push({
                                pathname:
                                  "/snapshots/[snapshotId]",

                                params: {
                                  snapshotId:
                                    snapshot.id,
                                },
                              })
                            }
                            style={({ pressed }) => [
                              styles.snapshotMain,
                              pressed &&
                                styles.pressed,
                            ]}
                          >
                            <View
                              style={
                                styles.snapshotIcon
                              }
                            >
                              <Ionicons
                                name="camera-outline"
                                size={22}
                                color={canalDynamicColors.gold}
                              />
                            </View>

                            <View
                              style={
                                styles.snapshotCopy
                              }
                            >
                              <Text
                                numberOfLines={1}
                                style={
                                  styles.snapshotTitle
                                }
                              >
                                {
                                  snapshot.sceneName
                                }
                              </Text>

                              <Text
                                numberOfLines={1}
                                style={
                                  styles.snapshotSubtitle
                                }
                              >
                                {snapshot.trackTitle
                                  ? `${snapshot.trackTitle}${
                                      snapshot.trackArtist
                                        ? ` · ${snapshot.trackArtist}`
                                        : ""
                                    }`
                                  : "Scene moment"}
                              </Text>
                            </View>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Remove from Soundscape"
                            onPress={() => {
                              void removeFeaturedSnapshot(
                                snapshot.id,
                              );
                            }}
                            style={({ pressed }) => [
                              styles.removeButton,
                              pressed &&
                                styles.pressed,
                            ]}
                          >
                            <Ionicons
                              name="close"
                              size={18}
                              color={canalDynamicColors.danger}
                            />
                          </Pressable>
                        </View>
                      ),
                    )}
                  </View>
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share Soundscape"
                onPress={() => {
                  void handleShare();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Ionicons
                  name="share-social-outline"
                  size={20}
                  color={canalDynamicColors.text}
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Share Soundscape
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (
    value: string,
  ) => void;
  placeholder: string;
  autoCapitalize?:
    | "none"
    | "sentences"
    | "words"
    | "characters";
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={
          onChangeText
        }
        placeholder={
          placeholder
        }
        placeholderTextColor={canalDynamicColors.muted}
        autoCapitalize={
          autoCapitalize ??
          "sentences"
        }
        maxLength={maxLength}
        style={styles.input}
      />
    </View>
  );
}

function ChipSection({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  return (
    <View
      style={
        styles.chipSection
      }
    >
      <Text
        style={styles.chipLabel}
      >
        {label}
      </Text>

      {values.length === 0 ? (
        <Text
          style={styles.noValueText}
        >
          Nothing added yet
        </Text>
      ) : (
        <View
          style={styles.chipGrid}
        >
          {values.map((value) => (
            <View
              key={value}
              style={styles.chip}
            >
              <Text
                style={
                  styles.chipText
                }
              >
                {value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function parseCommaList(
  value: string,
): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean),
    ),
  );
}

function getInitials(
  value: string,
): string {
  const initials =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) =>
        word
          .charAt(0)
          .toUpperCase(),
      )
      .join("");

  return initials || "YO";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: canalColors.light.page,
  },

  layout: {
    flex: 1,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    color: canalDynamicColors.muted,
    fontSize: 13,
  },

  page: {
    paddingHorizontal: 23,
    paddingTop: 10,
    paddingBottom: 42,
    gap: 22,
  },

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: 80,
    minHeight: 48,
    justifyContent: "center",
  },

  backText: {
    color: canalColors.light.ink,
    fontSize: 15,
    fontWeight: "600",
  },

  headerTitle: {
    ...canalTypography.chrome,
    color: canalColors.light.ink,
  },

  headerAction: {
    color: canalDynamicColors.gold,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },

  hero: {
    alignItems: "center",
  },

  avatar: {
    width: 122,
    height: 122,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 61,
    backgroundColor: "#ff7a1a",
  },

  avatarText: {
    color: "#17110c",
    fontSize: 34,
    fontWeight: "900",
  },

  displayName: {
    marginTop: 15,
    ...canalTypography.title,
    color: canalColors.light.ink,
    textAlign: "center",
  },

  username: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 14,
  },

  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 11,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#2d332f",
  },

  publicBadge: {
    backgroundColor: "#1d5b32",
  },

  visibilityBadgeText: {
    color: "#c5cbc6",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  bio: {
    maxWidth: 340,
    marginTop: 13,
    color: "#c5cbc6",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  formCard: {
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 21,
    backgroundColor: canalColors.light.surface,
  },

  field: {
    gap: 9,
  },

  label: {
    color: canalColors.light.ink,
    fontSize: 14,
    fontWeight: "700",
  },

  input: {
    minHeight: 53,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 15,
    backgroundColor: canalColors.light.elevated,
    color: canalColors.light.ink,
    fontSize: 14,
  },

  bioInput: {
    minHeight: 105,
    paddingTop: 14,
    paddingBottom: 14,
  },

  counter: {
    color: "#777f79",
    fontSize: 10,
    textAlign: "right",
  },

  visibilityCard: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 19,
    backgroundColor: canalDynamicColors.surface,
  },

  visibilityCopy: {
    flex: 1,
    paddingRight: 12,
  },

  visibilityTitle: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  visibilityText: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  informationCard: {
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 21,
    backgroundColor: canalColors.light.surface,
  },

  cardTitle: {
    ...canalTypography.title,
    color: canalColors.light.ink,
    fontSize: 22,
    lineHeight: 27,
  },

  chipSection: {
    gap: 9,
  },

  chipLabel: {
    color: canalDynamicColors.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#252c28",
  },

  chipText: {
    color: canalDynamicColors.text,
    fontSize: 11,
    fontWeight: "600",
  },

  noValueText: {
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  section: {
    gap: 11,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  sectionTitle: {
    ...canalTypography.title,
    color: canalColors.light.ink,
    fontSize: 24,
    lineHeight: 29,
  },

  sectionDescription: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 11,
  },

  seeAllText: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "700",
  },

  emptyCard: {
    alignItems: "center",
    gap: 9,
    padding: 21,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 19,
  },

  emptyTitle: {
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  emptyText: {
    color: canalDynamicColors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  snapshotList: {
    gap: 9,
  },

  snapshotCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 17,
    backgroundColor: canalDynamicColors.surface,
  },

  snapshotMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  snapshotIcon: {
    width: 47,
    height: 47,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    borderRadius: 15,
    backgroundColor: "#2b1d14",
  },

  snapshotCopy: {
    flex: 1,
  },

  snapshotTitle: {
    color: canalDynamicColors.text,
    fontSize: 13,
    fontWeight: "700",
  },

  snapshotSubtitle: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 10,
  },

  removeButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButton: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 17,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 48,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 15,
    backgroundColor: "#211810",
  },

  secondaryButtonText: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "700",
  },

  disabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.72,
    transform: [
      {
        scale: 0.99,
      },
    ],
  },
});
