import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
} from "expo-router";

import {
  StatusBar,
} from "expo-status-bar";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  exportSpotifyTastePlaylist,
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "../lib/spotify-api";

function formatArtistNames(
  track: SpotifyTrack,
): string {
  return track.artists
    .map(
      (artist) =>
        artist.name,
    )
    .join(", ");
}

function formatSyncTime(
  syncedAt: string,
): string {
  const date =
    new Date(syncedAt);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Unknown";
  }

  return date.toLocaleString();
}

async function openExternalUrl(
  url?: string,
): Promise<void> {
  if (!url) {
    return;
  }

  const supported =
    await Linking.canOpenURL(
      url,
    );

  if (supported) {
    await Linking.openURL(
      url,
    );
  }
}

function SectionHeader(props: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {props.title}
      </Text>

      {props.subtitle ? (
        <Text
          style={
            styles.sectionSubtitle
          }
        >
          {props.subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function ArtistRow(props: {
  artist: SpotifyArtist;
  rank: number;
}) {
  const imageUrl =
    props.artist.images?.[0]
      ?.url ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void openExternalUrl(
          props.artist
            .external_urls
            ?.spotify,
        );
      }}
      style={({ pressed }) => [
        styles.listRow,

        pressed &&
          styles.pressed,
      ]}
    >
      <Text style={styles.rankText}>
        {props.rank}
      </Text>

      {imageUrl ? (
        <Image
          source={{
            uri: imageUrl,
          }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            marginRight: 12,
          }}
        />
      ) : (
        <View
          style={
            styles.artistFallback
          }
        >
          <Text
            style={
              styles.fallbackText
            }
          >
            {props.artist.name
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={styles.rowTitle}
        >
          {props.artist.name}
        </Text>

        <Text
          numberOfLines={1}
          style={
            styles.rowSubtitle
          }
        >
          {(props.artist.genres ??
            [])
            .slice(0, 2)
            .join(" • ") ||
            "Artist"}
        </Text>
      </View>

      <Text style={styles.arrow}>
        ›
      </Text>
    </Pressable>
  );
}

function TrackRow(props: {
  track: SpotifyTrack;
  rank?: number;
}) {
  const imageUrl =
    props.track.album
      ?.images?.[0]?.url ??
    null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void openExternalUrl(
          props.track
            .external_urls
            ?.spotify,
        );
      }}
      style={({ pressed }) => [
        styles.listRow,

        pressed &&
          styles.pressed,
      ]}
    >
      {props.rank ? (
        <Text style={styles.rankText}>
          {props.rank}
        </Text>
      ) : null}

      {imageUrl ? (
        <Image
          source={{
            uri: imageUrl,
          }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 8,
            marginRight: 12,
          }}
        />
      ) : (
        <View
          style={
            styles.trackFallback
          }
        >
          <Text
            style={
              styles.fallbackText
            }
          >
            ♪
          </Text>
        </View>
      )}

      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={styles.rowTitle}
        >
          {props.track.name}
        </Text>

        <Text
          numberOfLines={1}
          style={
            styles.rowSubtitle
          }
        >
          {formatArtistNames(
            props.track,
          )}
        </Text>
      </View>

      <Text style={styles.arrow}>
        ›
      </Text>
    </Pressable>
  );
}

function PlaylistRow(props: {
  playlist: SpotifyPlaylist;
}) {
  const imageUrl =
    props.playlist.images?.[0]
      ?.url ?? null;

  const itemCount =
    props.playlist.items
      ?.total ??
    props.playlist.tracks
      ?.total ??
    0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void openExternalUrl(
          props.playlist
            .external_urls
            ?.spotify,
        );
      }}
      style={({ pressed }) => [
        styles.listRow,

        pressed &&
          styles.pressed,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{
            uri: imageUrl,
          }}
          style={{
            width: 50,
            height: 50,
            borderRadius: 8,
            marginRight: 12,
          }}
        />
      ) : (
        <View
          style={
            styles.playlistFallback
          }
        >
          <Text
            style={
              styles.fallbackText
            }
          >
            ≡
          </Text>
        </View>
      )}

      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={styles.rowTitle}
        >
          {props.playlist.name}
        </Text>

        <Text
          numberOfLines={1}
          style={
            styles.rowSubtitle
          }
        >
          {itemCount} items
          {props.playlist.owner
            ?.display_name
            ? ` • ${props.playlist.owner.display_name}`
            : ""}
        </Text>
      </View>

      <Text style={styles.arrow}>
        ›
      </Text>
    </Pressable>
  );
}

export default function SpotifyLibraryScreen() {
  const [
    snapshot,
    setSnapshot,
  ] =
    useState<SpotifyLibrarySnapshot | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    syncing,
    setSyncing,
  ] = useState(false);

  const [
    exporting,
    setExporting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState<string | null>(
      null,
    );

  const loadCachedSnapshot =
    useCallback(
      async (): Promise<void> => {
        setLoading(true);

        try {
          const cached =
            await readSpotifyLibrarySnapshot();

          setSnapshot(
            cached,
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load your Spotify library.",
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadCachedSnapshot();
  }, [loadCachedSnapshot]);

  const handleSync =
    async (): Promise<void> => {
      setSyncing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const updated =
          await syncSpotifyLibrary();

        setSnapshot(updated);

        setSuccessMessage(
          "Your Spotify taste snapshot is up to date.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not sync Spotify.",
        );
      } finally {
        setSyncing(false);
      }
    };

  const handleExport =
    async (): Promise<void> => {
      if (!snapshot) {
        return;
      }

      setExporting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const result =
          await exportSpotifyTastePlaylist(
            snapshot,
          );

        setSuccessMessage(
          `Created a private Spotify playlist with ${result.trackCount} tracks.`,
        );

        const url =
          result.playlist
            .external_urls
            ?.spotify;

        if (url) {
          await openExternalUrl(
            url,
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not create the Spotify playlist.",
        );
      } finally {
        setExporting(false);
      }
    };

  const displayName =
    snapshot?.profile
      .display_name ||
    snapshot?.profile.id ||
    "Your";

  const profileImageUrl =
    snapshot?.profile
      .images?.[0]?.url ??
    null;

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={({ pressed }) => [
            styles.backButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text style={styles.backText}>
            ‹
          </Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.title}>
            Spotify Library
          </Text>

          <Text style={styles.subtitle}>
            Your music taste, imported
            into Canal.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            size="large"
          />

          <Text
            style={
              styles.centerStateText
            }
          >
            Loading Spotify Library...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
          refreshControl={
            <RefreshControl
              refreshing={
                syncing
              }
              onRefresh={() =>
                void handleSync()
              }
            />
          }
        >
          {!snapshot ? (
            <View style={styles.emptyCard}>
              <Text
                style={
                  styles.emptyTitle
                }
              >
                No Spotify snapshot yet
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Sync Spotify to import
                your top artists, songs,
                genres, saved music, and
                playlists.
              </Text>

              <Pressable
                accessibilityRole="button"
                disabled={syncing}
                onPress={() =>
                  void handleSync()
                }
                style={({ pressed }) => [
                  styles.primaryButton,

                  syncing &&
                    styles.disabledButton,

                  pressed &&
                    styles.pressed,
                ]}
              >
                {syncing ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    Sync Spotify
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/music-services",
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
                  Spotify connection settings
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.profileCard}>
                {profileImageUrl ? (
                  <Image
                    source={{
                      uri: profileImageUrl,
                    }}
                    style={{
                      width: 66,
                      height: 66,
                      borderRadius: 33,
                      marginRight: 15,
                    }}
                  />
                ) : (
                  <View
                    style={
                      styles.profileFallback
                    }
                  >
                    <Text
                      style={
                        styles.profileFallbackText
                      }
                    >
                      {displayName
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}

                <View
                  style={
                    styles.profileDetails
                  }
                >
                  <Text
                    style={
                      styles.profileEyebrow
                    }
                  >
                    Canal taste snapshot
                  </Text>

                  <Text
                    style={
                      styles.profileName
                    }
                  >
                    {displayName}
                  </Text>

                  <Text
                    style={
                      styles.syncTime
                    }
                  >
                    Last synced{" "}
                    {formatSyncTime(
                      snapshot.syncedAt,
                    )}
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/scene-studio",
                  )
                }
                style={({ pressed }) => [
                  styles.sceneButton,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <View
                  style={
                    styles.sceneButtonIcon
                  }
                >
                  <Text
                    style={
                      styles.sceneButtonIconText
                    }
                  >
                    ◉
                  </Text>
                </View>

                <View
                  style={
                    styles.sceneButtonText
                  }
                >
                  <Text
                    style={
                      styles.sceneButtonTitle
                    }
                  >
                    Set the Scene
                  </Text>

                  <Text
                    style={
                      styles.sceneButtonDescription
                    }
                  >
                    Turn this Spotify taste
                    snapshot into a
                    personalized soundtrack.
                  </Text>
                </View>

                <Text
                  style={
                    styles.sceneButtonArrow
                  }
                >
                  ›
                </Text>
              </Pressable>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={syncing}
                  onPress={() =>
                    void handleSync()
                  }
                  style={({ pressed }) => [
                    styles.actionButton,

                    syncing &&
                      styles.disabledButton,

                    pressed &&
                      styles.pressed,
                  ]}
                >
                  {syncing ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={
                        styles.actionButtonText
                      }
                    >
                      Sync again
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={exporting}
                  onPress={() =>
                    void handleExport()
                  }
                  style={({ pressed }) => [
                    styles.exportButton,

                    exporting &&
                      styles.disabledButton,

                    pressed &&
                      styles.pressed,
                  ]}
                >
                  {exporting ? (
                    <ActivityIndicator
                      color="#F47A24"
                    />
                  ) : (
                    <Text
                      style={
                        styles.exportButtonText
                      }
                    >
                      Export playlist
                    </Text>
                  )}
                </Pressable>
              </View>

              {successMessage ? (
                <View style={styles.successBox}>
                  <Text
                    style={
                      styles.successText
                    }
                  >
                    {successMessage}
                  </Text>
                </View>
              ) : null}

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text
                    style={
                      styles.errorTitle
                    }
                  >
                    Spotify error
                  </Text>

                  <Text
                    style={
                      styles.errorText
                    }
                  >
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {snapshot.warnings.length >
              0 ? (
                <View style={styles.warningBox}>
                  <Text
                    style={
                      styles.warningTitle
                    }
                  >
                    Some information could
                    not be imported
                  </Text>

                  {snapshot.warnings.map(
                    (warning, index) => (
                      <Text
                        key={`${index}-${warning}`}
                        style={
                          styles.warningText
                        }
                      >
                        • {warning}
                      </Text>
                    ),
                  )}
                </View>
              ) : null}

              <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                  <Text
                    style={
                      styles.metricValue
                    }
                  >
                    {
                      snapshot.topArtists
                        .length
                    }
                  </Text>

                  <Text
                    style={
                      styles.metricLabel
                    }
                  >
                    Top artists
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text
                    style={
                      styles.metricValue
                    }
                  >
                    {
                      snapshot.topTracks
                        .length
                    }
                  </Text>

                  <Text
                    style={
                      styles.metricLabel
                    }
                  >
                    Top tracks
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text
                    style={
                      styles.metricValue
                    }
                  >
                    {
                      snapshot.playlists
                        .length
                    }
                  </Text>

                  <Text
                    style={
                      styles.metricLabel
                    }
                  >
                    Playlists
                  </Text>
                </View>
              </View>

              {snapshot.topGenres.length >
              0 ? (
                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Top genres"
                    subtitle="Signals collected from your top Spotify artists"
                  />

                  <View style={styles.genreWrap}>
                    {snapshot.topGenres.map(
                      (genre, index) => (
                        <View
                          key={genre.name}
                          style={[
                            styles.genreChip,

                            index === 0 &&
                              styles.primaryGenreChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.genreText,

                              index === 0 &&
                                styles.primaryGenreText,
                            ]}
                          >
                            {genre.name}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                </View>
              ) : null}

              {snapshot.topArtists.length >
              0 ? (
                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Top artists"
                    subtitle="Your strongest medium-term artist affinities"
                  />

                  {snapshot.topArtists
                    .slice(0, 10)
                    .map(
                      (
                        artist,
                        index,
                      ) => (
                        <ArtistRow
                          key={artist.id}
                          artist={artist}
                          rank={index + 1}
                        />
                      ),
                    )}
                </View>
              ) : null}

              {snapshot.topTracks.length >
              0 ? (
                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Top tracks"
                    subtitle="Songs Spotify associates most closely with your taste"
                  />

                  {snapshot.topTracks
                    .slice(0, 10)
                    .map(
                      (
                        track,
                        index,
                      ) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          rank={index + 1}
                        />
                      ),
                    )}
                </View>
              ) : null}

              {snapshot.recentTracks.length >
              0 ? (
                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Recently played"
                    subtitle="Your latest Spotify listening activity"
                  />

                  {snapshot.recentTracks
                    .slice(0, 10)
                    .map(
                      (
                        track,
                        index,
                      ) => (
                        <TrackRow
                          key={`${track.id}-${index}`}
                          track={track}
                        />
                      ),
                    )}
                </View>
              ) : null}

              {snapshot.savedTracks.length >
              0 ? (
                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Saved music"
                    subtitle="Recent tracks from your Spotify library"
                  />

                  {snapshot.savedTracks
                    .slice(0, 10)
                    .map(
                      (
                        track,
                        index,
                      ) => (
                        <TrackRow
                          key={`${track.id}-${index}`}
                          track={track}
                        />
                      ),
                    )}
                </View>
              ) : null}

              {snapshot.playlists.length >
              0 ? (
                <View style={styles.sectionCard}>
                  <SectionHeader
                    title="Spotify playlists"
                    subtitle="Playlists you own or follow"
                  />

                  {snapshot.playlists
                    .slice(0, 10)
                    .map(
                      (playlist) => (
                        <PlaylistRow
                          key={playlist.id}
                          playlist={playlist}
                        />
                      ),
                    )}
                </View>
              ) : null}
            </>
          )}

          {!snapshot &&
          errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>
                Spotify error
              </Text>

              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFF9F4",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 12,
  },

  backText: {
    color: "#1B1B1B",
    fontSize: 34,
    lineHeight: 36,
    marginTop: -2,
  },

  headerText: {
    flex: 1,
    paddingTop: 2,
  },

  title: {
    color: "#181818",
    fontSize: 28,
    fontWeight: "800",
  },

  subtitle: {
    color: "#6C655F",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  centerStateText: {
    color: "#655F5A",
    fontSize: 15,
    marginTop: 14,
    textAlign: "center",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
  },

  emptyTitle: {
    color: "#1A1A1A",
    fontSize: 21,
    fontWeight: "800",
  },

  emptyText: {
    color: "#655F5A",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 18,
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
  },

  profileFallback: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    marginRight: 15,
  },

  profileFallbackText: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
  },

  profileDetails: {
    flex: 1,
  },

  profileEyebrow: {
    color: "#F47A24",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  profileName: {
    color: "#181818",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 3,
  },

  syncTime: {
    color: "#746D67",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  sceneButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2B1710",
    borderRadius: 22,
    padding: 17,
  },

  sceneButtonIcon: {
    width: 51,
    height: 51,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F47A24",
    marginRight: 13,
  },

  sceneButtonIconText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },

  sceneButtonText: {
    flex: 1,
  },

  sceneButtonTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },

  sceneButtonDescription: {
    color: "#DBC5BA",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  sceneButtonArrow: {
    color: "#FFB781",
    fontSize: 28,
    marginLeft: 8,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
  },

  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F47A24",
    paddingHorizontal: 12,
  },

  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  exportButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F47A24",
    paddingHorizontal: 12,
  },

  exportButtonText: {
    color: "#F47A24",
    fontSize: 14,
    fontWeight: "800",
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F47A24",
    paddingHorizontal: 18,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D8D2CD",
    backgroundColor: "#FFFFFF",
    marginTop: 10,
    paddingHorizontal: 18,
  },

  secondaryButtonText: {
    color: "#2E2B29",
    fontSize: 15,
    fontWeight: "700",
  },

  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },

  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
  },

  metricValue: {
    color: "#181818",
    fontSize: 24,
    fontWeight: "900",
  },

  metricLabel: {
    color: "#746D67",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    textAlign: "center",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
  },

  sectionHeader: {
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#1B1B1B",
    fontSize: 19,
    fontWeight: "800",
  },

  sectionSubtitle: {
    color: "#746D67",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  genreWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  genreChip: {
    backgroundColor: "#F4F0EC",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  primaryGenreChip: {
    backgroundColor: "#F47A24",
  },

  genreText: {
    color: "#4E4945",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
  },

  primaryGenreText: {
    color: "#FFFFFF",
  },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    borderTopWidth: 1,
    borderTopColor: "#F0ECE8",
    paddingVertical: 10,
  },

  rankText: {
    width: 25,
    color: "#8A827B",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginRight: 6,
  },

  artistFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0E7DF",
    marginRight: 12,
  },

  trackFallback: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0E7DF",
    marginRight: 12,
  },

  playlistFallback: {
    width: 50,
    height: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0E7DF",
    marginRight: 12,
  },

  fallbackText: {
    color: "#F47A24",
    fontSize: 18,
    fontWeight: "900",
  },

  rowText: {
    flex: 1,
    minWidth: 0,
  },

  rowTitle: {
    color: "#1C1C1C",
    fontSize: 15,
    fontWeight: "800",
  },

  rowSubtitle: {
    color: "#77706A",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    textTransform: "capitalize",
  },

  arrow: {
    color: "#A29A93",
    fontSize: 25,
    marginLeft: 8,
  },

  successBox: {
    backgroundColor: "#EAF9EF",
    borderRadius: 16,
    padding: 15,
  },

  successText: {
    color: "#1D7138",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },

  errorBox: {
    backgroundColor: "#FFF0EF",
    borderRadius: 16,
    padding: 15,
  },

  errorTitle: {
    color: "#A62E27",
    fontSize: 14,
    fontWeight: "800",
  },

  errorText: {
    color: "#7E3833",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  warningBox: {
    backgroundColor: "#FFF4E9",
    borderRadius: 16,
    padding: 15,
  },

  warningTitle: {
    color: "#8C4A12",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },

  warningText: {
    color: "#714B2B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },

  disabledButton: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.7,
  },
});
