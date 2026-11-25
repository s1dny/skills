---
name: youtube
description: Pull a YouTube video's transcript with its title, channel, upload date, description and chapters. Use whenever the user shares a YouTube link or asks you to watch, read, summarise or quote a video.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run commands from that root:

```sh
bun run youtube transcript 'https://www.youtube.com/watch?v=nfTDljFG2g0'
bun run youtube transcript nfTDljFG2g0 --lang de
```

Quote the URL: `?` is a glob character in zsh and fish. The command prints JSON: metadata, `chapters`, and `sections`, the transcript split at the video's chapters (or every 60 seconds) with a start time on each. `source` says which captions were used: uploaded `subtitles`, original-language `auto-captions`, or `auto-translated`, which can be unreliable. Auto-captions have no punctuation guarantees and mishear names; check names against the title and description.

Read the whole transcript before describing a video. Cite moments by section start time.

## How it works

Requires `yt-dlp` and `uvx` on PATH (`brew install yt-dlp uv`).

1. `yt-dlp --dump-single-json` reads metadata and lists caption tracks.
2. Track choice for `--lang L` (default `en`): uploaded subtitles in `L` or `L-*`, then auto-captions `L-orig` (speech recognition in the spoken language), then auto-captions `L` (often a machine translation). The json3 track is downloaded directly.
3. If no track downloads, it falls back to `youtube-transcript-api` via `uvx`, which uses a different YouTube endpoint.

YouTube rate-limits caption downloads (HTTP 429), mostly on translated tracks; asking for `L-orig` first avoids most of it. Exits non-zero with every attempt's error when no transcript is available. Members-only, private and age-restricted videos need cookies (`yt-dlp --cookies-from-browser`), which the command doesn't pass.
