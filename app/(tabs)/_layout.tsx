import {
  Tabs,
} from "expo-router";

import CanalBottomNav from "../../components/CanalBottomNav";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={() => (
        <CanalBottomNav />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: "transparent",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          href: null,
          title: "Create",
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
        }}
      />
      <Tabs.Screen
        name="explore-category"
        options={{
          href: null,
          title: "Explore category",
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          href: null,
          title: "Live",
        }}
      />
    </Tabs>
  );
}
