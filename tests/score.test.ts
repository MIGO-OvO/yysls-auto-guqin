import { describe, expect, it } from "vitest";
import { writeMidi, type MidiData } from "midi-file";
import fixture from "./fixtures/score.json";
import {
  appendScore,
  canonicalKeys,
  emptyScore,
  exportCommands,
  exportJson,
  importCommands,
  importJson,
  importMidi,
  importText,
  pitches,
  schedule,
} from "../src/score";

describe("legacy formats and a shared timeline", () => {
  it("retains every 36-key mapping and modifier alias", () => {
    expect(pitches.map((p) => p.keys)).toEqual([
      "Z",
      "Shift+Z",
      "X",
      "Ctrl+C",
      "C",
      "V",
      "Shift+V",
      "B",
      "Shift+B",
      "N",
      "Ctrl+M",
      "M",
      "A",
      "Shift+A",
      "S",
      "Ctrl+D",
      "D",
      "F",
      "Shift+F",
      "G",
      "Shift+G",
      "H",
      "Ctrl+J",
      "J",
      "Q",
      "Shift+Q",
      "W",
      "Ctrl+E",
      "E",
      "R",
      "Shift+R",
      "T",
      "Shift+T",
      "Y",
      "Ctrl+U",
      "U",
    ]);
    expect(canonicalKeys("LControl+⇧Q")).toBe("Ctrl+Shift+Q");
    expect(() => canonicalKeys("Ctrl+Q+W")).toThrow();
    expect(() => canonicalKeys("Shift+Shift+Q")).toThrow();
  });
  it("matches the Rust schedule fixture, including truncation and rests", () => {
    const { score } = importJson(JSON.stringify(fixture), "test");
    expect(schedule(score).notes.map((n) => [n.atMs, n.holdMs])).toEqual([
      [0, 250],
      [250, 500],
      [1000, 250],
    ]);
    expect(schedule(score).durationMs).toBe(1250);
    expect(exportCommands(score)).toContain(
      "KEY Shift+A 500\n250ms\nKEY Ctrl+D 250",
    );
  });
  it("round trips old JSON objects and bare arrays", () => {
    const { score } = importJson(JSON.stringify(fixture), "test");
    const roundtrip = importJson(exportJson(score), "test").score;
    expect(exportCommands(roundtrip)).toBe(exportCommands(score));
    expect(
      importJson(JSON.stringify(fixture.notes), "array").score.notes.length,
    ).toBe(3);
    expect(() => importJson('{"notes":[{"midi":90,"col":0}]}', "bad")).toThrow(
      "音高",
    );
    expect(() =>
      importJson('{"notes":[],"timing":{"gridFactor":5}}', "bad"),
    ).toThrow("网格");
  });
  it("preserves sequence positions, repeats, rests and legacy ×N semantics", () => {
    const { score } = importText(
      "1, → 1 1 0 #4×2 1'",
      "sequence",
      emptyScore().timing,
    );
    expect(score.notes.map((n) => [n.midi, n.col, n.len])).toEqual([
      [48, 0, 1],
      [60, 1, 1],
      [60, 2, 1],
      [66, 4, 2],
      [72, 5, 1],
    ]);
    expect(() => importText("1 invalid", "bad", score.timing)).toThrow(
      "无法识别",
    );
  });
  it("imports exact TXT durations, full C# keys, comments and trailing rests", () => {
    const { score } = importCommands(
      "# test\n17ms\nkey ⇧Q 123 ms # c\n0\nKEY Alt+F4 60000\n321ms",
      "cmd",
      emptyScore().timing,
    );
    expect(
      schedule(score).notes.map((n) => [n.atMs, n.holdMs, n.keys, n.midi]),
    ).toEqual([
      [17, 123, "Shift+Q", 73],
      [140, 60000, "Alt+F4", null],
    ]);
    expect(schedule(score).durationMs).toBe(60461);
    expect(
      exportCommands(
        importText(exportCommands(score), "cmd", score.timing).score,
      )
        .split("\n")
        .slice(1),
    ).toEqual(exportCommands(score).split("\n").slice(1));
    expect(() => importCommands("KEY Q 60001", "bad", score.timing)).toThrow(
      "第 1 行",
    );
  });
  it("limits ordinary holds and selects the highest same-column melody", () => {
    const { score } = importJson(JSON.stringify(fixture), "test");
    score.notes.push({ ...score.notes[0], id: "high", midi: 83, keys: "U" });
    expect(schedule(score).notes[0].midi).toBe(83);
    score.notes = [{ ...score.notes[0], len: 1000 }];
    expect(schedule(score).notes[0].holdMs).toBe(6000);
  });
  it("preserves each hold policy, timing and trailing rest when appending mixed formats", () => {
    const ordinary = emptyScore("ordinary");
    ordinary.timing.bpm = 30;
    ordinary.notes = [{ id: "long", midi: 60, col: 0, len: 16 }];
    const commands = importCommands(
      "KEY F12 1\nKEY Q 60000\n321ms",
      "commands",
      emptyScore().timing,
    ).score;
    const forward = appendScore(ordinary, commands);
    const backward = appendScore(commands, ordinary);
    expect(schedule(forward).notes.map((n) => [n.atMs, n.holdMs])).toEqual([
      [0, 6000],
      [16000, 1],
      [16001, 60000],
    ]);
    expect(schedule(backward).notes.map((n) => [n.atMs, n.holdMs])).toEqual([
      [0, 1],
      [1, 60000],
      [60322, 6000],
    ]);
    for (const mixed of [forward, backward])
      expect(schedule(importJson(exportJson(mixed), "mixed").score)).toEqual({
        ...schedule(mixed),
        notes: schedule(mixed).notes.map((n) => ({
          ...n,
          id: expect.any(String),
        })),
      });
    const legacy = importJson(
      '{"source":"commands","notes":[{"midi":72,"col":0,"len":1000}]}',
      "legacy",
    ).score;
    expect(schedule(legacy).notes[0].holdMs).toBe(60000);
  });
});

describe("MIDI import", () => {
  const make = (): MidiData => ({
    header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
    tracks: [
      [
        {
          deltaTime: 0,
          meta: true,
          type: "setTempo",
          microsecondsPerBeat: 500000,
        },
        {
          deltaTime: 480,
          meta: true,
          type: "setTempo",
          microsecondsPerBeat: 1000000,
        },
        { deltaTime: 480, meta: true, type: "endOfTrack" },
      ],
      [
        {
          deltaTime: 0,
          type: "noteOn",
          channel: 0,
          noteNumber: 60,
          velocity: 100,
        },
        {
          deltaTime: 0,
          type: "noteOn",
          channel: 1,
          noteNumber: 67,
          velocity: 100,
        },
        {
          deltaTime: 480,
          type: "noteOff",
          channel: 0,
          noteNumber: 60,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: "noteOff",
          channel: 1,
          noteNumber: 67,
          velocity: 0,
        },
        {
          deltaTime: 0,
          type: "noteOn",
          channel: 0,
          noteNumber: 62,
          velocity: 100,
        },
        {
          deltaTime: 480,
          type: "noteOn",
          channel: 0,
          noteNumber: 62,
          velocity: 0,
        },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ],
    ],
  });
  it("folds chords, distinguishes channels and respects changing tempo", () => {
    const result = importMidi(
      new Uint8Array(writeMidi(make())),
      "MIDI",
      emptyScore().timing,
    );
    expect(result.score.notes.map((n) => [n.midi, n.col, n.len])).toEqual([
      [67, 0, 2],
      [62, 2, 4],
    ]);
    expect(result.warnings.join(" ")).toContain("速度变化");
  });
  it("folds pitches into the 36-key range and ignores drums", () => {
    const midi = make();
    midi.tracks[1] = [
      {
        deltaTime: 0,
        type: "noteOn",
        channel: 0,
        noteNumber: 100,
        velocity: 80,
      },
      {
        deltaTime: 480,
        type: "noteOff",
        channel: 0,
        noteNumber: 100,
        velocity: 0,
      },
      {
        deltaTime: 0,
        type: "noteOn",
        channel: 9,
        noteNumber: 35,
        velocity: 100,
      },
      {
        deltaTime: 100,
        type: "noteOff",
        channel: 9,
        noteNumber: 35,
        velocity: 0,
      },
    ];
    const result = importMidi(
      new Uint8Array(writeMidi(midi)),
      "high",
      emptyScore().timing,
    );
    expect(result.score.notes).toHaveLength(1);
    expect(result.score.notes[0].midi).toBe(76);
  });
  it("rejects broken, SMPTE and asynchronous format-2 files", () => {
    expect(() =>
      importMidi(new Uint8Array([1, 2, 3]), "bad", emptyScore().timing),
    ).toThrow();
    const midi = make();
    midi.header = { format: 2, numTracks: 2, ticksPerBeat: 480 };
    expect(() =>
      importMidi(new Uint8Array(writeMidi(midi)), "bad", emptyScore().timing),
    ).toThrow("格式 2");
    midi.header = {
      format: 1,
      numTracks: 2,
      framesPerSecond: 25,
      ticksPerFrame: 40,
    };
    expect(() =>
      importMidi(new Uint8Array(writeMidi(midi)), "bad", emptyScore().timing),
    ).toThrow("SMPTE");
  });
});
