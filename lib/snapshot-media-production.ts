import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { Share, type View } from "react-native";
import { captureRef } from "react-native-view-shot";

import {
  canComposeSnapshotVideo,
  composeSnapshotVideo,
} from "../modules/snapshot-composer";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export type SnapshotProductionMedia = Readonly<{
  uri: string;
  type: "photo" | "video";
}>;

function ensureDirectory(directory: Directory): void {
  directory.create({ intermediates: true, idempotent: true });
}

function extensionFor(type: SnapshotProductionMedia["type"]): string {
  return type === "video" ? "mov" : "jpg";
}

function safeScopeKey(scopeKey: string): string {
  const normalized = scopeKey.trim().replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 240);
  if (!normalized) throw new Error("A signed-in Snapshot draft scope is required.");
  return normalized;
}

function ownedBy(directory: Directory, uri: string, filePattern?: RegExp): boolean {
  try {
    const directoryUrl = new URL(directory.uri);
    const fileUrl = new URL(uri);
    if (directoryUrl.protocol !== "file:" || fileUrl.protocol !== "file:") return false;
    const parentPath = directoryUrl.pathname.replace(/\/$/u, "");
    const filePath = fileUrl.pathname;
    const name = filePath.slice(filePath.lastIndexOf("/") + 1);
    return filePath.startsWith(`${parentPath}/`)
      && !filePath.slice(parentPath.length + 1).includes("/")
      && (!filePattern || filePattern.test(name));
  } catch {
    return false;
  }
}

export function persistSnapshotCaptureDraft(
  media: SnapshotProductionMedia,
  scopeKey: string,
): SnapshotProductionMedia {
  if (!media.uri.startsWith("file:")) return media;
  const directory = draftDirectory(scopeKey);
  ensureDirectory(directory);
  const source = new File(media.uri);
  if (!source.exists || source.size <= 0) {
    throw new Error("The captured Snapshot media is no longer available.");
  }
  if (media.type === "video" && source.size > MAX_VIDEO_BYTES) {
    throw new Error("Snapshot videos must be 100 MB or smaller.");
  }
  const destination = new File(
    directory,
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extensionFor(media.type)}`,
  );
  source.copy(destination);
  return { ...media, uri: destination.uri };
}

export function cleanupSnapshotMediaDraft(uri: string | undefined, scopeKey: string): void {
  if (!uri) return;
  const directory = draftDirectory(scopeKey);
  if (!ownedBy(directory, uri, /^[a-z0-9]+-[a-z0-9]{8}\.(?:jpg|mov)$/u)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function isSnapshotMediaDraftOwnedByScope(uri: string, scopeKey: string): boolean {
  if (!uri.startsWith("file:")) return false;
  return ownedBy(
    draftDirectory(scopeKey),
    uri,
    /^[a-z0-9]+-[a-z0-9]{8}\.(?:jpg|mov)$/u,
  );
}

export function reapExpiredSnapshotMediaDrafts(
  nowMs = Date.now(),
  maxAgeMs = MAX_DRAFT_AGE_MS,
): number {
  const root = draftRootDirectory();
  if (!root.exists) return 0;
  let removed = 0;
  for (const scopeEntry of root.list()) {
    if (!(scopeEntry instanceof Directory)) continue;
    for (const entry of scopeEntry.list()) {
      if (!(entry instanceof File)) continue;
      if (!ownedBy(scopeEntry, entry.uri, /^[a-z0-9]+-[a-z0-9]{8}\.(?:jpg|mov)$/u)) continue;
      const modified = entry.modificationTime ?? entry.creationTime ?? nowMs;
      if (nowMs - modified > maxAgeMs) {
        entry.delete();
        removed += 1;
      }
    }
  }
  return removed;
}

async function localMediaFile(uri: string, extension: string): Promise<{ file: File; temporary: boolean }> {
  if (uri.startsWith("file:")) {
    const file = new File(uri);
    if (!file.exists || file.size <= 0) throw new Error("Snapshot media is unavailable on this device.");
    return { file, temporary: false };
  }
  const directory = exportDirectory();
  ensureDirectory(directory);
  const destination = new File(directory, `source-${Date.now().toString(36)}.${extension}`);
  await File.downloadFileAsync(uri, destination, { idempotent: true });
  return { file: destination, temporary: true };
}

function cleanupOwnedExport(file: File | undefined): void {
  if (file?.exists && ownedBy(exportDirectory(), file.uri)) file.delete();
}

function cleanupTransientCapture(file: File | undefined): void {
  if (!file?.exists) return;
  if (file.uri.startsWith(Paths.cache.uri)) file.delete();
}

export async function shareFinishedSnapshot(input: {
  mediaUri?: string;
  mediaType?: "photo" | "video";
  compositionRef: RefObject<View | null>;
  overlayRef: RefObject<View | null>;
  dialogTitle: string;
}): Promise<void> {
  const runtimePaths = Paths as typeof Paths | undefined;
  if (!runtimePaths?.cache || typeof Sharing.isAvailableAsync !== "function") {
    await Share.share({ title: input.dialogTitle, message: input.dialogTitle });
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("The system share sheet is unavailable on this device.");
  }
  const directory = exportDirectory();
  ensureDirectory(directory);
  let captured: File | undefined;
  let localSource: File | undefined;
  let finished: File | undefined;
  let sourceTemporary = false;
  try {
    if (input.mediaType !== "video") {
      const uri = await captureRef(input.compositionRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      captured = new File(uri);
      await Sharing.shareAsync(captured.uri, {
        dialogTitle: input.dialogTitle,
        mimeType: "image/png",
        UTI: "public.png",
      });
      return;
    }

    if (!input.mediaUri) throw new Error("The Snapshot video is unavailable.");
    if (!canComposeSnapshotVideo()) {
      throw new Error("Install the current Canal development build to export finished Snapshot videos.");
    }
    const source = await localMediaFile(input.mediaUri, "mov");
    localSource = source.file;
    sourceTemporary = source.temporary;
    const overlayUri = await captureRef(input.overlayRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
    captured = new File(overlayUri);
    finished = new File(directory, `canal-snapshot-${Date.now().toString(36)}.mp4`);
    const resultUri = await composeSnapshotVideo(localSource.uri, captured.uri, finished.uri);
    const result = new File(resultUri);
    if (!result.exists || result.size <= 0) throw new Error("The finished Snapshot video is empty.");
    if (result.size > MAX_VIDEO_BYTES) throw new Error("The finished Snapshot video exceeds 100 MB.");
    await Sharing.shareAsync(result.uri, {
      dialogTitle: input.dialogTitle,
      mimeType: "video/mp4",
      UTI: "public.mpeg-4",
    });
  } finally {
    cleanupTransientCapture(captured);
    cleanupOwnedExport(finished);
    if (sourceTemporary) cleanupOwnedExport(localSource);
  }
}
function draftDirectory(scopeKey: string): Directory {
  return new Directory(draftRootDirectory(), safeScopeKey(scopeKey));
}

function draftRootDirectory(): Directory {
  return new Directory(Paths.document, "canal-snapshot-drafts");
}

function exportDirectory(): Directory {
  return new Directory(Paths.cache, "canal-snapshot-exports");
}
