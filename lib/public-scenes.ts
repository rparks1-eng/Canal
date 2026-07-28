import {
  SceneTrack,
  StoredScene,
} from "./scenes";

export type PublicSceneCategory =
  | "Trending"
  | "Focus"
  | "Night"
  | "Energy"
  | "Relax"
  | "Social";

export type PublicScene = {
  id: string;
  name: string;
  creatorUsername: string;
  creatorName: string;
  creatorInitials: string;
  description: string;
  activity: string;
  duration: string;
  emotions: string;
  genres: string;
  energy: string;
  artists: string;
  category: PublicSceneCategory;
  saveCount: number;
  createdAt: string;
  tracks: SceneTrack[];
};

export const PUBLIC_SCENES: PublicScene[] = [
  {
    id: "late-night-drive",
    name: "Late Night Drive",
    creatorUsername: "maya.wav",
    creatorName: "Maya Thompson",
    creatorInitials: "MT",
    description:
      "Warm R&B and alternative music for empty roads, city lights, and no destination.",
    activity: "Driving at night",
    duration: "60 minutes",
    emotions:
      "Reflective, Calm, Nostalgic",
    genres:
      "R&B, Alternative, Neo-Soul",
    energy: "Low to medium",
    artists:
      "SZA, Frank Ocean, Brent Faiyaz",
    category: "Night",
    saveCount: 1842,
    createdAt:
      "2026-07-16T22:30:00.000Z",
    tracks: [
      createTrack(
        "ln-1",
        "Snooze",
        "SZA",
      ),
      createTrack(
        "ln-2",
        "Pink + White",
        "Frank Ocean",
      ),
      createTrack(
        "ln-3",
        "Clouded",
        "Brent Faiyaz",
      ),
      createTrack(
        "ln-4",
        "Why Don't You",
        "Cleo Sol",
      ),
      createTrack(
        "ln-5",
        "Free Mind",
        "Tems",
      ),
    ],
  },
  {
    id: "deep-work-window",
    name: "Deep Work Window",
    creatorUsername:
      "elliotlistens",
    creatorName: "Elliot Chen",
    creatorInitials: "EC",
    description:
      "Quiet jazz, ambient textures, and low-distraction music for focused work.",
    activity:
      "Studying and focused work",
    duration: "2+ hours",
    emotions: "Focused, Calm",
    genres:
      "Lo-Fi, Jazz, Ambient",
    energy: "Low",
    artists:
      "Nujabes, BADBADNOTGOOD, Khruangbin",
    category: "Focus",
    saveCount: 1376,
    createdAt:
      "2026-07-17T14:20:00.000Z",
    tracks: [
      createTrack(
        "dw-1",
        "Aruarian Dance",
        "Nujabes",
      ),
      createTrack(
        "dw-2",
        "Time Moves Slow",
        "BADBADNOTGOOD",
      ),
      createTrack(
        "dw-3",
        "Friday Morning",
        "Khruangbin",
      ),
      createTrack(
        "dw-4",
        "Quiet Focus",
        "Canal",
      ),
      createTrack(
        "dw-5",
        "Open Notes",
        "Canal",
      ),
    ],
  },
  {
    id: "outside-tonight",
    name: "Outside Tonight",
    creatorUsername:
      "jordansound",
    creatorName: "Jordan Lee",
    creatorInitials: "JL",
    description:
      "High-energy hip-hop and dance music for getting ready and going out.",
    activity:
      "Getting ready to go out",
    duration: "90 minutes",
    emotions:
      "Confident, Excited",
    genres:
      "Hip-Hop, Dance, Electronic",
    energy: "High",
    artists:
      "Drake, Travis Scott, Kaytranada",
    category: "Social",
    saveCount: 2241,
    createdAt:
      "2026-07-18T19:45:00.000Z",
    tracks: [
      createTrack(
        "ot-1",
        "Sticky",
        "Drake",
      ),
      createTrack(
        "ot-2",
        "LITE SPOTS",
        "Kaytranada",
      ),
      createTrack(
        "ot-3",
        "FE!N",
        "Travis Scott",
      ),
      createTrack(
        "ot-4",
        "Full Energy",
        "Canal",
      ),
      createTrack(
        "ot-5",
        "All Night",
        "Canal",
      ),
    ],
  },
  {
    id: "sunday-reset",
    name: "Sunday Reset",
    creatorUsername:
      "samira.mp3",
    creatorName: "Samira Brooks",
    creatorInitials: "SB",
    description:
      "Soulful, warm music for cleaning, cooking, planning, and beginning again.",
    activity:
      "Cleaning and resetting",
    duration: "90 minutes",
    emotions:
      "Optimistic, Calm",
    genres:
      "Soul, R&B, Afrobeats",
    energy: "Medium",
    artists:
      "Tems, Cleo Sol, Wizkid",
    category: "Relax",
    saveCount: 1988,
    createdAt:
      "2026-07-19T11:15:00.000Z",
    tracks: [
      createTrack(
        "sr-1",
        "Free Mind",
        "Tems",
      ),
      createTrack(
        "sr-2",
        "Know That You Are Loved",
        "Cleo Sol",
      ),
      createTrack(
        "sr-3",
        "Essence",
        "Wizkid",
      ),
      createTrack(
        "sr-4",
        "Golden Hour",
        "Canal",
      ),
      createTrack(
        "sr-5",
        "New Feeling",
        "Canal",
      ),
    ],
  },
  {
    id: "city-walk",
    name: "City Walk",
    creatorUsername: "nico.fm",
    creatorName: "Nico Alvarez",
    creatorInitials: "NA",
    description:
      "Indie and electronic music for moving through the city without rushing.",
    activity:
      "Walking through the city",
    duration: "45 minutes",
    emotions:
      "Reflective, Optimistic",
    genres:
      "Indie, Electronic, Alternative",
    energy: "Medium",
    artists:
      "Tame Impala, The Marías, Fred again..",
    category: "Trending",
    saveCount: 1654,
    createdAt:
      "2026-07-20T16:10:00.000Z",
    tracks: [
      createTrack(
        "cw-1",
        "Borderline",
        "Tame Impala",
      ),
      createTrack(
        "cw-2",
        "Hush",
        "The Marías",
      ),
      createTrack(
        "cw-3",
        "Delilah",
        "Fred again..",
      ),
      createTrack(
        "cw-4",
        "Moving Through",
        "Canal",
      ),
      createTrack(
        "cw-5",
        "Night Air",
        "Canal",
      ),
    ],
  },
  {
    id: "first-rep",
    name: "First Rep",
    creatorUsername:
      "jordansound",
    creatorName: "Jordan Lee",
    creatorInitials: "JL",
    description:
      "Fast, aggressive momentum for starting the workout without hesitation.",
    activity: "Working out",
    duration: "60 minutes",
    emotions:
      "Confident, Excited",
    genres:
      "Hip-Hop, Electronic, Dance",
    energy: "High",
    artists:
      "Travis Scott, Drake, Kaytranada",
    category: "Energy",
    saveCount: 1134,
    createdAt:
      "2026-07-20T18:40:00.000Z",
    tracks: [
      createTrack(
        "fr-1",
        "FE!N",
        "Travis Scott",
      ),
      createTrack(
        "fr-2",
        "Nonstop",
        "Drake",
      ),
      createTrack(
        "fr-3",
        "10%",
        "Kaytranada",
      ),
      createTrack(
        "fr-4",
        "No Waiting",
        "Canal",
      ),
      createTrack(
        "fr-5",
        "One More",
        "Canal",
      ),
    ],
  },
  {
    id: "soft-launch",
    name: "Soft Launch",
    creatorUsername: "maya.wav",
    creatorName: "Maya Thompson",
    creatorInitials: "MT",
    description:
      "Low-key romantic music for when the relationship is real but the post is subtle.",
    activity: "Date night",
    duration: "60 minutes",
    emotions:
      "Romantic, Calm, Confident",
    genres:
      "R&B, Neo-Soul",
    energy: "Low to medium",
    artists:
      "SZA, Frank Ocean, Cleo Sol",
    category: "Trending",
    saveCount: 2782,
    createdAt:
      "2026-07-21T20:25:00.000Z",
    tracks: [
      createTrack(
        "sl-1",
        "Snooze",
        "SZA",
      ),
      createTrack(
        "sl-2",
        "Thinkin Bout You",
        "Frank Ocean",
      ),
      createTrack(
        "sl-3",
        "When I'm in Your Arms",
        "Cleo Sol",
      ),
      createTrack(
        "sl-4",
        "Only Us",
        "Canal",
      ),
      createTrack(
        "sl-5",
        "No Rush",
        "Canal",
      ),
    ],
  },
  {
    id: "train-window",
    name: "Train Window",
    creatorUsername: "nico.fm",
    creatorName: "Nico Alvarez",
    creatorInitials: "NA",
    description:
      "Dreamy music for watching buildings, trees, and people pass through the glass.",
    activity: "Riding the train",
    duration: "45 minutes",
    emotions:
      "Nostalgic, Reflective",
    genres:
      "Indie, Alternative, Ambient",
    energy: "Low",
    artists:
      "The Marías, Tame Impala, Khruangbin",
    category: "Relax",
    saveCount: 947,
    createdAt:
      "2026-07-22T09:30:00.000Z",
    tracks: [
      createTrack(
        "tw-1",
        "Only in My Dreams",
        "The Marías",
      ),
      createTrack(
        "tw-2",
        "Yes I'm Changing",
        "Tame Impala",
      ),
      createTrack(
        "tw-3",
        "Friday Morning",
        "Khruangbin",
      ),
      createTrack(
        "tw-4",
        "Soft Window",
        "Canal",
      ),
      createTrack(
        "tw-5",
        "In Between",
        "Canal",
      ),
    ],
  },
];

export const PUBLIC_SCENE_CATEGORIES:
  PublicSceneCategory[] = [
    "Trending",
    "Focus",
    "Night",
    "Energy",
    "Relax",
    "Social",
  ];

export function getPublicScene(
  sceneId: string,
): PublicScene | null {
  return (
    PUBLIC_SCENES.find(
      (scene) =>
        scene.id === sceneId,
    ) ?? null
  );
}

export function publicSceneToStoredScene(
  scene: PublicScene,
): StoredScene {
  const now =
    new Date().toISOString();

  return {
    id:
      getSavedPublicSceneId(
        scene.id,
      ),

    name: scene.name,
    activity:
      scene.activity,
    duration:
      scene.duration,
    emotions:
      scene.emotions,
    genres: scene.genres,
    energy: scene.energy,
    familiarity:
      "Balanced",
    artists:
      scene.artists,
    songRequest: "",
    avoid: "",
    collaborators: [],
    tracks:
      scene.tracks.map(
        (track) => ({
          ...track,
        }),
      ),
    visibility: "public",
    createdAt: now,
    updatedAt: now,
    libraryType: "saved",
  };
}

export function getSavedPublicSceneId(
  publicSceneId: string,
): string {
  return `saved-${publicSceneId}`;
}

function createTrack(
  id: string,
  title: string,
  artist: string,
): SceneTrack {
  return {
    id,
    title,
    artist,
    source: "Canal",
  };
}