import * as AuthSession from "expo-auth-session";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { CanalAlert } from "../lib/canal-alert";

import {
    disconnectSpotifyOnly,
    isCanalAccountChangedError,
    retryIncompleteAccountCleanup,
} from "../lib/app-session";

import {
    acquireSpotifyAuthOperationLease,
    acquireSpotifyAuthPreparationLease,
    clearSpotifyReturnRoute,
    createSpotifyCleanupStatusEvent,
    createSpotifyLockedStatusEvent,
    createSpotifyAuthSurfaceInstanceId,
    isSpotifyAuthOperationLeaseCurrent,
    isSpotifyAuthPreparationLeaseCurrent,
    isSpotifyAuthPreparationOwnerCurrent,
    isSameSpotifyAuthAttempt,
    isSpotifyAuthAttemptAfterProviderRotation,
    prepareSpotifyAuthAttempt,
    promptSpotifyAuthAttempt,
    rebindSpotifyAuthAttemptAuthority,
    releaseSpotifyAuthOperationLease,
    releaseSpotifyAuthPreparationLease,
    SpotifyAuthStateMismatchError,
    SpotifyReturnRoute,
} from "../lib/spotify-auth-return";

import type {
    PreparedSpotifyAuthAttempt,
    SpotifyAuthAttempt,
    SpotifyAuthOperationLease,
    SpotifyAuthPreparationLease,
    SpotifyAuthPreparationOwner,
    SpotifyAuthStatusEvent,
} from "../lib/spotify-auth-return";
import {
    assertSpotifyAccountScopeCurrent,
    fetchSpotifyProfile,
    getValidSpotifySession,
    getSpotifyErrorMessage,
    saveSpotifySession,
    SpotifyProviderCleanupIncompleteError,
    SpotifyProfile,
    SpotifySession,
} from "../lib/spotify-auth";

import type {
    SpotifyCanalAccountGuard,
} from "../lib/spotify-auth";
import {
    getSpotifyClientId,
    getSpotifyRedirectUri,
    SPOTIFY_SCOPES,
    spotifyDiscovery,
} from "../lib/spotify-config";

import {
    useAuth,
} from "../providers/auth-provider";

WebBrowser.maybeCompleteAuthSession();

type SpotifyConnectionState = {
  profile: SpotifyProfile | null;
  isLoading: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  message: string;
  requestReady: boolean;
  statusEvent:
    SpotifyAuthStatusEvent | null;
  cleanupRecoveryRequired: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  changeAccount: () => Promise<void>;
  reload: () => Promise<void>;
  retryCleanup: () => Promise<void>;
};

export function useSpotifyConnection(
  returnRoute: SpotifyReturnRoute,
): SpotifyConnectionState {
  const {
    accountEpoch,
    user,
  } = useAuth();

  const accountIdentity =
    `${user?.id ?? "signed-out"}:${accountEpoch}`;

  const accountIdentityRef =
    useRef(
      accountIdentity,
    );

  accountIdentityRef.current =
    accountIdentity;

  const requestEpoch =
    useRef(0);

  const spotifyClientId =
    getSpotifyClientId();

  const spotifyRedirectUri =
    getSpotifyRedirectUri();

  const [
    profile,
    setProfile,
  ] =
    useState<SpotifyProfile | null>(
      null,
    );

  const [
    profileAccountIdentity,
    setProfileAccountIdentity,
  ] =
    useState<string | null>(
      null,
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    isConnecting,
    setIsConnecting,
  ] = useState(false);

  const [
    isDisconnecting,
    setIsDisconnecting,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    statusEvent,
    setStatusEvent,
  ] =
    useState<SpotifyAuthStatusEvent | null>(
      null,
    );

  const processedCode =
    useRef<string | null>(null);

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
        "connect-music-hook",
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
    cleanupRecoveryRequired,
    setCleanupRecoveryRequired,
  ] = useState(false);

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
      setStatusEvent(null);

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

      if (!spotifyClientId) {
        releasePreparation();

        return null;
      }

      try {
        const prepared =
          await prepareSpotifyAuthAttempt(
            returnRoute,
            {
              clientId:
                spotifyClientId,
              responseType:
                AuthSession
                  .ResponseType
                  .Code,
              redirectUri:
                spotifyRedirectUri,
              scopes: [
                ...SPOTIFY_SCOPES,
              ],
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
        if (
          accountIdentityRef.current ===
            preparationIdentity &&
          ownsPreparation()
        ) {
          setRequestReady(false);
        }

        return null;
      } finally {
        releasePreparation();
      }
    }, [
      accountIdentity,
      returnRoute,
      spotifyClientId,
      spotifyRedirectUri,
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
      setStatusEvent(null);

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

    setStatusEvent(null);

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

  const reload =
    useCallback(async () => {
      const expectedIdentity =
        accountIdentity;

      const expectedEpoch =
        requestEpoch.current +
        1;

      requestEpoch.current =
        expectedEpoch;

      const canCommit =
        (): boolean =>
          accountIdentityRef.current ===
            expectedIdentity &&
          requestEpoch.current ===
            expectedEpoch;

      if (
        pendingAuthAccount.current &&
        pendingAuthAccount
          .current
          .accountIdentity !==
          expectedIdentity
      ) {
        releaseSpotifyAuthOperationLease(
          pendingAuthAccount.current
            .operationLease,
        );
        pendingAuthAccount.current =
          null;
        processedCode.current =
          null;
        setIsConnecting(false);
      }

      try {
        setIsLoading(true);
        setProfile(null);
        setProfileAccountIdentity(
          null,
        );
        setMessage(
          "Loading Spotify for the current Canal account.",
        );

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

          setCleanupRecoveryRequired(
            true,
          );
          setProfile(null);
          setProfileAccountIdentity(
            expectedIdentity,
          );
          setMessage(
            "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.",
          );
          setStatusEvent(
            createSpotifyCleanupStatusEvent(
              pendingCleanup
                .cleanupIncomplete,
              expectedIdentity,
            ),
          );

          return;
        }

        setCleanupRecoveryRequired(
          false,
        );

        const storedSession =
          await getValidSpotifySession();

        if (!canCommit()) {
          return;
        }

        setProfile(
          storedSession?.profile ??
            null,
        );
        setProfileAccountIdentity(
          expectedIdentity,
        );
        setMessage("");
      } catch (error) {
        if (!canCommit()) {
          return;
        }

        console.error(
          "Unable to load Spotify connection:",
          error,
        );

        setProfile(null);
        setProfileAccountIdentity(
          expectedIdentity,
        );
        setMessage(
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. Spotify is loading only for the current account."
            : "Canal could not load Spotify for this account.",
        );
      } finally {
        if (canCommit()) {
          setIsLoading(false);
        }
      }
    }, [
      accountIdentity,
      retirePreparedAuthRequest,
    ]);

  useFocusEffect(
    useCallback(() => {
      void reload();

      return () => {
        requestEpoch.current +=
          1;
      };
    }, [reload]),
  );

  const connect =
    useCallback(async () => {
      if (!spotifyClientId) {
        CanalAlert.alert(
          "Spotify Client ID missing",
          "Add EXPO_PUBLIC_SPOTIFY_CLIENT_ID to the project's .env.local file and fully reload Canal.",
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
        CanalAlert.alert(
          "Spotify is still loading",
          "Try the connection button again.",
        );

        void prepareAuthRequest();

        return;
      }

      const prepared =
        preparedEntry.prepared;

      const attempt =
        prepared.attempt;

      const lifecycleToken =
        authInstanceLifecycle.current
          .epoch;

      if (
        !authInstanceLifecycle.current
          .mounted ||
        accountIdentityRef.current !==
          accountIdentity
      ) {
        return;
      }

      const operationLease =
        acquireSpotifyAuthOperationLease(
          preparedEntry
            .preparationLease,
          attempt,
          authSurfaceInstanceId
            .current,
          lifecycleToken,
        );

      const accountGuard:
        SpotifyCanalAccountGuard = {
        ownerId:
          attempt.ownerId,
        accountGeneration:
          attempt
            .spotifyAccountGeneration,
        configured: true,
      };

      let currentAttemptAuthority =
        attempt;

      let cleanupBlocked =
        false;

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

      const isCurrentAttempt =
        (): boolean => {
          const pending =
            pendingAuthAccount.current;

          return (
            authInstanceLifecycle.current
              .mounted &&
            authInstanceLifecycle.current
              .epoch ===
              lifecycleToken &&
            Boolean(pending) &&
            pending
              ?.accountIdentity ===
              accountIdentityRef.current &&
            pending
              .accountIdentity ===
              accountIdentity &&
            pending.lifecycleToken ===
              lifecycleToken &&
            pending.operationLease ===
              operationLease &&
            isSpotifyAuthOperationLeaseCurrent(
              operationLease,
            ) &&
            isSameSpotifyAuthAttempt(
              pending.attempt,
              attempt,
            )
          );
        };

      const assertCurrentAttempt =
        async (): Promise<void> => {
          if (
            !isCurrentAttempt()
          ) {
            throw new Error(
              "The Canal account changed. Start Spotify connection again with the current account.",
            );
          }

          await assertSpotifyAccountScopeCurrent(
            currentAttemptAuthority,
          );

          if (
            !isCurrentAttempt()
          ) {
            throw new Error(
              "The Canal account changed. Start Spotify connection again with the current account.",
            );
          }
        };

      const clearOwnedReturnRoute =
        async (): Promise<void> => {
          await assertCurrentAttempt();
          await clearSpotifyReturnRoute(
            attempt,
          );
          await assertCurrentAttempt();
        };

      try {
        await assertCurrentAttempt();

        const promptPromise =
          promptSpotifyAuthAttempt(
            prepared,
            spotifyDiscovery,
          );

        if (!isCurrentAttempt()) {
          return;
        }

        setCleanupRecoveryRequired(
          false,
        );
        setMessage("");
        setStatusEvent(null);
        setIsConnecting(true);

        const promptResult =
          await promptPromise;

        await assertCurrentAttempt();

        const response =
          promptResult.response;

        if (
          response.type ===
            "cancel" ||
          response.type ===
            "dismiss" ||
          response.type ===
            "locked"
        ) {
          await clearOwnedReturnRoute();

          if (
            response.type ===
              "locked" &&
            isCurrentAttempt()
          ) {
            const lockedEvent =
              createSpotifyLockedStatusEvent(
                attempt,
                accountIdentity,
              );

            setMessage(
              lockedEvent.message,
            );
            setStatusEvent(
              lockedEvent,
            );
          }

          return;
        }

        if (
          response.type ===
          "error"
        ) {
          await clearOwnedReturnRoute();

          if (
            isCurrentAttempt()
          ) {
            CanalAlert.alert(
              "Spotify connection failed",
              response.error?.message ??
                response.params
                  ?.error_description ??
                "Spotify did not complete the connection.",
            );
          }

          return;
        }

        if (
          response.type !==
          "success"
        ) {
          return;
        }

        const authorizationCode =
          response.params.code;

        if (
          !authorizationCode
        ) {
          throw new Error(
            "Spotify did not return an authorization code.",
          );
        }

        const processedAttemptCode =
          `${attempt.attemptId}:${authorizationCode}`;

        if (
          processedCode.current ===
          processedAttemptCode
        ) {
          return;
        }

        processedCode.current =
          processedAttemptCode;

        if (
          !promptResult.codeVerifier
        ) {
          throw new Error(
            "Canal could not find the Spotify security verifier.",
          );
        }

        await assertCurrentAttempt();

        const tokenResponse =
          await AuthSession.exchangeCodeAsync(
            {
              clientId:
                spotifyClientId,
              code:
                authorizationCode,
              redirectUri:
                spotifyRedirectUri,
              extraParams: {
                code_verifier:
                  promptResult
                    .codeVerifier,
              },
            },
            spotifyDiscovery,
          );

        await assertCurrentAttempt();

        const connectedProfile =
          await fetchSpotifyProfile(
            tokenResponse.accessToken,
          );

        await assertCurrentAttempt();

        const expiresIn =
          tokenResponse.expiresIn ??
          3600;

        const session:
          SpotifySession = {
          accessToken:
            tokenResponse.accessToken,
          refreshToken:
            tokenResponse.refreshToken,
          expiresIn,
          expiresAt:
            Date.now() +
            expiresIn * 1000 -
            60_000,
          scope:
            tokenResponse.scope ??
            SPOTIFY_SCOPES.join(
              " ",
            ),
          tokenType:
            tokenResponse.tokenType ??
            "Bearer",
          profile:
            connectedProfile,
        };

        const savedAccountGuard =
          await saveSpotifySession(
            session,
            {
              syncLibrary: true,
              accountGuard:
                accountGuard,
              operationCommitGuard:
                isCurrentAttempt,
            },
          );

        if (!isCurrentAttempt()) {
          throw new Error(
            "The Canal account changed. Start Spotify connection again with the current account.",
          );
        }

        currentAttemptAuthority =
          rebindSpotifyAuthAttemptAuthority(
            attempt,
            savedAccountGuard,
          );

        const pendingAfterSave =
          pendingAuthAccount.current;

        if (
          !pendingAfterSave ||
          !isSameSpotifyAuthAttempt(
            pendingAfterSave.attempt,
            attempt,
          )
        ) {
          throw new Error(
            "The Canal account changed. Start Spotify connection again with the current account.",
          );
        }

        pendingAfterSave.accountGuard =
          savedAccountGuard;

        await assertCurrentAttempt();

        setProfile(
          connectedProfile,
        );
        setProfileAccountIdentity(
          accountIdentity,
        );
        setMessage(
          "Spotify connected successfully.",
        );

        await clearOwnedReturnRoute();
      } catch (error) {
        if (!isCurrentAttempt()) {
          return;
        }

        if (
          error instanceof
            SpotifyProviderCleanupIncompleteError &&
          error.accountGuard
            .ownerId ===
            attempt.ownerId &&
          error.accountGuard
            .accountGeneration ===
            attempt
              .spotifyAccountGeneration +
              1 &&
          error.cleanupRecord
            .ownerId ===
            attempt.ownerId &&
          error.cleanupRecord
            .sessionGeneration ===
            attempt.sessionGeneration &&
          error.cleanupRecord
            .sourceSpotifyAccountGeneration ===
            attempt
              .spotifyAccountGeneration &&
          error.cleanupRecord
            .spotifyAccountGeneration ===
            error.accountGuard
              .accountGeneration
        ) {
          const pending =
            pendingAuthAccount.current;

          currentAttemptAuthority =
            rebindSpotifyAuthAttemptAuthority(
              attempt,
              error.accountGuard,
            );

          if (pending) {
            pending.accountGuard =
              error.accountGuard;
          }

          await assertCurrentAttempt();
          await clearOwnedReturnRoute();

          cleanupBlocked =
            true;
          setProfile(null);
          setProfileAccountIdentity(
            accountIdentity,
          );
          setCleanupRecoveryRequired(
            true,
          );
          setMessage(
            "Spotify account cleanup must finish before another account can connect. Retry cleanup for this Canal account.",
          );
          setStatusEvent(
            createSpotifyCleanupStatusEvent(
              error.cleanupRecord,
              accountIdentity,
            ),
          );

          return;
        }

        await clearOwnedReturnRoute();

        if (
          error instanceof
          SpotifyAuthStateMismatchError
        ) {
          return;
        }

        console.error(
          "Unable to open Spotify:",
          error,
        );

        setProfile(null);
        setProfileAccountIdentity(
          null,
        );

        CanalAlert.alert(
          "Unable to open Spotify",
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. Spotify was not connected to the replacement account."
            : getSpotifyErrorMessage(
                error,
              ),
        );
      } finally {
        if (isCurrentAttempt()) {
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

          setIsConnecting(false);

          if (!cleanupBlocked) {
            void prepareAuthRequest();
          }
        }
      }
  }, [
    accountIdentity,
    prepareAuthRequest,
    spotifyClientId,
    spotifyRedirectUri,
    user?.id,
  ]);

  const retryCleanup =
    useCallback(async () => {
      if (
        !cleanupRecoveryRequired ||
        isConnecting ||
        isDisconnecting
      ) {
        return;
      }

      const recoveryIdentity =
        accountIdentity;

      setIsConnecting(true);
      setMessage(
        "Retrying Spotify account cleanup for this Canal account.",
      );

      try {
        const result =
          await retryIncompleteAccountCleanup({
            allowSignOut:
              false,
          });

        if (
          accountIdentityRef.current !==
          recoveryIdentity
        ) {
          return;
        }

        if (
          result
            ?.cleanupIncomplete
        ) {
          setCleanupRecoveryRequired(
            true,
          );
          setMessage(
            "Spotify account cleanup still needs attention. Retry only for this Canal account.",
          );
          setStatusEvent(
            createSpotifyCleanupStatusEvent(
              result.cleanupIncomplete,
              recoveryIdentity,
            ),
          );

          return;
        }

        setCleanupRecoveryRequired(
          false,
        );
        setMessage(
          "Spotify account cleanup finished. You can connect an account now.",
        );

        await prepareAuthRequest();

        if (
          accountIdentityRef.current !==
          recoveryIdentity
        ) {
          return;
        }
      } catch (error) {
        if (
          accountIdentityRef.current !==
          recoveryIdentity
        ) {
          return;
        }

        setCleanupRecoveryRequired(
          true,
        );
        setMessage(
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. Cleanup was not applied to the replacement account."
            : "Canal could not finish Spotify cleanup. Retry for this Canal account.",
        );
      } finally {
        if (
          accountIdentityRef.current ===
          recoveryIdentity
        ) {
          setIsConnecting(false);
        }
      }
    }, [
      accountIdentity,
      cleanupRecoveryRequired,
      isConnecting,
      isDisconnecting,
      prepareAuthRequest,
    ]);

  const disconnect =
    useCallback(async () => {
      if (isDisconnecting) {
        return;
      }

      const actionIdentity =
        accountIdentity;

      try {
        setIsDisconnecting(true);

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

        processedCode.current =
          null;

        setProfile(null);
        setProfileAccountIdentity(
          accountIdentityRef.current,
        );

        setMessage(
          result.cleanupIncomplete
            ? "Spotify is disconnected, but account-scoped device cleanup still needs attention."
            : "Spotify disconnected.",
        );

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
      } catch (error) {
        if (
          accountIdentityRef.current !==
          actionIdentity
        ) {
          return;
        }

        console.error(
          "Unable to disconnect Spotify:",
          error,
        );

        CanalAlert.alert(
          "Unable to disconnect",
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. The replacement account was not disconnected."
            : "Canal could not remove the Spotify connection.",
        );

      } finally {
        if (
          accountIdentityRef.current ===
          actionIdentity
        ) {
          setIsDisconnecting(false);
        }
      }
    }, [
      accountIdentity,
      isDisconnecting,
      prepareAuthRequest,
      retirePreparedAuthRequest,
    ]);

  const changeAccount =
    useCallback(async () => {
      const actionIdentity =
        accountIdentity;

      let shouldConnect =
        false;

      try {
        setIsDisconnecting(true);
        setMessage("");

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

        processedCode.current =
          null;

        setProfile(null);
        setProfileAccountIdentity(
          accountIdentityRef.current,
        );

        const replacement =
          await prepareAuthRequest();

        if (
          accountIdentityRef.current !==
          actionIdentity
        ) {
          return;
        }

        if (
          !replacement ||
          (
            retired &&
            !isSpotifyAuthAttemptAfterProviderRotation(
              retired.attempt,
              replacement.attempt,
            )
          )
        ) {
          await retirePreparedAuthRequest();

          setMessage(
            "Spotify disconnected. Canal is preparing a fresh secure connection request.",
          );

          return;
        }

        if (
          result.cleanupIncomplete
        ) {
          await retirePreparedAuthRequest();

          setMessage(
            "Spotify is disconnected, but account-scoped device cleanup must finish before connecting another account.",
          );

          return;
        }

        shouldConnect =
          true;
      } catch (error) {
        if (
          accountIdentityRef.current !==
          actionIdentity
        ) {
          return;
        }

        console.error(
          "Unable to clear Spotify account:",
          error,
        );

        CanalAlert.alert(
          "Unable to change account",
          isCanalAccountChangedError(
            error,
          )
            ? "The Canal account changed. Spotify was not changed for the replacement account."
            : "Canal could not remove the current Spotify account.",
        );

        return;
      } finally {
        if (
          accountIdentityRef.current ===
          actionIdentity
        ) {
          setIsDisconnecting(false);
        }
      }

      if (
        shouldConnect &&
        accountIdentityRef.current ===
          actionIdentity
      ) {
        await connect();
      }
    }, [
      accountIdentity,
      connect,
      prepareAuthRequest,
      retirePreparedAuthRequest,
    ]);

  const visibleProfile =
    profileAccountIdentity ===
    accountIdentity
      ? profile
      : null;

  const visibleStatusEvent =
    statusEvent?.accountIdentity ===
      accountIdentity
      ? statusEvent
      : null;

  return {
    profile:
      visibleProfile,
    isLoading,
    isConnecting,
    isDisconnecting,
    message,
    cleanupRecoveryRequired,
    requestReady:
      requestReady,
    statusEvent:
      visibleStatusEvent,
    connect,
    disconnect,
    changeAccount,
    reload,
    retryCleanup,
  };
}
