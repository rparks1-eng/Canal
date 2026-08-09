import { normalizeLiveStageMessageReaction } from "../lib/live-stages";

describe("Stage emoji reaction normalization", () => {
  it.each(["❤️", "👍🏽", "😂", "👨‍👩‍👧‍👦", "🇺🇸", "1️⃣", "🎵"])("accepts one emoji sequence: %s", (emoji) => {
    expect(normalizeLiveStageMessageReaction(emoji)).toBe(emoji);
  });

  it.each(["", "heart", "hello 😂", "😂 😂", "!", "a", "😂".repeat(20)])("rejects non-emoji or unbounded reactions: %s", (value) => {
    expect(normalizeLiveStageMessageReaction(value)).toBeNull();
  });
});
