import { parseArgs } from "node:util";

const help = `youtube — video metadata and transcripts (JSON on stdout)
  bun run youtube transcript <url|id> [--lang en]
    Title, channel, upload date, duration, description, chapters and the transcript in sections.
    Sections follow the video's chapters, or 60-second windows when it has none.
    Prefers uploaded subtitles, then YouTube's original-language auto-captions.`;

type Track = { ext: string; url: string };
type Info = {
  id: string;
  title: string;
  channel: string;
  upload_date?: string;
  duration: number;
  description?: string;
  chapters?: { start_time: number; title: string }[] | null;
  language?: string | null;
  subtitles?: Record<string, Track[]>;
  automatic_captions?: Record<string, Track[]>;
};
type Cue = { start: number; text: string };

const clock = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}`;
};

async function exec(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} failed: ${err.trim().split("\n").pop()}`);
  return out;
}

// Manual subtitles first, then the original-language auto-caption track. Plain `<lang>` auto-captions
// are usually machine translations, which YouTube rate-limits (429) and which read worse.
function pickTrack(info: Info, lang: string) {
  const json3 = (tracks?: Track[]) => tracks?.find((t) => t.ext === "json3");
  const manual = Object.entries(info.subtitles ?? {}).find(([k]) => k === lang || k.startsWith(`${lang}-`));
  if (manual && json3(manual[1])) return { kind: "subtitles", lang: manual[0], track: json3(manual[1])! };
  const auto = info.automatic_captions ?? {};
  for (const key of [`${lang}-orig`, lang]) {
    const track = json3(auto[key]);
    if (track) return { kind: key.endsWith("-orig") ? "auto-captions" : "auto-translated", lang: key, track };
  }
  return null;
}

async function fromYtDlp(url: string): Promise<Cue[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`caption download failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    events?: { tStartMs: number; segs?: { utf8: string }[] }[];
  };
  return (data.events ?? [])
    .filter((e) => e.segs)
    .map((e) => ({ start: e.tStartMs / 1000, text: e.segs!.map((s) => s.utf8).join("") }))
    .filter((c) => c.text.trim());
}

// Fallback: youtube-transcript-api talks to a different YouTube endpoint and often works when yt-dlp is blocked.
async function fromTranscriptApi(id: string, lang: string): Promise<Cue[]> {
  const out = await exec([
    "uvx",
    "--from",
    "youtube-transcript-api",
    "youtube_transcript_api",
    id,
    "--languages",
    lang,
    "--format",
    "json",
  ]);
  const [cues] = JSON.parse(out) as { text: string; start: number }[][];
  return (cues ?? []).map((c) => ({ start: c.start, text: c.text }));
}

function sections(cues: Cue[], info: Info) {
  const bounds = info.chapters?.length
    ? info.chapters.map((c) => ({ start: c.start_time, title: c.title as string | undefined }))
    : Array.from({ length: Math.ceil(info.duration / 60) || 1 }, (_, i) => ({ start: i * 60, title: undefined }));
  return bounds
    .map((b, i) => {
      const end = bounds[i + 1]?.start ?? Infinity;
      const text = cues
        .filter((c) => c.start >= b.start && c.start < end)
        .map((c) => c.text.replace(/\s+/g, " ").trim())
        .join(" ")
        .trim();
      return { start: clock(b.start), ...(b.title ? { title: b.title } : {}), text };
    })
    .filter((s) => s.text);
}

async function transcript(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { lang: { type: "string", default: "en" } },
  });
  const input = positionals[0];
  if (!input) throw new Error(help);
  const lang = values.lang!;
  const info = JSON.parse(
    await exec(["yt-dlp", "--dump-single-json", "--skip-download", "--no-warnings", "--no-playlist", input]),
  ) as Info;

  const picked = pickTrack(info, lang);
  let cues: Cue[] = [],
    source = picked ? `yt-dlp ${picked.kind} (${picked.lang})` : "";
  const errors: string[] = [];
  if (picked) cues = await fromYtDlp(picked.track.url).catch((e: Error) => (errors.push(e.message), []));
  if (!cues.length) {
    cues = await fromTranscriptApi(info.id, lang).catch((e: Error) => (errors.push(e.message), []));
    source = "youtube-transcript-api";
  }
  if (!cues.length) throw new Error(`no ${lang} transcript for ${info.id}: ${errors.join("; ") || "no captions"}`);

  return {
    id: info.id,
    url: `https://www.youtube.com/watch?v=${info.id}`,
    title: info.title,
    channel: info.channel,
    uploaded: info.upload_date?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    duration: clock(info.duration),
    source,
    description: info.description,
    chapters: (info.chapters ?? []).map((c) => ({ start: clock(c.start_time), title: c.title })),
    sections: sections(cues, info),
  };
}

const [command, ...args] = Bun.argv.slice(2);
try {
  if (!command || command === "help" || command === "--help") console.log(help);
  else if (command === "transcript") console.log(JSON.stringify(await transcript(args), null, 2));
  else throw new Error(help);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
