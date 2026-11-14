import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import {
  adaptMidi,
  exportMidiTake,
  type MidiNote,
  type MidiTake,
} from "../src/midi";
import { emptyScore, importMidi, importMidiTake, schedule } from "../src/score";

const note = (
  midi: number,
  startMs = 0,
  extra: Partial<MidiNote> = {},
): MidiNote => ({
  midi,
  startMs,
  endMs: startMs + 250,
  channel: 0,
  velocity: 90,
  ...extra,
});
const take = (notes: MidiNote[]): MidiTake => ({
  notes,
  durationMs: notes.reduce((end, n) => Math.max(end, n.endMs), 0),
});

describe("88-key performance adaptation", () => {
  it("selects the original melody before folding bass into the playable register", () => {
    const source = take([note(21), note(44, 250), note(60, 250)]);
    const smart = adaptMidi(source, 250, "smart");
    const folded = adaptMidi(source, 250, "fold");
    expect(smart.notes[1].midi % 12).toBe(0);
    expect(folded.notes[1].midi % 12).toBe(8);
    expect(smart.removed).toBe(1);
    expect(source.notes.map((n) => n.midi)).toEqual([21, 44, 60]);
  });

  it("keeps a rising phrase across an octave boundary without reversing it", () => {
    const source = take([81, 83, 84, 86].map((midi, i) => note(midi, i * 250)));
    const pitches = adaptMidi(source, 250, "smart").notes.map((n) => n.midi);
    expect(pitches).toEqual([69, 71, 72, 74]);
  });

  it("uses voice continuity instead of chasing an isolated upper ornament", () => {
    const source = take([
      note(60, 0),
      note(62, 250),
      note(74, 250, { channel: 1, velocity: 1, endMs: 275 }),
      note(64, 500),
    ]);
    expect(adaptMidi(source, 250, "smart").notes.map((n) => n.midi)).toEqual([
      60, 62, 64,
    ]);
  });

  it("keeps all 88 sequential keys playable, quantized and in their original pitch classes", () => {
    const source = take(
      Array.from({ length: 88 }, (_, i) => note(21 + i, i * 250)),
    );
    for (const mode of ["smart", "fold"] as const) {
      const result = importMidiTake(
        source,
        "88 keys",
        emptyScore().timing,
        mode,
      );
      expect(result.score.notes).toHaveLength(88);
      result.score.notes.forEach((n, i) => {
        expect(n.midi).toBeGreaterThanOrEqual(48);
        expect(n.midi).toBeLessThanOrEqual(83);
        expect(n.midi! % 12).toBe((21 + i) % 12);
        expect(n.col).toBe(i);
      });
      expect(schedule(result.score).notes).toHaveLength(88);
    }
  });

  it("trims recording setup silence, ignores drums and validates timing", () => {
    const source = take([
      note(36, 0, { channel: 9 }),
      note(60, 1000),
      note(62, 1250),
    ]);
    const score = importMidiTake(
      source,
      "take",
      emptyScore().timing,
      "smart",
      true,
    ).score;
    expect(score.notes.map((n) => n.col)).toEqual([0, 1]);
    expect(() =>
      importMidiTake(source, "bad", { ...score.timing, bpm: 0 }),
    ).toThrow("BPM");
    expect(() =>
      importMidiTake(source, "bad", { ...score.timing, gridFactor: 5 }),
    ).toThrow("网格");
    expect(() => adaptMidi(take([note(200)]), 250, "smart")).toThrow(
      "音符数据",
    );
    expect(() =>
      adaptMidi(take([note(60, 10, { endMs: 0 })]), 250, "smart"),
    ).toThrow("音符数据");
    expect(() => adaptMidi(take([]), 250, "smart")).toThrow("没有录到");
  });

  it("exports full-range polyphony, velocity, channels and sustained durations before adaptation", () => {
    const source = take([
      note(21, 0, { endMs: 1000 }),
      note(108, 0, { channel: 1, velocity: 64 }),
      note(60, 500),
    ]);
    const bytes = exportMidiTake(source);
    const data = parseMidi(bytes);
    expect(data.header.format).toBe(0);
    const on = data.tracks[0].filter((e) => e.type === "noteOn");
    expect(
      on.map((e) =>
        e.type === "noteOn" ? [e.noteNumber, e.channel, e.velocity] : null,
      ),
    ).toEqual([
      [21, 0, 90],
      [108, 1, 64],
      [60, 0, 90],
    ]);
    let tick = 0;
    const ends: number[] = [];
    for (const event of data.tracks[0]) {
      tick += event.deltaTime;
      if (event.type === "noteOff" && event.noteNumber === 21) ends.push(tick);
    }
    expect(ends).toEqual([960]);
    expect(
      importMidi(bytes, "recording", emptyScore().timing).score.notes,
    ).toHaveLength(2);
  });
});
