import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Snapshot camera media contract", () => {
  it("routes Scene and Stage Snapshot actions through camera capture", () => {
    expect(read("app/scenes/[sceneId].tsx")).toContain('pathname:\n                  "/snapshot-camera"');
    expect(read("app/live-stage/[stageId].tsx")).toContain('pathname: "/snapshot-camera"');
  });

  it("supports bounded photo and video capture before composer navigation", () => {
    const source = read("app/snapshot-camera.tsx");
    expect(source).toContain("takePictureAsync");
    expect(source).toContain("recordAsync({ maxDuration: 10 })");
    expect(source).toContain("toggleRecordingAsyncAvailable");
    expect(source).toContain("toggleRecordingAsync()");
    expect(source).toContain("Finish video clip");
    expect(source).toContain("10 second video");
    expect(source).toContain("height={520} autoPlay");
    const preview = read("components/snapshot-media-preview.tsx");
    expect(preview).toContain("instance.loop = true");
    expect(preview).toContain("if (background || autoPlay) instance.play()");
    expect(source).toContain('pathname: "/scene-snapshot"');
    expect(source).toContain("router.push({");
    expect(source).toContain("Use in Snapshot");
    expect(source).toContain("Cancel Snapshot");
    expect(source).toContain("source={{ uri: first(params.trackImageUrl) }}");
    expect(source).toContain("stageId: first(params.stageId)");
    expect(source).toContain("trackImageUrl: first(params.trackImageUrl)");
    expect(source).toContain('style={StyleSheet.absoluteFill}');
  });

  it("uses captured media as the composer canvas and permits an in-source song change", () => {
    const composer = read("app/scene-snapshot.tsx");
    expect(composer).toContain("readLiveStage(params.stageId)");
    expect(composer).toContain("SnapshotMediaPreview uri={mediaUri} type={mediaType} background");
    expect(composer).toContain('accessibilityRole="radiogroup"');
    expect(composer).toContain("setSelectedTrackId(track.id)");
    expect(composer).toContain("trackId: selectedTrack?.id");
    expect(composer).toContain("trackTitle: selectedTrack?.title");
    expect(composer).toContain("trackArtist: selectedTrack?.artist");
    expect(composer).toContain("selectedTrack.imageUrl");
    expect(composer).toContain("routeTrackImageUrl");
    expect(composer).toContain("returnToCapturePreview");
    expect(composer).toContain("stage.tracks.map");
    expect(composer).toContain('normalizedUri.endsWith(".mov")');
    expect(composer).toContain('"video/quicktime"');
  });

  it("stores media privately with exact owner path policies", () => {
    const migration = read("supabase/migrations/202608080001_snapshot_camera_media.sql");
    expect(migration).toContain("'snapshot-media',\n  'snapshot-media',\n  false");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(migration).toContain("media_path = user_id::text || '/' || id");
  });

  it("keeps media credentials out of the client and uses signed playback URLs", () => {
    const cloud = read("lib/snapshot-cloud.ts");
    expect(cloud).toContain('.createSignedUrl(snapshot.mediaPath, 3600)');
    expect(cloud).toContain('new File(mediaUri)');
    expect(cloud).toContain('await mediaFile.arrayBuffer()');
    expect(cloud).toContain('uploadBody.byteLength === 0');
    expect(cloud).not.toContain('fetch(snapshot.mediaUri)');
    expect(cloud).not.toMatch(/service_role|SUPABASE_SERVICE/);
    const feed = read("lib/public-snapshots.ts");
    expect(feed).toContain('"media_path"');
    expect(feed).toContain("hydratePublicSnapshotMedia");
    const card = read("components/PublicSnapshotCard.tsx");
    expect(card).toContain("<SnapshotComposition");
    const composition = read("components/snapshot-composition.tsx");
    expect(composition).toContain("snapshot.mediaUri");
    expect(composition).toContain("<SnapshotMediaPreview");
    const publicPolicy = read("supabase/migrations/20260808214731_public_snapshot_media_read.sql");
    expect(publicPolicy).toContain("snapshots.visibility = 'public'");
    expect(publicPolicy).toContain("snapshots.media_path = storage.objects.name");
  });
});
