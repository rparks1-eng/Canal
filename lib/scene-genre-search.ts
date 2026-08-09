function normalizeGenre(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function suggestSceneGenres(
  query: string,
  catalog: readonly string[],
  selected: readonly string[],
  limit = 12,
): string[] {
  const normalizedQuery = normalizeGenre(query);
  const selectedGenres = new Set(selected.map(normalizeGenre));

  return catalog
    .filter((genre) => !selectedGenres.has(normalizeGenre(genre)))
    .map((genre, index) => {
      const normalizedGenre = normalizeGenre(genre);
      const words = normalizedGenre.split(" ");
      const rank = !normalizedQuery
        ? 3
        : normalizedGenre.startsWith(normalizedQuery)
          ? 0
          : words.some((word) => word.startsWith(normalizedQuery))
            ? 1
            : normalizedGenre.includes(normalizedQuery)
              ? 2
              : 99;
      return { genre, index, rank };
    })
    .filter((result) => result.rank < 99)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map((result) => result.genre);
}
