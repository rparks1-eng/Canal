import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  useMemo,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  PUBLIC_SCENES,
  PUBLIC_SCENE_CATEGORIES,
  PublicSceneCategory,
} from "../lib/public-scenes";

type CategoryFilter =
  | "All"
  | PublicSceneCategory;

export default function ExploreScreen() {
  const params =
    useLocalSearchParams();

  const initialCategory =
    readInitialCategory(
      params.category,
    );

  const [query, setQuery] =
    useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] =
    useState<CategoryFilter>(
      initialCategory,
    );

  const filteredScenes =
    useMemo(() => {
      const normalizedQuery =
        query.trim().toLowerCase();

      return PUBLIC_SCENES.filter(
        (scene) =>
          selectedCategory ===
            "All" ||
          scene.category ===
            selectedCategory,
      ).filter((scene) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          scene.name,
          scene.creatorName,
          scene.creatorUsername,
          scene.description,
          scene.activity,
          scene.emotions,
          scene.genres,
          scene.artists,
          scene.category,
        ].some((value) =>
          value
            .toLowerCase()
            .includes(
              normalizedQuery,
            ),
        );
      });
    }, [
      query,
      selectedCategory,
    ]);

  return (
    <SafeAreaView
      style={styles.screen}
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
            Explore
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/favorites",
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
              Favorites
            </Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.eyebrow}>
            PUBLIC SCENES
          </Text>

          <Text style={styles.heading}>
            Find a Scene.
          </Text>

          <Text
            style={styles.description}
          >
            Explore music experiences
            created around real moments,
            moods, and activities.
          </Text>
        </View>

        <View
          style={styles.searchBox}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color="#8f9891"
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search public Scenes"
            placeholderTextColor="#777f79"
            style={styles.searchInput}
          />

          {query ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setQuery("")
              }
            >
              <Ionicons
                name="close-circle"
                size={20}
                color="#777f79"
              />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filterRow
          }
        >
          {[
            "All",
            ...PUBLIC_SCENE_CATEGORIES,
          ].map((category) => {
            const selected =
              selectedCategory ===
              category;

            return (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityState={{
                  selected,
                }}
                onPress={() =>
                  setSelectedCategory(
                    category as CategoryFilter,
                  )
                }
                style={({ pressed }) => [
                  styles.filterButton,
                  selected &&
                    styles.selectedFilter,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    selected &&
                      styles.selectedFilterText,
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View
          style={styles.resultHeader}
        >
          <Text
            style={styles.resultTitle}
          >
            {selectedCategory ===
            "All"
              ? "All Scenes"
              : selectedCategory}
          </Text>

          <Text
            style={styles.resultCount}
          >
            {filteredScenes.length}
          </Text>
        </View>

        {filteredScenes.length ===
        0 ? (
          <View
            style={styles.emptyCard}
          >
            <Ionicons
              name="compass-outline"
              size={31}
              color="#ff9a50"
            />

            <Text
              style={styles.emptyTitle}
            >
              No Scenes found
            </Text>

            <Text
              style={styles.emptyText}
            >
              Try another search or
              category.
            </Text>
          </View>
        ) : (
          <View
            style={styles.sceneList}
          >
            {filteredScenes.map(
              (scene) => (
                <Pressable
                  key={scene.id}
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
                    styles.sceneCard,
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
                    <View
                      style={
                        styles.sceneTitleRow
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

                      <View
                        style={
                          styles.categoryBadge
                        }
                      >
                        <Text
                          style={
                            styles.categoryBadgeText
                          }
                        >
                          {scene.category}
                        </Text>
                      </View>
                    </View>

                    <Text
                      numberOfLines={2}
                      style={
                        styles.sceneDescription
                      }
                    >
                      {scene.description}
                    </Text>

                    <Text
                      numberOfLines={1}
                      style={
                        styles.sceneCreator
                      }
                    >
                      @
                      {
                        scene.creatorUsername
                      }{" "}
                      · {scene.saveCount} saves
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={19}
                    color="#717a73"
                  />
                </Pressable>
              ),
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function readInitialCategory(
  value:
    | string
    | string[]
    | undefined,
): CategoryFilter {
  const rawValue =
    Array.isArray(value)
      ? value[0]
      : value;

  if (
    rawValue &&
    PUBLIC_SCENE_CATEGORIES.includes(
      rawValue as PublicSceneCategory,
    )
  ) {
    return rawValue as PublicSceneCategory;
  }

  return "All";
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
    gap: 21,
  },

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: 91,
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
    fontSize: 12,
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

  searchBox: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 17,
    backgroundColor: "#171c19",
  },

  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
  },

  filterRow: {
    gap: 8,
    paddingRight: 20,
  },

  filterButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 15,
    backgroundColor: "#171c19",
  },

  selectedFilter: {
    borderColor: "#ff7a1a",
    backgroundColor: "#211810",
  },

  filterText: {
    color: "#8f9891",
    fontSize: 11,
    fontWeight: "700",
  },

  selectedFilterText: {
    color: "#ff9a50",
  },

  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  resultTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "700",
  },

  resultCount: {
    color: "#ff9a50",
    fontSize: 16,
    fontWeight: "800",
  },

  emptyCard: {
    alignItems: "center",
    gap: 10,
    padding: 25,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3c4540",
    borderRadius: 21,
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  emptyText: {
    color: "#8f9891",
    fontSize: 13,
  },

  sceneList: {
    gap: 12,
  },

  sceneCard: {
    minHeight: 119,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: "#303833",
    borderRadius: 21,
    backgroundColor: "#171c19",
  },

  artwork: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    borderRadius: 21,
    backgroundColor: "#2b1d14",
  },

  artworkText: {
    color: "#ff9a50",
    fontSize: 18,
    fontWeight: "800",
  },

  sceneInformation: {
    flex: 1,
    paddingRight: 8,
  },

  sceneTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  sceneName: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#2d332f",
  },

  categoryBadgeText: {
    color: "#c5cbc6",
    fontSize: 7,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  sceneDescription: {
    marginTop: 7,
    color: "#aeb6b0",
    fontSize: 11,
    lineHeight: 16,
  },

  sceneCreator: {
    marginTop: 7,
    color: "#ff9a50",
    fontSize: 10,
    fontWeight: "600",
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