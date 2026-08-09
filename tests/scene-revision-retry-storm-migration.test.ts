import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260809075523_stop_scene_revision_retry_storm.sql",
  ),
  "utf8",
);

describe("Scene revision retry-storm remediation", () => {
  it("reclassifies expected Scene conflicts as non-retryable application errors", () => {
    expect(migration).toContain(
      "public.stamp_canal_scene_revision()",
    );
    expect(migration).toContain(
      "public.update_collaborative_scene(uuid,text,bigint,jsonb)",
    );
    expect(migration).toContain(
      "'errcode = ''40001'''",
    );
    expect(migration).toContain(
      "'errcode = ''P0001'''",
    );
    expect(migration).toContain(
      "SCENE_REVISION_CONFLICT",
    );
  });
});
