import type {
  PublicCanalScene,
} from "./social";

import type {
  LiveStage,
  LiveStageKind,
} from "./live-stages";

function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase();
}

function sceneSearchValues(
  item: PublicCanalScene,
): string[] {
  return [
    item.scene.name,
    item.scene.activity,
    item.scene.emotions,
    item.scene.genres,
    item.scene.artists,
    item.creator.displayName,
    item.creator.handle,
    ...item.scene.tracks.flatMap(
      (track) => [
        track.title,
        track.artist,
      ],
    ),
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value === "string" &&
        Boolean(value.trim()),
    )
    .map(normalizeSearchText);
}

export function publicSceneMatchesQuery(
  item: PublicCanalScene,
  query: string,
): boolean {
  const terms =
    normalizeSearchText(query)
      .split(/\s+/u)
      .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const values =
    sceneSearchValues(item);

  return terms.every(
    (term) =>
      values.some(
        (value) =>
          value.includes(term),
      ),
  );
}

export function filterExploreScenes(
  scenes: PublicCanalScene[],
  query: string,
): PublicCanalScene[] {
  return scenes.filter(
    (scene) =>
      publicSceneMatchesQuery(
        scene,
        query,
      ),
  );
}

export function filterExploreStages(
  stages: LiveStage[],
  query: string,
  filter: "all" | LiveStageKind,
): LiveStage[] {
  const terms = normalizeSearchText(query).split(/\s+/u).filter(Boolean);

  return stages.filter((stage) => {
    if (stage.status !== "live" || stage.visibility !== "public") return false;
    if (filter !== "all" && stage.stageKind !== filter) return false;
    if (terms.length === 0) return true;

    const values = [
      stage.name,
      stage.hostName,
      stage.hostUsername,
      stage.activity,
      ...stage.tracks.flatMap((track) => [track.title, track.artist]),
    ]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map(normalizeSearchText);

    return terms.every((term) => values.some((value) => value.includes(term)));
  });
}
