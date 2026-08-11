import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import { Ionicons } from "@expo/vector-icons";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CanalAlert } from "../lib/canal-alert";

import {
  createManualArtist,
  mergeArtistSelections,
  searchSpotifyArtists,
  SpotifyArtistSelection,
} from "../lib/spotify-search";

type SpotifyArtistPickerProps = {
  selections:
    SpotifyArtistSelection[];

  onChange: (
    selections:
      SpotifyArtistSelection[],
  ) => void;

  maxSelections?: number;

  onConnectSpotify?: () => void;
};

export default function SpotifyArtistPicker({
  selections,
  onChange,
  maxSelections = 8,
  onConnectSpotify,
}: SpotifyArtistPickerProps) {
  const [query, setQuery] =
    useState("");

  const [
    searchResults,
    setSearchResults,
  ] = useState<
    SpotifyArtistSelection[]
  >([]);

  const [isSearching, setIsSearching] =
    useState(false);

  const [
    authorizationError,
    setAuthorizationError,
  ] = useState(false);

  const searchRequestId =
    useRef(0);

  useEffect(() => {
    const cleanedQuery =
      query.trim();

    if (cleanedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setAuthorizationError(false);
      return;
    }

    const requestId =
      searchRequestId.current + 1;

    searchRequestId.current =
      requestId;

    const timer =
      setTimeout(() => {
        void runSearch(
          cleanedQuery,
          requestId,
        );
      }, 600);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  async function runSearch(
    cleanedQuery: string,
    requestId: number,
  ) {
    try {
      setIsSearching(true);
      setAuthorizationError(false);

      const results =
        await searchSpotifyArtists(
          cleanedQuery,
        );

      if (
        searchRequestId.current !==
        requestId
      ) {
        return;
      }

      setSearchResults(results);
    } catch (error) {
      console.error(
        "Unable to search Spotify artists:",
        error,
      );

      if (
        searchRequestId.current !==
        requestId
      ) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message.toLowerCase()
          : "";

      setAuthorizationError(
        message.includes(
          "not connected",
        ) ||
          message.includes(
            "authorization",
          ) ||
          message.includes(
            "expired",
          ) ||
          message.includes(
            "spotify",
          ),
      );

      setSearchResults([]);
    } finally {
      if (
        searchRequestId.current ===
        requestId
      ) {
        setIsSearching(false);
      }
    }
  }

  function addArtist(
    artist:
      SpotifyArtistSelection,
  ) {
    if (
      selections.length >=
      maxSelections
    ) {
      CanalAlert.alert(
        "Artist limit reached",
        `Choose up to ${maxSelections} artists for this Scene.`,
      );

      return;
    }

    const updatedSelections =
      mergeArtistSelections([
        ...selections,
        artist,
      ]);

    onChange(
      updatedSelections.slice(
        0,
        maxSelections,
      ),
    );

    setQuery("");
    setSearchResults([]);
  }

  function addManualArtist() {
    const cleanedQuery =
      query.trim();

    if (!cleanedQuery) {
      return;
    }

    addArtist(
      createManualArtist(
        cleanedQuery,
      ),
    );
  }

  function removeArtist(
    artist:
      SpotifyArtistSelection,
  ) {
    onChange(
      selections.filter(
        (selection) =>
          !(
            selection.id ===
              artist.id &&
            selection.source ===
              artist.source
          ),
      ),
    );
  }

  async function openArtist(
    artist:
      SpotifyArtistSelection,
  ) {
    if (!artist.spotifyUrl) {
      return;
    }

    try {
      await Linking.openURL(
        artist.spotifyUrl,
      );
    } catch {
      CanalAlert.alert(
        "Unable to open Spotify",
        "Canal could not open this artist.",
      );
    }
  }

  const normalizedQuery =
    query.trim().toLowerCase();

  const queryAlreadySelected =
    selections.some(
      (selection) =>
        selection.name
          .trim()
          .toLowerCase() ===
        normalizedQuery,
    );

  return (
    <View style={styles.container}>
      <View
        style={styles.headingRow}
      >
        <View>
          <Text
            style={styles.title}
          >
            Artists
          </Text>

          <Text
            style={styles.helperText}
          >
            Search Spotify or add an
            artist manually.
          </Text>
        </View>

        <Text
          style={styles.count}
        >
          {selections.length}/
          {maxSelections}
        </Text>
      </View>

      {selections.length > 0 ? (
        <View
          style={styles.selectedList}
        >
          {selections.map(
            (artist) => (
              <View
                key={`${artist.source}-${artist.id}`}
                style={
                  styles.selectedArtist
                }
              >
                <Pressable
                  accessibilityRole={
                    artist.spotifyUrl
                      ? "link"
                      : "button"
                  }
                  disabled={
                    !artist.spotifyUrl
                  }
                  onPress={() => {
                    void openArtist(
                      artist,
                    );
                  }}
                  style={
                    styles.selectedMain
                  }
                >
                  {artist.imageUrl ? (
                    <Image
                      source={{
                        uri:
                          artist.imageUrl,
                      }}
                      style={
                        styles.selectedImage
                      }
                    />
                  ) : (
                    <View
                      style={
                        styles.selectedPlaceholder
                      }
                    >
                      <Text
                        style={
                          styles.selectedInitial
                        }
                      >
                        {artist.name
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View
                    style={
                      styles.selectedCopy
                    }
                  >
                    <Text
                      numberOfLines={1}
                      style={
                        styles.selectedName
                      }
                    >
                      {artist.name}
                    </Text>

                    <Text
                      style={
                        styles.selectedSource
                      }
                    >
                      {artist.source ===
                      "spotify"
                        ? "Spotify artist"
                        : "Manually added"}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${artist.name}`}
                  onPress={() =>
                    removeArtist(
                      artist,
                    )
                  }
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
      ) : null}

      <View style={styles.searchBox}>
        <Ionicons
          name="search-outline"
          size={20}
          color={canalDynamicColors.muted}
        />

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search artists"
          placeholderTextColor={canalDynamicColors.muted}
          autoCapitalize="words"
          style={styles.searchInput}
        />

        {isSearching ? (
          <ActivityIndicator
            size="small"
            color="#ff7a1a"
          />
        ) : query ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setQuery("");
              setSearchResults([]);
            }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={canalDynamicColors.muted}
            />
          </Pressable>
        ) : null}
      </View>

      {authorizationError ? (
        <View style={styles.errorCard}>
          <Text
            style={styles.errorTitle}
          >
            Spotify connection needed
          </Text>

          <Text
            style={styles.errorText}
          >
            Connect Spotify to search
            real artists. You can still
            add the name manually.
          </Text>

          {onConnectSpotify ? (
            <Pressable
              accessibilityRole="button"
              onPress={
                onConnectSpotify
              }
              style={({ pressed }) => [
                styles.connectButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.connectButtonText
                }
              >
                Connect Spotify
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {searchResults.length > 0 ? (
        <View
          style={styles.resultsCard}
        >
          {searchResults.map(
            (artist) => {
              const selected =
                selections.some(
                  (selection) =>
                    selection.source ===
                      "spotify" &&
                    selection.id ===
                      artist.id,
                );

              return (
                <View
                  key={artist.id}
                  style={
                    styles.resultRow
                  }
                >
                  <Pressable
                    accessibilityRole={
                      artist.spotifyUrl
                        ? "link"
                        : "button"
                    }
                    disabled={
                      !artist.spotifyUrl
                    }
                    onPress={() => {
                      void openArtist(
                        artist,
                      );
                    }}
                    style={
                      styles.resultMain
                    }
                  >
                    {artist.imageUrl ? (
                      <Image
                        source={{
                          uri:
                            artist.imageUrl,
                        }}
                        style={
                          styles.resultImage
                        }
                      />
                    ) : (
                      <View
                        style={
                          styles.resultPlaceholder
                        }
                      >
                        <Text
                          style={
                            styles.resultInitial
                          }
                        >
                          {artist.name
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View
                      style={
                        styles.resultCopy
                      }
                    >
                      <Text
                        numberOfLines={1}
                        style={
                          styles.resultName
                        }
                      >
                        {artist.name}
                      </Text>

                      <Text
                        numberOfLines={1}
                        style={
                          styles.resultGenres
                        }
                      >
                        {artist.genres
                          ?.slice(0, 2)
                          .join(" · ") ||
                          "Spotify artist"}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={selected}
                    onPress={() =>
                      addArtist(
                        artist,
                      )
                    }
                    style={({ pressed }) => [
                      styles.addButton,
                      selected &&
                        styles.selectedButton,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.addButtonText,
                        selected &&
                          styles.selectedButtonText,
                      ]}
                    >
                      {selected
                        ? "Added"
                        : "Add"}
                    </Text>
                  </Pressable>
                </View>
              );
            },
          )}
        </View>
      ) : null}

      {query.trim() &&
      !queryAlreadySelected ? (
        <Pressable
          accessibilityRole="button"
          onPress={
            addManualArtist
          }
          style={({ pressed }) => [
            styles.manualButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons
            name="add-circle-outline"
            size={19}
            color={canalDynamicColors.gold}
          />

          <Text
            style={
              styles.manualButtonText
            }
          >
            Add “{query.trim()}”
            manually
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },

  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  title: {
    color: canalDynamicColors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  helperText: {
    marginTop: 5,
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  count: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  selectedList: {
    gap: 8,
  },

  selectedArtist: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 16,
    backgroundColor: "#111613",
  },

  selectedMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  selectedImage: {
    width: 42,
    height: 42,
    marginRight: 10,
    borderRadius: 21,
  },

  selectedPlaceholder: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 21,
    backgroundColor: "#2b1d14",
  },

  selectedInitial: {
    color: canalDynamicColors.gold,
    fontSize: 15,
    fontWeight: "800",
  },

  selectedCopy: {
    flex: 1,
  },

  selectedName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },

  selectedSource: {
    marginTop: 4,
    color: "#8f9891",
    fontSize: 10,
  },

  removeButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBox: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#39413c",
    borderRadius: 16,
    backgroundColor: "#111613",
  },

  searchInput: {
    flex: 1,
    color: canalDynamicColors.text,
    fontSize: 14,
  },

  errorCard: {
    gap: 8,
    padding: 13,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 15,
    backgroundColor: "#211810",
  },

  errorTitle: {
    color: canalDynamicColors.text,
    fontSize: 13,
    fontWeight: "700",
  },

  errorText: {
    color: canalDynamicColors.muted,
    fontSize: 11,
    lineHeight: 17,
  },

  connectButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#1ed760",
  },

  connectButtonText: {
    color: "#07130b",
    fontSize: 12,
    fontWeight: "800",
  },

  resultsCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
    borderRadius: 17,
    backgroundColor: canalDynamicColors.surface,
  },

  resultRow: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#292f2b",
  },

  resultMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  resultImage: {
    width: 43,
    height: 43,
    marginRight: 10,
    borderRadius: 22,
  },

  resultPlaceholder: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderRadius: 22,
    backgroundColor: "#2b1d14",
  },

  resultInitial: {
    color: canalDynamicColors.gold,
    fontSize: 15,
    fontWeight: "800",
  },

  resultCopy: {
    flex: 1,
    paddingRight: 8,
  },

  resultName: {
    color: canalDynamicColors.text,
    fontSize: 13,
    fontWeight: "700",
  },

  resultGenres: {
    marginTop: 4,
    color: "#8f9891",
    fontSize: 10,
  },

  addButton: {
    minWidth: 54,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#ff7a1a",
  },

  addButtonText: {
    color: "#17110c",
    fontSize: 11,
    fontWeight: "800",
  },

  selectedButton: {
    backgroundColor: "#1d5b32",
  },

  selectedButtonText: {
    color: canalDynamicColors.mint,
  },

  manualButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#5d3b24",
    borderRadius: 14,
    backgroundColor: "#211810",
  },

  manualButtonText: {
    color: canalDynamicColors.gold,
    fontSize: 12,
    fontWeight: "700",
  },

  pressed: {
    opacity: 0.72,
  },
});
