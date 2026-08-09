import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import React from "react";
import {
  AccessibilityInfo,
  Linking,
  StyleSheet,
} from "react-native";

import {
  isGeniusContextResponse,
} from "../lib/genius-context-contract";
import {
  GENIUS_CONTEXT_FIXTURE,
} from "./fixtures/genius/song-context";

import {
  LinerNotesAction,
  LinerNotesOverlay,
} from "../components/liner-notes/LinerNotesOverlay";

const {
  act,
  create,
} = jest.requireActual("react-test-renderer");

const PROJECT_ROOT = resolve(__dirname, "..");

const UI_PATHS = [
  "components/liner-notes/LinerNotesOverlay.tsx",
  "app/scene-preview.tsx",
  "app/now-playing.tsx",
  "app/live-stage/[stageId].tsx",
  "lib/genius-context-client.ts",
] as const;

function geniusUiSource(): string {
  return UI_PATHS.map((relativePath) =>
    readFileSync(resolve(PROJECT_ROOT, relativePath), "utf8")
  ).join("\n");
}

async function render(element: React.ReactElement) {
  let renderer: any;
  await act(async () => {
    renderer = create(element);
    await Promise.resolve();
  });
  return renderer;
}

function effectiveStyle(node: any): Record<string, unknown> {
  return StyleSheet.flatten(
    typeof node.props.style === "function"
      ? node.props.style({ pressed: false })
      : node.props.style,
  ) ?? {};
}

function hasText(node: any, text: string): boolean {
  return node.findAll?.((child: any) => child.props.children === text).length > 0;
}

describe("Genius Liner Notes UI contract", () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });

  it("accepts the deterministic provider fixture without exposing extra fields", () => {
    expect(isGeniusContextResponse(GENIUS_CONTEXT_FIXTURE)).toBe(true);
    expect(JSON.stringify(GENIUS_CONTEXT_FIXTURE)).not.toMatch(/["](?:lyrics|fragment|accessToken|clientSecret)["]/iu);
  });

  it("implements a fixture-drivable quick-context and full Liner Notes flow", () => {
    const source = geniusUiSource();

    for (const relativePath of UI_PATHS) {
      expect(existsSync(resolve(PROJECT_ROOT, relativePath))).toBe(true);
    }
    expect(source).toMatch(/(?:Quick Context|Song context|Context by Genius)/iu);
    expect(source).toMatch(/Liner Notes/iu);
    expect(source).toMatch(/Open[^\n]{0,40}Genius/iu);
    expect(source).toMatch(/(?:credits|Written by|Produced by)/iu);
    expect(source).toMatch(/(?:annotations|notes)/iu);
  });

  it("renders loading, empty, offline, error, and retry states safely", () => {
    const source = geniusUiSource();

    expect(source).toMatch(/loading|ActivityIndicator|isPending/iu);
    expect(source).toMatch(/offline|connection|network/iu);
    expect(source).toMatch(/not found|no (?:song )?context|empty/iu);
    expect(source).toMatch(/error|could not|unavailable/iu);
  });

  it("keeps controls accessible and provides deterministic back/deep-link recovery", () => {
    const source = geniusUiSource();

    expect(source).toMatch(/accessibilityLabel/iu);
    expect(source).toMatch(/(?:minHeight|height)\s*:\s*(?:48|[5-9]\d)|CanalIconButton|CanalButton/iu);
    expect(source).toMatch(/(?:router\.)?canGoBack|onClose/iu);
    expect(source).toMatch(/router\.(?:back|replace)|onClose/iu);
    expect(source).toMatch(/LinerNotesOverlay/iu);
  });

  it("offers song context for the current and queued tracks in a live Stage", () => {
    const liveStageSource = readFileSync(
      resolve(PROJECT_ROOT, "app/live-stage/[stageId].tsx"),
      "utf8",
    );

    expect(liveStageSource).toContain("useLinerNotesContext");
    expect(liveStageSource).toContain("<LinerNotesOverlay");
    expect(liveStageSource.match(/<LinerNotesAction/gu) ?? []).toHaveLength(0);
    expect(liveStageSource).toContain("View context for ${currentTrack.title}");
    expect(liveStageSource).toContain("View context for ${track.title}");
    expect(liveStageSource).toContain("title: currentTrack.title");
    expect(liveStageSource).toContain("title: track.title");
    expect(liveStageSource).toContain("connectivityStatus");
    expect(liveStageSource).toContain("sessionGeneration");
  });

  it("isolates account/session responses and never persists or renders provider HTML/lyrics", () => {
    const source = geniusUiSource();

    expect(source).not.toMatch(/(?:AsyncStorage|SecureStore)\s*\.\s*(?:setItem|multiSet)|from\s+["'][^"']*(?:async-storage|secure-store)/iu);
    expect(source).not.toMatch(/dangerouslySetInnerHTML|WebView/iu);
    expect(source).not.toMatch(/\b(?:lyrics|lyricsHtml|lyricsBody|referentFragment)\s*[?:]/iu);
  });

  it("renders 48pt actions and toggles deterministic full notes", async () => {
    const action = await render(React.createElement(LinerNotesAction, {
      onPress: jest.fn(),
    }));
    const actionButton = action.root.findByProps({
      accessibilityLabel: "Open song context",
    });
    const actionStyle = effectiveStyle(actionButton) as { minHeight?: number; height?: number };
    expect(Math.max(actionStyle.minHeight ?? 0, actionStyle.height ?? 0)).toBeGreaterThanOrEqual(48);

    const overlay = await render(React.createElement(LinerNotesOverlay, {
      context: GENIUS_CONTEXT_FIXTURE,
      onClose: jest.fn(),
      track: {
        album: "The Quiet Current",
        artist: "Canal Artist",
        title: "First Light",
      },
      visible: true,
    }));
    const closeButtons = overlay.root.findAllByProps({
      accessibilityLabel: "Close song context",
    });
    const closeSizes = closeButtons.map((button: any) => {
      const style = effectiveStyle(button) as { minHeight?: number; height?: number };
      return Math.max(style.minHeight ?? 0, style.height ?? 0);
    });
    expect(Math.max(...closeSizes)).toBeGreaterThanOrEqual(48);

    const fullNotes = overlay.root.findAll(
      (node: any) => node.props.accessibilityRole === "button" && hasText(node, "Full liner notes"),
    )[0];
    expect(fullNotes.props.accessibilityLabel).toBe("Show full liner notes");
    await act(async () => fullNotes.props.onPress());
    expect(overlay.root.findAll((node: any) => node.props.children === "Notes").length).toBeGreaterThan(0);
  });

  it.each([
    ["loading", "Loading song context"],
    ["offline", "You’re offline"],
    ["error", "Context unavailable"],
    ["empty", "No context found"],
  ] as const)("renders the %s state", async (state, title) => {
    const overlay = await render(React.createElement(LinerNotesOverlay, {
      onClose: jest.fn(),
      state,
      track: {
        artist: "Canal Artist",
        title: "First Light",
      },
      visible: true,
    }));

    expect(overlay.root.findAll((node: any) => node.props.children === title).length).toBeGreaterThan(0);
  });

  it("keeps empty-state actions honest when Genius has no canonical match", async () => {
    const overlay = await render(React.createElement(LinerNotesOverlay, {
      onClose: jest.fn(),
      state: "empty",
      track: {
        artist: "Unmatched Artist",
        title: "Unmatched Track",
      },
      visible: true,
    }));

    expect(
      overlay.root.findAll(
        (node: any) =>
          node.props.children ===
          "Genius didn’t return a confident match for this track. Choose another track to view song context.",
      ),
    ).not.toHaveLength(0);
    expect(
      overlay.root.findAll(
        (node: any) =>
          node.props.children ===
          "Try another track or open Genius to search directly.",
      ),
    ).toHaveLength(0);

    const open = overlay.root.findAll(
      (node: any) =>
        node.props.accessibilityRole === "button" &&
        hasText(node, "Open Genius"),
    )[0];
    const fullNotes = overlay.root.findAll(
      (node: any) =>
        node.props.accessibilityRole === "button" &&
        hasText(node, "Full liner notes"),
    )[0];

    for (const action of [open, fullNotes]) {
      expect(action.props.disabled).toBe(true);
      expect(action.props.accessibilityState).toEqual({ disabled: true });
      expect(action.props.accessibilityHint).toBe(
        "Unavailable because Genius did not return a canonical match.",
      );
    }
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("opens only the canonical Genius link from a labeled control", async () => {
    const overlay = await render(React.createElement(LinerNotesOverlay, {
      context: GENIUS_CONTEXT_FIXTURE,
      onClose: jest.fn(),
      track: {
        artist: "Canal Artist",
        title: "First Light",
      },
      visible: true,
    }));
    const open = overlay.root.findAll(
      (node: any) => node.props.accessibilityRole === "button" && hasText(node, "Open Genius"),
    )[0];
    expect(open.props.accessibilityLabel).toBe("Open song on Genius");
    await act(async () => open.props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://genius.com/Canal-artist-first-light-lyrics",
    );
  });
});
