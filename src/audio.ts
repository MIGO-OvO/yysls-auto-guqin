import { schedule, type Score } from "./score";
import type { MidiNote, MidiTake } from "./midi";
import { synthesize, type Instrument, type SynthVoice } from "./instruments";

// The audio clock sets note timing; the timer only feeds a short look-ahead queue.
export class PreviewAudio {
  private context: AudioContext | null = null;
  private voices = new Set<SynthVoice>();
  private held = new Map<string, { voice: SynthVoice; released: boolean }>();
  private pedal = new Set<number>();
  private startedAt = 0;
  private offset = 0;
  private duration = 0;
  private master: GainNode | null = null;
  private level = 0.5;
  private timbre: Instrument = "piano";
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: MidiNote[] = [];
  private cursor = 0;
  private epoch = 0;

  get volume() {
    return this.level;
  }
  set volume(value: number) {
    this.level = value;
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.01);
  }
  get instrument() {
    return this.timbre;
  }
  set instrument(value: Instrument) {
    if (this.timbre === value) return;
    this.timbre = value;
    this.releaseHeld();
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.level;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      this.master.connect(limiter);
      limiter.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
  }

  tone(midi: number, seconds = 0.7, at?: number, velocity = 0.8) {
    const context = this.context;
    if (!context || !this.master) return;
    for (const voice of this.voices) {
      if (voice.ended) this.voices.delete(voice);
    }
    // Bound native nodes even for dense full-range recordings.
    if (this.voices.size >= 64) {
      const oldest = this.voices.values().next().value!;
      oldest.release(context.currentTime, 0.015);
      this.voices.delete(oldest);
    }
    const voice = synthesize(
      context,
      this.master,
      this.timbre,
      midi,
      velocity,
      at ?? context.currentTime + 0.005,
      seconds,
    );
    this.voices.add(voice);
    return voice;
  }

  noteOn(midi: number, velocity: number, channel: number) {
    const key = `${channel}:${midi}`;
    this.held.get(key)?.voice.release();
    const voice = this.tone(midi, Infinity, undefined, velocity / 127);
    if (voice) this.held.set(key, { voice, released: false });
  }
  noteOff(midi: number, channel: number) {
    const key = `${channel}:${midi}`;
    const held = this.held.get(key);
    if (!held) return;
    if (this.pedal.has(channel)) held.released = true;
    else {
      held.voice.release();
      this.held.delete(key);
    }
  }
  sustain(channel: number, down: boolean) {
    if (down) this.pedal.add(channel);
    else {
      this.pedal.delete(channel);
      for (const [key, held] of this.held) {
        if (key.startsWith(`${channel}:`) && held.released) {
          held.voice.release();
          this.held.delete(key);
        }
      }
    }
  }
  releaseHeld(channel?: number) {
    for (const [key, held] of this.held) {
      if (channel === undefined || key.startsWith(`${channel}:`)) {
        held.voice.release();
        this.held.delete(key);
      }
    }
    if (channel === undefined) this.pedal.clear();
    else this.pedal.delete(channel);
  }

  private pump = () => {
    const context = this.context!;
    const elapsed = (context.currentTime - this.startedAt) * 1000 + this.offset;
    while (this.cursor < this.pending.length) {
      const note = this.pending[this.cursor];
      if (note.startMs > elapsed + 350) break;
      this.cursor++;
      if (note.endMs <= elapsed) continue;
      const start = Math.max(note.startMs, elapsed);
      this.tone(
        note.midi,
        (note.endMs - start) / 1000,
        Math.max(
          context.currentTime,
          this.startedAt + (start - this.offset) / 1000,
        ),
        note.velocity / 127,
      );
    }
    if (this.cursor >= this.pending.length && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  private async start(notes: MidiNote[], durationMs: number, offsetMs: number) {
    const request = ++this.epoch;
    await this.unlock();
    if (request !== this.epoch) return;
    this.stop();
    this.startedAt = this.context!.currentTime + 0.04;
    this.offset = offsetMs;
    this.duration = durationMs;
    this.pending = notes
      .filter((n) => n.channel !== 9 && n.endMs > offsetMs)
      .sort((a, b) => a.startMs - b.startMs);
    this.timer = setInterval(this.pump, 50);
    this.pump();
  }

  async play(score: Score, startCol: number, offsetMs = 0) {
    const plan = schedule(score, startCol);
    await this.start(
      plan.notes
        .filter((n) => n.midi !== null)
        .map((n) => ({
          midi: n.midi!,
          channel: 0,
          velocity: 100,
          startMs: n.atMs,
          endMs: n.atMs + n.holdMs,
        })),
      plan.durationMs,
      offsetMs,
    );
  }

  get elapsedMs() {
    return Math.max(
      0,
      Math.min(
        this.duration,
        ((this.context?.currentTime ?? 0) - this.startedAt) * 1000 +
          this.offset,
      ),
    );
  }
  async playMidi(take: MidiTake) {
    await this.start(take.notes, take.durationMs, 0);
  }
  stop(natural = false) {
    this.epoch++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pending = [];
    for (const voice of this.voices)
      voice.release(undefined, natural ? undefined : 0.02);
    this.voices.clear();
    this.held.clear();
    this.pedal.clear();
  }
  dispose() {
    this.stop();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
