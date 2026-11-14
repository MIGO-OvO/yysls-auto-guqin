import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";
import {
  adaptMidi,
  exportMidiTake,
  type MidiNote,
  type MidiTake,
} from "../src/midi";
import {
  emptyScore,
  exportMidi,
  importMidi,
  importMidiTake,
  schedule,
} from "../src/score";

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

describe("score MIDI export", () => {
  it("retains chords, long overlapping notes, rests, tempo and UTF-8 titles", () => {
    const score = emptyScore("清音·试奏");
    score.timing.bpm = 75;
    score.endCol = 50;
    score.notes = [
      { id: "a", midi: 60, col: 2, len: 40 },
      { id: "b", midi: 64, col: 2, len: 2 },
      { id: "c", midi: 60, col: 42, len: 2 },
      { id: "command", midi: null, keys: "F1", col: 46, len: 2 },
    ];
    const original = structuredClone(score);
    const data = parseMidi(exportMidi(score, 107));
    expect(data.header).toMatchObject({
      format: 0,
      ticksPerBeat: 480,
      numTracks: 1,
    });
    expect(data.tracks[0]).toContainEqual({
      deltaTime: 0,
      meta: true,
      type: "setTempo",
      microsecondsPerBeat: 800000,
    });
    expect(data.tracks[0]).toContainEqual({
      deltaTime: 0,
      type: "programChange",
      channel: 0,
      programNumber: 107,
    });
    const title = data.tracks[0].find((e) => e.type === "trackName");
    expect(
      title?.type === "trackName" &&
        new TextDecoder().decode(
          Uint8Array.from(title.text, (c) => c.charCodeAt(0)),
        ),
    ).toBe(score.title);
    let tick = 0;
    const notes: [string, number, number][] = [];
    for (const event of data.tracks[0]) {
      tick += event.deltaTime;
      if (event.type === "noteOn" || event.type === "noteOff")
        notes.push([event.type, event.noteNumber, tick]);
    }
    expect(notes).toEqual([
      ["noteOn", 64, 480],
      ["noteOn", 60, 480],
      ["noteOff", 64, 960],
      ["noteOff", 60, 10080],
      ["noteOn", 60, 10080],
      ["noteOff", 60, 10560],
    ]);
    expect(tick).toBe(12000);
    expect(score).toEqual(original);
  });

  it("round-trips a melody at fractional BPM without losing grid timing", () => {
    const score = emptyScore("round trip");
    score.timing = { bpm: 97.5, gridFactor: 16, defaultLen: 1 };
    score.notes = [48, 61, 83].map((midi, i) => ({
      id: String(i),
      midi,
      col: i * 3 + 2,
      len: 2,
    }));
    const imported = importMidi(
      exportMidi(score),
      "copy",
      score.timing,
      "fold",
    ).score;
    expect(
      imported.notes.map(({ midi, col, len }) => ({ midi, col, len })),
    ).toEqual(score.notes.map(({ midi, col, len }) => ({ midi, col, len })));
  });

  it("reports empty or command-only scores and invalid MIDI metadata", () => {
    const score = emptyScore();
    expect(() => exportMidi(score)).toThrow("没有可导出");
    score.notes = [{ id: "command", midi: null, keys: "F1", col: 0, len: 1 }];
    expect(() => exportMidi(score)).toThrow("没有可导出");
    expect(() => exportMidiTake(take([note(60)]), { bpm: 0 })).toThrow("速度");
    expect(() => exportMidiTake(take([note(60)]), { program: 128 })).toThrow(
      "乐器编号",
    );
  });
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
