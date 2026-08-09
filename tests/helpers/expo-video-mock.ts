import React from "react";
import { View } from "react-native";

export function useVideoPlayer(
  _source: unknown,
  setup?: (player: { loop: boolean }) => void,
) {
  const player = { loop: false };
  setup?.(player);
  return player;
}

export function VideoView(props: Record<string, unknown>) {
  return React.createElement(View, props);
}
