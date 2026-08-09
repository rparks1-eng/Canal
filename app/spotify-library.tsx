import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
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
  useFocusEffect,
} from "expo-router";

import {
  StatusBar,
} from "expo-status-bar";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  getSpotifyLibraryImportRetryAfterSeconds,
  exportSpotifyTastePlaylist,
  readSpotifyLibraryImportStatus,
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import type {
  SpotifyLibraryImportProgress,
  SpotifyLibraryImportStatus,
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import {
  getSpotifyContentUrl,
} from "../lib/spotify-api";

import type {
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "../lib/spotify-api";

import {
  useAuth,
} from "../providers/auth-provider";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

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

type SpotifyLibraryRecoveryFailure = {
  operation:
    | "load"
    | "sync"
    | "export";
  cause: unknown;
  message: string;
};

type SpotifyLibraryStatusEvent = {
  id: string;
  accountIdentity: string;
  message: string;
  target:
    | "progress"
    | "recovery"
    | "success";
};

function sourceProgressCopy(
  label: string,
  source: SpotifyLibraryImportStatus["savedTracks"],
): string {
  const total =
    source.totalCount === undefined
      ? `${source.importedCount}`
      : `${source.importedCount} of ${source.totalCount}`;

  if (source.state === "complete") {
    return `${label}: ${total} imported.`;
  }

  if (source.state === "failed") {
    return `${label}: ${total} imported. Resume required.`;
  }

  if (source.state === "partial") {
    return `${label}: ${total} imported. Paused for Spotify's retry window.`;
  }

  if (source.state === "importing") {
    return `${label}: ${total} imported.`;
  }

  return `${label}: waiting to import.`;
}

function importStatusAnnouncement(
  status: SpotifyLibraryImportStatus,
): string {
  const sources = [
    status.savedTracks,
    status.playlists,
    status.playlistTracks,
  ];

  if (
    sources.some(
      (source) =>
        source.state === "partial",
    )
  ) {
    const retryAfterSeconds =
      getSpotifyLibraryImportRetryAfterSeconds(
        status,
      );

    return retryAfterSeconds
      ? `Spotify import is paused. Resume will be available in about ${formatRetryAfter(retryAfterSeconds)}.`
      : "Spotify import is paused. Resume is available.";
  }

  if (
    sources.some(
      (source) =>
        source.state === "failed",
    )
  ) {
    return "Spotify import needs attention. Resume when you are ready.";
  }

  return "Spotify import is paused. Resume when you are ready.";
}

function formatRetryAfter(
  retryAfterSeconds: number,
): string {
  if (retryAfterSeconds < 60) {
    return `${retryAfterSeconds} second${
      retryAfterSeconds === 1 ? "" : "s"
    }`;
  }

  const minutes = Math.ceil(
    retryAfterSeconds / 60,
  );

  return `${minutes} minute${
    minutes === 1 ? "" : "s"
  }`;
}

function ImportProgressCard(props: {
  status: SpotifyLibraryImportStatus;
  syncing: boolean;
  onResume: () => void;
  onCancel: () => void;
  offline: boolean;
  statusAnnouncement?: string;
  statusAnnouncementRef?: RefObject<View | null>;
}) {
  const incomplete =
    props.status.state === "incomplete";
  const [retryClock, setRetryClock] =
    useState(() => Date.now());
  const retryAfterUntil =
    props.status.retryAfterUntil;
  const retryAfterSeconds =
    getSpotifyLibraryImportRetryAfterSeconds(
      props.status,
      retryClock,
    );
  const retryWindowActive =
    retryAfterSeconds !== null;
  const resumeDisabled =
    props.syncing ||
    props.offline ||
    retryWindowActive;

  useEffect(
    () => {
      setRetryClock(Date.now());

      if (
        retryAfterUntil === undefined ||
        retryAfterUntil <= Date.now()
      ) {
        return;
      }

      const timeout = setTimeout(
        () => {
          setRetryClock(Date.now());
        },
        retryAfterUntil - Date.now(),
      );

      return () => {
        clearTimeout(timeout);
      };
    }, [retryAfterUntil]);
  const followedPlaylistCount =
    props.status.skippedPlaylists.filter(
      (playlist) =>
        playlist.reason ===
        "followed-playlist",
    ).length;
  const inaccessiblePlaylistCount =
    props.status.skippedPlaylists.filter(
      (playlist) =>
        playlist.reason === "inaccessible",
    ).length;

  return (
    <View style={styles.importCard}>
      <Text
        accessibilityRole="header"
        style={styles.importTitle}
      >
        {incomplete
          ? "Spotify import progress"
          : "Spotify import sources"}
      </Text>

      {props.statusAnnouncement ? (
        <View
          ref={props.statusAnnouncementRef}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.importStatusSummary}
        >
          <Text
            style={styles.importStatusSummaryText}
          >
            {props.statusAnnouncement}
          </Text>
        </View>
      ) : null}

      <Text style={styles.importText}>
        {sourceProgressCopy(
          "Saved tracks",
          props.status.savedTracks,
        )}
      </Text>

      <Text style={styles.importText}>
        {sourceProgressCopy(
          "Playlists",
          props.status.playlists,
        )}
      </Text>

      <Text style={styles.importText}>
        {sourceProgressCopy(
          "Playlist items",
          props.status.playlistTracks,
        )}
      </Text>

      {followedPlaylistCount > 0 ? (
        <Text style={styles.importWarning}>
          {followedPlaylistCount} followed playlist{followedPlaylistCount === 1 ? " was" : "s were"} skipped because Canal imports items only from playlists you own or collaborate on.
        </Text>
      ) : null}

      {inaccessiblePlaylistCount > 0 ? (
        <Text style={styles.importWarning}>
          {inaccessiblePlaylistCount} playlist{inaccessiblePlaylistCount === 1 ? " was" : "s were"} inaccessible when Canal tried to import its items.
        </Text>
      ) : null}

      {retryAfterSeconds ? (
        <Text style={styles.importWarning}>
          Spotify asked Canal to wait. Resume will be available in about {formatRetryAfter(retryAfterSeconds)}.
        </Text>
      ) : null}

      {incomplete ? (
        <View style={styles.importActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Resume Spotify import"
            accessibilityState={{
              busy: props.syncing,
              disabled: resumeDisabled,
            }}
            disabled={resumeDisabled}
            onPress={props.onResume}
            style={({ pressed }) => [
              styles.importResumeButton,
              resumeDisabled &&
                styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.importResumeText}>
              Resume import
            </Text>
          </Pressable>

          {props.syncing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause Spotify import"
              onPress={props.onCancel}
              style={({ pressed }) => [
                styles.importPauseButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.importPauseText}>
                Pause import
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
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
  url?: string | null,
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
  const spotifyUrl =
    getSpotifyContentUrl(
      "artist",
      props.artist,
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${props.artist.name} in Spotify`}
      accessibilityHint="Opens this artist in Spotify."
      accessibilityState={{
        disabled: !spotifyUrl,
      }}
      disabled={!spotifyUrl}
      onPress={() => {
        void openExternalUrl(
          spotifyUrl,
        );
      }}
      style={({ pressed }) => [
        styles.listRow,

        !spotifyUrl &&
          styles.disabledRow,

        pressed &&
          styles.pressed,
      ]}
    >
      <Text style={styles.rankText}>
        {props.rank}
      </Text>

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

      <View style={styles.rowText}>
        <Text
          style={styles.rowTitle}
        >
          {props.artist.name}
        </Text>

        <Text
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

      <Text style={styles.spotifyLinkText}>
        Open in Spotify
      </Text>
    </Pressable>
  );
}

function TrackRow(props: {
  track: SpotifyTrack;
  rank?: number;
}) {
  const spotifyUrl =
    getSpotifyContentUrl(
      "track",
      props.track,
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${props.track.name} in Spotify`}
      accessibilityHint="Opens this track in Spotify."
      accessibilityState={{
        disabled: !spotifyUrl,
      }}
      disabled={!spotifyUrl}
      onPress={() => {
        void openExternalUrl(
          spotifyUrl,
        );
      }}
      style={({ pressed }) => [
        styles.listRow,

        !spotifyUrl &&
          styles.disabledRow,

        pressed &&
          styles.pressed,
      ]}
    >
      {props.rank ? (
        <Text style={styles.rankText}>
          {props.rank}
        </Text>
      ) : null}

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

      <View style={styles.rowText}>
        <Text
          style={styles.rowTitle}
        >
          {props.track.name}
        </Text>

        <Text
          style={
            styles.rowSubtitle
          }
        >
          {formatArtistNames(
            props.track,
          )}
        </Text>
      </View>

      <Text style={styles.spotifyLinkText}>
        Open in Spotify
      </Text>
    </Pressable>
  );
}

function PlaylistRow(props: {
  playlist: SpotifyPlaylist;
}) {
  const spotifyUrl =
    getSpotifyContentUrl(
      "playlist",
      props.playlist,
    );

  const itemCount =
    props.playlist.items
      ?.total ??
    props.playlist.tracks
      ?.total ??
    0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${props.playlist.name} in Spotify`}
      accessibilityHint="Opens this playlist in Spotify."
      accessibilityState={{
        disabled: !spotifyUrl,
      }}
      disabled={!spotifyUrl}
      onPress={() => {
        void openExternalUrl(
          spotifyUrl,
        );
      }}
      style={({ pressed }) => [
        styles.listRow,

        !spotifyUrl &&
          styles.disabledRow,

        pressed &&
          styles.pressed,
      ]}
    >
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

      <View style={styles.rowText}>
        <Text
          style={styles.rowTitle}
        >
          {props.playlist.name}
        </Text>

        <Text
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

      <Text style={styles.spotifyLinkText}>
        Open in Spotify
      </Text>
    </Pressable>
  );
}

export default function SpotifyLibraryScreen() {
  const {
    user,
    accountEpoch,
  } = useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const accountIdentity =
    `${user?.id ?? "signed-out"}:${accountEpoch}`;
  const accountIdentityRef =
    useRef(accountIdentity);
  const importOperationRef =
    useRef(0);

  accountIdentityRef.current =
    accountIdentity;

  const [
    storedSnapshot,
    setStoredSnapshot,
  ] =
    useState<SpotifyLibrarySnapshot | null>(
      null,
    );

  const [
    snapshotAccountIdentity,
    setSnapshotAccountIdentity,
  ] = useState<string | null>(null);

  const [
    storedLoading,
    setStoredLoading,
  ] = useState(true);

  const [
    loadingAccountIdentity,
    setLoadingAccountIdentity,
  ] = useState<string | null>(
    accountIdentity,
  );

  const [
    storedSyncing,
    setStoredSyncing,
  ] = useState(false);

  const [
    syncingAccountIdentity,
    setSyncingAccountIdentity,
  ] = useState<string | null>(
    accountIdentity,
  );

  const [
    storedImportProgress,
    setStoredImportProgress,
  ] = useState<
    SpotifyLibraryImportStatus | null
  >(null);

  const [
    importProgressAccountIdentity,
    setImportProgressAccountIdentity,
  ] = useState<string | null>(null);

  // Never render a previous account's snapshot or resume checkpoint while the
  // identity-scoped effect below is waiting to clear the old React state.
  const snapshot =
    snapshotAccountIdentity === accountIdentity
      ? storedSnapshot
      : null;
  const importProgress =
    importProgressAccountIdentity ===
    accountIdentity
      ? storedImportProgress
      : null;

  const [
    storedExporting,
    setStoredExporting,
  ] = useState(false);

  const [
    exportingAccountIdentity,
    setExportingAccountIdentity,
  ] = useState<string | null>(
    accountIdentity,
  );

  const [
    storedRecoveryFailure,
    setStoredRecoveryFailure,
  ] =
    useState<SpotifyLibraryRecoveryFailure | null>(
      null,
    );

  const [
    recoveryFailureAccountIdentity,
    setRecoveryFailureAccountIdentity,
  ] = useState<string | null>(null);

  const [
    storedSuccessMessage,
    setStoredSuccessMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    successMessageAccountIdentity,
    setSuccessMessageAccountIdentity,
  ] = useState<string | null>(null);

  const [
    storedStatusEvent,
    setStoredStatusEvent,
  ] = useState<SpotifyLibraryStatusEvent | null>(
    null,
  );

  const [
    statusEventAccountIdentity,
    setStatusEventAccountIdentity,
  ] = useState<string | null>(null);

  const statusEventSequenceRef =
    useRef(0);
  const announcedStatusEventId =
    useRef<string | null>(null);
  const importStatusRef =
    useRef<View>(null);
  const recoveryStatusRef =
    useRef<View>(null);
  const successStatusRef =
    useRef<View>(null);

  const recoveryFailure =
    recoveryFailureAccountIdentity ===
    accountIdentity
      ? storedRecoveryFailure
      : null;
  const successMessage =
    successMessageAccountIdentity ===
    accountIdentity
      ? storedSuccessMessage
      : null;
  const statusEvent =
    statusEventAccountIdentity ===
    accountIdentity
      ? storedStatusEvent
      : null;
  const loading =
    loadingAccountIdentity === accountIdentity
      ? storedLoading
      : true;
  const syncing =
    syncingAccountIdentity === accountIdentity
      ? storedSyncing
      : false;
  const exporting =
    exportingAccountIdentity === accountIdentity
      ? storedExporting
      : false;

  useEffect(
    () => {
      importOperationRef.current += 1;
      setStoredSnapshot(null);
      setSnapshotAccountIdentity(null);
      setStoredImportProgress(null);
      setImportProgressAccountIdentity(null);
      setStoredRecoveryFailure(null);
      setRecoveryFailureAccountIdentity(null);
      setStoredSuccessMessage(null);
      setSuccessMessageAccountIdentity(null);
      setStoredStatusEvent(null);
      setStatusEventAccountIdentity(null);
      announcedStatusEventId.current =
        null;
      setStoredSyncing(false);
      setSyncingAccountIdentity(null);
      setStoredExporting(false);
      setExportingAccountIdentity(null);
    }, [
      accountIdentity,
    ]);

  const loadCachedSnapshot =
    useCallback(
      async (): Promise<void> => {
        const loadAccountIdentity =
          accountIdentity;
        setStoredLoading(true);
        setLoadingAccountIdentity(
          loadAccountIdentity,
        );

        try {
          const [
            cached,
            checkpoint,
          ] = await Promise.all([
            readSpotifyLibrarySnapshot(),
            readSpotifyLibraryImportStatus(),
          ]);

          if (
            accountIdentityRef.current !==
            loadAccountIdentity
          ) {
            return;
          }

          setStoredSnapshot(
            cached,
          );
          setSnapshotAccountIdentity(
            loadAccountIdentity,
          );
          setStoredImportProgress(
            checkpoint ??
              cached?.importStatus ??
              null,
          );
          setImportProgressAccountIdentity(
            loadAccountIdentity,
          );

          setStoredRecoveryFailure(
            (current) =>
              current?.operation ===
              "load"
                ? null
                : current,
          );
          setRecoveryFailureAccountIdentity(
            loadAccountIdentity,
          );
        } catch (error) {
          if (
            accountIdentityRef.current !==
            loadAccountIdentity
          ) {
            return;
          }

          setStoredRecoveryFailure(
            (current) =>
              current?.operation ===
              "export"
                ? current
                : {
                    operation:
                      "load",
                    cause:
                      error,
                    message:
                      error instanceof
                      Error
                        ? error.message
                        : "Canal could not load your Spotify library.",
                  },
          );
          setRecoveryFailureAccountIdentity(
            loadAccountIdentity,
          );
        } finally {
          if (
            accountIdentityRef.current ===
            loadAccountIdentity
          ) {
            setStoredLoading(false);
            setLoadingAccountIdentity(
              loadAccountIdentity,
            );
          }
        }
      },
    [
      accountIdentity,
    ],
  );

  const publishStatusEvent =
    useCallback(
      (
        eventAccountIdentity: string,
        event: Omit<
          SpotifyLibraryStatusEvent,
          "id" | "accountIdentity"
        >,
      ): void => {
        if (
          accountIdentityRef.current !==
          eventAccountIdentity
        ) {
          return;
        }

        statusEventSequenceRef.current +=
          1;
        setStoredStatusEvent({
          ...event,
          accountIdentity:
            eventAccountIdentity,
          id: `${eventAccountIdentity}:${statusEventSequenceRef.current}`,
        });
        setStatusEventAccountIdentity(
          eventAccountIdentity,
        );
      },
      [],
    );

  useEffect(
    () => {
      if (
        !statusEvent ||
        statusEvent.accountIdentity !==
          accountIdentity ||
        announcedStatusEventId.current ===
          statusEvent.id
      ) {
        return;
      }

      announcedStatusEventId.current =
        statusEvent.id;

      if (
        process.env.EXPO_OS ===
        "ios"
      ) {
        AccessibilityInfo
          .announceForAccessibility(
            statusEvent.message,
          );
      }

      const targetRef =
        statusEvent.target ===
        "progress"
          ? importStatusRef
          : statusEvent.target ===
              "recovery"
            ? recoveryStatusRef
            : successStatusRef;
      const focusTarget =
        findNodeHandle(
          targetRef.current,
        );

      if (focusTarget !== null) {
        AccessibilityInfo
          .setAccessibilityFocus(
            focusTarget,
          );
      }
    }, [
      accountIdentity,
      statusEvent,
    ]);

  useFocusEffect(
    useCallback(
      () => {
        void loadCachedSnapshot();
      },
      [
        loadCachedSnapshot,
      ],
    ),
  );

  const handleSync =
    async (): Promise<void> => {
      const syncAccountIdentity =
        accountIdentity;
      const operationId =
        importOperationRef.current + 1;

      importOperationRef.current =
        operationId;
      setStoredSyncing(true);
      setSyncingAccountIdentity(
        syncAccountIdentity,
      );
      setStoredSuccessMessage(null);
      setSuccessMessageAccountIdentity(
        syncAccountIdentity,
      );
      setStoredStatusEvent(null);
      setStatusEventAccountIdentity(
        syncAccountIdentity,
      );

      try {
        const updated =
          await syncSpotifyLibrary({
            operationCommitGuard: () =>
              accountIdentityRef.current ===
                syncAccountIdentity &&
              importOperationRef.current ===
                operationId,
            onProgress: (
              progress: SpotifyLibraryImportProgress,
            ) => {
              if (
                accountIdentityRef.current ===
                  syncAccountIdentity &&
                importOperationRef.current ===
                  operationId
              ) {
                setStoredImportProgress(
                  progress.status,
                );
                setImportProgressAccountIdentity(
                  syncAccountIdentity,
                );
              }
            },
          });

        if (
          accountIdentityRef.current !==
            syncAccountIdentity ||
          importOperationRef.current !==
            operationId
        ) {
          return;
        }

        setStoredSnapshot(updated);
        setSnapshotAccountIdentity(
          syncAccountIdentity,
        );
        setStoredImportProgress(
          updated.importStatus ??
            null,
        );
        setImportProgressAccountIdentity(
          syncAccountIdentity,
        );

        setStoredSuccessMessage(
          "Your Spotify library import is complete.",
        );
        setSuccessMessageAccountIdentity(
          syncAccountIdentity,
        );
        publishStatusEvent(
          syncAccountIdentity,
          {
            message:
              "Your Spotify library import is complete.",
            target: "success",
          },
        );

        setStoredRecoveryFailure(
          (current) =>
            current?.operation ===
            "export"
              ? current
              : null,
        );
        setRecoveryFailureAccountIdentity(
          syncAccountIdentity,
        );
      } catch (error) {
        if (
          accountIdentityRef.current !==
            syncAccountIdentity ||
          importOperationRef.current !==
            operationId
        ) {
          return;
        }

        let checkpoint: SpotifyLibraryImportStatus | null =
          null;

        try {
          checkpoint =
            await readSpotifyLibraryImportStatus();

          if (
            accountIdentityRef.current !==
              syncAccountIdentity ||
            importOperationRef.current !==
              operationId
          ) {
            return;
          }

          setStoredImportProgress(
            checkpoint,
          );
          setImportProgressAccountIdentity(
            syncAccountIdentity,
          );
        } catch {
          // The recovery card below is still actionable if a checkpoint cannot be read.
        }

        if (
          accountIdentityRef.current !==
            syncAccountIdentity ||
          importOperationRef.current !==
            operationId
        ) {
          return;
        }

        setStoredRecoveryFailure(
          (current) =>
            current?.operation ===
            "export"
              ? current
              : {
                  operation:
                    "sync",
                  cause:
                    error,
                  message:
                    error instanceof
                    Error
                      ? error.message
                      : "Canal could not sync Spotify.",
                },
        );
        setRecoveryFailureAccountIdentity(
          syncAccountIdentity,
        );
        publishStatusEvent(
          syncAccountIdentity,
          {
            message: checkpoint
              ? importStatusAnnouncement(
                  checkpoint,
                )
              : "Spotify import needs attention. Use the recovery action to continue.",
            target: checkpoint
              ? "progress"
              : "recovery",
          },
        );
      } finally {
        if (
          accountIdentityRef.current ===
            syncAccountIdentity &&
          importOperationRef.current ===
            operationId
        ) {
          setStoredSyncing(false);
          setSyncingAccountIdentity(
            syncAccountIdentity,
          );
        }
      }
    };

  const pauseSync =
    (): void => {
      importOperationRef.current += 1;
      setStoredSyncing(false);
      setSyncingAccountIdentity(
        accountIdentity,
      );
      setStoredSuccessMessage(
        "Spotify import paused. Resume when you are ready.",
      );
      setSuccessMessageAccountIdentity(
        accountIdentity,
      );
      publishStatusEvent(
        accountIdentity,
        {
          message:
            "Spotify import paused. Resume when you are ready.",
          target: "progress",
        },
      );
    };

  const exportInFlight =
    useRef(false);

  const handleExport =
    async (
      refreshBeforeExport = false,
    ): Promise<void> => {
      const exportAccountIdentity =
        accountIdentity;
      const exportSnapshot =
        snapshot;

      if (
        !exportSnapshot ||
        exportInFlight.current
      ) {
        return;
      }

      exportInFlight.current =
        true;
      setStoredExporting(true);
      setExportingAccountIdentity(
        exportAccountIdentity,
      );

      try {
        if (
          refreshBeforeExport
        ) {
          const nextStatus =
            await refreshConnectivity();

          if (
            nextStatus ===
            "offline"
          ) {
            return;
          }
        }

        if (
          accountIdentityRef.current !==
          exportAccountIdentity
        ) {
          return;
        }

        setStoredRecoveryFailure(
          null,
        );
        setRecoveryFailureAccountIdentity(
          exportAccountIdentity,
        );
        setStoredSuccessMessage(null);
        setSuccessMessageAccountIdentity(
          exportAccountIdentity,
        );

        const result =
          await exportSpotifyTastePlaylist(
            exportSnapshot,
          );

        if (
          accountIdentityRef.current !==
          exportAccountIdentity
        ) {
          return;
        }

        setStoredSuccessMessage(
          `Created a private Spotify playlist with ${result.trackCount} tracks.`,
        );
        setSuccessMessageAccountIdentity(
          exportAccountIdentity,
        );

        const url =
          getSpotifyContentUrl(
            "playlist",
            result.playlist,
          );

        if (url) {
          try {
            await openExternalUrl(
              url,
            );
          } catch (error) {
            console.warn(
              "Spotify playlist created, but Canal could not open it:",
              error,
            );
          }
        }
      } catch (error) {
        if (
          accountIdentityRef.current !==
          exportAccountIdentity
        ) {
          return;
        }

        setStoredRecoveryFailure({
          operation:
            "export",
          cause:
            error,
          message:
            error instanceof Error
              ? error.message
              : "Canal could not create the Spotify playlist.",
        });
        setRecoveryFailureAccountIdentity(
          exportAccountIdentity,
        );
      } finally {
        exportInFlight.current =
          false;

        if (
          accountIdentityRef.current ===
          exportAccountIdentity
        ) {
          setStoredExporting(false);
          setExportingAccountIdentity(
            exportAccountIdentity,
          );
        }
      }
    };

  const retryReadOrSync =
    async (): Promise<void> => {
      if (
        recoveryFailure?.operation ===
        "load"
      ) {
        await loadCachedSnapshot();

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus !==
        "offline"
      ) {
        await handleSync();
      }
    };

  const displayName =
    snapshot?.profile
      .display_name ||
    snapshot?.profile.id ||
    "Your";

  const recoveryIssue =
    useMemo(
      () => {
        if (
          !recoveryFailure &&
          connectivityStatus !==
            "offline"
        ) {
          return null;
        }

        return classifyRecoveryIssue(
          recoveryFailure
            ?.cause ??
            new Error(
              recoveryFailure
                ?.message ||
                "Canal is offline.",
            ),
          {
            service:
              "spotify",
            connectivityStatus,
          },
        );
      },
      [
        connectivityStatus,
        recoveryFailure,
      ],
    );

  const recover =
    async (): Promise<void> => {
      if (
        recoveryIssue?.action ===
        "reconnect-spotify"
      ) {
        router.push(
          "/music-services",
        );

        return;
      }

      if (
        recoveryFailure?.operation ===
        "export"
      ) {
        await handleExport(
          true,
        );

        return;
      }

      await retryReadOrSync();
    };

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
              enabled={
                connectivityStatus !==
                "offline"
              }
              refreshing={
                syncing
              }
              onRefresh={() => {
                if (
                  connectivityStatus !==
                  "offline"
                ) {
                  void handleSync();
                }
              }}
            />
          }
        >
          {importProgress ? (
            <ImportProgressCard
              offline={
                connectivityStatus ===
                "offline"
              }
              onCancel={pauseSync}
              onResume={() => {
                void handleSync();
              }}
              status={importProgress}
              statusAnnouncement={
                statusEvent?.target ===
                "progress"
                  ? statusEvent.message
                  : undefined
              }
              statusAnnouncementRef={
                importStatusRef
              }
              syncing={syncing}
            />
          ) : null}

          {statusEvent?.target ===
          "recovery" ? (
            <View
              ref={recoveryStatusRef}
              accessible
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.recoveryStatusSummary}
            >
              <Text
                style={
                  styles.recoveryStatusSummaryText
                }
              >
                {statusEvent.message}
              </Text>
            </View>
          ) : null}

          {recoveryIssue ? (
            <RecoveryNotice
              busy={
                syncing ||
                exporting
              }
              issue={
                recoveryIssue
              }
              onAction={
                recover
              }
            />
          ) : null}

          {!snapshot &&
          !recoveryIssue ? (
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
                accessibilityLabel="Sync Spotify library"
                accessibilityState={{
                  busy:
                    syncing,
                  disabled:
                    syncing ||
                    connectivityStatus ===
                      "offline",
                }}
                disabled={
                  syncing ||
                  connectivityStatus ===
                    "offline"
                }
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
          ) : snapshot ? (
            <>
              <View style={styles.profileCard}>
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
                  accessibilityLabel="Sync Spotify library again"
                  accessibilityState={{
                    busy:
                      syncing,
                    disabled:
                      syncing ||
                      connectivityStatus ===
                        "offline",
                  }}
                  disabled={
                    syncing ||
                    connectivityStatus ===
                      "offline"
                  }
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
                  accessibilityLabel="Export playlist"
                  accessibilityState={{
                    busy:
                      exporting,
                    disabled:
                      exporting ||
                      connectivityStatus ===
                        "offline",
                  }}
                  disabled={
                    exporting ||
                    connectivityStatus ===
                      "offline"
                  }
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
                <View
                  ref={
                    statusEvent?.target ===
                    "success"
                      ? successStatusRef
                      : undefined
                  }
                  accessible={
                    statusEvent?.target ===
                    "success"
                  }
                  accessibilityLiveRegion={
                    statusEvent?.target ===
                    "success"
                      ? "polite"
                      : undefined
                  }
                  accessibilityRole={
                    statusEvent?.target ===
                    "success"
                      ? "alert"
                      : undefined
                  }
                  style={styles.successBox}
                >
                  <Text
                    style={
                      styles.successText
                    }
                  >
                    {successMessage}
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
    marginTop: 4,
  },

  sceneButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: canalDynamicColors.surface,
    borderWidth: 1,
    borderColor: canalDynamicColors.line,
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
    color: canalDynamicColors.muted,
    fontSize: 13,
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
    color: canalDynamicColors.text,
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

  disabledRow: {
    opacity: 0.5,
  },

  rankText: {
    width: 25,
    color: canalDynamicColors.muted,
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
    color: canalDynamicColors.text,
    fontSize: 15,
    fontWeight: "800",
  },

  rowSubtitle: {
    color: "#77706A",
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },

  arrow: {
    color: canalDynamicColors.muted,
    fontSize: 25,
    marginLeft: 8,
  },

  spotifyLinkText: {
    color: canalDynamicColors.mint,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
    textAlign: "right",
  },

  successBox: {
    backgroundColor: "#EAF9EF",
    borderRadius: 16,
    padding: 15,
  },

  successText: {
    color: canalDynamicColors.mint,
    fontSize: 14,
    fontWeight: "700",
  },

  errorBox: {
    backgroundColor: "#FFF0EF",
    borderRadius: 16,
    padding: 15,
  },

  errorTitle: {
    color: canalDynamicColors.danger,
    fontSize: 14,
    fontWeight: "800",
  },

  errorText: {
    color: canalDynamicColors.danger,
    fontSize: 13,
    marginTop: 4,
  },

  warningBox: {
    backgroundColor: "#FFF4E9",
    borderRadius: 16,
    padding: 15,
  },

  warningTitle: {
    color: canalDynamicColors.gold,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },

  warningText: {
    color: canalDynamicColors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  importCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2DAD4",
    gap: 8,
    padding: 16,
  },

  importTitle: {
    color: "#1B1B1B",
    fontSize: 16,
    fontWeight: "800",
  },

  importStatusSummary: {
    backgroundColor: "#FFF4E9",
    borderRadius: 12,
    padding: 12,
  },

  importStatusSummaryText: {
    color: canalDynamicColors.gold,
    fontSize: 14,
    fontWeight: "700",
  },

  importText: {
    color: canalDynamicColors.muted,
    fontSize: 13,
  },

  importWarning: {
    color: canalDynamicColors.gold,
    fontSize: 13,
    fontWeight: "700",
  },

  importActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },

  importResumeButton: {
    minHeight: 48,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#F47A24",
    paddingHorizontal: 16,
  },

  importResumeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  importPauseButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8D2CD",
    paddingHorizontal: 16,
  },

  importPauseText: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "800",
  },

  recoveryStatusSummary: {
    backgroundColor: "#FFF0EF",
    borderRadius: 16,
    padding: 15,
  },

  recoveryStatusSummaryText: {
    color: canalDynamicColors.danger,
    fontSize: 14,
    fontWeight: "700",
  },

  disabledButton: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.7,
  },
});
import { canalDynamicColors } from "../theme/canal-dynamic-colors";
