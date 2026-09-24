// Sound effects and music (prompt 1.9).
//
// Each sound plays a clip from public/audio/ when one is listed in AUDIO_FILES, and otherwise
// falls back to a small Web Audio synth (also used until a clip finishes loading).

import { create } from "zustand";
import { asset } from "../config";

export type SfxName = "chime" | "boing" | "thud" | "win" | "step";

/**
 * Clips: name → base path (".ogg" (Opus) and ".mp3" siblings). Anything not listed uses the
 * synth fallback: the music loop (no music MP3 exists on the Mac) and footsteps.
 * Sources and processing: public/audio/CREDITS.md.
 */
const AUDIO_FILES: Partial<Record<SfxName | "music", string>> = {
  chime: asset("/audio/chime"),
  boing: asset("/audio/boing"),
  thud: asset("/audio/thud"),
  win: asset("/audio/win"),
};

const MUTE_KEY = "huesroom.mute";

type AudioSettings = { sfxMuted: boolean; musicMuted: boolean; toggleSfx: () => void; toggleMusic: () => void };

function readMute(): { sfxMuted: boolean; musicMuted: boolean } {
  try {
    const v = JSON.parse(window.localStorage.getItem(MUTE_KEY) ?? "{}");
    return { sfxMuted: !!v.sfx, musicMuted: !!v.music };
  } catch {
    return { sfxMuted: false, musicMuted: false };
  }
}

function writeMute(s: { sfxMuted: boolean; musicMuted: boolean }) {
  try {
    window.localStorage.setItem(MUTE_KEY, JSON.stringify({ sfx: s.sfxMuted, music: s.musicMuted }));
  } catch {
    // Storage blocked: the toggle still works for this visit.
  }
}

export const useAudioSettings = create<AudioSettings>((set, get) => ({
  ...(typeof window === "undefined" ? { sfxMuted: false, musicMuted: false } : readMute()),
  toggleSfx: () => {
    set({ sfxMuted: !get().sfxMuted });
    writeMute(get());
    applyMute();
  },
  toggleMusic: () => {
    set({ musicMuted: !get().musicMuted });
    writeMute(get());
    applyMute();
  },
}));

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();

function applyMute() {
  if (!ctx || !sfxBus || !musicBus) return;
  const { sfxMuted, musicMuted } = useAudioSettings.getState();
  sfxBus.gain.setTargetAtTime(sfxMuted ? 0 : 0.8, ctx.currentTime, 0.02);
  musicBus.gain.setTargetAtTime(musicMuted ? 0 : 0.5, ctx.currentTime, 0.2);
}

async function loadClip(name: string, base: string) {
  if (!ctx) return;
  const probe = document.createElement("audio");
  const ext = probe.canPlayType('audio/ogg; codecs="opus"') ? "ogg" : "mp3";
  try {
    const res = await fetch(`${base}.${ext}`);
    if (!res.ok) return;
    buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
  } catch {
    // Missing or undecodable: the synth fallback stays in place.
  }
}

/** Names of clips decoded so far (for ?test checks). */
export const loadedClips = () => [...buffers.keys()];

/** Creates/resumes the audio context. Call from a user gesture (the begin press). */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(ctx.destination);
    musicBus.connect(ctx.destination);
    applyMute();
    for (const [name, base] of Object.entries(AUDIO_FILES)) if (base) void loadClip(name, base);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

// ------------------------------------------------------------------ synth fallbacks

function env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, type: OscillatorType, t: number, attack: number, peak: number, decay: number, out: AudioNode) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, attack, peak, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

function noise(t: number, dur: number, cutoff: number, peak: number, out: AudioNode) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = c.createGain();
  env(g, t, 0.004, peak, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

const synth: Record<SfxName, (pitch: number, vol: number, out: AudioNode) => void> = {
  chime: (pitch, vol, out) => {
    const t = ctx!.currentTime;
    tone(1318.5 * pitch, "sine", t, 0.005, 0.22 * vol, 0.55, out);
    tone(1975.5 * pitch, "sine", t + 0.03, 0.005, 0.12 * vol, 0.45, out);
    tone(2637 * pitch, "triangle", t, 0.002, 0.03 * vol, 0.2, out);
  },
  boing: (pitch, vol, out) => {
    const c = ctx!;
    const t = c.currentTime;
    const o = tone(170 * pitch, "sine", t, 0.01, 0.25 * vol, 0.4, out);
    o.frequency.exponentialRampToValueAtTime(420 * pitch, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.4);
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 22;
    depth.gain.value = 18 * pitch;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.45);
  },
  thud: (pitch, vol, out) => {
    const t = ctx!.currentTime;
    noise(t, 0.12, 380 * pitch, 0.35 * vol, out);
    const o = tone(95 * pitch, "sine", t, 0.003, 0.3 * vol, 0.14, out);
    o.frequency.exponentialRampToValueAtTime(55 * pitch, t + 0.14);
  },
  win: (pitch, vol, out) => {
    const t = ctx!.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      tone(f * pitch, "sine", t + i * 0.09, 0.006, 0.18 * vol, 0.7, out);
      tone(f * 2 * pitch, "triangle", t + i * 0.09, 0.004, 0.03 * vol, 0.3, out);
    });
  },
  step: (pitch, vol, out) => {
    noise(ctx!.currentTime, 0.04, 900 * pitch, 0.06 * vol, out);
  },
};

export function playSfx(name: SfxName, { pitch = 1, volume = 1 }: { pitch?: number; volume?: number } = {}) {
  if (!ctx || !sfxBus || ctx.state !== "running" || useAudioSettings.getState().sfxMuted) return;
  const buf = buffers.get(name);
  if (buf) {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    g.gain.value = volume;
    src.connect(g).connect(sfxBus);
    src.start();
    return;
  }
  synth[name](pitch, volume, sfxBus);
}

// ------------------------------------------------------------------ music

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let nextBar = 0;
let bar = 0;

// A quiet, slow four-chord pad (Fmaj7 → Em7 → Dm7 → Cmaj9), 4 s per chord.
const CHORDS = [
  [174.61, 220, 261.63, 329.63],
  [164.81, 196, 246.94, 293.66],
  [146.83, 174.61, 220, 261.63],
  [130.81, 164.81, 196, 293.66],
];
const BAR = 4;

function scheduleBar(t: number, notes: number[]) {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 1.2);
  g.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.8);
  f.connect(g).connect(musicBus!);
  for (const n of notes) {
    for (const detune of [-6, 6]) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = n;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + BAR + 1);
    }
  }
  // A soft pluck on the top note, halfway through.
  tone(notes[3] * 2, "sine", t + BAR / 2, 0.01, 0.02, 1.6, musicBus!);
}

export function startMusic() {
  if (!ctx || !musicBus || musicTimer || musicSource) return;
  const buf = buffers.get("music");
  if (buf) {
    musicSource = ctx.createBufferSource();
    musicSource.buffer = buf;
    musicSource.loop = true;
    musicSource.connect(musicBus);
    musicSource.start();
    return;
  }
  nextBar = ctx.currentTime + 0.1;
  const tick = () => {
    while (ctx && nextBar < ctx.currentTime + 1.5) {
      scheduleBar(nextBar, CHORDS[bar % CHORDS.length]);
      nextBar += BAR;
      bar++;
    }
  };
  tick();
  musicTimer = setInterval(tick, 500);
}

export function setMusicPaused(paused: boolean) {
  if (!ctx) return;
  if (paused) void ctx.suspend();
  else void ctx.resume();
}
