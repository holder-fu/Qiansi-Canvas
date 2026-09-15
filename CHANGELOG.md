# Changelog

All notable public release changes are recorded here.

## [1.0.0] - 2026-08-24

First production-ready release of Qiansi-Canvas.

### Release highlights

- Promotes the Bridge-authoritative infinite canvas, project center, media libraries and AI-assisted creation workflows to the stable `1.0.x` line.
- Provides reproducible source validation plus Windows and macOS portable-release tooling with the multilingual launch center.
- Retains the existing project/media formats and the stable `0.1.0` data compatibility path; no destructive migration is required for this version promotion.

### Distribution notes

- GitHub source excludes local projects, credentials, generated media, dependency caches, compiled output and machine-specific runtimes.
- Ordinary users should use a platform-specific portable package; source development requires Node.js 22.12.0 or newer.

## [0.1.0] - 2026-08-22

First stable source release of Qiansi-Canvas.

### Added

- Bridge-authoritative multi-project infinite canvas with text, image, video, audio and director workflows.
- Style, effect, character and prompt libraries with persistent metadata and portable ZIP transfer.
- 2D and 3D directing tools, media editing surfaces, plugin sandbox and trusted private-LAN collaboration.
- Windows and macOS installers/launchers, Linux command-line instructions and reproducible GitHub CI.

### Reliability and security

- Atomic revisioned project/media persistence, managed-media validation and bounded generation recovery.
- Host-only gates for credentials, CLI, update and maintenance operations.
- Clean-checkout test, quality and production-build contracts with Node.js 22.12.0 or newer.

### Distribution notes

- Local projects, generated media, credentials, plugins, models, dependency folders and build output are not part of the source release.
- The repository includes only the explicitly allowlisted starter theme files under `data/canvas-themes/`.
- FFmpeg and FFprobe binaries are distributed separately; see `tools/README.md` and `tools/FFmpeg-README.txt`.
