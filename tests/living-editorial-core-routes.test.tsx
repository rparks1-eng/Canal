import React from "react";

import type {
  ReactElement,
} from "react";

import {
  StyleSheet,
} from "react-native";

type RenderNode = {
  props: Record<string, unknown>;
};

type TestRenderer = {
  root: {
    findAll: (
      predicate: (node: RenderNode) => boolean,
    ) => RenderNode[];
  };
  unmount: () => void;
  update: (element: ReactElement) => void;
};

const {
  act,
  create,
} = jest.requireActual(
  "react-test-renderer",
) as {
  act: (
    callback: () => Promise<void> | void,
  ) => Promise<void>;
  create: (element: ReactElement) => TestRenderer;
};

const mockPush = jest.fn();
const mockReplace = jest.fn();

let mockPathname = "/";

jest.mock("expo-router", () => ({
  router: {
    push: (href: string) => mockPush(href),
    replace: (href: string) => mockReplace(href),
  },
  usePathname: () => mockPathname,
}));

// The component import must follow the router mock so handlers bind to it.
// eslint-disable-next-line import/first
import CanalBottomNav from "../components/CanalBottomNav";

const CONTROLS = [
  {
    activePath: "/",
    hint: "Opens your home tab.",
    label: "Home",
    method: "replace",
    role: "tab",
    target: "/(tabs)",
  },
  {
    activePath: "/explore",
    hint: "Opens your explore tab.",
    label: "Explore",
    method: "replace",
    role: "tab",
    target: "/(tabs)/explore",
  },
  {
    activePath: "/scene-studio",
    hint: "Opens Scene Studio.",
    label: "Create a new Scene",
    method: "push",
    role: "button",
    target: "/scene-studio",
  },
  {
    activePath: "/library",
    hint: "Opens your library tab.",
    label: "Library",
    method: "replace",
    role: "tab",
    target: "/(tabs)/library",
  },
  {
    activePath: "/profile",
    hint: "Opens your profile tab.",
    label: "Profile",
    method: "replace",
    role: "tab",
    target: "/(tabs)/profile",
  },
] as const;

async function renderNavigation(
  pathname: string,
): Promise<TestRenderer> {
  mockPathname = pathname;
  let renderer: TestRenderer | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(CanalBottomNav),
    );
  });

  if (!renderer) {
    throw new Error("Bottom navigation did not render.");
  }

  return renderer;
}

function control(
  renderer: TestRenderer,
  label: string,
): RenderNode {
  const match = renderer.root.findAll(
    (node) => node.props.accessibilityLabel === label,
  )[0];

  if (!match) {
    throw new Error(`Missing ${label} control.`);
  }

  return match;
}

async function unmountNavigation(
  renderer: TestRenderer,
): Promise<void> {
  await act(async () => {
    renderer.unmount();
  });
}

describe("living editorial core navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(CONTROLS)(
    "preserves the $label handler, target, and accessible contract",
    async ({ hint, label, method, role, target }) => {
      const renderer = await renderNavigation("/friends");
      const item = control(renderer, label);

      expect(item.props).toMatchObject({
        accessibilityHint: hint,
        accessibilityRole: role,
        accessibilityState: { selected: false },
      });
      expect(item.props.disabled).toBeUndefined();
      expect(item.props.hitSlop).toBeUndefined();

      const style = item.props.style as (
        state: { pressed: boolean },
      ) => unknown;
      expect(
        StyleSheet.flatten(style({ pressed: false })),
      ).toMatchObject({ minHeight: 54 });

      const onPress = item.props.onPress as () => void;
      onPress();

      if (method === "push") {
        expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
          pathname: target,
          params: expect.objectContaining({ mode: "new" }),
        }));
      } else {
        expect(mockReplace).toHaveBeenCalledWith(target);
      }
      expect(mockPush).toHaveBeenCalledTimes(
        method === "push" ? 1 : 0,
      );
      expect(mockReplace).toHaveBeenCalledTimes(
        method === "replace" ? 1 : 0,
      );

      await unmountNavigation(renderer);
    },
  );

  it.each(CONTROLS)(
    "selects $label from the normalized pathname",
    async ({ activePath, label }) => {
      const renderer = await renderNavigation(activePath);

      expect(control(renderer, label).props.accessibilityState).toEqual({
        selected: true,
      });
      CONTROLS.filter((item) => item.label !== label).forEach((item) => {
        expect(control(renderer, item.label).props.accessibilityState).toEqual({
          selected: false,
        });
      });

      const marker = renderer.root.findAll(
        (node) => node.props.pointerEvents === "none",
      );
      expect(marker.length).toBeGreaterThanOrEqual(1);
      expect(marker[0].props).toMatchObject({
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      });

      await unmountNavigation(renderer);
    },
  );

  it("coalesces rapid presses for every destination", async () => {
    for (const item of CONTROLS) {
      jest.clearAllMocks();
      const renderer = await renderNavigation("/friends");
      const destination = control(renderer, item.label);
      const onPress = destination.props.onPress as () => void;

      onPress();
      onPress();

      expect(item.method === "push" ? mockPush : mockReplace).toHaveBeenCalledTimes(1);
      if (item.method === "push") {
        expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
          pathname: item.target,
          params: expect.objectContaining({ mode: "new" }),
        }));
      } else {
        expect(mockReplace).toHaveBeenCalledWith(item.target);
      }

      await unmountNavigation(renderer);
    }
  });

  it("re-enables navigation after a pathname transition", async () => {
    const renderer = await renderNavigation("/friends");

    const homePress = control(renderer, "Home").props.onPress as () => void;
    homePress();
    homePress();
    expect(mockReplace).toHaveBeenCalledTimes(1);

    mockPathname = "/library";
    await act(async () => {
      renderer.update(React.createElement(CanalBottomNav));
    });

    const explorePress = control(renderer, "Explore").props.onPress as () => void;
    explorePress();
    explorePress();
    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenLastCalledWith("/(tabs)/explore");

    await unmountNavigation(renderer);
  });

  it("does not redispatch the already-selected destination", async () => {
    const renderer = await renderNavigation("/profile");
    const onPress = control(renderer, "Profile").props.onPress as () => void;

    onPress();
    expect(mockReplace).not.toHaveBeenCalled();

    await unmountNavigation(renderer);
  });

  it("keeps five 48-point targets non-overlapping at 320 points", async () => {
    const renderer = await renderNavigation("/friends");
    let requiredWidth = 0;

    CONTROLS.forEach(({ label }) => {
      const item = control(renderer, label);
      expect(item.props.accessibilityState).toEqual({
        selected: false,
      });
      expect(item.props.hitSlop).toBeUndefined();

      const style = item.props.style as (
        state: { pressed: boolean },
      ) => unknown;
      const flattened = StyleSheet.flatten(
        style({ pressed: false }),
      ) as {
        minHeight: number;
        minWidth: number;
      };
      expect(flattened.minHeight).toBeGreaterThanOrEqual(48);
      expect(flattened.minWidth).toBeGreaterThanOrEqual(48);
      requiredWidth += flattened.minWidth as number;
    });

    expect(requiredWidth).toBeLessThanOrEqual(320 - 12);

    await unmountNavigation(renderer);
  });
});
