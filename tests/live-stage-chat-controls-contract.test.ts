import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "app", "live-stage", "[stageId].tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "lib", "live-stages.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260808192305_stage_chat_controls_and_reactions.sql"), "utf8");
const unicodeMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260808215648_stage_chat_unicode_reactions.sql"), "utf8");
const picker = fs.readFileSync(path.join(root, "components", "stage-emoji-picker.tsx"), "utf8");

describe("Stage chat ownership controls", () => {
  it("offers accessible Unicode emoji reactions and author edit/delete", () => {
    expect(route).toContain("Edit your message");
    expect(route).toContain("Delete your message");
    expect(route).toContain("Long press for reactions and message actions");
    expect(route).toContain("Add emoji reaction");
    expect(route).toContain("React to message");
    expect(route).toContain("actionsVisible");
    expect(route.indexOf("<StageEmojiPicker")).toBeGreaterThan(route.indexOf("visible={chatOpen}"));
    expect(route).toContain("Long press to view who reacted");
    expect(route).toMatch(/hitSlop=\{7\}[\s\S]*reactionButton/u);
    expect(route).toMatch(/reactionButton:[\s\S]*minHeight: 34/u);
    expect(route).toContain('autoCapitalize="none"');
    expect(picker).toContain("Search emojis");
    expect(picker).toContain("Search or paste an emoji");
    expect(picker).toContain("stage-emoji-recents");
    expect(picker).toContain("accessibilityViewIsModal");
    expect(picker).not.toContain("<Modal");
    expect(picker.match(/autoCapitalize="none"/gu)).toHaveLength(1);
    expect(picker).toContain('height: "38%"');
    expect(picker).toContain("numColumns={8}");
  });

  it("keeps edits author-owned and reactions member-owned under RLS", () => {
    expect(migration).toMatch(/Authors can edit their live Stage messages[\s\S]*auth[.]uid[(][)]\) = user_id/u);
    expect(migration).toMatch(/Members can add their Stage message reactions[\s\S]*member[.]user_id = \(select auth[.]uid[(][)]\)/u);
    expect(library).toContain("editLiveStageMessage");
    expect(library).toContain("deleteLiveStageMessage");
    expect(library).toContain("toggleLiveStageMessageReaction");
    expect(library).toContain("normalizeLiveStageMessageReaction");
    expect(unicodeMigration).toContain("char_length(reaction) between 1 and 16");
    expect(unicodeMigration).toContain("count(distinct reaction) >= 24");
    expect(unicodeMigration).toContain("count(*) >= 12");
  });
});
