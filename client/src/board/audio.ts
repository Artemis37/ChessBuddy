import type { MoveSound } from "./sound";
import SOUND_FILES from "./sounds.json";

/**
 * Move sounds: chess.com's own sound files, played with the Web Audio API. They come as data
 * URLs in sounds.json (made by `npm run sounds:build`), so the page never requests an .mp3,
 * which download managers such as IDM would take over. A sound whose file can't be decoded is
 * synthesized instead: a piece set down is a click of band-passed noise over the falling knock
 * of the board, and check, promotion and the end of the game add bell-like tones.
 */

const MUTED_KEY = "chessbuddy.muted";
/** chess.com's file for each sound, as a data URL. */
const FILES: Record<MoveSound, string> = {
  move: SOUND_FILES["move-self"],
  opponent: SOUND_FILES["move-opponent"],
  capture: SOUND_FILES.capture,
  castle: SOUND_FILES.castle,
  check: SOUND_FILES["move-check"],
  promote: SOUND_FILES.promote,
  gameEnd: SOUND_FILES["game-end"],
};
/** The synthesized sounds' volume; the files play as they are. */
const SYNTH_VOLUME = 0.5;
/** Presses that count as interacting with the page, which browsers require before sound can play. */
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "keydown"];
/** A sound asked for while the audio was still starting is dropped if starting took longer than this. */
const STALE_MS = 300;

let context: AudioContext | null = null;
let synthOutput: GainNode | null = null;
let muted = loadMuted();
const files = new Map<MoveSound, AudioBuffer>();
let filesRequested = false;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * Decodes the sound files. An offline context decodes them without starting any audio, so
 * this can run before the user has interacted with the page.
 */
function loadFiles() {
  if (filesRequested) return;
  filesRequested = true;
  let decoder: OfflineAudioContext;
  try {
    decoder = new OfflineAudioContext(1, 1, 48_000);
  } catch {
    // Nothing to decode with: every sound is synthesized.
    return;
  }
  for (const [sound, url] of Object.entries(FILES) as [MoveSound, string][]) {
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => decoder.decodeAudioData(data))
      // A file that doesn't decode leaves that sound synthesized.
      .then((buffer) => files.set(sound, buffer), () => {});
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable: the choice lasts until the page reloads.
  }
}

/**
 * Browsers let a page start sound only once the user has interacted with it, so the audio is
 * started on the first key or pointer press (or at once if the user already has, say by
 * signing in), and moves before that are silent. Returns a function that stops listening.
 */
export function listenForUnlock(): () => void {
  const stop = () => {
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
  };
  function unlock() {
    if (!context) {
      try {
        context = new AudioContext();
      } catch {
        // No Web Audio: the game stays silent.
        return stop();
      }
      synthOutput = context.createGain();
      synthOutput.gain.value = SYNTH_VOLUME;
      synthOutput.connect(context.destination);
    }
    if (context.state === "running") stop();
    else context.resume().then(stop, () => {});
  }
  loadFiles();
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
  if (navigator.userActivation?.hasBeenActive) unlock();
  return stop;
}

/** Plays a move's sound, unless sound is off or the user hasn't interacted with the page yet. */
export function playSound(sound: MoveSound | null): void {
  const ctx = context;
  if (!sound || muted || !ctx || ctx.state === "closed") return;
  if (ctx.state === "running") {
    start(ctx, sound);
    return;
  }
  const asked = performance.now();
  ctx.resume().then(
    () => {
      if (performance.now() - asked < STALE_MS) start(ctx, sound);
    },
    () => {},
  );
}

/** Starts a sound from its file, or synthesizes it when the file isn't there. */
function start(ctx: AudioContext, sound: MoveSound) {
  const at = ctx.currentTime + 0.005;
  const buffer = files.get(sound);
  if (!buffer) {
    if (synthOutput) renderSound(ctx, synthOutput, sound, at);
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(at);
}

interface Knock {
  /** Pitch of the board's knock, in Hz; it falls as the sound dies away. */
  body: number;
  /** Middle of the click's noise band, in Hz: higher sounds harder. */
  click: number;
  gain: number;
  /** Seconds until it has died away. */
  decay: number;
}

const PLACE: Knock = { body: 210, click: 1700, gain: 0.6, decay: 0.12 };
/** The opponent's pieces sound a little deeper. */
const OPPONENT: Knock = { body: 175, click: 1300, gain: 0.6, decay: 0.13 };
const TAKE: Knock = { body: 250, click: 2800, gain: 0.85, decay: 0.1 };

/** Schedules the synthesized `sound` on `ctx` at time `at`, into `out`. */
export function renderSound(ctx: BaseAudioContext, out: AudioNode, sound: MoveSound, at: number): void {
  switch (sound) {
    case "move":
      knock(ctx, out, at, PLACE);
      break;
    case "opponent":
      knock(ctx, out, at, OPPONENT);
      break;
    case "capture":
      // The capturing piece lands hard and knocks the captured one aside.
      knock(ctx, out, at, TAKE);
      knock(ctx, out, at + 0.03, { ...PLACE, body: 280, gain: 0.3 });
      break;
    case "castle":
      // The king, then the rook.
      knock(ctx, out, at, PLACE);
      knock(ctx, out, at + 0.11, { ...PLACE, body: 190, gain: 0.5 });
      break;
    case "check":
      knock(ctx, out, at, TAKE);
      tone(ctx, out, at, 1318.5, 0.14, 0.3);
      tone(ctx, out, at, 1975.5, 0.06, 0.2);
      break;
    case "promote":
      knock(ctx, out, at, PLACE);
      tone(ctx, out, at + 0.04, 784, 0.12, 0.25);
      tone(ctx, out, at + 0.12, 1174.7, 0.12, 0.4);
      break;
    case "gameEnd":
      knock(ctx, out, at, PLACE);
      for (const frequency of [523.25, 659.25, 784]) tone(ctx, out, at + 0.08, frequency, 0.09, 1.2);
      break;
  }
}

function knock(ctx: BaseAudioContext, out: AudioNode, at: number, { body, click, gain, decay }: Knock) {
  // The click: a short burst of noise, band-passed so it sounds like wood rather than hiss.
  const burst = ctx.createBufferSource();
  burst.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = click;
  band.Q.value = 1.2;
  burst.connect(band).connect(envelope(ctx, out, at, gain * 2, 0.04));
  burst.start(at);
  burst.stop(at + 0.05);
  // The knock: a low tone that falls in pitch as it dies away.
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(body, at);
  osc.frequency.exponentialRampToValueAtTime(body * 0.6, at + decay);
  osc.connect(envelope(ctx, out, at, gain, decay));
  osc.start(at);
  osc.stop(at + decay);
}

function tone(ctx: BaseAudioContext, out: AudioNode, at: number, frequency: number, gain: number, decay: number) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(frequency, at);
  osc.connect(envelope(ctx, out, at, gain, decay));
  osc.start(at);
  osc.stop(at + decay);
}

/** A gain into `out` that rises at once to `peak` and dies away over `decay` seconds. */
function envelope(ctx: BaseAudioContext, out: AudioNode, at: number, peak: number, decay: number): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(0.0001, at);
  node.gain.exponentialRampToValueAtTime(peak, at + 0.003);
  node.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  node.connect(out);
  return node;
}

/** A tenth of a second of white noise, made once per audio context. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate / 10), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}
