import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  isCanalAccountChangedError,
  isCanalLogoutIncompleteError,
  disconnectSpotifyOnly,
  logoutAllMusicPlatforms,
  retryIncompleteAccountCleanup,
} from "../lib/app-session";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  getSpotifyClientId,
  getSpotifyRedirectUri,
  SPOTIFY_SCOPES,
  spotifyDiscovery,
} from "../lib/spotify-config";

import {
  acquireSpotifyAuthOperationLease,
  acquireSpotifyAuthPreparationLease,
  clearSpotifyReturnRoute,
  createSpotifyAuthSurfaceInstanceId,
  isSpotifyAuthOperationLeaseCurrent,
  isSpotifyAuthPreparationLeaseCurrent,
  isSameSpotifyAuthAttempt,
  isSpotifyAuthPreparationOwnerCurrent,
  isSpotifyAuthAttemptAfterProviderRotation,
  prepareSpotifyAuthAttempt,
  promptSpotifyAuthAttempt,
  rebindSpotifyAuthAttemptAuthority,
  releaseSpotifyAuthOperationLease,
  releaseSpotifyAuthPreparationLease,
  SpotifyAuthStateMismatchError,
} from "../lib/spotify-auth-return";

import type {
  PreparedSpotifyAuthAttempt,
  SpotifyAuthAttempt,
  SpotifyAuthOperationLease,
  SpotifyAuthPreparationLease,
  SpotifyAuthPreparationOwner,
} from "../lib/spotify-auth-return";

import {
  assertSpotifyAccountScopeCurrent,
  getMissingSpotifyScopes,
  getValidSpotifySession,
  saveSpotifySession,
  SpotifyProviderCleanupIncompleteError,
  SpotifyAccessError,
} from "../lib/spotify-auth";

import type {
  SpotifyCanalAccountGuard,
  SpotifyProfile,
  SpotifySession,
} from "../lib/spotify-auth";

import {
  getLatestSpotifyLibrarySnapshot,
  readSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../lib/spotify-library";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

import {
  useAuth,
} from "../providers/auth-provider";

WebBrowser.maybeCompleteAuthSession();

type ConnectionState =
  | "loading"
  | "disconnected"
  | "connecting"
  | "syncing"
  | "connected";

type AccountAction =
  | "cleanup"
  | "disconnect"
  | "logout";

type RecoveryAction =
  | AccountAction
  | "cleanup"
  | "signout";

function safeBack(
  loginMode: boolean,
): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace(
    loginMode
      ? "/login"
      : "/settings",
  );
}

export default function MusicServicesScreen() {
  const {
    accountEpoch,
    user,
  } =
    useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const params =
    useLocalSearchParams<{
      mode?: string;
    }>();

  const loginMode =
    params.mode === "login";

  const clientId =
    getSpotifyClientId();

  const redirectUri =
    getSpotifyRedirectUri();

  const [
    connectionState,
    setConnectionState,
  ] =
    useState<ConnectionState>(
      "loading",
    );

  const [
    session,
    setSession,
  ] =
    useState<SpotifySession | null>(
      null,
    );

  const [
    libraryReady,
    setLibraryReady,
  ] = useState(false);

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    errorCause,
    setErrorCause,
  ] =
    useState<unknown>(
      null,
    );

  const [
    accountAction,
    setAccountAction,
  ] =
    useState<AccountAction | null>(
      null,
    );

  const [
    recoveryAction,
    setRecoveryAction,
  ] =
    useState<RecoveryAction | null>(
      null,
    );

  const accountIdentity =
    `${user?.id ?? "signed-out"}:${accountEpoch}`;

  const accountIdentityRef =
    useRef(
      accountIdentity,
    );

  accountIdentityRef.current =
    accountIdentity;

  const connectionLoadEpoch =
    useRef(0);

  const [
    providerStateAccountIdentity,
    setProviderStateAccountIdentity,
  ] =
    useState<string | null>(
      null,
    );

  const processingCode =
    useRef<string | null>(
      null,
    );

  const pendingAuthAccount =
    useRef<{
      accountGuard:
        SpotifyCanalAccountGuard;
      accountIdentity: string;
      attempt:
        SpotifyAuthAttempt;
      lifecycleToken: number;
      operationLease:
        SpotifyAuthOperationLease;
    } | null>(
      null,
    );

  const preparedAuthRequest =
    useRef<{
      accountIdentity: string;
      preparationEpoch: number;
      preparationLease:
        SpotifyAuthPreparationLease;
      prepared:
        PreparedSpotifyAuthAttempt;
    } | null>(
      null,
    );

  const authPreparationEpoch =
    useRef(0);

  const authPreparationOwner =
    useRef<SpotifyAuthPreparationOwner | null>(
      null,
    );

  const authPreparationLease =
    useRef<SpotifyAuthPreparationLease | null>(
      null,
    );

  const authInstanceLifecycle =
    useRef({
      mounted: false,
      epoch: 0,
    });

  const authSurfaceInstanceId =
    useRef(
      createSpotifyAuthSurfaceInstanceId(
        "music-services-screen",
      ),
    );

  const authPreparationTail =
    useRef<Promise<void>>(
      Promise.resolve(),
    );

  const [
    requestReady,
    setRequestReady,
  ] = useState(false);

  const [
    authCompletion,
    setAuthCompletion,
  ] =
    useState<{
      response:
        AuthSession.AuthSessionResult;
      attempt:
        SpotifyAuthAttempt;
      codeVerifier: string;
    } | null>(
      null,
    );

  const announce =
    useCallback(
      (message: string): void => {
        AccessibilityInfo
          .announceForAccessibility(
            message,
          );
      },
      [],
    );

  const prepareAuthRequest =
    useCallback(async (): Promise<
      PreparedSpotifyAuthAttempt | null
    > => {
      const preparationIdentity =
        accountIdentity;

      const instanceEpoch =
        authInstanceLifecycle.current
          .epoch;

      const isInstanceActive =
        (): boolean =>
          authInstanceLifecycle.current
            .mounted &&
          authInstanceLifecycle.current
            .epoch ===
            instanceEpoch;

      if (
        !isInstanceActive() ||
        accountIdentityRef.current !==
        preparationIdentity
      ) {
        return null;
      }

      const preparationEpoch =
        authPreparationEpoch.current +
        1;

      const preparationOwner:
        SpotifyAuthPreparationOwner = {
        accountIdentity:
          preparationIdentity,
        epoch:
          preparationEpoch,
      };

      authPreparationEpoch.current =
        preparationEpoch;
      authPreparationOwner.current =
        preparationOwner;

      const preparationLease =
        acquireSpotifyAuthPreparationLease(
          preparationIdentity,
        );

      authPreparationLease.current =
        preparationLease;

      const ownsPreparation =
        (): boolean =>
          isInstanceActive() &&
          isSpotifyAuthPreparationLeaseCurrent(
            preparationLease,
          ) &&
          isSpotifyAuthPreparationOwnerCurrent(
            preparationOwner,
            accountIdentityRef.current,
            authPreparationOwner.current,
          );

      if (
        preparedAuthRequest.current
          ?.accountIdentity ===
        preparationIdentity
      ) {
        preparedAuthRequest.current =
          null;
      }

      setRequestReady(false);

      const previousPreparation =
        authPreparationTail.current;

      let releasePreparation:
        () => void =
        () => {};

      authPreparationTail.current =
        new Promise<void>(
          (resolve) => {
            releasePreparation =
              resolve;
          },
        );

      await previousPreparation;

      if (!ownsPreparation()) {
        releasePreparation();

        return null;
      }

      if (!clientId) {
        releasePreparation();

        return null;
      }

      try {
        const prepared =
          await prepareSpotifyAuthAttempt(
            "/music-services",
            {
              clientId,
              scopes: [
                ...SPOTIFY_SCOPES,
              ],
              redirectUri,
              responseType:
                AuthSession
                  .ResponseType
                  .Code,
              usePKCE: true,
              extraParams: {
                show_dialog:
                  "true",
              },
            },
            spotifyDiscovery,
            undefined,
            ownsPreparation,
          );

        if (
          accountIdentityRef.current !==
            preparationIdentity ||
          !ownsPreparation()
        ) {
          await clearSpotifyReturnRoute(
            prepared.attempt,
          );

          return null;
        }

        preparedAuthRequest.current = {
          accountIdentity:
            preparationIdentity,
          preparationEpoch,
          preparationLease,
          prepared,
        };
        setRequestReady(true);

        return prepared;
      } catch {
        // The Connect action exposes a guarded retry once preparation is ready.
        return null;
      } finally {
        releasePreparation();
      }
    }, [
      accountIdentity,
      clientId,
      redirectUri,
    ]);

  const retirePreparedAuthRequest =
    useCallback(async (): Promise<
      PreparedSpotifyAuthAttempt | null
    > => {
      const retirementIdentity =
        accountIdentity;

      const retirementInstanceEpoch =
        authInstanceLifecycle.current
          .epoch;

      if (
        !authInstanceLifecycle.current
          .mounted ||
        authInstanceLifecycle.current
          .epoch !==
          retirementInstanceEpoch ||
        accountIdentityRef.current !==
        retirementIdentity
      ) {
        return null;
      }

      const retirementEpoch =
        authPreparationEpoch.current +
        1;

      authPreparationEpoch.current =
        retirementEpoch;
      authPreparationOwner.current = {
        accountIdentity:
          retirementIdentity,
        epoch:
          retirementEpoch,
      };

      const preparedEntry =
        preparedAuthRequest.current
          ?.accountIdentity ===
        retirementIdentity
          ? preparedAuthRequest.current
          : null;

      const prepared =
        preparedEntry?.prepared ??
        null;

      const leaseToRelease =
        preparedEntry
          ?.preparationLease ??
        authPreparationLease.current;

      if (leaseToRelease) {
        releaseSpotifyAuthPreparationLease(
          leaseToRelease,
        );
      }

      if (
        authPreparationLease.current ===
        leaseToRelease
      ) {
        authPreparationLease.current =
          null;
      }

      if (preparedEntry) {
        preparedAuthRequest.current =
          null;
      }

      setRequestReady(false);

      if (prepared) {
        try {
          await clearSpotifyReturnRoute(
            prepared.attempt,
          );
        } catch {
          // The retired tuple is no longer promptable; its scoped route is replaced by preparation.
        }
      }

      return prepared;
    }, [
      accountIdentity,
    ]);

  useEffect(() => {
    authInstanceLifecycle.current = {
      mounted: true,
      epoch:
        authInstanceLifecycle.current
          .epoch + 1,
    };

    void prepareAuthRequest();

    return () => {
      authInstanceLifecycle.current = {
        mounted: false,
        epoch:
          authInstanceLifecycle.current
            .epoch + 1,
      };

      if (
        authPreparationOwner.current
          ?.accountIdentity ===
        accountIdentity
      ) {
        authPreparationEpoch.current +=
          1;
        authPreparationOwner.current =
          null;
      }

      if (
        preparedAuthRequest.current
          ?.accountIdentity ===
        accountIdentity
      ) {
        releaseSpotifyAuthPreparationLease(
          preparedAuthRequest.current
            .preparationLease,
        );

        preparedAuthRequest.current =
          null;
      }

      const pendingOperation =
        pendingAuthAccount.current;

      if (
        pendingOperation
          ?.accountIdentity ===
        accountIdentity
      ) {
        releaseSpotifyAuthOperationLease(
          pendingOperation.operationLease,
        );
        pendingAuthAccount.current =
          null;
      }

      if (
        authPreparationLease.current
      ) {
        releaseSpotifyAuthPreparationLease(
          authPreparationLease.current,
        );
        authPreparationLease.current =
          null;
      }
    };
  }, [
    accountIdentity,
    prepareAuthRequest,
  ]);

  const loadExistingConnection =
    useCallback(async (): Promise<void> => {
      const loadAccountIdentity =
        accountIdentity;

      const loadEpoch =
        connectionLoadEpoch.current +
        1;

      connectionLoadEpoch.current =
        loadEpoch;

      const canCommit =
        (): boolean =>
          accountIdentityRef.current ===
            loadAccountIdentity &&
          connectionLoadEpoch.current ===
            loadEpoch;

      if (
        pendingAuthAccount.current &&
        pendingAuthAccount
          .current
          .accountIdentity !==
          loadAccountIdentity
      ) {
        releaseSpotifyAuthOperationLease(
          pendingAuthAccount.current
            .operationLease,
        );
        pendingAuthAccount.current =
          null;
        processingCode.current =
          null;
        setAuthCompletion(
          null,
        );
      }

      /*
       * Hide the previous provider state synchronously. A deferred read
       * from account A can never remain visible after Canal switches to B.
       */
      setProviderStateAccountIdentity(
        null,
      );
      setSession(null);
      setLibraryReady(false);
      setConnectionState(
        "loading",
      );
      setRecoveryAction(null);
      setErrorMessage("");
      setErrorCause(null);
      setStatusMessage(
        "Checking Spotify for the current Canal account.",
      );

      try {
        const pendingCleanup =
          await retryIncompleteAccountCleanup({
            allowSignOut:
              false,
          });

        if (!canCommit()) {
          return;
        }

        if (
          pendingCleanup
            ?.cleanupIncomplete
        ) {
          await retirePreparedAuthRequest();

          if (!canCommit()) {
            return;
          }

          const needsSignOut =
            pendingCleanup.recovery ===
            "signout";

          const recoveryMessage =
            needsSignOut
              ? "Spotify cleanup finished, but this device still needs to finish logging out of Canal."
              : "Spotify is disconnected, but some account-scoped device cleanup still needs attention.";

          setProviderStateAccountIdentity(
            loadAccountIdentity,
          );
          setConnectionState(
            "disconnected",
          );
          setRecoveryAction(
            needsSignOut
              ? "signout"
              : "cleanup",
          );
          setErrorMessage(
            recoveryMessage,
          );
          setErrorCause(
            new Error(
              needsSignOut
                ? "Canal sign-out is incomplete."
                : "Spotify cleanup is incomplete.",
            ),
          );
          setStatusMessage(
            needsSignOut
              ? "Retry Log Out. Canal will not repeat completed Spotify cleanup."
              : "Retry cleanup for this Canal account. No other account will be changed.",
          );
          announce(
            recoveryMessage,
          );

          return;
        }

        const validSession =
          await getValidSpotifySession();

        if (!canCommit()) {
          return;
        }

        if (!validSession) {
          setProviderStateAccountIdentity(
            loadAccountIdentity,
          );
          setConnectionState(
            "disconnected",
          );
          setStatusMessage("");

          return;
        }

        let snapshot =
          await readSpotifyLibrarySnapshot();

        let libraryStatusMessage:
          string | null =
          null;

        if (!canCommit()) {
          return;
        }

        const missingScopes =
          getMissingSpotifyScopes(
            validSession.scope,
          );

        setSession(
          validSession,
        );
        setProviderStateAccountIdentity(
          loadAccountIdentity,
        );

        if (
          missingScopes.length >
          0
        ) {
          const permissionMessage =
            "Spotify permission is required before Canal can refresh your library and export playlists.";

          setConnectionState(
            "connected",
          );
          setErrorMessage(
            permissionMessage,
          );
          setErrorCause(
            new SpotifyAccessError(
              "permission",
              permissionMessage,
              missingScopes,
            ),
          );
          setStatusMessage(
            snapshot
              ? "Your last Spotify snapshot is still available while you reconnect."
              : "Reconnect Spotify before creating a Scene.",
          );
          announce(
            permissionMessage,
          );

          return;
        }

        if (snapshot) {
          const latestLibrary =
            await getLatestSpotifyLibrarySnapshot();

          if (!canCommit()) {
            return;
          }

          snapshot =
            latestLibrary.snapshot ??
            snapshot;

          if (latestLibrary.warning) {
            libraryStatusMessage =
              latestLibrary.warning;
            setStatusMessage(
              latestLibrary.warning,
            );
          }
        }

        if (!snapshot) {
          setConnectionState(
            "syncing",
          );
          setStatusMessage(
            "Spotify is connected. Canal is importing your library.",
          );

          try {
            snapshot =
              await syncSpotifyLibrary();

            if (!canCommit()) {
              return;
            }
          } catch (error) {
            if (!canCommit()) {
              return;
            }

            const syncErrorMessage =
              error instanceof Error
                ? error.message
                : "Spotify connected, but the library could not be synced.";

            setErrorCause(
              () => error,
            );
            setErrorMessage(
              syncErrorMessage,
            );
            setStatusMessage(
              "Spotify is connected, but its library is not ready yet.",
            );
            libraryStatusMessage =
              "Spotify is connected, but its library is not ready yet.";
            announce(
              syncErrorMessage,
            );
          }
        }

        if (!canCommit()) {
          return;
        }

        setLibraryReady(
          Boolean(snapshot),
        );
        if (snapshot) {
          setStatusMessage(
            libraryStatusMessage ??
              "",
          );
        }
        setConnectionState(
          "connected",
        );
      } catch (error) {
        if (!canCommit()) {
          return;
        }

        const loadErrorMessage =
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. Spotify is loading only for the current account."
            : error instanceof Error
              ? error.message
              : "Canal could not verify the Spotify connection.";

        setProviderStateAccountIdentity(
          loadAccountIdentity,
        );
        setConnectionState(
          "disconnected",
        );
        setErrorMessage(
          loadErrorMessage,
        );
        setErrorCause(
          () => error,
        );
        setStatusMessage("");
        announce(
          loadErrorMessage,
        );
      }
    }, [
      accountIdentity,
      announce,
      retirePreparedAuthRequest,
    ]);

  useFocusEffect(
    useCallback(() => {
      void loadExistingConnection();

      return () => {
        connectionLoadEpoch.current +=
          1;
      };
    }, [
      loadExistingConnection,
    ]),
  );

  const providerStateIsCurrent =
    providerStateAccountIdentity ===
    accountIdentity;

  const visibleSession =
    providerStateIsCurrent
      ? session
      : null;

  const visibleConnectionState:
    ConnectionState =
    providerStateIsCurrent
      ? connectionState
      : "loading";

  const visibleLibraryReady =
    providerStateIsCurrent &&
    libraryReady;

  useEffect(() => {
    const response =
      authCompletion?.response;

    const responseAttempt =
      authCompletion?.attempt;

    if (
      !response ||
      !responseAttempt
    ) {
      return;
    }

    if (
      response?.type !==
      "success"
    ) {
      if (
        response?.type ===
        "error"
      ) {
        const responseAccount =
          pendingAuthAccount.current;

        if (
          !responseAccount ||
          !authInstanceLifecycle.current
            .mounted ||
          authInstanceLifecycle.current
            .epoch !==
            responseAccount
              .lifecycleToken ||
          !isSpotifyAuthOperationLeaseCurrent(
            responseAccount
              .operationLease,
          ) ||
          !isSameSpotifyAuthAttempt(
            responseAccount.attempt,
            responseAttempt,
          ) ||
          responseAccount.accountIdentity !==
            accountIdentityRef.current
        ) {
          return;
        }

        void (async () => {
          try {
            await assertSpotifyAccountScopeCurrent(
              responseAttempt,
            );
          } catch {
            return;
          }

          if (
            !isSameSpotifyAuthAttempt(
              pendingAuthAccount
                .current
                ?.attempt ??
                null,
              responseAttempt,
            ) ||
            pendingAuthAccount
                .current
                ?.accountIdentity !==
              accountIdentityRef.current ||
            pendingAuthAccount
                .current !==
              responseAccount ||
            !isSpotifyAuthOperationLeaseCurrent(
              responseAccount
                .operationLease,
            )
          ) {
            return;
          }

          await assertSpotifyAccountScopeCurrent(
            responseAttempt,
          );

          if (
            pendingAuthAccount.current !==
              responseAccount ||
            !isSpotifyAuthOperationLeaseCurrent(
              responseAccount
                .operationLease,
            )
          ) {
            return;
          }

          const responseError =
            new Error(
              response.params
                .error_description ||
                response.params.error ||
                "Spotify authorization failed.",
            );

          setConnectionState(
            visibleSession
              ? "connected"
              : "disconnected",
          );
          setErrorMessage(
            responseError.message,
          );
          setErrorCause(
            responseError,
          );
          announce(
            responseError.message,
          );

          await clearSpotifyReturnRoute(
            responseAttempt,
          );

          try {
            await assertSpotifyAccountScopeCurrent(
              responseAttempt,
            );
          } catch {
            return;
          }

          if (
            isSameSpotifyAuthAttempt(
              pendingAuthAccount
                .current
                ?.attempt ??
                null,
              responseAttempt,
            ) &&
            pendingAuthAccount.current ===
              responseAccount &&
            isSpotifyAuthOperationLeaseCurrent(
              responseAccount
                .operationLease,
            )
          ) {
            pendingAuthAccount.current =
              null;
            releaseSpotifyAuthOperationLease(
              responseAccount
                .operationLease,
            );
            if (
              authPreparationLease.current
                ?.leaseId ===
              responseAccount
                .operationLease
                .leaseId
            ) {
              authPreparationLease.current =
                null;
            }
            setAuthCompletion(
              null,
            );
            void prepareAuthRequest();
          }
        })();
      }

      return;
    }

    const code =
      response.params.code;

    if (
      !code ||
      processingCode.current ===
        `${responseAttempt.attemptId}:${code}`
    ) {
      return;
    }

    processingCode.current =
      `${responseAttempt.attemptId}:${code}`;

    const completeConnection =
      async (): Promise<void> => {
        const pendingAccount =
          pendingAuthAccount.current;

        let currentAttemptAuthority =
          responseAttempt;

        const canCommitAuth =
          (): boolean =>
            authInstanceLifecycle.current
              .mounted &&
            authInstanceLifecycle.current
              .epoch ===
              pendingAccount
                ?.lifecycleToken &&
            pendingAuthAccount.current ===
              pendingAccount &&
            isSameSpotifyAuthAttempt(
              pendingAccount
                ?.attempt ??
                null,
              responseAttempt,
            ) &&
            pendingAccount
              ?.accountIdentity ===
              accountIdentityRef.current &&
            Boolean(
              pendingAccount &&
                isSpotifyAuthOperationLeaseCurrent(
                  pendingAccount
                    .operationLease,
                ),
            );

        const assertCanCommitAuth =
          async (): Promise<void> => {
            if (
              !canCommitAuth()
            ) {
              throw new Error(
                "The Canal account changed before Spotify finished connecting. Start again with the current account.",
              );
            }

            await assertSpotifyAccountScopeCurrent(
              currentAttemptAuthority,
            );

            if (
              !canCommitAuth()
            ) {
              throw new Error(
                "The Canal account changed before Spotify finished connecting. Start again with the current account.",
              );
            }
          };

        if (
          !pendingAccount ||
          !canCommitAuth()
        ) {
          throw new Error(
            "The Canal account changed before Spotify finished connecting. Start again with the current account.",
          );
        }

        if (
          !authCompletion
            ?.codeVerifier
        ) {
          throw new Error(
            "Spotify PKCE verification information is missing.",
          );
        }

        await assertCanCommitAuth();

        setConnectionState(
          "connecting",
        );

        setErrorMessage("");
        setErrorCause(null);

        setStatusMessage(
          "Completing Spotify connection.",
        );

        const tokenResponse =
          await AuthSession.exchangeCodeAsync(
            {
              clientId,
              code,
              redirectUri,

              extraParams: {
                code_verifier:
                  authCompletion
                    .codeVerifier,
              },
            },

            spotifyDiscovery,
          );

        await assertCanCommitAuth();

        const profileResponse =
          await fetch(
            "https://api.spotify.com/v1/me",
            {
              headers: {
                Authorization:
                  `Bearer ${tokenResponse.accessToken}`,
              },
            },
          );

        const profilePayload =
          (await profileResponse.json()) as
            SpotifyProfile & {
              error?: {
                message?: string;
              };
            };

        await assertCanCommitAuth();

        if (
          !profileResponse.ok ||
          !profilePayload.id
        ) {
          throw new Error(
            profilePayload.error
              ?.message ||
              "Canal could not load your Spotify profile.",
          );
        }

        const expiresIn =
          typeof tokenResponse.expiresIn ===
            "number"
            ? tokenResponse.expiresIn
            : 3600;

        const newSession: SpotifySession = {
          accessToken:
            tokenResponse.accessToken,

          refreshToken:
            tokenResponse.refreshToken,

          tokenType:
            tokenResponse.tokenType ||
            "Bearer",

          scope:
            tokenResponse.scope ||
            SPOTIFY_SCOPES.join(
              " ",
            ),

          expiresIn,

          expiresAt:
            Date.now() +
            expiresIn *
              1000 -
            60_000,

          profile:
            profilePayload,
        };

        let librarySyncError:
          unknown =
          null;

        await assertCanCommitAuth();

        setConnectionState(
          "syncing",
        );

        setStatusMessage(
          "Spotify connected. Canal is automatically importing your library.",
        );

        const savedAccountGuard =
          await saveSpotifySession(
            newSession,
            {
              syncLibrary: true,
              accountGuard:
                pendingAccount.accountGuard,
              operationCommitGuard:
                canCommitAuth,
              onLibrarySyncError:
                (error) => {
                  librarySyncError =
                    error;
                },
            },
          );

        if (!canCommitAuth()) {
          throw new Error(
            "The Canal account changed before Spotify finished connecting. Start again with the current account.",
          );
        }

        currentAttemptAuthority =
          rebindSpotifyAuthAttemptAuthority(
            responseAttempt,
            savedAccountGuard,
          );

        pendingAccount.accountGuard =
          savedAccountGuard;

        await assertCanCommitAuth();

        setSession(
          newSession,
        );
        setProviderStateAccountIdentity(
          pendingAccount.accountIdentity,
        );

        await assertCanCommitAuth();

        if (
          librarySyncError ===
            null
        ) {
          setLibraryReady(
            true,
          );

          setStatusMessage(
            "Spotify is connected and your library is ready.",
          );
        } else {
          setLibraryReady(
            false,
          );

          setErrorMessage(
            librarySyncError instanceof
              Error
              ? librarySyncError.message
              : "Spotify connected, but the library could not be synced.",
          );

          setErrorCause(
            () =>
              librarySyncError,
          );

          setStatusMessage(
            "Spotify is connected. Retry the library import when your connection is available.",
          );
        }

        await assertCanCommitAuth();

        setConnectionState(
          "connected",
        );

        try {
          await assertCanCommitAuth();

          WebBrowser.dismissAuthSession();
        } catch {
          // The browser may already be closed.
        }

        await clearSpotifyReturnRoute(
          responseAttempt,
        );

        await assertCanCommitAuth();

        if (
          canCommitAuth()
        ) {
          releaseSpotifyAuthOperationLease(
            pendingAccount
              .operationLease,
          );
          if (
            authPreparationLease.current
              ?.leaseId ===
            pendingAccount
              .operationLease
              .leaseId
          ) {
            authPreparationLease.current =
              null;
          }
          pendingAuthAccount.current =
            null;
          setAuthCompletion(
            null,
          );
          void prepareAuthRequest();
        }
      };

    completeConnection().catch(
      async (
        error: unknown,
      ) => {
        const failedAccount =
          pendingAuthAccount.current;

        const isFailedOperationCurrent =
          (): boolean =>
            authInstanceLifecycle.current
              .mounted &&
            Boolean(failedAccount) &&
            authInstanceLifecycle.current
              .epoch ===
              failedAccount
                ?.lifecycleToken &&
            pendingAuthAccount.current ===
              failedAccount &&
            failedAccount
              ?.accountIdentity ===
              accountIdentityRef.current &&
            Boolean(
              failedAccount &&
                isSpotifyAuthOperationLeaseCurrent(
                  failedAccount
                    .operationLease,
                ),
            ) &&
            isSameSpotifyAuthAttempt(
              failedAccount
                ?.attempt ??
                null,
              responseAttempt,
            );

        if (
          !failedAccount ||
          !isFailedOperationCurrent()
        ) {
          return;
        }

        let failureAuthority =
          responseAttempt;

        const cleanupFailure =
          error instanceof
            SpotifyProviderCleanupIncompleteError &&
          error.accountGuard
            .ownerId ===
            responseAttempt.ownerId &&
          error.accountGuard
            .accountGeneration ===
            responseAttempt
              .spotifyAccountGeneration +
              1 &&
          error.cleanupRecord
            .ownerId ===
            responseAttempt.ownerId &&
          error.cleanupRecord
            .sessionGeneration ===
            responseAttempt
              .sessionGeneration &&
          error.cleanupRecord
            .sourceSpotifyAccountGeneration ===
            responseAttempt
              .spotifyAccountGeneration &&
          error.cleanupRecord
            .spotifyAccountGeneration ===
            error.accountGuard
              .accountGeneration;

        if (cleanupFailure) {
          failureAuthority =
            rebindSpotifyAuthAttemptAuthority(
              responseAttempt,
              error.accountGuard,
            );
          failedAccount.accountGuard =
            error.accountGuard;
        }

        try {
          await assertSpotifyAccountScopeCurrent(
            failureAuthority,
          );

          if (
            !isFailedOperationCurrent()
          ) {
            return;
          }

          await clearSpotifyReturnRoute(
            responseAttempt,
          );

          await assertSpotifyAccountScopeCurrent(
            failureAuthority,
          );
        } catch {
          return;
        }

        if (
          !isFailedOperationCurrent()
        ) {
          return;
        }

        if (cleanupFailure) {
          releaseSpotifyAuthOperationLease(
            failedAccount
              .operationLease,
          );
          if (
            authPreparationLease.current
              ?.leaseId ===
            failedAccount
              .operationLease
              .leaseId
          ) {
            authPreparationLease.current =
              null;
          }
          pendingAuthAccount.current =
            null;
          setAuthCompletion(
            null,
          );
          setSession(null);
          setProviderStateAccountIdentity(
            failedAccount
              .accountIdentity,
          );
          setLibraryReady(false);
          setConnectionState(
            "disconnected",
          );
          setRecoveryAction(
            "cleanup",
          );

          const cleanupMessage =
            "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.";

          setErrorMessage(
            cleanupMessage,
          );
          setErrorCause(
            error,
          );
          setStatusMessage(
            "The replacement Spotify account was not saved.",
          );
          announce(
            cleanupMessage,
          );

          return;
        }

        let restoredSession:
          SpotifySession | null =
          null;

        try {
          restoredSession =
            await getValidSpotifySession();
        } catch {
          restoredSession =
            null;
        }

        if (
          !isFailedOperationCurrent()
        ) {
          return;
        }

        releaseSpotifyAuthOperationLease(
          failedAccount
            .operationLease,
        );
        if (
          authPreparationLease.current
            ?.leaseId ===
          failedAccount
            .operationLease
            .leaseId
        ) {
          authPreparationLease.current =
            null;
        }
        pendingAuthAccount.current =
          null;
        setAuthCompletion(
          null,
        );
        void prepareAuthRequest();

        const connectionErrorMessage =
          error instanceof Error
            ? error.message
            : "Spotify connection failed.";

        setSession(
          restoredSession,
        );
        setProviderStateAccountIdentity(
          failedAccount
            .accountIdentity,
        );

        setLibraryReady(
          Boolean(
            restoredSession,
          ),
        );

        setConnectionState(
          restoredSession
            ? "connected"
            : "disconnected",
        );

        setErrorMessage(
          connectionErrorMessage,
        );

        setErrorCause(
          () => error,
        );
        announce(
          connectionErrorMessage,
        );
      },
    );
  }, [
    authCompletion,
    clientId,
    redirectUri,
    visibleSession,
    announce,
    prepareAuthRequest,
  ]);

  const accountName =
    useMemo(
      () =>
        visibleSession?.profile
          .display_name ||
        visibleSession?.profile.id ||
        "Spotify account",

      [visibleSession],
    );

  const connect =
    async (): Promise<void> => {
      if (
        !requestReady ||
        recoveryAction ===
          "cleanup"
      ) {
        return;
      }

      if (!clientId) {
        const configurationError =
          new Error(
            "EXPO_PUBLIC_SPOTIFY_CLIENT_ID is missing.",
          );

        setErrorMessage(
          configurationError.message,
        );

        setErrorCause(
          configurationError,
        );

        return;
      }

      const preparedEntry =
        preparedAuthRequest.current;

      if (
        !preparedEntry ||
        preparedEntry
            .accountIdentity !==
          accountIdentity ||
        preparedEntry
            .prepared
            .attempt
            .ownerId !==
          user?.id
      ) {
        const requestError =
          new Error(
            "Spotify authorization is still loading.",
          );

        setErrorMessage(
          requestError.message,
        );
        setErrorCause(
          requestError,
        );
        void prepareAuthRequest();

        return;
      }

      const previousErrorMessage =
        errorMessage;

      const previousErrorCause =
        errorCause;

      const previousStatusMessage =
        statusMessage;

      let expectedAttempt:
        SpotifyAuthAttempt | null =
        null;

      let completionQueued =
        false;

      let operationLease:
        SpotifyAuthOperationLease | null =
        null;

      let lifecycleToken =
        -1;

      const isPromptCurrent =
        (): boolean => {
          const pending =
            pendingAuthAccount.current;

          return (
            operationLease !==
              null &&
            authInstanceLifecycle.current
              .mounted &&
            authInstanceLifecycle.current
              .epoch ===
              lifecycleToken &&
            pending?.operationLease ===
              operationLease &&
            pending.lifecycleToken ===
              lifecycleToken &&
            pending.accountIdentity ===
              accountIdentity &&
            pending.accountIdentity ===
              accountIdentityRef.current &&
            isSpotifyAuthOperationLeaseCurrent(
              operationLease,
            )
          );
        };

      const assertPromptCurrent =
        async (
          authority:
            SpotifyAuthAttempt,
        ): Promise<void> => {
          if (!isPromptCurrent()) {
            throw new Error(
              "The Canal account changed. Start Spotify connection again with the current account.",
            );
          }

          await assertSpotifyAccountScopeCurrent(
            authority,
          );

          if (!isPromptCurrent()) {
            throw new Error(
              "The Canal account changed. Start Spotify connection again with the current account.",
            );
          }
        };

      try {
        const prepared =
          preparedEntry.prepared;

        const attempt =
          prepared.attempt;

        expectedAttempt =
          attempt;

        const accountGuard:
          SpotifyCanalAccountGuard = {
          ownerId:
            attempt.ownerId,
          accountGeneration:
            attempt
              .spotifyAccountGeneration,
          configured: true,
        };

        if (
          !authInstanceLifecycle.current
            .mounted ||
          accountIdentityRef.current !==
          accountIdentity
        ) {
          throw new Error(
            "The Canal account changed. Start Spotify connection again with the current account.",
          );
        }

        lifecycleToken =
          authInstanceLifecycle.current
            .epoch;
        operationLease =
          acquireSpotifyAuthOperationLease(
            preparedEntry
              .preparationLease,
            attempt,
            authSurfaceInstanceId
              .current,
            lifecycleToken,
          );

        preparedAuthRequest.current =
          null;
        setRequestReady(false);

        pendingAuthAccount.current = {
          accountGuard,
          accountIdentity,
          attempt,
          lifecycleToken,
          operationLease,
        };

        await assertPromptCurrent(
          attempt,
        );

        const promptPromise =
          promptSpotifyAuthAttempt(
            prepared,
            spotifyDiscovery,
          );

        setConnectionState(
          "connecting",
        );
        setErrorMessage("");
        setErrorCause(null);
        setStatusMessage(
          "Opening Spotify authorization.",
        );
        announce(
          "Opening Spotify authorization.",
        );

        const promptResult =
          await promptPromise;

        await assertPromptCurrent(
          attempt,
        );

        const result =
          promptResult.response;

        if (
          result.type ===
          "cancel" ||
          result.type ===
            "dismiss" ||
          result.type ===
            "locked"
        ) {
          await assertPromptCurrent(
            attempt,
          );
          await clearSpotifyReturnRoute(
            attempt,
          );
          await assertPromptCurrent(
            attempt,
          );

          if (
            !isPromptCurrent()
          ) {
            return;
          }

          setConnectionState(
            visibleSession
              ? "connected"
              : "disconnected",
          );

          setErrorMessage(
            previousErrorMessage,
          );

          setErrorCause(
            () =>
              previousErrorCause,
          );

          setStatusMessage(
            result.type ===
              "locked"
              ? "Spotify authorization is already in progress. Try again."
              : previousStatusMessage,
          );

          return;
        }

        await assertPromptCurrent(
          attempt,
        );

        if (
          !isPromptCurrent()
        ) {
          return;
        }

        setAuthCompletion({
          response:
            result,
          attempt,
          codeVerifier:
            promptResult
              .codeVerifier ??
            "",
        });
        completionQueued =
          true;
      } catch (error) {
        const failedAttempt =
          expectedAttempt;

        if (
          !failedAttempt ||
          !isPromptCurrent()
        ) {
          return;
        }

        try {
          await assertPromptCurrent(
            failedAttempt,
          );
          await clearSpotifyReturnRoute(
            failedAttempt,
          );
          await assertPromptCurrent(
            failedAttempt,
          );
        } catch {
          return;
        }

        if (
          !isPromptCurrent()
        ) {
          return;
        }

        if (
          error instanceof
          SpotifyAuthStateMismatchError
        ) {
          setAuthCompletion(null);

          return;
        }

        setConnectionState(
          visibleSession
            ? "connected"
            : "disconnected",
        );

        setErrorCause(
          () => error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not open Spotify authorization.",
        );
        announce(
          error instanceof Error
            ? error.message
            : "Canal could not open Spotify authorization.",
        );
      } finally {
        if (
          !completionQueued &&
          operationLease &&
          isPromptCurrent()
        ) {
          pendingAuthAccount.current =
            null;
          releaseSpotifyAuthOperationLease(
            operationLease,
          );

          if (
            authPreparationLease.current ===
            preparedEntry
              .preparationLease
          ) {
            authPreparationLease.current =
              null;
          }

          void prepareAuthRequest();
        }
      }
    };

  const syncAgain =
    async (): Promise<void> => {
      const syncAccountIdentity =
        accountIdentity;

      setConnectionState(
        "syncing",
      );

      setErrorMessage("");
      setErrorCause(null);

      setStatusMessage(
        "Refreshing your Spotify library.",
      );
      announce(
        "Refreshing your Spotify library.",
      );

      try {
        const snapshot =
          await syncSpotifyLibrary();

        if (
          accountIdentityRef.current !==
          syncAccountIdentity
        ) {
          return;
        }

        setLibraryReady(
          Boolean(snapshot),
        );

        setConnectionState(
          "connected",
        );

        setStatusMessage(
          "Your Spotify library is up to date.",
        );
        announce(
          "Your Spotify library is up to date.",
        );
      } catch (error) {
        if (
          accountIdentityRef.current !==
          syncAccountIdentity
        ) {
          return;
        }

        setConnectionState(
          "connected",
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Spotify library sync failed.",
        );

        setErrorCause(
          () => error,
        );
        announce(
          error instanceof Error
            ? error.message
            : "Spotify library sync failed.",
        );
      }
    };

  useReconnectReload(
    async () => {
      if (visibleSession) {
        await syncAgain();
      }
    },
  );

  const disconnect =
    async (): Promise<void> => {
      if (accountAction) {
        return;
      }

      const actionIdentity =
        accountIdentity;

      setAccountAction(
        "disconnect",
      );

      setRecoveryAction(
        null,
      );

      setErrorMessage("");
      setErrorCause(null);

      setStatusMessage(
        "Disconnecting Spotify from this Canal account.",
      );
      announce(
        "Disconnecting Spotify from this Canal account.",
      );

      try {
        const retiredRequest =
          retirePreparedAuthRequest();

        const disconnectResult =
          disconnectSpotifyOnly();

        const [
          retired,
          result,
        ] = await Promise.all([
          retiredRequest,
          disconnectResult,
        ]);

        if (
          accountIdentityRef.current !==
          actionIdentity
        ) {
          return;
        }

        setSession(null);
        setProviderStateAccountIdentity(
          accountIdentityRef.current,
        );
        setLibraryReady(false);
        setConnectionState(
          "disconnected",
        );

        if (
          result.cleanupIncomplete
        ) {
          const message =
            "Spotify is disconnected and unusable for this Canal account, but some account-scoped device cleanup still needs attention.";

          setErrorMessage(
            message,
          );
          setErrorCause(
            new Error(
              message,
            ),
          );
          setStatusMessage(
            "Retry cleanup. Canal will retry only this account's unfinished items.",
          );
          setRecoveryAction(
            "cleanup",
          );
          announce(
            message,
          );
        } else {
          const message =
            "Spotify was disconnected from this Canal account on this device.";

          setErrorMessage("");
          setErrorCause(null);
          setStatusMessage(
            message,
          );
          announce(
            message,
          );
        }

        const replacement =
          await prepareAuthRequest();

        if (
          accountIdentityRef.current !==
          actionIdentity
        ) {
          return;
        }

        if (
          retired &&
          replacement &&
          !isSpotifyAuthAttemptAfterProviderRotation(
            retired.attempt,
            replacement.attempt,
          )
        ) {
          await retirePreparedAuthRequest();

          throw new Error(
            "Canal could not verify a fresh Spotify authorization request after disconnecting.",
          );
        }

        if (
          result.cleanupIncomplete
        ) {
          await retirePreparedAuthRequest();
        }
      } catch (error) {
        if (
          accountIdentityRef.current !==
          actionIdentity
        ) {
          return;
        }

        setErrorCause(
          () => error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not safely disconnect Spotify.",
        );

        setStatusMessage(
          "Canal could not confirm a safe disconnect. Reload this screen, check the current account, and try again.",
        );

        setRecoveryAction(
          isCanalAccountChangedError(
            error,
          )
            ? null
            : "disconnect",
        );
        announce(
          error instanceof Error
            ? error.message
            : "Canal could not safely disconnect Spotify.",
        );

      } finally {
        if (
          accountIdentityRef.current ===
          actionIdentity
        ) {
          setAccountAction(
            null,
          );
        }
      }
    };

  const logout =
    async (): Promise<void> => {
      if (accountAction) {
        return;
      }

      setAccountAction(
        "logout",
      );

      setRecoveryAction(
        null,
      );

      setErrorMessage("");
      setErrorCause(null);

      setStatusMessage(
        "Ending this device's Canal session.",
      );
      announce(
        "Ending this device's Canal session.",
      );

      try {
        const pending =
          await retryIncompleteAccountCleanup({
            allowSignOut:
              true,
          });

        let result =
          pending ??
          (await logoutAllMusicPlatforms());

        if (
          pending &&
          !result.signedOut &&
          !result.cleanupIncomplete &&
          result.recovery ===
            "none"
        ) {
          result =
            await logoutAllMusicPlatforms();
        }

        setSession(null);
        setLibraryReady(false);
        setConnectionState(
          "disconnected",
        );

        if (result.signedOut) {
          announce(
            "Logged out of Canal on this device.",
          );
          router.replace(
            "/login",
          );

          return;
        }

        const message =
          result.recovery ===
          "signout"
            ? "Spotify cleanup finished, but Canal still needs to finish local sign-out."
            : "Spotify is disconnected, but some account-scoped device cleanup still needs attention.";

        setErrorMessage(
          message,
        );
        setErrorCause(
          new Error(
            message,
          ),
        );
        setStatusMessage(
          result.recovery ===
          "signout"
            ? "Retry Log Out. Completed Spotify cleanup will not run again."
            : "Retry cleanup for this Canal account before Canal signs out.",
        );
        setRecoveryAction(
          result.recovery ===
          "signout"
            ? "signout"
            : "cleanup",
        );
        announce(
          message,
        );
      } catch (error) {
        setErrorCause(
          () => error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not log out safely.",
        );

        if (
          isCanalLogoutIncompleteError(
            error,
          )
        ) {
          setSession(null);
          setLibraryReady(false);
          setConnectionState(
            "disconnected",
          );
          setStatusMessage(
            error.canalSessionStatus ===
            "same-account"
              ? "Spotify cleanup is complete. Retry only the local Canal sign-out."
              : "The Canal account changed. The current account was not logged out.",
          );
          setRecoveryAction(
            error.canalSessionStatus ===
            "same-account"
              ? "signout"
              : null,
          );
        } else {
          setStatusMessage(
            isCanalAccountChangedError(
              error,
            )
              ? "The Canal account changed. No action will run against the replacement account."
              : "Canal could not safely finish this account action. Reload and verify the current account.",
          );
          setRecoveryAction(
            isCanalAccountChangedError(
              error,
            )
              ? null
              : "logout",
          );
        }
        announce(
          error instanceof Error
            ? error.message
            : "Canal could not log out safely.",
        );
      } finally {
        setAccountAction(
          null,
        );
      }
    };

  const confirmDisconnect =
    (): void => {
      if (accountAction) {
        return;
      }

      Alert.alert(
        "Disconnect Spotify?",
        `Remove ${accountName} from this Canal account on this device? Your Spotify account and Canal data are not deleted.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text:
              "Disconnect",
            style:
              "destructive",
            onPress: () => {
              void disconnect();
            },
          },
        ],
      );
    };

  const confirmLogout =
    (): void => {
      if (accountAction) {
        return;
      }

      Alert.alert(
        "Log Out of Canal?",
        "End only this device's current Canal session and disconnect Spotify for this account? Your account and cloud data are not deleted.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Log Out",
            style:
              "destructive",
            onPress: () => {
              void logout();
            },
          },
        ],
      );
    };

  const continueToCanal =
    (): void => {
      router.replace(
        "/(tabs)",
      );
    };

  const recoveryIssue =
    useMemo(
      () => {
        if (
          !errorMessage &&
          connectivityStatus !==
            "offline"
        ) {
          return null;
        }

        return classifyRecoveryIssue(
          errorCause ??
            new Error(
              errorMessage ||
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
        errorCause,
        errorMessage,
      ],
    );

  const showsInlineSpotifyReconnect =
    recoveryIssue?.action ===
    "reconnect-spotify";

  const retryCleanup =
    async (
      allowSignOut: boolean,
    ): Promise<void> => {
      if (accountAction) {
        return;
      }

      setAccountAction(
        "cleanup",
      );
      setRecoveryAction(null);
      setErrorMessage("");
      setErrorCause(null);

      const busyMessage =
        allowSignOut
          ? "Retrying the local Canal sign-out."
          : "Retrying unfinished cleanup for this Canal account.";

      setStatusMessage(
        busyMessage,
      );
      announce(
        busyMessage,
      );

      try {
        const result =
          await retryIncompleteAccountCleanup({
            allowSignOut,
          });

        if (!result) {
          await loadExistingConnection();

          return;
        }

        setSession(null);
        setLibraryReady(false);
        setProviderStateAccountIdentity(
          accountIdentityRef.current,
        );
        setConnectionState(
          "disconnected",
        );

        if (result.signedOut) {
          announce(
            "Logged out of Canal on this device.",
          );
          router.replace(
            "/login",
          );

          return;
        }

        if (
          result.cleanupIncomplete
        ) {
          const needsSignOut =
            result.recovery ===
            "signout";

          const message =
            needsSignOut
              ? "Account cleanup is complete. Retry only the local Canal sign-out."
              : "Some account-scoped device cleanup still needs attention.";

          setErrorMessage(
            message,
          );
          setErrorCause(
            new Error(
              message,
            ),
          );
          setStatusMessage(
            needsSignOut
              ? "Completed Spotify cleanup will not run again."
              : "Retry cleanup. No other Canal account will be changed.",
          );
          setRecoveryAction(
            needsSignOut
              ? "signout"
              : "cleanup",
          );
          announce(
            message,
          );

          return;
        }

        await prepareAuthRequest();

        const message =
          "Spotify account cleanup finished on this device.";

        setErrorMessage("");
        setErrorCause(null);
        setStatusMessage(
          message,
        );
        announce(
          message,
        );
      } catch (error) {
        const message =
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. Cleanup was not applied to the replacement account."
            : error instanceof Error
              ? error.message
              : "Canal could not finish account cleanup.";

        setErrorMessage(
          message,
        );
        setErrorCause(
          () => error,
        );
        setStatusMessage(
          "Check the current account, then retry.",
        );
        setRecoveryAction(
          isCanalAccountChangedError(
            error,
          )
            ? null
            : allowSignOut
              ? "signout"
              : "cleanup",
        );
        announce(
          message,
        );
      } finally {
        setAccountAction(
          null,
        );
      }
    };

  const recover =
    async (): Promise<void> => {
      if (
        recoveryAction ===
        "cleanup"
      ) {
        await retryCleanup(
          false,
        );

        return;
      }

      if (
        recoveryAction ===
        "signout"
      ) {
        await retryCleanup(
          true,
        );

        return;
      }

      if (
        recoveryAction ===
        "logout"
      ) {
        await logout();

        return;
      }

      if (
        recoveryIssue?.action ===
        "reconnect-spotify"
      ) {
        await connect();

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus ===
        "offline"
      ) {
        return;
      }

      if (visibleSession) {
        await syncAgain();
      } else {
        await connect();
      }
    };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityState={{
            disabled:
              accountAction !==
              null,
          }}
          disabled={
            accountAction !==
              null
          }
          onPress={() =>
            safeBack(
              loginMode,
            )
          }
          style={({ pressed }) => [
            styles.backButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.backText
            }
          >
            ‹
          </Text>
        </Pressable>

        <View
          style={
            styles.headerText
          }
        >
          <Text style={styles.title}>
            Music Services
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Connect once. Canal imports your
            taste before Scene creation.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.spotifyCard}>
          <View
            style={
              styles.spotifyMark
            }
          >
            <Text
              style={
                styles.spotifyMarkText
              }
            >
              S
            </Text>
          </View>

          <View
            style={
              styles.serviceText
            }
          >
            <Text
              style={
                styles.serviceName
              }
            >
              Spotify
            </Text>

            <Text
              style={
                styles.serviceStatus
              }
            >
              {visibleConnectionState ===
              "loading"
                ? "Checking connection"

                : visibleConnectionState ===
                    "connecting"
                  ? "Connecting"

                  : visibleConnectionState ===
                      "syncing"
                    ? "Syncing library"

                    : visibleConnectionState ===
                        "connected"
                      ? `Connected as ${accountName}`

                      : "Not connected"}
            </Text>
          </View>

          {visibleConnectionState ===
            "loading" ||
          visibleConnectionState ===
            "connecting" ||
          visibleConnectionState ===
            "syncing" ? (
            <ActivityIndicator />
          ) : (
            <View
              style={[
                styles.statusDot,

                visibleConnectionState ===
                  "connected" &&
                  styles.statusDotConnected,
              ]}
            />
          )}
        </View>

        {visibleConnectionState ===
        "connected" ? (
          <>
            <View
              style={
                styles.libraryStatus
              }
            >
              <Text
                style={
                  styles.libraryStatusTitle
                }
              >
                {visibleLibraryReady
                  ? "Spotify Library ready"
                  : recoveryIssue
                      ?.action ===
                    "reconnect-spotify"
                    ? "Spotify permission needed"
                    : "Spotify Library needs attention"}
              </Text>

              <Text
                style={
                  styles.libraryStatusText
                }
              >
                {visibleLibraryReady
                  ? "Scene Studio will use the saved Spotify snapshot. It will not request or sync account data during generation."
                  : recoveryIssue
                        ?.action ===
                      "reconnect-spotify"
                    ? "Your last snapshot stays available on this device. Reconnect Spotify to refresh it and export playlists."
                    : "Use Sync Spotify Library before creating a Scene."}
              </Text>

              {showsInlineSpotifyReconnect ? (
                <Pressable
                  accessibilityLabel="Reconnect Spotify"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled:
                      connectivityStatus ===
                        "offline" ||
                      !requestReady ||
                      accountAction !==
                        null,
                  }}
                  disabled={
                    connectivityStatus ===
                      "offline" ||
                    !requestReady ||
                    accountAction !==
                      null
                  }
                  onPress={() =>
                    void connect()
                  }
                  style={({ pressed }) => [
                    styles.reconnectButton,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={
                      styles.reconnectButtonText
                    }
                  >
                    Reconnect Spotify
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  connectivityStatus ===
                    "offline" ||
                  !requestReady ||
                  accountAction !==
                    null,
              }}
              disabled={
              connectivityStatus ===
                  "offline" ||
                !requestReady ||
                accountAction !==
                  null
              }
              onPress={() =>
                void syncAgain()
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
                Sync Spotify Library
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  accountAction !==
                  null,
              }}
              disabled={
                accountAction !==
                  null
              }
              onPress={
                continueToCanal
              }
              style={({ pressed }) => [
                styles.continueButton,

                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.continueButtonText
                }
              >
                Continue to Canal
              </Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Disconnect Spotify"
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  accountAction ===
                  "disconnect",
                disabled:
                  accountAction !==
                  null,
              }}
              disabled={
                accountAction !==
                null
              }
              onPress={() =>
                confirmDisconnect()
              }
              style={({ pressed }) => [
                styles.secondaryButton,

                accountAction !==
                  null &&
                  styles.disabled,

                pressed &&
                  styles.pressed,
              ]}
            >
              {accountAction ===
              "disconnect" ? (
                <ActivityIndicator
                  color="#5B4940"
                />
              ) : (
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Disconnect Spotify
                </Text>
              )}
            </Pressable>
          </>
        ) : visibleConnectionState ===
          "disconnected" ? (
          <Pressable
            accessibilityLabel="Connect Spotify"
            accessibilityRole="button"
            accessibilityState={{
              busy:
                !requestReady,
              disabled:
                connectivityStatus ===
                  "offline" ||
                accountAction !==
                  null ||
                !requestReady ||
                recoveryAction ===
                  "cleanup",
            }}
            disabled={
              connectivityStatus ===
                "offline" ||
              accountAction !==
                null ||
              !requestReady ||
              recoveryAction ===
                "cleanup"
            }
            onPress={() =>
              void connect()
            }
            style={({ pressed }) => [
              styles.primaryButton,

              pressed &&
                styles.pressed,
            ]}
            >
            {!requestReady ? (
              <ActivityIndicator
                color="#5B4940"
              />
            ) : (
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Connect Spotify
              </Text>
            )}
          </Pressable>
        ) : null}

        {statusMessage ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.infoBox}
          >
            <Text
              style={
                styles.infoText
              }
            >
              {statusMessage}
            </Text>
          </View>
        ) : null}

        {recoveryIssue &&
        !showsInlineSpotifyReconnect ? (
          <RecoveryNotice
            busy={
              visibleConnectionState ===
                "connecting" ||
              visibleConnectionState ===
                "syncing" ||
              accountAction !==
                null
            }
            issue={
              recoveryIssue
            }
            onAction={
              recover
            }
          />
        ) : null}

        <View style={styles.explanationCard}>
          <Text
            style={
              styles.explanationTitle
            }
          >
            Connection flow
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            1. Spotify authorizes Canal.
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            2. Canal imports the Spotify
            profile and library snapshot.
          </Text>

          <Text
            style={
              styles.explanationText
            }
          >
            3. Scene Studio reads the saved
            snapshot without reconnecting or
            syncing.
          </Text>
        </View>

        <Pressable
          accessibilityLabel="Log Out of Canal"
          accessibilityRole="button"
          accessibilityState={{
            busy:
              accountAction ===
              "logout",
            disabled:
              accountAction !==
              null,
          }}
          disabled={
            accountAction !==
              null
          }
          onPress={() =>
            confirmLogout()
          }
          style={({ pressed }) => [
            styles.logoutButton,

            accountAction !==
              null &&
              styles.disabled,

            pressed &&
              styles.pressed,
          ]}
        >
          {accountAction ===
          "logout" ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text
              style={
                styles.logoutButtonText
              }
            >
              Log Out of Canal
            </Text>
          )}
        </Pressable>

        <Text
          selectable
          style={
            styles.redirectText
          }
        >
          Redirect URI: {redirectUri}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 17,
    },

    backButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
      marginRight: 12,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    headerText: {
      flex: 1,
    },

    title: {
      fontFamily: "Georgia",
      color: canalDynamicColors.text,
      fontSize: 28,
      fontWeight: "900",
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 4,
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 45,
      gap: 13,
    },

    spotifyCard: {
      flexDirection: "row",
      alignItems:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      padding: 17,
    },

    spotifyMark: {
      width: 53,
      height: 53,
      borderRadius: 27,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
      marginRight: 13,
    },

    spotifyMarkText: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
    },

    serviceText: {
      flex: 1,
    },

    serviceName: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    serviceStatus: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },

    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor:
        "#C7C0BA",
    },

    statusDotConnected: {
      backgroundColor:
        "#1DB954",
    },

    libraryStatus: {
      backgroundColor:
        "#ECFAF0",
      borderRadius: 18,
      padding: 15,
    },

    libraryStatusTitle: {
      color: "#176B35",
      fontSize: 14,
      fontWeight: "900",
    },

    libraryStatusText: {
      color: "#39704B",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    reconnectButton: {
      minHeight: 48,
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
      paddingHorizontal: 17,
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: "#1DB954",
    },

    reconnectButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800",
    },

    primaryButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
      paddingHorizontal: 17,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    continueButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#4C46C8",
      paddingHorizontal: 17,
    },

    continueButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    secondaryButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderWidth: 1,
      borderColor:
        "#D8D0CA",
    },

    secondaryButtonText: {
      color: "#4D4743",
      fontSize: 14,
      fontWeight: "800",
    },

    infoBox: {
      backgroundColor:
        "#EFF5FF",
      borderRadius: 16,
      padding: 14,
    },

    infoText: {
      color: "#36567C",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 16,
      padding: 14,
    },

    errorTitle: {
      color: canalDynamicColors.danger,
      fontSize: 13,
      fontWeight: "900",
    },

    errorText: {
      color: "#7E3833",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    explanationCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 20,
      padding: 17,
    },

    explanationTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 8,
    },

    explanationText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 3,
    },

    logoutButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#D8AAA5",
      backgroundColor:
        "#FFF8F7",
    },

    logoutButtonText: {
      color: canalDynamicColors.danger,
      fontSize: 14,
      fontWeight: "900",
    },

    redirectText: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      lineHeight: 14,
      textAlign: "center",
      marginTop: 5,
    },

    disabled: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
