import { parseMidi } from 'midi-file';

export interface Note { id: string; midi: number | null; col: number; len: number; keys?: string }
export interface Timing { bpm: number; gridFactor: number; defaultLen: number }
export interface Score { id: string; title: string; cols: number; timing: Timing; notes: Note[]; source?: 'commands'; endCol?: number }
export interface Pitch { midi: number; name: string; keys: string; black: boolean; octave: number }
export interface ScheduledNote { atMs: number; holdMs: number; midi: number | null; keys: string; id: string }
export interface ImportResult { score: Score; warnings: string[] }

const degrees = ['1', '#1', '2', 'b3', '3', '4', '#4', '5', '#5', '6', 'b7', '7'];
const letterIndices = [0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6];
const modifiers = ['', 'Shift+', '', 'Ctrl+', '', '', 'Shift+', '', 'Shift+', '', 'Ctrl+', ''];
export const pitches: Pitch[] = ['ZXCVBNM', 'ASDFGHJ', 'QWERTYU'].flatMap((letters, octave) =>
  degrees.map((name, i) => ({ midi: 48 + octave * 12 + i, name: name + [',', '', "'"][octave], keys: modifiers[i] + letters[letterIndices[i]], black: Boolean(modifiers[i]), octave })),
);
export const pitchOf = (midi: number | null) => pitches.find(p => p.midi === midi);
export const uid = () => crypto.randomUUID();
export const stepMs = (score: Score) => 60000 / score.timing.bpm * 4 / score.timing.gridFactor;
export const emptyScore = (title = '未命名曲谱'): Score => ({ id: uid(), title, cols: 32, timing: { bpm: 120, gridFactor: 8, defaultLen: 1 }, notes: [] });
export const sorted = (score: Score) => [...score.notes].sort((a, b) => a.col - b.col || (b.midi ?? -1) - (a.midi ?? -1));

export function canonicalKeys(text: string): string {
  const parts = text.replace(/[↑⇧]/g, 'Shift+').replace(/[↓⌃]/g, 'Ctrl+').replace(/\s*\+\s*/g, '+').toUpperCase().split('+');
  const mods = new Set<string>();
  let base = '';
  for (const part of parts) {
    const mod = /^(CTRL|CONTROL|LCTRL|LCONTROL|L-CTRL|左CTRL)$/.test(part) ? 'Ctrl' : /^(SHIFT|LSHIFT|L-SHIFT|左SHIFT)$/.test(part) ? 'Shift' : /^(ALT|LALT|左ALT)$/.test(part) ? 'Alt' : '';
    if (mod) { if (mods.has(mod)) throw new Error(`重复的 ${mod}`); mods.add(mod); }
    else if (!base && /^([A-Z0-9]|F([1-9]|1[0-2]))$/.test(part)) base = part;
    else throw new Error(`无法识别按键：${text}`);
  }
  if (!base) throw new Error(`缺少主键：${text}`);
  return ['Ctrl', 'Alt', 'Shift'].filter(m => mods.has(m)).map(m => m + '+').join('') + base;
}

export function schedule(score: Score, startCol = 0): { notes: ScheduledNote[]; durationMs: number } {
  const step = stepMs(score);
  // Same-column chords follow the original MIDI melody rule: highest note wins.
  const melody = sorted(score).filter((n, i, all) => i === 0 || n.col !== all[i - 1].col);
  const notes = melody.map((n, i) => {
    const next = melody[i + 1];
    const atMs = Math.round((n.col - startCol) * step);
    const maximum = score.source === 'commands' ? 60000 : 6000;
    const minimum = score.source === 'commands' ? 1 : 20;
    const untilNext = next ? Math.max(1, Math.round((next.col - n.col) * step)) : maximum;
    return { id: n.id, midi: n.midi, keys: n.keys ?? pitchOf(n.midi)!.keys, atMs, holdMs: Math.max(1, Math.min(maximum, Math.max(minimum, Math.round(n.len * step)), untilNext)) };
  }).filter(n => n.atMs >= 0);
  const last = notes.at(-1);
  return { notes, durationMs: Math.max(last ? last.atMs + last.holdMs : 0, Math.round(Math.max(0, (score.endCol ?? 0) - startCol) * step)) };
}

export function exportCommands(score: Score): string {
  const plan = schedule(score);
  let cursor = 0;
  const lines = [`# ${score.title} · ${score.timing.bpm} BPM`];
  for (const n of plan.notes) {
    if (n.atMs > cursor) lines.push(`${n.atMs - cursor}ms`);
    lines.push(`KEY ${n.keys} ${n.holdMs}`);
    cursor = n.atMs + n.holdMs;
  }
  if (plan.durationMs > cursor) lines.push(`${plan.durationMs - cursor}ms`);
  return lines.join('\n');
}

export function exportJson(score: Score): string {
  return JSON.stringify({ ...score, app: 'yysls-freeplay-arranger', version: 1, count: score.notes.length,
    notes: sorted(score).map(n => ({ ...n, name: pitchOf(n.midi)?.name, keys: n.keys ?? pitchOf(n.midi)?.keys })) }, null, 2);
}

function number(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label}需在 ${min}–${max} 之间`);
  return n;
}

export function importJson(text: string, title: string): ImportResult {
  const data = JSON.parse(text);
  if (data === null || typeof data !== 'object') throw new Error('JSON 需要 notes 数组');
  const list: unknown = Array.isArray(data) ? data : data.notes;
  if (!Array.isArray(list) || list.length > 100000) throw new Error('JSON 需要 notes 数组，最多 100000 个音符');
  const score = emptyScore(typeof data.title === 'string' ? data.title.slice(0, 100) : title);
  const timing = data.timing ?? score.timing;
  score.timing = { bpm: number(timing.bpm ?? 120, 30, 300, 'BPM'), gridFactor: number(timing.gridFactor ?? 8, 4, 32, '网格'), defaultLen: number(timing.defaultLen ?? 1, 1, 16, '新音长') };
  if (![4, 8, 16, 32].includes(score.timing.gridFactor)) throw new Error('网格需要 4、8、16 或 32');
  if (data.source === 'commands') score.source = 'commands';
  score.notes = list.map((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`第 ${i + 1} 个音符格式错误`);
    const n = item as Record<string, unknown>;
    const midi = n.midi === null && score.source === 'commands' ? null : number(n.midi, 48, 83, '音高');
    if (midi !== null && !Number.isInteger(midi)) throw new Error('音高必须是整数');
    const keys = midi === null ? canonicalKeys(String(n.keys ?? '')) : pitchOf(midi)!.keys;
    return { id: uid(), midi, col: number(n.col, 0, 1000000, '位置'), len: number(n.len ?? 1, 0.001, 32000, '音长'), keys };
  });
  if (data.endCol !== undefined) score.endCol = number(data.endCol, 0, 1000000, '曲尾');
  score.cols = Math.max(16, Math.ceil(number(data.cols ?? 16, 1, 1000000, '总格数') / 16) * 16, ...score.notes.map(n => Math.ceil((n.col + n.len) / 16) * 16));
  return { score, warnings: chordWarnings(score) };
}

function chordWarnings(score: Score): string[] {
  const count = score.notes.length - new Set(score.notes.map(n => n.col)).size;
  return count ? [`${count} 个同列叠音：演奏时取最高音。`] : [];
}

export function importCommands(text: string, title: string, timing: Timing): ImportResult {
  const score = { ...emptyScore(title), timing: { ...timing }, source: 'commands' as const };
  const step = stepMs(score);
  let cursor = 0;
  text.replace(/^\uFEFF/, '').split(/\r\n?|\n/).forEach((line, index) => {
    const raw = line.replace(/#.*$|\/\/.*$/g, '').trim();
    if (!raw) return;
    try {
      const key = /^KEY\s+(.+?)\s+(\d+)\s*(?:ms)?$/i.exec(raw);
      if (key) {
        const keys = canonicalKeys(key[1]);
        const hold = number(key[2], 1, 60000, '按住毫秒');
        score.notes.push({ id: uid(), midi: pitches.find(p => p.keys === keys)?.midi ?? null, keys, col: cursor / step, len: hold / step });
        cursor += hold;
      } else if (/^\d+\s*(ms)?$/i.test(raw)) cursor += number(raw.replace(/\s*ms$/i, ''), 0, 600000, '等待毫秒');
      else throw new Error('格式应为 KEY Shift+Q 250 或 250ms');
    } catch (e) { throw new Error(`第 ${index + 1} 行：${e instanceof Error ? e.message : String(e)}`); }
    if (cursor > 86400000 || score.notes.length > 100000) throw new Error('乐谱超过 24 小时或 100000 个音符');
  });
  if (!score.notes.length) throw new Error('没有找到 KEY 命令');
  score.endCol = cursor / step;
  score.cols = Math.max(32, Math.ceil(score.endCol / 16) * 16);
  return { score, warnings: score.notes.some(n => n.midi === null) ? ['包含 36 键以外的按键，已放入命令轨。'] : [] };
}

export function importText(text: string, title: string, timing: Timing): ImportResult {
  const raw = text.trim().replace(/^\uFEFF/, '');
  if (!raw) throw new Error('请先输入简谱、键位或命令');
  if (/^[{[]/.test(raw)) return importJson(raw, title);
  if (/^\s*KEY\s/im.test(raw)) return importCommands(raw, title, timing);
  const score = { ...emptyScore(title), timing: { ...timing } };
  const tokens = raw.replace(/[’‘]/g, "'").replace(/\s*\+\s*/g, '+')
    .replace(/([0-9]),(\s|→|⇒|>|$)/g, '$1\u0001$2').split(/→|⇒|->|=>|＞|>|\n|,|，|;|；|\||\s+/).filter(Boolean);
  for (const [position, token] of tokens.entries()) {
    const value = token.replace(/\u0001/g, ',');
    const match = /^(.*?)[×xX*](\d{1,3})$/.exec(value);
    const word = match?.[1] ?? value;
    const len = match ? number(match[2], 1, 64, '音长') : 1;
    let pitch = pitches.find(p => p.name.toLowerCase() === word.toLowerCase());
    if (!pitch) { try { const keys = canonicalKeys(word); pitch = pitches.find(p => p.keys === keys); } catch { /* It may be a numbered rest. */ } }
    if (word === '0' || word === '-') continue;
    if (!pitch) throw new Error(`无法识别：${value}`);
    // Legacy sequences advance one column per token, including ×N notes.
    score.notes.push({ id: uid(), midi: pitch.midi, col: position, len });
  }
  score.cols = Math.max(32, Math.ceil(tokens.length / 16) * 16);
  return { score, warnings: [] };
}

export function importMidi(bytes: Uint8Array, title: string, timing: Timing): ImportResult {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('MIDI 文件超过 20MB');
  const data = parseMidi(bytes);
  if (data.header.format === 2) throw new Error('请把 MIDI 格式 2 转为格式 0 或 1');
  const division = data.header.ticksPerBeat;
  if (!division) throw new Error('暂不支持 SMPTE 时间码 MIDI');
  const raw: { tick: number; end: number; midi: number }[] = [];
  const tempos: { tick: number; us: number }[] = [{ tick: 0, us: 500000 }];
  for (const track of data.tracks) {
    let tick = 0;
    const open = new Map<string, { tick: number; midi: number }[]>();
    for (const e of track) {
      tick += e.deltaTime;
      if (e.type === 'setTempo') { if (e.microsecondsPerBeat > 0) tempos.push({ tick, us: e.microsecondsPerBeat }); }
      if (e.type === 'noteOn' || e.type === 'noteOff') {
        if (e.channel === 9) continue;
        const key = `${e.channel}:${e.noteNumber}`;
        if (e.type === 'noteOn' && e.velocity > 0) { const queue = open.get(key) ?? []; queue.push({ tick, midi: e.noteNumber }); open.set(key, queue); }
        else { const n = open.get(key)?.shift(); if (n) raw.push({ tick: n.tick, end: tick, midi: n.midi }); }
      }
    }
    for (const queue of open.values()) for (const n of queue) raw.push({ tick: n.tick, end: Math.max(n.tick + division / 4, tick), midi: n.midi });
  }
  if (!raw.length) throw new Error('MIDI 中没有旋律音符（打击乐通道不导入）');
  if (raw.length > 100000) throw new Error('MIDI 超过 100000 个音符');
  tempos.sort((a, b) => a.tick - b.tick);
  const tempoMap = tempos.filter((t, i) => i === tempos.length - 1 || tempos[i + 1].tick !== t.tick);
  const initialBpm = Math.max(30, Math.min(300, Math.round(60000000 / tempoMap[0].us)));
  const score = { ...emptyScore(title), timing: { ...timing, bpm: initialBpm } };
  const toMs = (tick: number) => {
    let result = 0;
    for (let i = 0; i < tempoMap.length; i++) {
      const end = Math.min(tick, tempoMap[i + 1]?.tick ?? tick);
      if (end > tempoMap[i].tick) result += (end - tempoMap[i].tick) / division * tempoMap[i].us / 1000;
      if (end === tick) break;
    }
    return result;
  };
  const min = Math.min(...raw.map(n => n.midi));
  const max = Math.max(...raw.map(n => n.midi));
  let shift = max > 83 ? -12 * Math.ceil((max - 83) / 12) : 0;
  if (min + shift < 48) shift += 12 * Math.ceil((48 - (min + shift)) / 12);
  const cells = new Map<number, Note>();
  let folded = 0;
  for (const n of raw) {
    let midi = n.midi + shift;
    while (midi < 48) midi += 12;
    while (midi > 83) midi -= 12;
    if (midi !== n.midi) folded++;
    const col = Math.max(0, Math.round(toMs(n.tick) / stepMs(score)));
    const len = Math.max(1, Math.min(64, Math.round((toMs(n.end) - toMs(n.tick)) / stepMs(score))));
    if (!cells.has(col) || midi > cells.get(col)!.midi!) cells.set(col, { id: uid(), midi, col, len });
  }
  score.notes = [...cells.values()].sort((a, b) => a.col - b.col);
  score.cols = Math.max(32, ...score.notes.map(n => Math.ceil((n.col + n.len) / 16) * 16));
  const warnings = [`按 1/${timing.gridFactor} 量化，${raw.length - cells.size} 个叠音已取最高音。`];
  if (folded) warnings.push(`${folded} 个音已移八度到 C3–B5。`);
  if (tempoMap.length > 1) warnings.push('MIDI 速度变化已换算为网格时间。');
  return { score, warnings };
}

export const formatTime = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;

export function demoScore(): Score {
  const score = emptyScore('山间清音');
  score.timing.bpm = 96;
  score.timing.gridFactor = 8;
  const melody = [60, 64, 67, 69, 67, 64, 62, 60, 55, 60, 62, 64, 62, 60, 57, 55, 60, 64, 67, 72, 71, 69, 67, 64, 62, 64, 67, 64, 62, 60];
  score.notes = melody.map((midi, i) => ({ id: uid(), midi, col: i * 2, len: i % 7 === 6 ? 3 : 1.5 }));
  score.cols = 64;
  return score;
}
