/**
 * Turns chess.com's move sounds (data/sounds/*.mp3) into client/src/board/sounds.json, as data
 * URLs that the app's JavaScript carries. Run with `npm run sounds:build`.
 *
 * The app never requests an .mp3: download managers such as IDM take over any request for one
 * (offering to download it) and leave the page without the sound.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SOURCE = path.resolve("data/sounds");
const TARGET = path.resolve("client/src/board/sounds.json");
const NAMES = ["move-self", "move-opponent", "capture", "castle", "move-check", "promote", "game-end"];

const sounds = Object.fromEntries(
  NAMES.map((name) => [name, `data:audio/mpeg;base64,${readFileSync(path.join(SOURCE, `${name}.mp3`)).toString("base64")}`]),
);
writeFileSync(TARGET, `${JSON.stringify(sounds, null, 2)}\n`);
console.log(`Wrote ${NAMES.length} sounds to ${path.relative(process.cwd(), TARGET)}.`);
