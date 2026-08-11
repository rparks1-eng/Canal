import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import {
  subscribeToCanalAlerts,
} from "../lib/canal-alert";

import type {
  CanalAlertButton,
  CanalAlertRequest,
} from "../lib/canal-alert";

import { canalDynamicColors } from "../theme/canal-dynamic-colors";

export function CanalAlertHost() {
  const [queue, setQueue] =
    useState<CanalAlertRequest[]>([]);
  const dark =
    useColorScheme() === "dark";

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    return subscribeToCanalAlerts(
      (request) => {
        setQueue((current) => [
          ...current,
          request,
        ]);
      },
    );
  }, []);

  const request = queue[0] ?? null;

  const close = useCallback(
    (
      button?: CanalAlertButton,
      dismissed = false,
    ) => {
      if (!request) {
        return;
      }

      setQueue((current) =>
        current.filter(
          (candidate) =>
            candidate.id !==
            request.id,
        ),
      );

      button?.onPress?.();

      if (dismissed) {
        request.options.onDismiss?.();
      }
    },
    [request],
  );

  if (
    Platform.OS !== "web" ||
    !request
  ) {
    return null;
  }

  const cancelButton =
    request.buttons.find(
      (button) =>
        button.style === "cancel",
    );

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (
          request.options.cancelable !==
          false
        ) {
          close(
            cancelButton,
            true,
          );
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessibilityLabel="Dismiss alert"
        accessibilityRole="button"
        disabled={
          request.options.cancelable ===
          false
        }
        onPress={() => {
          close(
            cancelButton,
            true,
          );
        }}
        style={styles.backdrop}
      >
        <View
          accessibilityLabel={
            request.title
          }
          accessibilityRole="alert"
          accessibilityViewIsModal
          onStartShouldSetResponder={() =>
            true
          }
          style={[
            styles.card,
            {
              backgroundColor: dark
                ? "#241B22"
                : "#FFFDFC",
              borderColor: dark
                ? "rgba(255,255,255,0.16)"
                : "rgba(69,42,53,0.14)",
            },
          ]}
        >
          <Text
            style={[
              styles.title,
              {
                color: dark
                  ? "#FFF7F9"
                  : "#321B22",
              },
            ]}
          >
            {request.title}
          </Text>

          {request.message ? (
            <Text
              style={[
                styles.message,
                {
                  color: dark
                    ? "rgba(255,247,249,0.72)"
                    : "rgba(50,27,34,0.70)",
                },
              ]}
            >
              {request.message}
            </Text>
          ) : null}

          <View
            style={styles.actions}
          >
            {request.buttons.map(
              (button, index) => (
                <Pressable
                  key={`${button.text ?? "Action"}:${index}`}
                  accessibilityRole="button"
                  onPress={() => {
                    close(button);
                  }}
                  style={({
                    pressed,
                  }) => [
                    styles.action,
                    button.style ===
                      "destructive" &&
                      styles.destructiveAction,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      button.style ===
                        "destructive" &&
                        styles.destructiveText,
                      button.style ===
                        "cancel" &&
                        styles.cancelText,
                    ]}
                  >
                    {button.text ??
                      "OK"}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor:
      "rgba(9, 6, 9, 0.58)",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    boxShadow:
      "0 24px 80px rgba(10, 4, 8, 0.30)",
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
  },
  message: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    marginTop: 20,
    gap: 8,
  },
  action: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: canalDynamicColors.elevated,
  },
  destructiveAction: {
    backgroundColor: "#A12834",
  },
  actionText: {
    color: canalDynamicColors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  destructiveText: {
    color: canalDynamicColors.onDanger,
  },
  cancelText: {
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.68,
  },
});
