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

      var songRequest = MusicLibraryRequest<Song>()
      songRequest.limit = min(max(songLimit, 1), 200)
      let songResponse = try await songRequest.response()

      var playlistRequest = MusicLibraryRequest<Playlist>()
      playlistRequest.limit = min(max(playlistLimit, 1), 50)
      let playlistResponse = try await playlistRequest.response()

      return [
        "songs": songResponse.items.map(self.songPayload),
        "playlists": playlistResponse.items.map(self.playlistPayload),
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
    [
      "id": song.id.rawValue,
      "name": song.title,
      "artistName": song.artistName,
      "albumName": song.albumTitle as Any,
      "artworkUrl": song.artwork?.url(width: 600, height: 600)?.absoluteString as Any,
      "durationMs": Int((song.duration ?? 0) * 1000),
      "explicit": song.contentRating == .explicit,
      "genres": song.genreNames,
      "url": song.url?.absoluteString as Any,
    ]
  }

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
