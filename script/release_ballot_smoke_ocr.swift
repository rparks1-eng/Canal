import AppKit
import Foundation
import Vision

struct ScreenshotText: Codable {
  let path: String
  let text: String
}

func recognizedText(at path: String) throws -> String {
  guard let image = NSImage(contentsOfFile: path) else {
    throw NSError(
      domain: "CanalReleaseBallotSmoke",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey: "Could not read screenshot at \(path)",
      ]
    )
  }

  var proposedRect = NSRect(
    origin: .zero,
    size: image.size
  )

  guard let cgImage = image.cgImage(
    forProposedRect: &proposedRect,
    context: nil,
    hints: nil
  ) else {
    throw NSError(
      domain: "CanalReleaseBallotSmoke",
      code: 2,
      userInfo: [
        NSLocalizedDescriptionKey: "Could not decode screenshot at \(path)",
      ]
    )
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true

  let handler = VNImageRequestHandler(
    cgImage: cgImage,
    options: [:]
  )

  try handler.perform([request])

  let observations =
    (request.results ?? []).sorted {
      let verticalDistance =
        abs(
          $0.boundingBox.midY -
            $1.boundingBox.midY
        )

      if verticalDistance > 0.015 {
        return $0.boundingBox.midY >
          $1.boundingBox.midY
      }

      return $0.boundingBox.minX <
        $1.boundingBox.minX
    }

  return observations.compactMap {
    $0.topCandidates(1).first?.string
  }.joined(separator: "\n")
}

do {
  let paths =
    Array(
      CommandLine.arguments.dropFirst()
    )

  guard !paths.isEmpty else {
    throw NSError(
      domain: "CanalReleaseBallotSmoke",
      code: 3,
      userInfo: [
        NSLocalizedDescriptionKey: "Provide at least one screenshot path.",
      ]
    )
  }

  let results = try paths.map {
    ScreenshotText(
      path: $0,
      text: try recognizedText(at: $0)
    )
  }

  let encoder = JSONEncoder()
  encoder.outputFormatting = [
    .prettyPrinted,
    .sortedKeys,
  ]

  let data = try encoder.encode(results)

  guard let output = String(
    data: data,
    encoding: .utf8
  ) else {
    throw NSError(
      domain: "CanalReleaseBallotSmoke",
      code: 4,
      userInfo: [
        NSLocalizedDescriptionKey: "Could not encode OCR results.",
      ]
    )
  }

  print(output)
} catch {
  FileHandle.standardError.write(
    Data(
      "\(error.localizedDescription)\n".utf8
    )
  )
  exit(1)
}
