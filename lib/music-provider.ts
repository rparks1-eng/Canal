import type {
  MusicCatalogSearchRequest,
  MusicCatalogTrack,
  MusicLibrarySnapshot,
  MusicProviderCapability,
  MusicProviderDescriptor,
  MusicProviderId,
  MusicSceneExportReceipt,
  MusicSceneExportRequest,
} from "./music-provider-model";

export interface MusicProviderAdapter {
  readonly descriptor:
    MusicProviderDescriptor;

  searchCatalog(
    request:
      MusicCatalogSearchRequest,
  ): Promise<
    readonly MusicCatalogTrack[]
  >;

  readLibrarySnapshot(): Promise<
    MusicLibrarySnapshot | null
  >;

  syncLibrary(): Promise<
    MusicLibrarySnapshot
  >;

  exportScene(
    request:
      MusicSceneExportRequest,
  ): Promise<
    MusicSceneExportReceipt
  >;
}

export type MusicProviderRegistry = {
  list(): readonly MusicProviderDescriptor[];

  get(
    providerId:
      MusicProviderId,
  ): MusicProviderAdapter | null;

  require(
    providerId:
      MusicProviderId,
    capability?:
      MusicProviderCapability,
  ): MusicProviderAdapter;
};

export function createMusicProviderRegistry(
  adapters:
    readonly MusicProviderAdapter[],
): MusicProviderRegistry {
  const providers =
    new Map<
      MusicProviderId,
      MusicProviderAdapter
    >();

  for (const adapter of adapters) {
    const providerId =
      adapter.descriptor.id;

    if (
      providers.has(
        providerId,
      )
    ) {
      throw new Error(
        `Canal registered the ${providerId} music provider more than once.`,
      );
    }

    providers.set(
      providerId,
      adapter,
    );
  }

  return {
    list: () =>
      Array.from(
        providers.values(),
        (adapter) =>
          adapter.descriptor,
      ),

    get: (
      providerId,
    ) =>
      providers.get(
        providerId,
      ) ??
      null,

    require: (
      providerId,
      capability,
    ) => {
      const adapter =
        providers.get(
          providerId,
        );

      if (!adapter) {
        throw new Error(
          `Canal does not have a ${providerId} music provider configured.`,
        );
      }

      if (
        capability &&
        !adapter.descriptor
          .capabilities.includes(
            capability,
          )
      ) {
        throw new Error(
          `${adapter.descriptor.displayName} does not support ${capability}.`,
        );
      }

      return adapter;
    },
  };
}
