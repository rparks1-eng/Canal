Pod::Spec.new do |s|
  s.name           = 'SnapshotComposer'
  s.version        = '1.0.0'
  s.summary        = 'Canal finished Snapshot video composition'
  s.description    = 'Composes a bounded user-owned video with a Canal-generated overlay.'
  s.author         = 'Canal'
  s.homepage       = 'https://canal.local'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'QuartzCore', 'UIKit'
  s.swift_version = '5.9'
end
