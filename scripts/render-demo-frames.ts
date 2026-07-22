import { access, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

type Scene = { scene: number; phrases: unknown[] };

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(
  root,
  process.env.PROOFPAY_DEMO_FRAMES ?? "artifacts/demo-frames-v5",
);
const scenes = JSON.parse(
  await readFile(join(root, "scripts", "demo-video-script.json"), "utf8"),
) as Scene[];

const mimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    const relativePath = pathname === "/" ? "README.md" : pathname.slice(1);
    const path = resolve(root, relativePath);
    if (!path.startsWith(`${root}/`)) {
      throw new Error("Path escapes repository root");
    }
    const body = await readFile(path);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes[extname(path)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise<void>((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen),
);
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to start frame-rendering server");
}

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
].filter((candidate): candidate is string => Boolean(candidate));

let executablePath: string | undefined;
for (const candidate of browserCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Continue to the next installed browser candidate.
  }
}
if (!executablePath) {
  server.close();
  throw new Error(
    "No Chromium browser found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE.",
  );
}

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1920, height: 1080 },
  });
  const baseUrl = `http://127.0.0.1:${address.port}/docs/ProofPay_Bounty_Demo.html`;

  for (const scene of scenes) {
    const sceneName = String(scene.scene).padStart(2, "0");
    for (let phrase = -1; phrase < scene.phrases.length; phrase += 1) {
      const suffix =
        phrase < 0 ? "" : `-phrase-${String(phrase).padStart(2, "0")}`;
      await page.goto(
        `${baseUrl}?scene=${scene.scene}${phrase < 0 ? "" : `&phrase=${phrase}`}`,
        { waitUntil: "networkidle" },
      );
      await page.waitForFunction(
        () =>
          customElements.get("proofpay-video") !== undefined &&
          [...document.images].every((image) => image.complete),
      );
      await page.screenshot({
        animations: "disabled",
        path: join(outputRoot, `scene-${sceneName}${suffix}.png`),
      });
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`Rendered action-highlight frames to ${outputRoot}`);
