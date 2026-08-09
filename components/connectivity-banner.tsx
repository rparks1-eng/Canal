import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  shouldShowConnectivityBanner,
} from "../lib/connectivity";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

export function ConnectivityBanner() {
  const {
    reconnectEpoch,
    refresh,
    status,
  } =
    useConnectivity();

  const [
    checking,
    setChecking,
  ] = useState(false);

  const [
    visibleReconnectEpoch,
    setVisibleReconnectEpoch,
  ] = useState(0);

  const previousReconnectEpoch =
    useRef(
      reconnectEpoch,
    );

  useEffect(() => {
    if (
      reconnectEpoch <=
      previousReconnectEpoch.current
    ) {
      return;
    }

    previousReconnectEpoch.current =
      reconnectEpoch;

    setVisibleReconnectEpoch(
      reconnectEpoch,
    );

    const timeout =
      setTimeout(
        () => {
          setVisibleReconnectEpoch(
            0,
          );
        },
        4_000,
      );

    return () => {
      clearTimeout(
        timeout,
      );
    };
  }, [
    reconnectEpoch,
  ]);

  if (
    !shouldShowConnectivityBanner(
      status,
      visibleReconnectEpoch,
      reconnectEpoch,
    )
  ) {
    return null;
  }

  const isOffline =
    status ===
    "offline";

  const checkConnection =
    async (): Promise<void> => {
      setChecking(
        true,
      );

      try {
        await refresh();
      } finally {
        setChecking(
          false,
        );
      }
    };

  return (
    <SafeAreaView
      edges={[
        "top",
      ]}
      style={[
        styles.safeArea,

        isOffline
          ? styles.offlineBackground
          : styles.onlineBackground,
      ]}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={
          styles.banner
        }
      >
        <View
          style={
            styles.copy
          }
        >
          <Text
            selectable
            style={
              styles.title
            }
          >
            {isOffline
              ? "You’re offline"
              : "Back online"}
          </Text>

          <Text
            selectable
            style={
              styles.message
            }
          >
            {isOffline
              ? "Saved work stays available. Cloud updates resume when Canal reconnects."
              : "Canal is refreshing cloud activity and shared content."}
          </Text>
        </View>

        {isOffline ? (
          <Pressable
            accessibilityLabel={
              checking
                ? "Checking connection, in progress"
                : "Check connection"
            }
            accessibilityRole="button"
            accessibilityState={{
              busy:
                checking,
              disabled:
                checking,
            }}
            disabled={
              checking
            }
            onPress={() =>
              void checkConnection()
            }
            style={({
              pressed,
            }) => [
              styles.button,

              checking &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            {checking ? (
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
              {checking
                ? "Checking"
                : "Check"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      width: "100%",
    },

    offlineBackground: {
      backgroundColor:
        "#7D3A10",
    },

    onlineBackground: {
      backgroundColor:
        "#176A39",
    },

    banner: {
      minHeight: 58,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      paddingHorizontal:
        16,
      paddingVertical:
        10,
    },

    copy: {
      flex: 1,
      gap: 2,
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight:
        "900",
    },

    message: {
      color: "#FFF4EC",
      fontSize: 12,
      lineHeight: 17,
    },

    button: {
      minHeight: 40,
      minWidth: 76,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 7,
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F47A24",
      paddingHorizontal:
        14,
    },

    buttonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight:
        "900",
    },

    disabled: {
      opacity: 0.62,
    },

    pressed: {
      opacity: 0.76,
    },
  });
