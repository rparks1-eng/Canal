import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("published Snapshot composition", () => {
  it("renders the same composed post in the feed and detail route", () => {
    const feed = read("components/PublicSnapshotCard.tsx");
    const detail = read("app/snapshots/[snapshotId].tsx");
    const composition = read("components/snapshot-composition.tsx");

    expect(feed).toContain("<SnapshotComposition");
    expect(detail).toContain("<SnapshotComposition snapshot={snapshot}");
    expect(detail).not.toContain("<SnapshotMediaPreview");
    expect(composition).toContain("snapshot.mediaUri");
    expect(composition).toContain("exportBrand");
    expect(composition).toContain("snapshot.sceneName");
    expect(composition).toContain("snapshot.sceneActivity");
    expect(composition).toContain("snapshot.trackImageUrl");
    expect(composition).toContain("snapshot.trackTitle");
    expect(composition).toContain("<SceneCardBackdrop");
    expect(composition).toContain("fallbackPresentation");
    expect(composition).not.toContain("<LivingCover");
  });

  it("freezes video thumbnails app-wide and plays only an opened Snapshot", () => {
    const preview = read("components/snapshot-media-preview.tsx");
    const composition = read("components/snapshot-composition.tsx");
    const feed = read("components/PublicSnapshotCard.tsx");
    const library = read("app/(tabs)/library.tsx");
    const detail = read("app/snapshots/[snapshotId].tsx");

    expect(preview).toContain("if (autoPlay) instance.play()");
    expect(preview).toContain("else instance.pause()");
    expect(composition).toContain("playVideo = false");
    expect(composition).toContain("autoPlay={playVideo}");
    expect(feed).not.toContain("playVideo");
    expect(library).not.toContain("playVideo");
    expect(detail).toContain("<SnapshotComposition snapshot={snapshot} height={500} playVideo />");
  });

  it("overlays notes and free-standing song details without in-app Canal branding", () => {
    const feed = read("components/PublicSnapshotCard.tsx");
    const composition = read("components/snapshot-composition.tsx");
    const detail = read("app/snapshots/[snapshotId].tsx");

    expect(feed).not.toContain("No note added");
    expect(feed).not.toContain("Template ·");
    expect(composition).toContain("snapshot.note ? (");
    expect(composition).toContain("styles.compactNote");
    expect(composition).not.toContain('backgroundColor: "rgba(8, 11, 16, 0.48)"');
    expect(detail).toContain("exportBrand");
  });

  it("uses the Canal verification icon instead of a text badge in Explore", () => {
    const feed = read("components/PublicSnapshotCard.tsx");

    expect(feed).toContain('import { VerifiedAccountBadge } from "./verified-account-badge";');
    expect(feed).toContain("<VerifiedAccountBadge");
    expect(feed).not.toContain('"VERIFIED"');
  });

  it("preserves uploaded media during metadata-only Snapshot edits", () => {
    const cloud = read("lib/snapshot-cloud.ts");

    expect(cloud).toContain('.select("media_path, media_type, media_mime_type")');
    expect(cloud).toContain("const mediaPath =");
    expect(cloud).toContain("media.mediaPath ?? cleanOptionalString(preservedMedia?.media_path)");
    expect(cloud).toContain("media_path: mediaPath ?? null");
  });

  it("persists and safely backfills immutable composition display data", () => {
    const migration = read(
      "supabase/migrations/20260809004500_snapshot_composition_provenance.sql",
    );
    const cloud = read("lib/snapshot-cloud.ts");
    const composer = read("app/scene-snapshot.tsx");

    expect(migration).toContain("add column if not exists scene_activity text");
    expect(migration).toContain("add column if not exists track_image_url text");
    expect(migration).toContain("snapshots_track_image_url_safe");
    expect(migration).toContain("from public.live_stages as stage");
    expect(cloud).toContain('"scene_activity"');
    expect(cloud).toContain('"track_image_url"');
    expect(composer).toContain("sceneActivity:");
    expect(composer).toContain("trackImageUrl:");
  });
});
