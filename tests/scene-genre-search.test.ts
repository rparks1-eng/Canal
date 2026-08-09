import { suggestSceneGenres } from "../lib/scene-genre-search";
import { SCENE_GENRE_OPTIONS } from "../lib/scene-studio";

describe("Scene genre autocomplete", () => {
  it("narrows real catalog suggestions as each letter is entered", () => {
    expect(suggestSceneGenres("dr", SCENE_GENRE_OPTIONS, [], 10)).toEqual([
      "Dream pop",
      "Drum and bass",
      "Drone",
    ]);
  });

  it("normalizes ampersands and finds both direct and related matches", () => {
    expect(suggestSceneGenres("r&b", SCENE_GENRE_OPTIONS, [], 10)).toEqual([
      "R&B",
      "Alternative R&B",
    ]);
  });

  it("does not suggest an already selected genre and respects the result ceiling", () => {
    const suggestions = suggestSceneGenres("pop", SCENE_GENRE_OPTIONS, ["Pop"], 2);

    expect(suggestions).toEqual(["Indie pop", "Dream pop"]);
  });
});
