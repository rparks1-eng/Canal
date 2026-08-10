import fs from "node:fs";
import path from "node:path";

describe("Scene visibility cloud CAS", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "social.ts"), "utf8");
  const visibilitySource = source.slice(
    source.indexOf("export async function setOwnSceneVisibility"),
  );

  it("refreshes the canonical row and uses the collaborative revision RPC", () => {
    expect(visibilitySource).toContain('.select("user_id, id, payload, revision, created_at, updated_at, deleted_at")');
    expect(visibilitySource).toContain('"update_collaborative_scene"');
    expect(visibilitySource).toContain("expected_revision_value: remoteRow.revision");
    expect(visibilitySource).not.toContain('.upsert(');
    expect(visibilitySource).not.toContain("deleted_at:\n            null");
  });

  it("retries one exact revision conflict and refuses deleted cloud Scenes", () => {
    expect(visibilitySource).toContain("attempt < 2");
    expect(visibilitySource).toContain('savedError.message.includes("SCENE_REVISION_CONFLICT")');
    expect(visibilitySource).toContain("if (conflict && attempt === 0) continue");
    expect(visibilitySource).toContain("if (!remoteRow || remoteRow.deleted_at)");
    expect(visibilitySource).toContain("await assertSceneCacheOwner(sceneCacheOwner)");
  });
});
