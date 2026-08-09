export type SceneStudioProviderState = Readonly<{
  available: false;
  title: "Music-provider generation is unavailable";
  message: string;
}>;

export const SCENE_STUDIO_PROVIDER_UNAVAILABLE: SceneStudioProviderState =
  Object.freeze({
    available: false,
    title: "Music-provider generation is unavailable",
    message:
      "Canal cannot generate a Scene from Spotify while library import is unavailable. Your Studio draft stays on this device.",
  });

export function getSceneStudioProviderState(): SceneStudioProviderState {
  return SCENE_STUDIO_PROVIDER_UNAVAILABLE;
}
