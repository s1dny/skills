# YouTube transcripts

Requires `yt-dlp` and `uvx` on PATH (`brew install yt-dlp uv`).

1. `yt-dlp --dump-single-json` reads metadata and lists caption tracks.
2. Track choice for `--lang L` (default `en`): uploaded subtitles in `L` or `L-*`, then auto-captions `L-orig` (speech recognition in the spoken language), then auto-captions `L` (often a machine translation). The json3 track is downloaded directly.
3. If no track downloads, it falls back to `youtube-transcript-api` via `uvx`, which uses a different YouTube endpoint.

YouTube rate-limits caption downloads (HTTP 429), mostly on translated tracks; asking for `L-orig` first avoids most of it. Exits non-zero with every attempt's error when no transcript is available. Members-only, private and age-restricted videos need cookies (`yt-dlp --cookies-from-browser`), which the command doesn't pass.
