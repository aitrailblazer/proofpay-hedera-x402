import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

type Phrase = {
  text: string;
  rate: number;
  pauseAfterMs: number;
};

type Scene = {
  scene: number;
  phrases: Phrase[];
};

const root = resolve(import.meta.dirname, "..");
const scriptPath = join(root, "scripts", "demo-video-script.json");
const outputRoot = resolve(
  root,
  process.env.PROOFPAY_DEMO_OUTPUT ?? "artifacts/demo-video-v3",
);
const frameRoot = resolve(
  root,
  process.env.PROOFPAY_DEMO_FRAMES ?? "artifacts/demo-video-v2",
);
const audioRoot = join(outputRoot, "audio");
const segmentRoot = join(outputRoot, "segments");
const scenes = JSON.parse(await readFile(scriptPath, "utf8")) as Scene[];
const padBefore = 0.7;
const padAfter = 1.5;
const narrationVoiceMode =
  process.env.PROOFPAY_NARRATION_VOICE_MODE ?? "system";

if (!["system", "samantha"].includes(narrationVoiceMode)) {
  throw new Error(
    `Invalid PROOFPAY_NARRATION_VOICE_MODE=${narrationVoiceMode}; expected system or samantha`,
  );
}

const run = (command: string, args: string[]) => {
  execFileSync(command, args, { stdio: "inherit" });
};

const sayVoiceArgs = (mode: string): string[] =>
  mode === "system" ? [] : ["-v", "Samantha"];

const detectSilences = (
  path: string,
  expectedCount: number,
): { start: number; end: number; duration: number }[] => {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      path,
      "-af",
      "silencedetect=n=-42dB:d=0.35",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `Silence detection failed for ${path}: ${result.stderr.trim()}`,
    );
  }
  const starts = [
    ...result.stderr.matchAll(/silence_start: ([0-9.]+)/g),
  ].map((match) => Number(match[1]));
  const ends = [...result.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map(
    (match) => Number(match[1]),
  );
  if (starts.length !== expectedCount || ends.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} phrase-boundary silences in ${path}, found ${starts.length} starts and ${ends.length} ends`,
    );
  }
  return starts.map((start, index) => {
    const end = ends[index];
    if (end === undefined || end <= start) {
      throw new Error(`Invalid silence boundary ${index} in ${path}`);
    }
    return { start, end, duration: end - start };
  });
};

const probeDuration = (path: string): number =>
  Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        path,
      ],
      { encoding: "utf8" },
    ).trim(),
  );

const srtTime = (seconds: number): string => {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const concatEntry = (path: string) =>
  `file '${resolve(path).replaceAll("'", "'\\''")}'`;

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

await Promise.all([
  mkdir(outputRoot, { recursive: true }),
  mkdir(audioRoot, { recursive: true }),
  mkdir(segmentRoot, { recursive: true }),
]);

const voiceProbeRoot = join(outputRoot, "voice-preflight");
await mkdir(voiceProbeRoot, { recursive: true });
const voiceProbeText =
  "ProofPay turns one protected request into one verified Hedera payment and one evidence-backed response.";
const systemProbePath = join(voiceProbeRoot, "system-voice.aiff");
const samanthaProbePath = join(voiceProbeRoot, "compact-samantha-control.aiff");
const systemProbePcmPath = join(voiceProbeRoot, "system-voice.pcm");
const samanthaProbePcmPath = join(
  voiceProbeRoot,
  "compact-samantha-control.pcm",
);

run("say", [
  ...sayVoiceArgs(narrationVoiceMode),
  "-r",
  "154",
  "-o",
  systemProbePath,
  voiceProbeText,
]);
run("say", [
  "-v",
  "Samantha",
  "-r",
  "154",
  "-o",
  samanthaProbePath,
  voiceProbeText,
]);
for (const [source, destination] of [
  [systemProbePath, systemProbePcmPath],
  [samanthaProbePath, samanthaProbePcmPath],
] as const) {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "1",
    destination,
  ]);
}

const pcmSha256 = async (path: string): Promise<string> =>
  createHash("sha256").update(await readFile(path)).digest("hex");
const systemProbeSha256 = await pcmSha256(systemProbePcmPath);
const samanthaProbeSha256 = await pcmSha256(samanthaProbePcmPath);
const systemProbeDuration = probeDuration(systemProbePath);
const samanthaProbeDuration = probeDuration(samanthaProbePath);
const voicePreflight = {
  requested_mode: narrationVoiceMode,
  expected_system_voice: "Ava (Premium)",
  system_voice_pcm_sha256: systemProbeSha256,
  compact_samantha_pcm_sha256: samanthaProbeSha256,
  system_voice_duration_seconds: systemProbeDuration,
  compact_samantha_duration_seconds: samanthaProbeDuration,
  duration_delta_seconds: systemProbeDuration - samanthaProbeDuration,
  differs_from_compact_samantha: systemProbeSha256 !== samanthaProbeSha256,
};
if (
  narrationVoiceMode === "system" &&
  !voicePreflight.differs_from_compact_samantha
) {
  throw new Error(
    "System narration voice is identical to compact Samantha. Select Ava (Premium) in System Settings > Accessibility > Read & Speak, then retry.",
  );
}
await writeFile(
  join(voiceProbeRoot, "voice-preflight.json"),
  `${JSON.stringify(voicePreflight, null, 2)}\n`,
);

const captions: string[] = [];
const timeline: {
  totalDuration: number;
  padBefore: number;
  padAfter: number;
  voice: string;
  voicePreflight: typeof voicePreflight;
  mastering: string;
  scenes: {
    scene: number;
    narrationDuration: number;
    duration: number;
    start: number;
    end: number;
  }[];
} = {
  totalDuration: 0,
  padBefore,
  padAfter,
  voice:
    narrationVoiceMode === "system"
      ? "macOS system voice (Ava Premium selected), scene-coherent Apple speech controls"
      : "Apple compact Samantha (explicit fallback), scene-coherent Apple speech controls",
  voicePreflight,
  mastering:
    "48 kHz mono; high-pass/EQ/gentle compression; EBU R128 -16 LUFS, -1.8 dBTP mastering target",
  scenes: [],
};

let globalCursor = 0;
let captionIndex = 1;

for (const scene of scenes) {
  const sceneName = String(scene.scene).padStart(2, "0");
  const rawScenePath = join(audioRoot, `scene-${sceneName}-coherent.aiff`);
  const speechControlPath = join(
    audioRoot,
    `scene-${sceneName}-speech-controls.txt`,
  );
  const phraseDurations: number[] = [];
  const phrasePauseDurations: number[] = [];
  const speechControls = scene.phrases
    .map(
      (phrase) =>
        `[[rate ${phrase.rate}]] ${phrase.text} [[slnc ${Math.max(phrase.pauseAfterMs, 450)}]]`,
    )
    .join(" ");
  await writeFile(speechControlPath, `${speechControls}\n`);
  run("say", [
    ...sayVoiceArgs(narrationVoiceMode),
    "-o",
    rawScenePath,
    "-f",
    speechControlPath,
  ]);
  const silenceBoundaries = detectSilences(
    rawScenePath,
    scene.phrases.length,
  );
  let detectedCursor = 0;
  for (const boundary of silenceBoundaries) {
    phraseDurations.push(boundary.start - detectedCursor);
    phrasePauseDurations.push(boundary.duration);
    detectedCursor = boundary.end;
  }

  const narrationPath = join(audioRoot, `scene-${sceneName}-mastered.wav`);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    rawScenePath,
    "-af",
    [
      "aresample=48000",
      "highpass=f=80",
      "equalizer=f=220:t=q:w=1.2:g=-1.5",
      "equalizer=f=3200:t=q:w=1:g=1.5",
      "acompressor=threshold=0.1:ratio=2.5:attack=15:release=180:makeup=1.25",
      "loudnorm=I=-16:TP=-1.8:LRA=7",
    ].join(","),
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    narrationPath,
  ]);

  const narrationDuration = probeDuration(narrationPath);
  const sceneDuration = padBefore + narrationDuration + padAfter;
  let phraseCursor = globalCursor + padBefore;
  for (const [phraseIndex, phrase] of scene.phrases.entries()) {
    const phraseDuration = phraseDurations[phraseIndex];
    if (phraseDuration === undefined) {
      throw new Error(`Missing duration for scene ${scene.scene}, phrase ${phraseIndex}`);
    }
    captions.push(
      String(captionIndex),
      `${srtTime(phraseCursor)} --> ${srtTime(phraseCursor + phraseDuration)}`,
      phrase.text,
      "",
    );
    captionIndex += 1;
    const phrasePauseDuration = phrasePauseDurations[phraseIndex];
    if (phrasePauseDuration === undefined) {
      throw new Error(
        `Missing pause duration for scene ${scene.scene}, phrase ${phraseIndex}`,
      );
    }
    phraseCursor += phraseDuration + phrasePauseDuration;
  }

  const framePath = join(frameRoot, `scene-${sceneName}.png`);
  const localFramePath = join(outputRoot, `scene-${sceneName}.png`);
  const visualConcatPath = join(outputRoot, `scene-${sceneName}-visuals.txt`);
  const segmentPath = join(segmentRoot, `scene-${sceneName}.mp4`);
  await cp(framePath, localFramePath);
  const visualParts = [concatEntry(localFramePath), `duration ${padBefore}`];
  for (const [phraseIndex, phrase] of scene.phrases.entries()) {
    const phraseFramePath = join(
      frameRoot,
      `scene-${sceneName}-phrase-${String(phraseIndex).padStart(2, "0")}.png`,
    );
    const selectedFramePath = (await exists(phraseFramePath))
      ? phraseFramePath
      : framePath;
    const phraseDuration = phraseDurations[phraseIndex];
    if (phraseDuration === undefined) {
      throw new Error(`Missing duration for scene ${scene.scene}, phrase ${phraseIndex}`);
    }
    const phrasePauseDuration = phrasePauseDurations[phraseIndex];
    if (phrasePauseDuration === undefined) {
      throw new Error(
        `Missing pause duration for scene ${scene.scene}, phrase ${phraseIndex}`,
      );
    }
    visualParts.push(
      concatEntry(selectedFramePath),
      `duration ${phraseDuration + phrasePauseDuration}`,
    );
  }
  visualParts.push(
    concatEntry(localFramePath),
    `duration ${padAfter}`,
    concatEntry(localFramePath),
  );
  await writeFile(visualConcatPath, `${visualParts.join("\n")}\n`);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    visualConcatPath,
    "-itsoffset",
    String(padBefore),
    "-i",
    narrationPath,
    "-t",
    String(sceneDuration),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-fps_mode",
    "cfr",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "1",
    segmentPath,
  ]);

  timeline.scenes.push({
    scene: scene.scene,
    narrationDuration,
    duration: sceneDuration,
    start: globalCursor,
    end: globalCursor + sceneDuration,
  });
  globalCursor += sceneDuration;
}

timeline.totalDuration = globalCursor;
const captionsPath = join(outputRoot, "captions.srt");
const timelinePath = join(outputRoot, "timeline.json");
const concatVideoPath = join(outputRoot, "concat.txt");
const uncaptionedPath = join(outputRoot, "proofpay-demo-uncaptioned.mp4");
const continuousAudioPath = join(outputRoot, "proofpay-demo-continuous-audio.wav");
const finalFilename =
  process.env.PROOFPAY_DEMO_FILENAME ??
  "ProofPay_Hedera_x402_Bounty_Demo_Enhanced_Voice.mp4";
const finalPath = join(outputRoot, finalFilename);
const captionMode = process.env.PROOFPAY_CAPTION_MODE ?? "burn";
if (!["burn", "soft", "none"].includes(captionMode)) {
  throw new Error(
    `Invalid PROOFPAY_CAPTION_MODE=${captionMode}; expected burn, soft, or none`,
  );
}
await writeFile(captionsPath, captions.join("\n"));
await writeFile(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`);
await writeFile(
  concatVideoPath,
  `${scenes
    .map((scene) =>
      concatEntry(
        join(
          segmentRoot,
          `scene-${String(scene.scene).padStart(2, "0")}.mp4`,
        ),
      ),
    )
    .join("\n")}\n`,
);

run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  concatVideoPath,
  "-c",
  "copy",
  uncaptionedPath,
]);
const finalDuration = probeDuration(uncaptionedPath);
run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  uncaptionedPath,
  "-vn",
  "-af",
  "aresample=async=1:first_pts=0,apad=pad_dur=5",
  "-t",
  String(finalDuration),
  "-c:a",
  "pcm_s16le",
  continuousAudioPath,
]);
if (captionMode === "burn") {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    uncaptionedPath,
    "-i",
    continuousAudioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-vf",
    `subtitles=${captionsPath}:force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H90000000,BorderStyle=3,Outline=0,Shadow=0,MarginV=38,Alignment=2'`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "1",
    "-t",
    String(finalDuration),
    "-movflags",
    "+faststart",
    finalPath,
  ]);
} else if (captionMode === "soft") {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    uncaptionedPath,
    "-i",
    continuousAudioPath,
    "-i",
    captionsPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-map",
    "2:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=eng",
    "-metadata:s:s:0",
    "title=English captions",
    "-disposition:s:0",
    "0",
    "-t",
    String(finalDuration),
    "-movflags",
    "+faststart",
    finalPath,
  ]);
} else {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    uncaptionedPath,
    "-i",
    continuousAudioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "1",
    "-t",
    String(finalDuration),
    "-movflags",
    "+faststart",
    finalPath,
  ]);
}
await cp(join(outputRoot, "scene-00.png"), join(outputRoot, "frame-title.png"));
await cp(
  join(root, "docs", "ProofPay_Demo_Transcript.txt"),
  join(outputRoot, "ProofPay_Demo_Transcript.txt"),
);
await cp(
  join(root, "docs", "ProofPay_Demo_Visualization_Prompts.txt"),
  join(outputRoot, "ProofPay_Demo_Visualization_Prompts.txt"),
);
await cp(
  join(root, "docs", "ProofPay_Demo_Infographic_Scene_Briefs.txt"),
  join(outputRoot, "ProofPay_Demo_Infographic_Scene_Briefs.txt"),
);

console.log(
  JSON.stringify(
    {
      output: finalPath,
      file: basename(finalPath),
      duration_seconds: probeDuration(finalPath),
      voice: timeline.voice,
      mastering: timeline.mastering,
      caption_mode: captionMode,
    },
    null,
    2,
  ),
);
