export type CanalUser = {
  username: string;
  displayName: string;
  initials: string;
  bio: string;
  genres: string[];
  favoriteArtists: string[];
  recentScenes: string[];
  visibility: "public" | "private";
};

export const CANAL_USERS: CanalUser[] = [
  {
    username: "maya.wav",
    displayName: "Maya Thompson",
    initials: "MT",
    bio: "R&B, alternative, and music for late-night drives.",
    genres: [
      "R&B",
      "Alternative",
      "Neo-Soul",
    ],
    favoriteArtists: [
      "SZA",
      "Frank Ocean",
      "Brent Faiyaz",
    ],
    recentScenes: [
      "Late Night Drive",
      "Soft Launch",
      "After Midnight",
    ],
    visibility: "public",
  },
  {
    username: "jordansound",
    displayName: "Jordan Lee",
    initials: "JL",
    bio: "High-energy music for workouts, parties, and everything between.",
    genres: [
      "Hip-Hop",
      "Dance",
      "Electronic",
    ],
    favoriteArtists: [
      "Drake",
      "Travis Scott",
      "Kaytranada",
    ],
    recentScenes: [
      "Pre-Game Energy",
      "Friday Lift",
      "City Lights",
    ],
    visibility: "public",
  },
  {
    username: "nico.fm",
    displayName: "Nico Alvarez",
    initials: "NA",
    bio: "Indie, electronic, and music for long walks through the city.",
    genres: [
      "Indie",
      "Electronic",
      "Alternative",
    ],
    favoriteArtists: [
      "Tame Impala",
      "The Marías",
      "Fred again..",
    ],
    recentScenes: [
      "Train Window",
      "Slow Saturday",
    ],
    visibility: "public",
  },
  {
    username: "samira.mp3",
    displayName: "Samira Brooks",
    initials: "SB",
    bio: "Afrobeats, soul, and music that makes ordinary moments feel warmer.",
    genres: [
      "Afrobeats",
      "Soul",
      "R&B",
    ],
    favoriteArtists: [
      "Tems",
      "Wizkid",
      "Cleo Sol",
    ],
    recentScenes: [
      "Sunday Reset",
      "Golden Hour",
      "Kitchen Dancing",
    ],
    visibility: "public",
  },
  {
    username: "elliotlistens",
    displayName: "Elliot Chen",
    initials: "EC",
    bio: "Focused listening, quiet production, and music for getting work done.",
    genres: [
      "Lo-Fi",
      "Jazz",
      "Ambient",
    ],
    favoriteArtists: [
      "Nujabes",
      "BADBADNOTGOOD",
      "Khruangbin",
    ],
    recentScenes: [
      "Late Study Session",
      "Deep Work",
    ],
    visibility: "public",
  },
];

export const MOCK_USERS =
  CANAL_USERS;

export function getCanalUser(
  username: string,
): CanalUser | undefined {
  const normalizedUsername =
    normalizeUsername(username);

  return CANAL_USERS.find(
    (user) =>
      user.username ===
      normalizedUsername,
  );
}

function normalizeUsername(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}