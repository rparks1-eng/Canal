import React from "react";

import {
  AccessibilityInfo,
  Text,
  View,
} from "react-native";

const mockUseReducedMotion = jest.fn(() => false);
const mockWithTiming = jest.fn((value: number, _config?: unknown) => value);

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "AnimatedView" },
  Easing: {
    cubic: "cubic",
    out: (value: unknown) => value,
  },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => mockUseReducedMotion(),
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number, config: unknown) =>
    mockWithTiming(value, config),
}));

import {
  CanalButton,
  CanalChip,
  CanalEmpty,
  CanalGlassNav,
  CanalOffline,
} from "../components/canal-ui/canal-primitives";

import {
  useCanalOneShot,
} from "../components/canal-ui/canal-motion";

// react-test-renderer is locked transitively by React Native in this project.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer");
const { act } = TestRenderer;

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("Canal UI rendered primitives", () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
    mockWithTiming.mockClear();
  });

  it("latches Button synchronously and exposes busy while one callback is in flight", async () => {
    const wait = deferred();
    const onPress = jest.fn(() => wait.promise);
    let tree: any;
    act(() => {
      tree = TestRenderer.create(<CanalButton label="Save Scene" onPress={onPress} />);
    });
    let button = tree.root.findByProps({ accessibilityLabel: "Save Scene" });
    let pending: Promise<void>;
    act(() => {
      pending = button.props.onPress();
      void button.props.onPress();
    });
    button = tree.root.findByProps({ accessibilityLabel: "Save Scene" });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    wait.resolve();
    await act(async () => pending!);
    expect(tree.root.findByProps({ accessibilityLabel: "Save Scene" }).props.accessibilityState).toEqual({ disabled: false, busy: false });
  });

  it("disables actions without callbacks and intercepts disabled callbacks", () => {
    const onPress = jest.fn();
    let missing: any;
    let disabled: any;
    act(() => {
      missing = TestRenderer.create(<CanalButton label="Unavailable" />);
      disabled = TestRenderer.create(<CanalChip label="Private" disabled onPress={onPress} />);
    });
    expect(missing.root.findByProps({ accessibilityLabel: "Unavailable" }).props.disabled).toBe(true);
    expect(missing.root.findByProps({ accessibilityLabel: "Unavailable" }).props.pointerEvents).toBeUndefined();
    void disabled.root.findByProps({ accessibilityLabel: "Private" }).props.onPress();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps selected Chip state visible, accessible, and callback-backed", async () => {
    const onPress = jest.fn();
    let tree: any;
    act(() => {
      tree = TestRenderer.create(<CanalChip label="Morning" selected onPress={onPress} />);
    });
    const chip = tree.root.findByProps({ accessibilityLabel: "Morning" });
    expect(chip.props.accessibilityState.selected).toBe(true);
    expect(tree.root.findByType(Text).props.children).toEqual(["✓ ", "Morning"]);
    await act(async () => chip.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps optional recovery actions disabled when callbacks are absent", () => {
    let empty: any;
    let offline: any;
    act(() => {
      empty = TestRenderer.create(<CanalEmpty title="No Scenes" message="Create one." actionLabel="Create Scene" />);
      offline = TestRenderer.create(<CanalOffline message="Reconnect to continue." />);
    });
    expect(empty.root.findByProps({ accessibilityLabel: "Create Scene" }).props.disabled).toBe(true);
    expect(offline.root.findByProps({ accessibilityLabel: "Try again" }).props.disabled).toBe(true);
  });

  it("observes Reduce Transparency and uses a solid navigation fallback", async () => {
    const transparency = jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    let listener: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((event: string, handler: (enabled: boolean) => void) => {
      if (event === "reduceTransparencyChanged") listener = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
    let tree: any;
    await act(async () => {
      tree = TestRenderer.create(<CanalGlassNav><Text>Navigation</Text></CanalGlassNav>);
      await Promise.resolve();
    });
    const nav = tree.root.findByProps({ testID: "canal-glass-nav" });
    expect(nav.props.style[1].backgroundColor).toBe("rgba(255, 255, 255, 0.9)");
    act(() => listener?.(false));
    expect(tree.root.findByProps({ testID: "canal-glass-nav" }).props.style[1].backgroundColor).toBe("rgba(241, 255, 252, 0.68)");
    transparency.mockRestore();
  });

  it("does not let a caller bypass the OS Reduce Transparency setting", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as unknown as typeof AccessibilityInfo.addEventListener);
    let tree: any;
    await act(async () => {
      tree = TestRenderer.create(<CanalGlassNav reduceTransparency={false}><Text>Navigation</Text></CanalGlassNav>);
      await Promise.resolve();
    });
    expect(tree.root.findByProps({ testID: "canal-glass-nav" }).props.style[1].backgroundColor).toBe("rgba(255, 255, 255, 0.9)");
  });

  it("collapses one-shot motion to zero duration under Reduce Motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    function MotionProbe() {
      const style = useCanalOneShot("ready");
      return <View style={style} />;
    }
    act(() => {
      TestRenderer.create(<MotionProbe />);
    });
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 0 }));
  });
});
