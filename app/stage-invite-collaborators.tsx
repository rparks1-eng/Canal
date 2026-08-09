import {
  Stack,
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  loadProfileConnections,
} from "../lib/profile-social";
import type {
  ProfileConnection,
} from "../lib/profile-social";
import {
  inviteStageCollaborators,
} from "../lib/stage-collaboration-invites";
import {
  useAuth,
} from "../providers/auth-provider";
import {
  useConnectivity,
} from "../providers/connectivity-provider";
import {
  canalDynamicColors,
} from "../theme/canal-dynamic-colors";

function first(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

export default function StageInviteCollaboratorsScreen() {
  const params =
    useLocalSearchParams<{
      stageId?: string | string[];
    }>();
  const stageId =
    first(params.stageId);
  const {
    user,
    accountEpoch,
    sessionGeneration,
  } = useAuth();
  const { status } =
    useConnectivity();
  const accountKey = `${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration}`;
  const accountKeyRef =
    useRef(accountKey);
  accountKeyRef.current =
    accountKey;

  const [friends, setFriends] =
    useState<ProfileConnection[]>([]);
  const [selected, setSelected] =
    useState<Set<string>>(
      new Set(),
    );
  const [loading, setLoading] =
    useState(true);
  const [sending, setSending] =
    useState(false);
  const [message, setMessage] =
    useState("");

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const requestedAccount =
      accountKey;

    void loadProfileConnections(
      user.id,
      {
        limit: 100,
      },
    )
      .then((connections) => {
        if (
          accountKeyRef.current !==
          requestedAccount
        ) {
          return;
        }

        const followerIds =
          new Set(
            connections.followers.map(
              (connection) =>
                connection.profile.id,
            ),
          );

        setFriends(
          connections.following.filter(
            (connection) =>
              followerIds.has(
                connection.profile.id,
              ),
          ),
        );
      })
      .catch(() => {
        if (
          accountKeyRef.current ===
          requestedAccount
        ) {
          setMessage(
            "Canal could not load your mutual friends.",
          );
        }
      })
      .finally(() => {
        if (
          accountKeyRef.current ===
          requestedAccount
        ) {
          setLoading(false);
        }
      });
  }, [accountKey, user?.id]);

  const selectedCount =
    selected.size;

  const orderedFriends =
    useMemo(
      () =>
        [...friends].sort((a, b) =>
          a.profile.displayName.localeCompare(
            b.profile.displayName,
          ),
        ),
      [friends],
    );

  function toggle(userId: string) {
    setSelected((current) => {
      const next =
        new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < 25) {
        next.add(userId);
      }
      return next;
    });
  }

  function continueToLobby() {
    router.replace({
      pathname:
        "/stage-lobby/[stageId]",
      params: { stageId },
    });
  }

  async function send(): Promise<void> {
    if (
      !stageId ||
      selectedCount < 1 ||
      sending ||
      status !== "online"
    ) {
      return;
    }

    const requestedAccount =
      accountKey;
    setSending(true);
    setMessage("");

    try {
      await inviteStageCollaborators(
        stageId,
        [...selected],
      );
      if (
        accountKeyRef.current ===
        requestedAccount
      ) {
        continueToLobby();
      }
    } catch (error) {
      if (
        accountKeyRef.current ===
        requestedAccount
      ) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Canal could not send these invitations.",
        );
      }
    } finally {
      if (
        accountKeyRef.current ===
        requestedAccount
      ) {
        setSending(false);
      }
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScrollView
        contentContainerStyle={
          styles.content
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() =>
              router.back()
            }
            style={styles.iconButton}
          >
            <Text style={styles.back}>
              ‹
            </Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            Invite collaborators
          </Text>
          <Pressable
            accessibilityLabel="Skip collaborator invitations"
            accessibilityRole="button"
            onPress={continueToLobby}
            style={styles.iconButton}
          >
            <Text style={styles.skip}>
              Skip
            </Text>
          </Pressable>
        </View>

        <Text style={styles.title}>
          Build this Stage together.
        </Text>
        <Text style={styles.subtitle}>
          Mutual Canal friends receive an Activity invitation. After accepting, they can add a Scene, share permitted connected-music context, or create their own Scene take.
        </Text>

        {loading ? (
          <ActivityIndicator
            color={
              canalDynamicColors.mint
            }
          />
        ) : orderedFriends.length < 1 ? (
          <Text style={styles.message}>
            Follow each other on Canal to invite someone directly. You can still share the Stage code from the lobby.
          </Text>
        ) : (
          orderedFriends.map(
            (friend) => {
              const chosen =
                selected.has(
                  friend.profile.id,
                );
              return (
                <Pressable
                  key={friend.profile.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: chosen,
                  }}
                  onPress={() =>
                    toggle(
                      friend.profile.id,
                    )
                  }
                  style={styles.friend}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {friend.profile.displayName
                        .split(/\s+/u)
                        .map(
                          (part) =>
                            part[0],
                        )
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.name}>
                      {friend.profile.displayName}
                    </Text>
                    <Text style={styles.handle}>
                      @{friend.profile.handle}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.check,
                      chosen &&
                        styles.checkSelected,
                    ]}
                  />
                </Pressable>
              );
            },
          )
        )}

        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            style={styles.message}
          >
            {message}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy: sending,
            disabled:
              selectedCount < 1 ||
              sending ||
              status !== "online",
          }}
          disabled={
            selectedCount < 1 ||
            sending ||
            status !== "online"
          }
          onPress={() => void send()}
          style={[
            styles.primary,
            (
              selectedCount < 1 ||
              sending ||
              status !== "online"
            ) && styles.disabled,
          ]}
        >
          {sending ? (
            <ActivityIndicator
              color="#0C1714"
            />
          ) : (
            <Text style={styles.primaryText}>
              Invite {selectedCount || "friends"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 110,
  },
  header: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  back: {
    color: canalDynamicColors.text,
    fontSize: 34,
  },
  skip: {
    color: canalDynamicColors.mint,
    fontSize: 13,
    fontWeight: "800",
  },
  headerTitle: {
    color: canalDynamicColors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  title: {
    color: canalDynamicColors.text,
    fontFamily: "Georgia",
    fontSize: 29,
    fontWeight: "900",
  },
  subtitle: {
    color: canalDynamicColors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  friend: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#29312E",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#293833",
  },
  avatarText: {
    color: canalDynamicColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  grow: { flex: 1 },
  name: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  handle: {
    color: canalDynamicColors.muted,
    fontSize: 12,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#64706B",
  },
  checkSelected: {
    borderColor: canalDynamicColors.mint,
    backgroundColor: canalDynamicColors.mint,
  },
  message: {
    color: canalDynamicColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  primary: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: canalDynamicColors.mint,
  },
  primaryText: {
    color: "#0C1714",
    fontSize: 15,
    fontWeight: "900",
  },
  disabled: { opacity: 0.45 },
});
