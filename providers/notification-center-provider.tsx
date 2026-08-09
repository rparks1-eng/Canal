import type { PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { readActivity } from "../lib/relationships";
import {
  isSupabaseConfigured,
  supabase,
} from "../lib/supabase";
import { useAuth } from "./auth-provider";

type NotificationBanner = {
  id: string;
  title: string;
  description: string;
};

type NotificationCenterValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  clearUnreadCount: () => void;
};

const NotificationCenterContext =
  createContext<NotificationCenterValue | null>(null);

export function NotificationCenterProvider({
  children,
}: PropsWithChildren) {
  const { accountEpoch, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [banner, setBanner] = useState<NotificationBanner | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissBanner = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }

    Animated.timing(translateY, {
      toValue: -120,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setBanner(null));
  }, [translateY]);

  const showBanner = useCallback((next: NotificationBanner) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setBanner(next);
    translateY.setValue(-120);
    Animated.spring(translateY, {
      toValue: 0,
      damping: 18,
      stiffness: 210,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
    dismissTimer.current = setTimeout(dismissBanner, 6000);
  }, [dismissBanner, translateY]);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const activity = await readActivity();
    setUnreadCount(activity.filter((item) => !item.isRead).length);
  }, [user]);

  const clearUnreadCount = useCallback(() => setUnreadCount(0), []);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    dismissBanner();
  }, [accountEpoch, dismissBanner, user?.id]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const subscribedUserId = user.id;
    let active = true;
    const channel = supabase
      .channel(`activity-events:${subscribedUserId}:${accountEpoch}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `user_id=eq.${subscribedUserId}`,
        },
        (payload) => {
          if (!active) return;
          const row = payload.new as Record<string, unknown>;
          const id = typeof row.id === "string" ? row.id : "new-activity";
          const title = typeof row.title === "string" ? row.title : "New Canal activity";
          const description = typeof row.description === "string" ? row.description : "Open Activity to view it.";

          setUnreadCount((current) => current + 1);
          showBanner({ id, title, description });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "activity_events",
          filter: `user_id=eq.${subscribedUserId}`,
        },
        (payload) => {
          if (!active) return;
          const row = payload.new as Record<string, unknown>;
          if (row.is_read === false) {
            const id = typeof row.id === "string" ? row.id : "updated-activity";
            const title = typeof row.title === "string" ? row.title : "New Canal activity";
            const description = typeof row.description === "string" ? row.description : "Open Activity to view it.";
            showBanner({ id, title, description });
          }
          void refreshUnreadCount();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [accountEpoch, refreshUnreadCount, showBanner, user]);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const value = useMemo(() => ({
    unreadCount,
    refreshUnreadCount,
    clearUnreadCount,
  }), [clearUnreadCount, refreshUnreadCount, unreadCount]);

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
      {banner ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[styles.bannerPosition, { transform: [{ translateY }] }]}
        >
          <Pressable
            accessibilityHint="Opens Activity to view this notification."
            accessibilityLabel={`${banner.title}. ${banner.description}`}
            accessibilityRole="button"
            onPress={() => {
              dismissBanner();
              router.push("/(tabs)/activity" as never);
            }}
            style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
          >
            <View style={styles.iconWell}>
              <Ionicons color="#FFFFFF" name="notifications" size={18} />
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>{banner.title}</Text>
              <Text numberOfLines={2} style={styles.description}>{banner.description}</Text>
            </View>
            <Pressable
              accessibilityLabel="Dismiss notification"
              accessibilityRole="button"
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                dismissBanner();
              }}
              style={styles.dismiss}
            >
              <Ionicons color="#D9DED8" name="close" size={17} />
            </Pressable>
          </Pressable>
        </Animated.View>
      ) : null}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter(): NotificationCenterValue {
  const context = useContext(NotificationCenterContext);
  if (!context) throw new Error("useNotificationCenter must be used inside NotificationCenterProvider.");
  return context;
}

const styles = StyleSheet.create({
  bannerPosition: {
    position: "absolute",
    top: 58,
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 20,
  },
  banner: {
    minHeight: 72,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(24, 29, 27, 0.96)",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#236D51",
  },
  copy: { flex: 1, gap: 2 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  description: { color: "#D9DED8", fontSize: 13, lineHeight: 18 },
  dismiss: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.86 },
});
