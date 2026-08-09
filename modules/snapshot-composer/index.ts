import { requireOptionalNativeModule } from "expo";

type SnapshotComposerNativeModule = {
  composeVideo(videoUri: string, overlayUri: string, outputUri: string): Promise<string>;
};

const nativeModule = requireOptionalNativeModule<SnapshotComposerNativeModule>("SnapshotComposer");

export function canComposeSnapshotVideo(): boolean {
  return Boolean(nativeModule);
}

export async function composeSnapshotVideo(
  videoUri: string,
  overlayUri: string,
  outputUri: string,
): Promise<string> {
  if (!nativeModule) {
    throw new Error("Finished Snapshot video export is unavailable in this build.");
  }
  return nativeModule.composeVideo(videoUri, overlayUri, outputUri);
}
