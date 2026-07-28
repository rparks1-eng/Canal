import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  readFavoriteSceneIds,
  removeFavoriteScene,
} from "../lib/favorite-scenes";
import {
  PUBLIC_SCENES,
  PublicScene,
} from "../lib/public-scenes";

export default function FavoritesScreen() {
  const [
    favoriteScenes,
    setFavoriteScenes,
  ] = useState<PublicScene[]>(
    [],
  );

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    removingSceneId,
    setRemovingSceneId,
  ] = useState("");

  const loadFavorites =
    useCallback(async () => {
      try {
        setIsLoading(true);

        const favoriteIds =
          await readFavoriteSceneIds();

        setFavoriteScenes(
          favoriteIds
            .map((sceneId) =>
              PUBLIC_SCENES.find(
                (scene) =>
                  scene.id ===
                  sceneId,
              ),
            )
            .filter(
              (
                scene,
              ): scene is PublicScene =>
                scene !== undefined,
            ),
        );
      } catch (error) {
        console.error(
          "Unable to load Favorites:",
          error,
        );

        Alert.alert(
          "Unable to load",
          "Canal could not load your Favorites.",
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFavorites();
    }, [loadFavorites]),
  );

  async function removeFavorite(
    sceneId: string,
  ) {
    try {
      setRemovingSceneId(
        sceneId,
      );

      await removeFavoriteScene(
        sceneId,
      );

      setFavoriteScenes(
        favoriteScenes.filter(
          (scene) =>
            scene.id !== sceneId,
        ),
      );
    } catch (error) {
      console.error(
        "Unable to remove favorite:",
        error,
      );

      Alert.alert(
        "Unable to update",
        "Canal could not remove this favorite.",
      );
    } finally {
      setRemovingSceneId("");
    }
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={
          styles.page
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={styles.backText}
            >
              ‹ Discover
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            Favorites
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/explore",
              )
            }
            style={({ pressed }) => [
              styles.headerButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.headerAction
              }
            >
              Explore
            </Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.eyebrow}>
            SAVED FOR LATER
          </Text>

          <Text style={styles.heading}>
            Favorite Scenes.
          </Text>

          <Text
            style={styles.description}
          >
            Favorite public Scenes
            without adding them to your
            Library.
          </Text>
        </View>

        {isLoading ? (
          <View
            style={styles.centered}
          >
            <ActivityIndicator
              size="large"
              color="#ff7a1a"
            />
          </View>
        ) : favoriteScenes.length ===
          0 ? (
          <View
            style={styles.emptyCard}
          >
            <View
              style={styles.emptyIcon}
            >
              <Ionicons
                name="heart-outline"
                size={32}
                color="#ff9a50"
              />
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No favorites yet
            </Text>

            <Text
              style={styles.emptyText}
            >
              Explore public Scenes and
              tap the heart to save
              inspiration.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  "/explore",
                )
              }
              style={({ pressed }) => [
                styles.primaryButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Explore Scenes
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={styles.sceneList}
          >
            {favoriteScenes.map(
              (scene) => (
                <View
                  key={scene.id}
                  style={
                    styles.sceneCard
                  }
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname:
                          "/scenes/[sceneId]",

                        params: {
                          sceneId:
                            scene.id,
                        },
                      })
                    }
                    style={({ pressed }) => [
                      styles.sceneMain,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <View
                      style={
                        styles.artwork
                      }
                    >
                      <Text
                        style={
                          styles.artworkText
                        }
                      >
                        {getInitials(
                          scene.name,
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.sceneInformation
                      }
                    >
                      <Text
                        numberOfLines={1}
                        style={
                          styles.sceneName
                        }
                      >
                        {scene.name}
                      </Text>

                      <Text
                        numberOfLines={1}
                        style={
                          styles.creator
                        }
                      >
                        @
                        {
                          scene.creatorUsername
                        }
                      </Text>

                      <Text
                        numberOfLines={1}
                        style={
                          styles.sceneDetails
                        }
                      >
                        {scene.activity} ·{" "}
                        {scene.category}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color="#717a73"
                    />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      removingSceneId ===
                      scene.id
                    }
                    onPress={() => {
                      void removeFavorite(
                        scene.id,
                      );
                    }}
                    style={({ pressed }) => [
                      styles.removeButton,
                      removingSceneId ===
                        scene.id &&
                        styles.disabled,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    {removingSceneId ===
                    scene.id ? (
                      <ActivityIndicator
                        size="small"
                        color="#ff9187"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="heart-dislike-outline"
                          size={18}
                          color="#ff9187"
                        />

                        <Text
                          style={
                            styles.removeText
                          }
                        >
                          Remove Favorite
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ),
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getInitials(
  value: string,
): string {
  return (
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
      .join("") || "SC"
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0d100e",
  },

  page: {
    paddingHorizontal: 22,
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
    width: 90,
    minHeight: 44,
    justifyContent: "center",
  },

  backText: {
    color: "#c5cbc6",
    fontSize: 14,
    fontWeight: "600",
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  headerAction: {
    color: "#ff9a50",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },

  eyebrow: {
    marginBottom: 8,
    color: "#ff9a50",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heading: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
  },

  description: {
    marginTop: 10,
    color: "#aeb6b0",
    fontSize: 15,
    lineHeight: 22,
  },

  centered: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    alignItems: "center",
    gap: 10,
    padding: 25,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 22,
  },

  emptyIcon: {
    width: 67,
    height: 67,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#271716",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "700",
  },

  emptyText: {
    color: "#8f9891",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  primaryButton: {
    minHeight: 51,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    borderRadius: 16,
    backgroundColor: "#ff7a1a",
  },

  primaryButtonText: {
    color: "#17110c",
    fontSize: 14,
    fontWeight: "800",
  },

  sceneList: {
    gap: 13,
  },

  sceneCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 20,
    backgroundColor: "#171c19",
  },

  sceneMain: {
    minHeight: 101,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },

  artwork: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: "#2b1d14",
  },

  artworkText: {
    color: "#ff9a50",
    fontSize: 16,
    fontWeight: "800",
  },

  sceneInformation: {
    flex: 1,
    paddingRight: 8,
  },

  sceneName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  creator: {
    marginTop: 5,
    color: "#ff9a50",
    fontSize: 10,
    fontWeight: "600",
  },

  sceneDetails: {
    marginTop: 7,
    color: "#8f9891",
    fontSize: 10,
  },

  removeButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: "#303833",
  },

  removeText: {
    color: "#ff9187",
    fontSize: 11,
    fontWeight: "800",
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