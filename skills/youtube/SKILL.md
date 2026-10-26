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

Read the whole transcript before describing a video. Cite moments by section start time. [Details](references/api.md)
