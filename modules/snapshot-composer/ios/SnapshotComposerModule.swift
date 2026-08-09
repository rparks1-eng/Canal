import AVFoundation
import ExpoModulesCore
import UIKit

public final class SnapshotComposerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SnapshotComposer")

    AsyncFunction("composeVideo") { (videoUri: String, overlayUri: String, outputUri: String) in
      return try await composeVideo(videoUri: videoUri, overlayUri: overlayUri, outputUri: outputUri)
    }
  }

  private func composeVideo(videoUri: String, overlayUri: String, outputUri: String) async throws -> String {
    guard let videoURL = URL(string: videoUri), videoURL.isFileURL,
          let overlayURL = URL(string: overlayUri), overlayURL.isFileURL,
          let outputURL = URL(string: outputUri), outputURL.isFileURL else {
      throw SnapshotComposerError.invalidUri
    }
    guard let overlayImage = UIImage(contentsOfFile: overlayURL.path)?.cgImage else {
      throw SnapshotComposerError.invalidOverlay
    }

    let asset = AVURLAsset(url: videoURL)
    let duration = try await asset.load(.duration)
    let boundedDuration = CMTimeMinimum(duration, CMTime(seconds: 10, preferredTimescale: 600))
    guard boundedDuration.seconds > 0 else { throw SnapshotComposerError.emptyVideo }

    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    guard let sourceVideoTrack = videoTracks.first else { throw SnapshotComposerError.emptyVideo }
    let naturalSize = try await sourceVideoTrack.load(.naturalSize)
    let preferredTransform = try await sourceVideoTrack.load(.preferredTransform)
    let transformedRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    let renderSize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))

    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else { throw SnapshotComposerError.compositionFailed }
    try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: boundedDuration), of: sourceVideoTrack, at: .zero)

    if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first,
       let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      try? audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: boundedDuration), of: sourceAudioTrack, at: .zero)
    }

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: boundedDuration)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    var normalizedTransform = preferredTransform
    normalizedTransform.tx -= transformedRect.origin.x
    normalizedTransform.ty -= transformedRect.origin.y
    layerInstruction.setTransform(normalizedTransform, at: .zero)
    instruction.layerInstructions = [layerInstruction]

    let videoComposition = AVMutableVideoComposition()
    videoComposition.instructions = [instruction]
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

    let videoLayer = CALayer()
    videoLayer.frame = CGRect(origin: .zero, size: renderSize)
    let overlayLayer = CALayer()
    overlayLayer.frame = videoLayer.frame
    overlayLayer.contents = overlayImage
    overlayLayer.contentsGravity = .resizeAspectFill
    overlayLayer.isGeometryFlipped = true
    let parentLayer = CALayer()
    parentLayer.frame = videoLayer.frame
    parentLayer.addSublayer(videoLayer)
    parentLayer.addSublayer(overlayLayer)
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
      postProcessingAsVideoLayer: videoLayer,
      in: parentLayer
    )

    try? FileManager.default.removeItem(at: outputURL)
    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw SnapshotComposerError.exportUnavailable
    }
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.shouldOptimizeForNetworkUse = true
    exporter.videoComposition = videoComposition
    exporter.timeRange = CMTimeRange(start: .zero, duration: boundedDuration)
    await exporter.export()
    guard exporter.status == .completed else {
      throw exporter.error ?? SnapshotComposerError.exportFailed
    }
    return outputURL.absoluteString
  }
}

private enum SnapshotComposerError: LocalizedError {
  case invalidUri, invalidOverlay, emptyVideo, compositionFailed, exportUnavailable, exportFailed

  var errorDescription: String? {
    switch self {
    case .invalidUri: return "Snapshot media must be a local file."
    case .invalidOverlay: return "Canal could not render the Snapshot overlay."
    case .emptyVideo: return "The Snapshot video is empty."
    case .compositionFailed: return "Canal could not prepare the Snapshot video."
    case .exportUnavailable: return "Finished Snapshot video export is unavailable."
    case .exportFailed: return "Canal could not finish the Snapshot video."
    }
  }
}
