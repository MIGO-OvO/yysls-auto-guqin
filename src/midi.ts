import { writeMidi, type MidiEvent } from "midi-file";

export interface MidiNote {
  midi: number;
  channel: number;
  velocity: number;
  startMs: number;
  endMs: number;
  track?: number;
}
export interface MidiTake {
  notes: MidiNote[];
  durationMs: number;
}
export type MidiConversion = "smart" | "fold";
export interface MidiPort {
  id: string;
  name: string;
}
export interface MidiMessage {
  portId: string;
  data: number[];
  error?: string | null;
}

export function validateTake(take: MidiTake) {
  if (!take.notes.length) throw new Error("没有录到音符，请弹奏后再试");
  if (take.notes.length > 100000) throw new Error("MIDI 超过 100000 个音符");
  if (
    !Number.isFinite(take.durationMs) ||
    take.durationMs < 0 ||
    take.durationMs > 86400001
  )
    throw new Error("MIDI 时长无效或超过 24 小时");
  for (const n of take.notes) {
    if (
      !Number.isInteger(n.midi) ||
      n.midi < 0 ||
      n.midi > 127 ||
      !Number.isInteger(n.channel) ||
      n.channel < 0 ||
      n.channel > 15 ||
      !Number.isInteger(n.velocity) ||
      n.velocity < 1 ||
      n.velocity > 127 ||
      !Number.isFinite(n.startMs) ||
      !Number.isFinite(n.endMs) ||
      n.startMs < 0 ||
      n.endMs <= n.startMs ||
      n.endMs > 86400001
    )
      throw new Error("MIDI 音符数据无效");
  }
}

// Both passes use the complete phrase, rather than committing to each local peak.
function bestPath<T>(
  groups: T[][],
  local: (n: T, i: number) => number,
  transition: (a: T, b: T, i: number) => number,
): T[] {
  const back: number[][] = [];
  let costs: number[] = [];
  groups.forEach((group, i) => {
    const pointers: number[] = [];
    const next = group.map((n) => {
      let cost = 0,
        parent = 0;
      if (i) {
        cost = Infinity;
        groups[i - 1].forEach((previous, j) => {
          const candidate = costs[j] + transition(previous, n, i);
          if (candidate < cost) {
            cost = candidate;
            parent = j;
          }
        });
      }
      pointers.push(parent);
      return cost + local(n, i);
    });
    back.push(pointers);
    costs = next;
  });
  let cursor = costs.indexOf(Math.min(...costs));
  const result: T[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    result.push(groups[i][cursor]);
    cursor = back[i][cursor];
  }
  return result.reverse();
}

export function adaptMidi(
  take: MidiTake,
  step: number,
  mode: MidiConversion,
  trimStart = false,
) {
  validateTake(take);
  if (!Number.isFinite(step) || step <= 0) throw new Error("MIDI 网格时值无效");
  const raw = take.notes.filter((n) => n.channel !== 9);
  if (!raw.length) throw new Error("MIDI 中没有旋律音符（打击乐通道不导入）");
  const origin = trimStart
    ? raw.reduce((t, n) => Math.min(t, n.startMs), Infinity)
    : 0;
  const cells = new Map<number, MidiNote[]>();
  for (const n of raw) {
    const col = Math.max(0, Math.round((n.startMs - origin) / step));
    const group = cells.get(col) ?? [];
    group.push(n);
    cells.set(col, group);
  }
  const columns = [...cells.keys()].sort((a, b) => a - b);
  const groups = columns.map((col) => cells.get(col)!);
  let melody: MidiNote[], mapped: number[];
  if (mode === "fold") {
    const min = raw.reduce((v, n) => Math.min(v, n.midi), 127);
    const max = raw.reduce((v, n) => Math.max(v, n.midi), 0);
    let shift = max > 83 ? -12 * Math.ceil((max - 83) / 12) : 0;
    if (min + shift < 48) shift += 12 * Math.ceil((48 - min - shift) / 12);
    const fold = (pitch: number) => {
      let value = pitch + shift;
      while (value < 48) value += 12;
      while (value > 83) value -= 12;
      return value;
    };
    melody = groups.map((g) =>
      g.reduce((a, b) => (fold(b.midi) > fold(a.midi) ? b : a)),
    );
    mapped = melody.map((n) => fold(n.midi));
  } else {
    // ponytail: score eight upper voices; add manual voice selection for inner melodies.
    const candidates = groups.map((g) =>
      g
        .slice()
        .sort((a, b) => b.midi - a.midi)
        .slice(0, 8),
    );
    melody = bestPath(
      candidates,
      (n, i) =>
        (candidates[i][0].midi - n.midi) * 0.12 +
        ((127 - n.velocity) / 127) * 0.35 +
        0.3 / (1 + (n.endMs - n.startMs) / step),
      (a, b) =>
        b.startMs - a.endMs > 1500
          ? 0
          : Math.abs(b.midi - a.midi) * 0.05 +
            (a.track !== b.track || a.channel !== b.channel ? 0.6 : 0),
    );
    let shift = 0,
      shiftCost = Infinity;
    for (let octave = -8; octave <= 8; octave++) {
      const offset = octave * 12;
      const cost =
        melody.reduce(
          (sum, n) =>
            sum + Math.max(48 - n.midi - offset, n.midi + offset - 83, 0),
          0,
        ) +
        Math.abs(offset) * 0.01;
      if (cost < shiftCost) {
        shiftCost = cost;
        shift = offset;
      }
    }
    mapped = bestPath(
      melody.map((n) => [48, 60, 72].map((v) => v + (n.midi % 12))),
      (pitch, i) => Math.abs(pitch - melody[i].midi - shift) * 0.12,
      (a, b, i) => {
        if (melody[i].startMs - melody[i - 1].endMs > 1500) return 0;
        const source = melody[i].midi - melody[i - 1].midi;
        const delta = b - a;
        return (
          Math.min(24, Math.abs(delta - source)) * 0.2 +
          Math.abs(delta) * 0.03 +
          (delta * source < 0 ? 1.2 : 0)
        );
      },
    );
  }
  return {
    notes: melody.map((n, i) => ({
      midi: mapped[i],
      col: columns[i],
      len: Math.max(1, Math.min(64, Math.round((n.endMs - n.startMs) / step))),
    })),
    folded: melody.filter((n, i) => n.midi !== mapped[i]).length,
    removed: raw.length - melody.length,
  };
}

export function exportMidiTake(
  take: MidiTake,
  {
    bpm = 120,
    name,
    program,
  }: { bpm?: number; name?: string; program?: number } = {},
): Uint8Array {
  validateTake(take);
  if (!Number.isFinite(bpm) || bpm < 4 || bpm > 1000)
    throw new Error("MIDI 速度无效");
  if (
    program !== undefined &&
    (!Number.isInteger(program) || program < 0 || program > 127)
  )
    throw new Error("MIDI 乐器编号无效");
  const tempo = Math.round(60000000 / bpm);
  const ticksPerMs = 480000 / tempo;
  const events: { tick: number; event: MidiEvent }[] = [];
  for (const n of take.notes) {
    const start = Math.round(n.startMs * ticksPerMs);
    const end = Math.max(start + 1, Math.round(n.endMs * ticksPerMs));
    events.push(
      {
        tick: start,
        event: {
          deltaTime: 0,
          type: "noteOn",
          channel: n.channel,
          noteNumber: n.midi,
          velocity: n.velocity,
        },
      },
      {
        tick: end,
        event: {
          deltaTime: 0,
          type: "noteOff",
          channel: n.channel,
          noteNumber: n.midi,
          velocity: 0,
        },
      },
    );
  }
  events.sort(
    (a, b) =>
      a.tick - b.tick ||
      Number(a.event.type === "noteOn") - Number(b.event.type === "noteOn"),
  );
  let previous = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: tempo },
  ];
  if (name)
    track.push({
      deltaTime: 0,
      meta: true,
      type: "trackName",
      text: Array.from(new TextEncoder().encode(name), (byte) =>
        String.fromCharCode(byte),
      ).join(""),
    });
  if (program !== undefined) {
    for (const channel of new Set(take.notes.map((n) => n.channel))) {
      if (channel !== 9)
        track.push({
          deltaTime: 0,
          type: "programChange",
          channel,
          programNumber: program,
        });
    }
  }
  for (const { tick, event } of events) {
    track.push({ ...event, deltaTime: tick - previous });
    previous = tick;
  }
  track.push({
    deltaTime: Math.max(0, Math.round(take.durationMs * ticksPerMs) - previous),
    meta: true,
    type: "endOfTrack",
  });
  return new Uint8Array(
    writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
      tracks: [track],
    }),
  );
}
