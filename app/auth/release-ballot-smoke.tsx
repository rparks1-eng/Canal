import {
  useMemo,
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
  Redirect,
  Stack,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  CreatorReleaseCard,
} from "../../components/CreatorReleaseCard";

import {
  contributorConsentLabel,
  creatorReleaseRoleCopy,
  creatorReleaseVoteCopy,
  creatorReleaseVotePercent,
  rankCreatorReleaseResults,
} from "../../lib/creator-release-interface";

import type {
  CreatorRelease,
  CreatorReleaseResultItem,
} from "../../lib/creator-releases";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import smokeCases from "../../fixtures/release-ballot-smoke-cases.json";

type SmokeCase = Readonly<{
  id: string;
  expectedText:
    readonly string[];
  relaunch?: boolean;
}>;

type ActionButtonProps = Readonly<{
  disabled?: boolean;
  label: string;
  hint: string;
  role?:
    | "button"
    | "radio";
  selected?: boolean;
  secondary?: boolean;
}>;

export const RELEASE_BALLOT_SMOKE_MIN_ACTION_SIZE =
  48;

export function releaseBallotSmokeActionAccessibility(
  role:
    | "button"
    | "radio",
  selected = false,
  disabled = false,
) {
  return {
    role,
    state: {
      checked:
        role === "radio"
          ? selected
          : undefined,
      disabled,
    },
  } as const;
}

const RELEASE_BALLOT_SMOKE_ENABLED =
  __DEV__ &&
  process.env
    .EXPO_PUBLIC_CANAL_RELEASE_BALLOT_SMOKE ===
    "1";

const CASES =
  smokeCases as readonly SmokeCase[];

const OPEN_OWNER_RELEASE: CreatorRelease = {
  id:
    "11111111-1111-4111-8111-111111111111",
  ownerId:
    "22222222-2222-4222-8222-222222222222",
  collectionId:
    "33333333-3333-4333-8333-333333333333",
  title:
    "Night Drive Sessions",
  description:
    "Three frozen Scenes ready for a private listener ballot.",
  status: "open",
  openedAt:
    "2026-07-29T12:00:00.000Z",
  closedAt: null,
  winnerSceneId: null,
  createdAt:
    "2026-07-29T11:00:00.000Z",
  updatedAt:
    "2026-07-29T12:00:00.000Z",
};

const CLOSED_AVAILABLE_RELEASE: CreatorRelease = {
  ...OPEN_OWNER_RELEASE,
  id:
    "44444444-4444-4444-8444-444444444444",
  ownerId:
    "55555555-5555-4555-8555-555555555555",
  title:
    "After Hours Vol. 2",
  description:
    "A finished ballot with aggregate-only results.",
  status: "closed",
  closedAt:
    "2026-07-29T14:00:00.000Z",
  winnerSceneId:
    "66666666-6666-4666-8666-666666666666",
  updatedAt:
    "2026-07-29T14:00:00.000Z",
};

const RESULT_ITEMS: CreatorReleaseResultItem[] = [
  {
    releaseId:
      CLOSED_AVAILABLE_RELEASE.id,
    sceneId:
      "66666666-6666-4666-8666-666666666666",
    sceneRevision: 7,
    position: 0,
    title:
      "Midnight Canal",
    voteCount: 5,
    isWinner: true,
  },
  {
    releaseId:
      CLOSED_AVAILABLE_RELEASE.id,
    sceneId:
      "77777777-7777-4777-8777-777777777777",
    sceneRevision: 3,
    position: 1,
    title:
      "Neon Water",
    voteCount: 2,
    isWinner: false,
  },
  {
    releaseId:
      CLOSED_AVAILABLE_RELEASE.id,
    sceneId:
      "88888888-8888-4888-8888-888888888888",
    sceneRevision: 4,
    position: 2,
    title:
      "Last Train Home",
    voteCount: 1,
    isWinner: false,
  },
];

const OFFLINE_ISSUE: RecoveryIssue = {
  kind: "offline",
  title:
    "Release ballots are offline",
  message:
    "Reconnect before loading a fresh ballot or changing anything.",
  action: "retry",
  actionLabel:
    "Try again",
};

const SERVICE_ISSUE: RecoveryIssue = {
  kind: "service",
  title:
    "Release ballots unavailable",
  message:
    "Canal could not load a fresh snapshot. Your previous ballot stays inactive.",
  action: "retry",
  actionLabel: "Retry",
};

const BLOCKED_ISSUE: RecoveryIssue = {
  kind: "service",
  title:
    "Release unavailable",
  message:
    "This ballot is unavailable. Private release details stay hidden.",
  action: "retry",
  actionLabel:
    "Back to releases",
};

function ActionButton(
  props: ActionButtonProps,
) {
  const accessibility =
    releaseBallotSmokeActionAccessibility(
      props.role ??
        "button",
      Boolean(
        props.selected,
      ),
      Boolean(
        props.disabled,
      ),
    );

  return (
    <Pressable
      accessibilityHint={
        props.hint
      }
      accessibilityLabel={
        props.label
      }
      accessibilityRole={
        accessibility.role
      }
      accessibilityState={
        accessibility.state
      }
      disabled={
        accessibility
          .state
          .disabled
      }
      onPress={() => {
        if (
          accessibility
            .state
            .disabled
        ) {
          return;
        }
      }}
      style={({
        pressed,
      }) => [
        styles.actionButton,
        props.secondary &&
          styles.secondaryButton,
        props.selected &&
          styles.selectedButton,
        props.disabled &&
          styles.disabledButton,
        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          props.secondary &&
            styles.secondaryButtonText,
          props.selected &&
            styles.selectedButtonText,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function SmokeRecoveryNotice(
  props: Readonly<{
    issue: RecoveryIssue;
  }>,
) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={
        styles.recoveryCard
      }
    >
      <Text
        selectable
        style={
          styles.recoveryTitle
        }
      >
        {props.issue.title}
      </Text>

      <Text
        selectable
        style={
          styles.recoveryMessage
        }
      >
        {props.issue.message}
      </Text>

      <ActionButton
        hint="Runs this isolated recovery action"
        label={
          props.issue
            .actionLabel
        }
      />
    </View>
  );
}

function FixtureNotice() {
  return (
    <View
      accessibilityLabel="Isolated fixture. No account or network."
      style={
        styles.fixtureNotice
      }
    >
      <Text
        style={
          styles.fixtureNoticeText
        }
      >
        ISOLATED FIXTURE · NO ACCOUNT OR NETWORK
      </Text>
    </View>
  );
}

function RolePanel(
  props: Readonly<{
    role:
      | "owner"
      | "contributor"
      | "listener";
    status:
      | "draft"
      | "open"
      | "closed";
  }>,
) {
  const copy =
    creatorReleaseRoleCopy(
      props.role,
      props.status,
    );

  return (
    <View
      accessibilityLabel={`${copy.label}. ${copy.title} ${copy.detail}`}
      style={
        styles.roleCard
      }
    >
      <Text
        style={
          styles.roleLabel
        }
      >
        {copy.label}
      </Text>

      <Text
        style={
          styles.panelTitle
        }
      >
        {copy.title}
      </Text>

      <Text
        style={
          styles.body
        }
      >
        {copy.detail}
      </Text>
    </View>
  );
}

function SceneChoice(
  props: Readonly<{
    sceneId: string;
    title: string;
    selectedSceneId:
      | string
      | null;
  }>,
) {
  const copy =
    creatorReleaseVoteCopy(
      props.selectedSceneId,
      props.sceneId,
    );

  return (
    <View
      style={
        styles.sceneRow
      }
    >
      <View
        style={
          styles.sceneCopy
        }
      >
        <Text
          style={
            styles.sceneTitle
          }
        >
          {props.title}
        </Text>

        <Text
          style={
            styles.sceneMeta
          }
        >
          Frozen revision
        </Text>
      </View>

      <ActionButton
        disabled={
          copy.selected
        }
        hint={copy.hint}
        label={copy.label}
        role="radio"
        selected={
          copy.selected
        }
      />
    </View>
  );
}

function BrowseScenario() {
  return (
    <View
      style={
        styles.section
      }
    >
      <Text
        style={
          styles.sectionTitle
        }
      >
        Browse ballots
      </Text>

      <View
        accessibilityLabel="Release status filters"
        accessibilityRole="radiogroup"
        style={
          styles.filterRow
        }
      >
        {[
          "All",
          "Open",
          "Closed",
        ].map(
          (
            label,
            index,
          ) => (
            <Pressable
              accessibilityLabel={`Show ${label.toLowerCase()} release ballots`}
              accessibilityRole="radio"
              accessibilityState={{
                checked:
                  index ===
                  0,
                disabled:
                  false,
              }}
              key={
                label
              }
              onPress={() => undefined}
              style={[
                styles.filter,
                index ===
                  0 &&
                  styles.activeFilter,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  index ===
                    0 &&
                    styles.activeFilterText,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      <Text
        style={
          styles.groupLabel
        }
      >
        Your releases
      </Text>

      <View
        pointerEvents="none"
      >
        <CreatorReleaseCard
          isOwner
          release={
            OPEN_OWNER_RELEASE
          }
        />
      </View>

      <Text
        style={
          styles.groupLabel
        }
      >
        Available ballots
      </Text>

      <View
        pointerEvents="none"
      >
        <CreatorReleaseCard
          isOwner={
            false
          }
          release={
            CLOSED_AVAILABLE_RELEASE
          }
        />
      </View>
    </View>
  );
}

function OwnerScenario() {
  return (
    <View
      style={
        styles.section
      }
    >
      <RolePanel
        role="owner"
        status="open"
      />

      <View
        style={
          styles.privacyCard
        }
      >
        <Text
          style={
            styles.privacyTitle
          }
        >
          Results stay sealed
        </Text>

        <Text
          style={
            styles.body
          }
        >
          Closing publishes aggregate totals and a winner. Voter identities never appear.
        </Text>
      </View>

      <ActionButton
        hint="Closes voting after confirmation"
        label="Close voting"
      />
    </View>
  );
}

function ContributorScenario() {
  const consent =
    contributorConsentLabel(
      "pending",
    );

  return (
    <View
      style={
        styles.section
      }
    >
      <RolePanel
        role="contributor"
        status="open"
      />

      <View
        style={
          styles.consentCard
        }
      >
        <Text
          style={
            styles.groupLabel
          }
        >
          CONTRIBUTOR CREDIT
        </Text>

        <Text
          style={
            styles.panelTitle
          }
        >
          {consent}
        </Text>

        <Text
          style={
            styles.body
          }
        >
          Your name appears publicly only if you accept. This choice does not reveal your vote.
        </Text>

        <View
          style={
            styles.actionRow
          }
        >
          <ActionButton
            hint="Accepts public contributor credit"
            label="Accept credit"
          />

          <ActionButton
            hint="Declines public contributor credit"
            label="Decline credit"
            secondary
          />
        </View>
      </View>
    </View>
  );
}

function VoteScenario(
  props: Readonly<{
    selectedSceneId:
      | string
      | null;
  }>,
) {
  return (
    <View
      style={
        styles.section
      }
    >
      <RolePanel
        role="listener"
        status="open"
      />

      <View
        style={
          styles.privacyCard
        }
      >
        <Text
          style={
            styles.privacyTitle
          }
        >
          Your vote is private
        </Text>

        <Text
          style={
            styles.body
          }
        >
          The owner sees results only after voting closes. Canal never publishes voter identities.
        </Text>
      </View>

      <View
        accessibilityLabel="Favorite Scene choices"
        accessibilityRole="radiogroup"
        style={
          styles.section
        }
      >
        <SceneChoice
          sceneId="scene-midnight"
          selectedSceneId={
            props.selectedSceneId
          }
          title="Midnight Canal"
        />

        <SceneChoice
          sceneId="scene-neon"
          selectedSceneId={
            props.selectedSceneId
          }
          title="Neon Water"
        />
      </View>
    </View>
  );
}

function ResultsScenario() {
  const ranked =
    rankCreatorReleaseResults(
      RESULT_ITEMS,
    );

  return (
    <View
      style={
        styles.section
      }
    >
      <RolePanel
        role="listener"
        status="closed"
      />

      <View
        style={
          styles.resultsHeader
        }
      >
        <View>
          <Text
            style={
              styles.roleLabel
            }
          >
            CLOSED
          </Text>

          <Text
            style={
              styles.panelTitle
            }
          >
            8 total votes
          </Text>
        </View>

        <Text
          style={
            styles.privacyPill
          }
        >
          Aggregate results only
        </Text>
      </View>

      {ranked.map(
        (item) => (
          <View
            accessibilityLabel={`${item.title}, ${item.voteCount} votes${item.isWinner ? ", winner" : ""}`}
            key={
              item.sceneId
            }
            style={
              styles.resultRow
            }
          >
            <View
              style={
                styles.sceneCopy
              }
            >
              <Text
                style={
                  styles.sceneTitle
                }
              >
                {
                  item.title
                }
              </Text>

              <Text
                style={
                  styles.sceneMeta
                }
              >
                {item.voteCount} votes ·{" "}
                {creatorReleaseVotePercent(
                  item.voteCount,
                  8,
                )}
                %
              </Text>
            </View>

            {item.isWinner ? (
              <Text
                style={
                  styles.winner
                }
              >
                WINNER
              </Text>
            ) : null}
          </View>
        ),
      )}
    </View>
  );
}

function LoadingScenario() {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={
        styles.centerState
      }
    >
      <ActivityIndicator
        color="#F47A24"
        size="large"
      />

      <Text
        style={
          styles.panelTitle
        }
      >
        Loading release ballots
      </Text>

      <Text
        style={
          styles.centerBody
        }
      >
        Actions stay paused until this account receives a fresh snapshot.
      </Text>
    </View>
  );
}

function EmptyScenario() {
  return (
    <View
      style={
        styles.centerState
      }
    >
      <Text
        style={
          styles.emptyIcon
        }
      >
        ◌
      </Text>

      <Text
        style={
          styles.panelTitle
        }
      >
        No release ballots yet
      </Text>

      <Text
        style={
          styles.centerBody
        }
      >
        Start from a public Scene collection when you are ready to invite private favorites.
      </Text>

      <ActionButton
        hint="Returns to public Scene collections"
        label="Browse collections"
      />
    </View>
  );
}

function ReconnectScenario() {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={
        styles.centerState
      }
    >
      <View
        style={
          styles.onlineDot
        }
      />

      <Text
        style={
          styles.panelTitle
        }
      >
        Back online
      </Text>

      <Text
        style={
          styles.centerBody
        }
      >
        Refreshing a fresh snapshot before ballot actions become available.
      </Text>

      <ActivityIndicator
        color="#326646"
        size="small"
      />
    </View>
  );
}

function LifecycleScenario() {
  return (
    <View
      style={
        styles.section
      }
    >
      <View
        style={
          styles.successCard
        }
      >
        <Text
          style={
            styles.successLabel
          }
        >
          RESTORED SAFELY
        </Text>

        <Text
          style={
            styles.panelTitle
          }
        >
          Fresh snapshot required
        </Text>

        <Text
          style={
            styles.body
          }
        >
          The screen restored its route after relaunch. No action was replayed, and mutations remain paused until refresh completes.
        </Text>
      </View>
    </View>
  );
}

function AccountSwitchScenario() {
  return (
    <View
      accessibilityLiveRegion="assertive"
      style={
        styles.section
      }
    >
      <View
        style={
          styles.accountCard
        }
      >
        <Text
          style={
            styles.accountLabel
          }
        >
          ACCOUNT CHANGED
        </Text>

        <Text
          style={
            styles.panelTitle
          }
        >
          Previous ballot hidden
        </Text>

        <Text
          style={
            styles.body
          }
        >
          Loading this account. Scene and ballot content from the prior account cannot commit or remain visible.
        </Text>

        <ActivityIndicator
          color="#7A3EA1"
          size="small"
        />
      </View>
    </View>
  );
}

function ScenarioContent(
  props: Readonly<{
    id: string;
  }>,
) {
  switch (
    props.id
  ) {
    case "browse":
      return (
        <BrowseScenario />
      );

    case "detail-owner":
      return (
        <OwnerScenario />
      );

    case "detail-contributor":
      return (
        <ContributorScenario />
      );

    case "detail-vote":
      return (
        <VoteScenario
          selectedSceneId={
            null
          }
        />
      );

    case "detail-change-vote":
      return (
        <VoteScenario
          selectedSceneId="scene-midnight"
        />
      );

    case "detail-results":
      return (
        <ResultsScenario />
      );

    case "loading":
      return (
        <LoadingScenario />
      );

    case "empty":
      return (
        <EmptyScenario />
      );

    case "error":
      return (
        <SmokeRecoveryNotice
          issue={
            SERVICE_ISSUE
          }
        />
      );

    case "offline":
      return (
        <View
          style={
            styles.section
          }
        >
          <SmokeRecoveryNotice
            issue={
              OFFLINE_ISSUE
            }
          />

          <Text
            style={
              styles.mutationNotice
            }
          >
            Mutations stay paused while offline.
          </Text>
        </View>
      );

    case "reconnect":
      return (
        <ReconnectScenario />
      );

    case "blocked":
      return (
        <SmokeRecoveryNotice
          issue={
            BLOCKED_ISSUE
          }
        />
      );

    case "lifecycle":
      return (
        <LifecycleScenario />
      );

    case "account-switch":
      return (
        <AccountSwitchScenario />
      );

    default:
      return (
        <View
          style={
            styles.centerState
          }
        >
          <Text
            style={
              styles.panelTitle
            }
          >
            Unknown smoke scenario
          </Text>
        </View>
      );
  }
}

export default function ReleaseBallotSmokeScreen() {
  const params =
    useLocalSearchParams<{
      scenario?: string;
    }>();

  const scenario =
    useMemo(
      () => {
        const requested =
          Array.isArray(
            params.scenario,
          )
            ? params
                .scenario[0]
            : params.scenario;

        return (
          CASES.find(
            (candidate) =>
              candidate.id ===
              requested,
          ) ??
          CASES[0]
        );
      },
      [
        params.scenario,
      ],
    );

  if (
    !RELEASE_BALLOT_SMOKE_ENABLED
  ) {
    return (
      <Redirect href="/login" />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown:
            false,
        }}
      />

      <SafeAreaView
        edges={[
          "top",
          "left",
          "right",
        ]}
        style={
          styles.safeArea
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          contentInsetAdjustmentBehavior="automatic"
          key={
            scenario.id
          }
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={
              styles.header
            }
          >
            <View>
              <Text
                style={
                  styles.eyebrow
                }
              >
                RELEASE BALLOT SMOKE
              </Text>

              <Text
                style={
                  styles.heading
                }
              >
                {scenario.id}
              </Text>
            </View>

            <Text
              accessibilityLabel={`Scenario ${scenario.id}`}
              style={
                styles.caseNumber
              }
            >
              {CASES.indexOf(
                scenario,
              ) +
                1}
              /{CASES.length}
            </Text>
          </View>

          <FixtureNotice />

          <ScenarioContent
            id={
              scenario.id
            }
          />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#FBF8F4",
    },

    content: {
      width: "100%",
      maxWidth: 720,
      alignSelf:
        "center",
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 40,
      gap: 14,
    },

    header: {
      minHeight: 58,
      flexDirection: "row",
      alignItems:
        "flex-end",
      justifyContent:
        "space-between",
      gap: 16,
    },

    eyebrow: {
      color: "#F47A24",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },

    heading: {
      color: "#1B1B1B",
      fontSize: 24,
      fontWeight: "900",
      lineHeight: 29,
    },

    caseNumber: {
      color: "#736A63",
      fontSize: 12,
      fontWeight: "800",
      fontVariant: [
        "tabular-nums",
      ],
    },

    fixtureNotice: {
      minHeight: 34,
      justifyContent:
        "center",
      paddingHorizontal: 12,
      borderRadius: 11,
      backgroundColor:
        "#F1ECE7",
    },

    fixtureNoticeText: {
      color: "#6D625A",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.5,
      textAlign: "center",
    },

    recoveryCard: {
      gap: 12,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#F3C7A7",
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF3E9",
    },

    recoveryTitle: {
      color: "#8A3F12",
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 23,
    },

    recoveryMessage: {
      color: "#704C37",
      fontSize: 14,
      lineHeight: 21,
    },

    section: {
      gap: 12,
    },

    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 20,
      fontWeight: "900",
    },

    groupLabel: {
      color: "#756A62",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    filterRow: {
      flexDirection: "row",
      gap: 8,
    },

    filter: {
      minHeight:
        RELEASE_BALLOT_SMOKE_MIN_ACTION_SIZE,
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#E4D8CE",
      borderRadius: 14,
      backgroundColor:
        "#FFFFFF",
    },

    activeFilter: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF0E5",
    },

    filterText: {
      color: "#6F655D",
      fontSize: 13,
      fontWeight: "800",
    },

    activeFilterText: {
      color: "#A84A0D",
    },

    roleCard: {
      gap: 8,
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#DDE7F7",
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F3F7FD",
    },

    roleLabel: {
      color: "#315F9A",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    panelTitle: {
      color: "#1B1B1B",
      fontSize: 20,
      fontWeight: "900",
      lineHeight: 25,
    },

    body: {
      color: "#625A54",
      fontSize: 13,
      lineHeight: 19,
    },

    privacyCard: {
      gap: 6,
      padding: 14,
      borderRadius: 16,
      backgroundColor:
        "#FFF0E5",
    },

    privacyTitle: {
      color: "#A84A0D",
      fontSize: 15,
      fontWeight: "900",
    },

    consentCard: {
      gap: 9,
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 20,
      backgroundColor:
        "#FFFFFF",
    },

    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    actionButton: {
      minWidth: 104,
      minHeight:
        RELEASE_BALLOT_SMOKE_MIN_ACTION_SIZE,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor:
        "#F47A24",
      borderRadius: 14,
      backgroundColor:
        "#F47A24",
    },

    secondaryButton: {
      backgroundColor:
        "#FFFFFF",
    },

    selectedButton: {
      borderColor:
        "#326646",
      backgroundColor:
        "#EAF5EE",
    },

    actionButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },

    secondaryButtonText: {
      color: "#A84A0D",
    },

    selectedButtonText: {
      color: "#326646",
    },

    disabledButton: {
      opacity: 0.72,
    },

    pressed: {
      opacity: 0.68,
    },

    sceneRow: {
      minHeight: 72,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
    },

    sceneCopy: {
      flex: 1,
      gap: 3,
    },

    sceneTitle: {
      color: "#1B1B1B",
      fontSize: 14,
      fontWeight: "900",
    },

    sceneMeta: {
      color: "#81776F",
      fontSize: 11,
    },

    resultsHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
      padding: 14,
      borderRadius: 16,
      backgroundColor:
        "#EAF5EE",
    },

    privacyPill: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
      color: "#326646",
      fontSize: 10,
      fontWeight: "900",
      backgroundColor:
        "#FFFFFF",
    },

    resultRow: {
      minHeight: 62,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderColor:
        "#E3E9E5",
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
    },

    winner: {
      color: "#326646",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    centerState: {
      minHeight: 420,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 14,
      padding: 24,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 22,
      backgroundColor:
        "#FFFFFF",
    },

    centerBody: {
      maxWidth: 360,
      color: "#625A54",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },

    emptyIcon: {
      color: "#F47A24",
      fontSize: 42,
      lineHeight: 46,
    },

    mutationNotice: {
      color: "#8A3F12",
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
    },

    onlineDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor:
        "#3E8A57",
    },

    successCard: {
      gap: 10,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#C8DFCf",
      borderRadius: 20,
      backgroundColor:
        "#F0F8F2",
    },

    successLabel: {
      color: "#326646",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    accountCard: {
      gap: 10,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#D9C8E4",
      borderRadius: 20,
      backgroundColor:
        "#F7F0FB",
    },

    accountLabel: {
      color: "#7A3EA1",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
  });
