import ExpoModulesCore
import MusicKit

@available(iOS 15.0, *)
public final class CanalAppleMusicModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CanalAppleMusic")

    AsyncFunction("getStatus") {
      return try await self.statusPayload()
    }

    AsyncFunction("requestAuthorization") {
      _ = await MusicAuthorization.request()
      return try await self.statusPayload()
    }

    AsyncFunction("searchCatalog") { (query: String, limit: Int) in
      try await self.requireAuthorization()
      let boundedLimit = min(max(limit, 1), 25)
      var request = MusicCatalogSearchRequest(term: query, types: [Song.self])
      request.limit = boundedLimit
      let response = try await request.response()
      return response.songs.map(self.songPayload)
    }

    AsyncFunction("readLibrary") { (songLimit: Int, playlistLimit: Int) in
      try await self.requireAuthorization()
      guard #available(iOS 16.0, *) else {
        throw CanalAppleMusicError.libraryRequiresIOS16
      }

      let boundedSongLimit = min(max(songLimit, 1), 5_000)
      let boundedPlaylistLimit = min(max(playlistLimit, 1), 1_000)
      let songs = try await self.readSongs(limit: boundedSongLimit)
      let playlists = try await self.readPlaylists(limit: boundedPlaylistLimit)
      let albums = try await self.readAlbums(limit: 2_000)
      let artists = try await self.readArtists(limit: 2_000)
      let playlistTracks = await self.readPlaylistTracks(
        playlists: playlists.items,
        limit: boundedSongLimit
      )

      var recentRequest = MusicRecentlyPlayedRequest<Song>()
      recentRequest.limit = 100
      let recentResponse = try? await recentRequest.response()
      let recentSongs = recentResponse.map { Array($0.items) } ?? []

      return [
        "songs": songs.items.map(self.songPayload),
        "playlists": playlists.items.map(self.playlistPayload),
        "playlistTracks": playlistTracks.items.map(self.songPayload),
        "albums": albums.items.map(self.albumPayload),
        "artists": artists.items.map(self.artistPayload),
        "recentSongs": recentSongs.map(self.songPayload),
        "songsTruncated": songs.truncated,
        "playlistsTruncated": playlists.truncated,
        "playlistTracksTruncated": playlistTracks.truncated,
        "albumsTruncated": albums.truncated,
        "artistsTruncated": artists.truncated,
      ]
    }

    AsyncFunction("createPlaylist") { (name: String, description: String, songIds: [String]) in
      try await self.requireAuthorization()
      guard #available(iOS 16.0, *) else {
        throw CanalAppleMusicError.libraryRequiresIOS16
      }
      let subscription = try await MusicSubscription.current
      guard subscription.hasCloudLibraryEnabled else {
        throw CanalAppleMusicError.cloudLibraryRequired
      }

      let boundedSongIds = Array(songIds[0..<min(songIds.count, 250)])
      let ids = Array(Set(boundedSongIds)).map { MusicItemID($0) }
      guard !ids.isEmpty else {
        throw CanalAppleMusicError.noTracks
      }

      var request = MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: ids)
      request.limit = ids.count
      let response = try await request.response()
      let songs = Array(response.items)
      guard !songs.isEmpty else {
        throw CanalAppleMusicError.noTracks
      }

      let playlist = try await MusicLibrary.shared.createPlaylist(
        name: String(name.prefix(100)),
        description: String(description.prefix(300)),
        authorDisplayName: "Canal",
        items: songs
      )

      return [
        "id": playlist.id.rawValue,
        "name": playlist.name,
        "url": playlist.url?.absoluteString as Any,
        "trackCount": songs.count,
      ]
    }
  }

  private func requireAuthorization() async throws {
    guard MusicAuthorization.currentStatus == .authorized else {
      throw CanalAppleMusicError.authorizationRequired
    }
  }

  @available(iOS 16.0, *)
  private func readSongs(limit: Int) async throws -> (items: [Song], truncated: Bool) {
    var items: [Song] = []
    var offset = 0
    while items.count < limit {
      var request = MusicLibraryRequest<Song>()
      request.limit = min(100, limit - items.count)
      request.offset = offset
      let response = try await request.response()
      let page = Array(response.items)
      items.append(contentsOf: page)
      if page.count < request.limit { return (items, false) }
      offset += page.count
    }
    var probe = MusicLibraryRequest<Song>()
    probe.limit = 1
    probe.offset = offset
    return (items, !(try await probe.response()).items.isEmpty)
  }

  @available(iOS 16.0, *)
  private func readPlaylists(limit: Int) async throws -> (items: [Playlist], truncated: Bool) {
    var items: [Playlist] = []
    var offset = 0
    while items.count < limit {
      var request = MusicLibraryRequest<Playlist>()
      request.limit = min(50, limit - items.count)
      request.offset = offset
      let response = try await request.response()
      let page = Array(response.items)
      items.append(contentsOf: page)
      if page.count < request.limit { return (items, false) }
      offset += page.count
    }
    var probe = MusicLibraryRequest<Playlist>()
    probe.limit = 1
    probe.offset = offset
    return (items, !(try await probe.response()).items.isEmpty)
  }

  @available(iOS 16.0, *)
  private func readAlbums(limit: Int) async throws -> (items: [Album], truncated: Bool) {
    var items: [Album] = []
    var offset = 0
    while items.count < limit {
      var request = MusicLibraryRequest<Album>()
      request.limit = min(100, limit - items.count)
      request.offset = offset
      let response = try await request.response()
      let page = Array(response.items)
      items.append(contentsOf: page)
      if page.count < request.limit { return (items, false) }
      offset += page.count
    }
    var probe = MusicLibraryRequest<Album>()
    probe.limit = 1
    probe.offset = offset
    return (items, !(try await probe.response()).items.isEmpty)
  }

  @available(iOS 16.0, *)
  private func readArtists(limit: Int) async throws -> (items: [Artist], truncated: Bool) {
    var items: [Artist] = []
    var offset = 0
    while items.count < limit {
      var request = MusicLibraryRequest<Artist>()
      request.limit = min(100, limit - items.count)
      request.offset = offset
      let response = try await request.response()
      let page = Array(response.items)
      items.append(contentsOf: page)
      if page.count < request.limit { return (items, false) }
      offset += page.count
    }
    var probe = MusicLibraryRequest<Artist>()
    probe.limit = 1
    probe.offset = offset
    return (items, !(try await probe.response()).items.isEmpty)
  }

  @available(iOS 16.0, *)
  private func readPlaylistTracks(
    playlists: [Playlist],
    limit: Int
  ) async -> (items: [Song], truncated: Bool) {
    // Loading every relationship for a very large account can turn a normal
    // sync into hundreds of network requests. Scan a bounded playlist window,
    // hydrate four relationships at a time, and cap each individual playlist.
    let playlistScanLimit = min(playlists.count, 200)
    let perPlaylistTrackLimit = 500
    let concurrencyLimit = 4
    let candidates = Array(playlists.prefix(playlistScanLimit))
    var songsById: [MusicItemID: Song] = [:]
    var orderedIds: [MusicItemID] = []
    var truncated = playlists.count > playlistScanLimit

    for batchStart in stride(from: 0, to: candidates.count, by: concurrencyLimit) {
      let batchEnd = min(batchStart + concurrencyLimit, candidates.count)
      let batch = Array(candidates[batchStart..<batchEnd])
      let results = await withTaskGroup(
        of: PlaylistTrackLoadResult.self,
        returning: [PlaylistTrackLoadResult].self
      ) { group in
        for (batchOffset, playlist) in batch.enumerated() {
          group.addTask {
            await loadPlaylistTracks(
              playlist,
              order: batchStart + batchOffset,
              limit: perPlaylistTrackLimit
            )
          }
        }

        var loaded: [PlaylistTrackLoadResult] = []
        for await result in group {
          loaded.append(result)
        }
        return loaded.sorted { $0.order < $1.order }
      }

      for result in results {
        truncated = truncated || result.truncated
        for song in result.songs where songsById[song.id] == nil {
          songsById[song.id] = song
          orderedIds.append(song.id)
          if orderedIds.count >= limit {
            truncated = true
            break
          }
        }
        if orderedIds.count >= limit { break }
      }

      if orderedIds.count >= limit { break }
    }

    return (
      orderedIds.compactMap { songsById[$0] },
      truncated
    )
  }

  private func statusPayload() async throws -> [String: Any] {
    let authorizationStatus = MusicAuthorization.currentStatus
    guard authorizationStatus == .authorized else {
      return [
        "authorizationStatus": statusName(authorizationStatus),
        "canPlayCatalogContent": false,
        "hasCloudLibraryEnabled": false,
      ]
    }

    let subscription = try await MusicSubscription.current
    return [
      "authorizationStatus": statusName(authorizationStatus),
      "canPlayCatalogContent": subscription.canPlayCatalogContent,
      "hasCloudLibraryEnabled": subscription.hasCloudLibraryEnabled,
    ]
  }

  private func statusName(_ status: MusicAuthorization.Status) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    @unknown default: return "unavailable"
    }
  }

  private func songPayload(_ song: Song) -> [String: Any] {
    var payload: [String: Any] = [
      "id": song.id.rawValue,
      "name": song.title,
      "artistName": song.artistName,
      "albumName": song.albumTitle as Any,
      "artworkUrl": song.artwork?.url(width: 600, height: 600)?.absoluteString as Any,
      "durationMs": Int((song.duration ?? 0) * 1000),
      "explicit": song.contentRating == .explicit,
      "genres": song.genreNames,
      "url": song.url?.absoluteString as Any,
      "isrc": song.isrc as Any,
    ]

    if #available(iOS 16.0, *) {
      payload["libraryAddedAt"] = iso8601(song.libraryAddedDate) as Any
      payload["lastPlayedAt"] = iso8601(song.lastPlayedDate) as Any
      payload["playCount"] = song.playCount as Any
    }
    return payload
  }

  @available(iOS 16.0, *)
  private func albumPayload(_ album: Album) -> [String: Any] {
    var payload: [String: Any] = [
      "id": album.id.rawValue,
      "name": album.title,
      "artistName": album.artistName,
      "artworkUrl": album.artwork?.url(width: 600, height: 600)?.absoluteString as Any,
      "genres": album.genreNames,
      "trackCount": album.trackCount,
      "releaseDate": iso8601(album.releaseDate) as Any,
      "url": album.url?.absoluteString as Any,
    ]
    return payload
  }

  @available(iOS 16.0, *)
  private func artistPayload(_ artist: Artist) -> [String: Any] {
    var payload: [String: Any] = [
      "id": artist.id.rawValue,
      "name": artist.name,
      "artworkUrl": artist.artwork?.url(width: 600, height: 600)?.absoluteString as Any,
      "genres": artist.genreNames ?? [],
      "url": artist.url?.absoluteString as Any,
    ]
    return payload
  }

  private func iso8601(_ date: Date?) -> String? {
    guard let date else { return nil }
    return ISO8601DateFormatter().string(from: date)
  }

  @available(iOS 16.0, *)
  private func playlistPayload(_ playlist: Playlist) -> [String: Any] {
    [
      "id": playlist.id.rawValue,
      "name": playlist.name,
      "trackCount": playlist.tracks?.count ?? 0,
      "artworkUrl": playlist.artwork?.url(width: 600, height: 600)?.absoluteString as Any,
      "url": playlist.url?.absoluteString as Any,
    ]
  }
}

@available(iOS 16.0, *)
private struct PlaylistTrackLoadResult: Sendable {
  let order: Int
  let songs: [Song]
  let truncated: Bool
}

@available(iOS 16.0, *)
private func loadPlaylistTracks(
  _ playlist: Playlist,
  order: Int,
  limit: Int
) async -> PlaylistTrackLoadResult {
  do {
    let detailed = try await playlist.with(
      [.tracks],
      preferredSource: .library
    )
    guard var collection = detailed.tracks else {
      return PlaylistTrackLoadResult(
        order: order,
        songs: [],
        truncated: false
      )
    }

    var songs: [Song] = []
    var inspectedTrackCount = 0
    var hasMore = false

    while true {
      for track in collection {
        inspectedTrackCount += 1
        if case .song(let song) = track {
          songs.append(song)
        }
        if inspectedTrackCount >= limit {
          hasMore = collection.hasNextBatch || inspectedTrackCount < collection.count
          break
        }
      }

      if inspectedTrackCount >= limit || !collection.hasNextBatch {
        break
      }

      guard let next = try await collection.nextBatch(
        limit: min(100, limit - inspectedTrackCount)
      ) else {
        break
      }
      collection = next
    }

    return PlaylistTrackLoadResult(
      order: order,
      songs: songs,
      truncated: hasMore || collection.hasNextBatch
    )
  } catch {
    // A single unavailable or malformed playlist must not fail the account's
    // complete library sync. Mark the flattened playlist pool incomplete.
    return PlaylistTrackLoadResult(
      order: order,
      songs: [],
      truncated: true
    )
  }
}

private enum CanalAppleMusicError: LocalizedError {
  case authorizationRequired
  case cloudLibraryRequired
  case libraryRequiresIOS16
  case noTracks

  var errorDescription: String? {
    switch self {
    case .authorizationRequired:
      return "Allow Canal to access Apple Music before using this feature."
    case .cloudLibraryRequired:
      return "Turn on Sync Library in Apple Music before exporting a Scene playlist."
    case .libraryRequiresIOS16:
      return "Apple Music library sync and Scene playlist export require iOS 16 or newer."
    case .noTracks:
      return "Canal could not match any Scene tracks in the Apple Music catalog."
    }
  }
}
