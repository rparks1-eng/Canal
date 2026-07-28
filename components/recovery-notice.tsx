import {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  RecoveryIssue,
} from "../lib/recovery-issue";

export function RecoveryNotice(
  props: {
    issue: RecoveryIssue;
    busy?: boolean;
    onAction: () =>
      | void
      | Promise<void>;
  },
) {
  const retryDelayMs =
    props.issue.kind ===
      "rate-limited" &&
    typeof props.issue
      .retryAfterMs ===
      "number" &&
    Number.isFinite(
      props.issue
        .retryAfterMs,
    ) &&
    props.issue
      .retryAfterMs >
      0
      ? props.issue
          .retryAfterMs
      : 0;

  const retryGateKey = [
    props.issue.kind,
    props.issue.message,
    retryDelayMs,
  ].join(
    "\u0000",
  );

  const [
    availableRetryKey,
    setAvailableRetryKey,
  ] = useState(
    retryDelayMs > 0
      ? ""
      : retryGateKey,
  );

  useEffect(() => {
    if (
      retryDelayMs <= 0
    ) {
      setAvailableRetryKey(
        retryGateKey,
      );

      return;
    }

    setAvailableRetryKey(
      "",
    );

    const timeout =
      setTimeout(
        () => {
          setAvailableRetryKey(
            retryGateKey,
          );
        },
        retryDelayMs,
      );

    return () => {
      clearTimeout(
        timeout,
      );
    };
  }, [
    retryDelayMs,
    retryGateKey,
  ]);

  const retryIsWaiting =
    retryDelayMs > 0 &&
    availableRetryKey !==
      retryGateKey;

  const isDisabled =
    Boolean(
      props.busy,
    ) ||
    retryIsWaiting;

  const buttonText =
    retryIsWaiting
      ? "Available later"
      : props.issue
          .actionLabel;

  const accessibilityLabel =
    props.busy
      ? `${props.issue.actionLabel}, in progress`
      : retryIsWaiting
        ? `${props.issue.actionLabel} available later`
        : props.issue
            .actionLabel;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={
        styles.card
      }
    >
      <Text
        selectable
        style={
          styles.title
        }
      >
        {props.issue.title}
      </Text>

      <Text
        selectable
        style={
          styles.message
        }
      >
        {props.issue.message}
      </Text>

      <Pressable
        accessibilityLabel={
          accessibilityLabel
        }
        accessibilityRole="button"
        accessibilityState={{
          busy:
            Boolean(
              props.busy,
            ),
          disabled:
            isDisabled,
        }}
        disabled={
          isDisabled
        }
        onPress={() => {
          if (
            isDisabled
          ) {
            return;
          }

          void props.onAction();
        }}
        style={({
          pressed,
        }) => [
          styles.button,

          isDisabled &&
            styles.disabled,

          pressed &&
            styles.pressed,
        ]}
      >
        {props.busy ? (
          <ActivityIndicator
            color="#FFFFFF"
            size="small"
          />
        ) : null}

        <Text
          style={
            styles.buttonText
          }
        >
          {buttonText}
        </Text>
      </Pressable>
    </View>
  );
}

const styles =
  StyleSheet.create({
    card: {
      padding: 16,
      gap: 10,
      borderRadius: 18,
      borderCurve:
        "continuous",
      borderWidth: 1,
      borderColor:
        "#F3C7A7",
      backgroundColor:
        "#FFF3E9",
    },

    title: {
      color: "#8A3F12",
      fontSize: 16,
      fontWeight: "800",
    },

    message: {
      color: "#6E4B37",
      fontSize: 14,
      lineHeight: 20,
    },

    button: {
      minHeight: 44,
      alignSelf:
        "flex-start",
      alignItems:
        "center",
      justifyContent:
        "center",
      flexDirection:
        "row",
      gap: 8,
      paddingHorizontal: 18,
      borderRadius: 22,
      backgroundColor:
        "#F47A24",
    },

    buttonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800",
    },

    disabled: {
      opacity: 0.55,
    },

    pressed: {
      opacity: 0.72,
    },
  });
