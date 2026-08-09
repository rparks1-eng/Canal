import { useEffect } from "react";

import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { canalMotion } from "../../theme/canal-motion";

export function useCanalOneShot(
  trigger: string | number | boolean,
) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? canalMotion.reducedMs : canalMotion.enterMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduceMotion, trigger]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : (1 - progress.value) * canalMotion.translateY,
      },
      {
        scale: reduceMotion
          ? 1
          : canalMotion.emphasisScale +
            progress.value * (1 - canalMotion.emphasisScale),
      },
    ],
  }));
}

export const CanalAnimatedView = Animated.View;
