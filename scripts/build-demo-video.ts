import { execFileSync } from "node:child_process";
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
const phraseRoot = join(audioRoot, "phrases");
const segmentRoot = join(outputRoot, "segments");
const scenes = JSON.parse(await readFile(scriptPath, "utf8")) as Scene[];
const padBefore = 0.7;
const padAfter = 1.5;

const run = (command: string, args: string[]) => {
  execFileSync(command, args, { stdio: "inherit" });
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
  mkdir(phraseRoot, { recursive: true }),
  mkdir(segmentRoot, { recursive: true }),
]);

const captions: string[] = [];
const timeline: {
  totalDuration: number;
  padBefore: number;
  padAfter: number;
  voice: string;
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
  voice: "Apple Samantha (en_US), phrase-directed",
  mastering:
    "48 kHz mono; high-pass/EQ/gentle compression; EBU R128 -16 LUFS, -1.8 dBTP mastering target",
  scenes: [],
};

let globalCursor = 0;
let captionIndex = 1;

for (const scene of scenes) {
  const sceneName = String(scene.scene).padStart(2, "0");
  const sceneParts: string[] = [];
  const phraseDurations: number[] = [];

  for (const [phraseIndex, phrase] of scene.phrases.entries()) {
    const phraseName = `${sceneName}-${String(phraseIndex).padStart(2, "0")}`;
    const rawPath = join(phraseRoot, `${phraseName}.aiff`);
    const processedPath = join(phraseRoot, `${phraseName}.wav`);
    const silencePath = join(phraseRoot, `${phraseName}-silence.wav`);

    run("say", [
      "-v",
      "Samantha",
      "-r",
      String(phrase.rate),
      "-o",
      rawPath,
      phrase.text,
    ]);
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      rawPath,
      "-af",
      [
        "aresample=48000",
        "highpass=f=80",
        "equalizer=f=220:t=q:w=1.2:g=-1.5",
        "equalizer=f=3200:t=q:w=1:g=1.5",
        "acompressor=threshold=0.1:ratio=2.5:attack=15:release=180:makeup=1.25",
      ].join(","),
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      processedPath,
    ]);
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=mono",
      "-t",
      String(phrase.pauseAfterMs / 1000),
      "-c:a",
      "pcm_s16le",
      silencePath,
    ]);

    phraseDurations.push(probeDuration(processedPath));
    sceneParts.push(concatEntry(processedPath), concatEntry(silencePath));
  }

  const concatPath = join(audioRoot, `scene-${sceneName}-concat.txt`);
  const narrationPath = join(audioRoot, `scene-${sceneName}-mastered.wav`);
  await writeFile(concatPath, `${sceneParts.join("\n")}\n`);
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
    concatPath,
    "-af",
    "loudnorm=I=-16:TP=-1.8:LRA=7",
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
    phraseCursor += phraseDuration + phrase.pauseAfterMs / 1000;
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
    visualParts.push(
      concatEntry(selectedFramePath),
      `duration ${phraseDuration + phrase.pauseAfterMs / 1000}`,
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
