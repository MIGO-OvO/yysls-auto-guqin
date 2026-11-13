import { schedule, type Score } from "./score";

// AudioContext's audio clock schedules preview; no JS timers drive game input.
export class PreviewAudio {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  private startedAt = 0;
  private offset = 0;
  private duration = 0;
  private master: GainNode | null = null;
  private level = 0.5;

  get volume() {
    return this.level;
  }
  set volume(value: number) {
    this.level = value;
    if (this.context && this.master)
      this.master.gain.setValueAtTime(value, this.context.currentTime);
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.level;
      this.master.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
  }

  tone(midi: number, seconds = 0.7, at?: number) {
    const ctx = this.context;
    if (!ctx) return;
    const when = at ?? ctx.currentTime + 0.005;
    const duration = Math.max(0.025, Math.min(6, seconds));
    const oscillator = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const overtone = ctx.createGain();
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    harmonic.frequency.value = oscillator.frequency.value * 2;
    harmonic.type = "triangle";
    overtone.gain.value = 0.12;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(
      0.28,
      when + Math.min(0.008, duration / 3),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain);
    harmonic.connect(overtone);
    overtone.connect(gain);
    gain.connect(this.master!);
    for (const voice of [oscillator, harmonic]) {
      this.voices.add(voice);
      voice.onended = () => {
        this.voices.delete(voice);
        voice.disconnect();
        gain.disconnect();
        overtone.disconnect();
      };
      voice.start(when);
      voice.stop(when + duration + 0.015);
    }
  }

  async play(score: Score, startCol: number, offsetMs = 0) {
    await this.unlock();
    this.stop();
    const plan = schedule(score, startCol);
    const origin = this.context!.currentTime + 0.04;
    this.startedAt = origin;
    this.offset = offsetMs;
    this.duration = plan.durationMs;
    for (const note of plan.notes) {
      if (note.midi !== null && note.atMs >= offsetMs)
        this.tone(
          note.midi,
          note.holdMs / 1000,
          origin + (note.atMs - offsetMs) / 1000,
        );
    }
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
  stop() {
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices.clear();
  }
}
