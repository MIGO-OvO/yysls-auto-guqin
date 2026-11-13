import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Music2 } from "lucide-react";
import { pitchOf, pitches, uid, type Note, type Score } from "./score";

export type Tool = "draw" | "select" | "erase";
interface Props {
  score: Score;
  commit: (score: Score) => void;
  selected: string | null;
  select: (id: string | null) => void;
  tool: Tool;
  zoom: number;
  startCol: number;
  seek: (col: number) => void;
  playCol: number | null;
  activeNote: string | null;
  preview: (midi: number) => void;
  locked: boolean;
}
const ROW = 21;
const LABEL = 90;

export default function PianoRoll({
  score,
  commit,
  selected,
  select,
  tool,
  zoom,
  startCol,
  seek,
  playCol,
  activeNote,
  preview,
  locked,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Note | null>(null);
  const [cell, setCell] = useState({ midi: 60, col: 0 });
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    note: Note;
    resize: boolean;
    changed: boolean;
  } | null>(null);
  const width = 28 * zoom;
  const hasCommands = score.notes.some((n) => n.midi === null);
  const height = ROW * (hasCommands ? 37 : 36);
  const count = Math.max(32, score.cols);
  const beat = score.timing.gridFactor / 4;
  const notes = score.notes.map((n) => (draft?.id === n.id ? draft : n));

  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = ROW * 9;
  }, [score.id]);
  useEffect(() => {
    const el = viewport.current;
    if (!el || playCol === null) return;
    const x = playCol * width + LABEL;
    if (x > el.scrollLeft + el.clientWidth - 70 || x < el.scrollLeft + LABEL)
      el.scrollLeft = Math.max(0, x - LABEL - 70);
  }, [playCol, width]);
  useEffect(() => {
    if (!keyboardFocus || !viewport.current) return;
    const el = viewport.current;
    const x = cell.col * width;
    const y = (83 - cell.midi) * ROW;
    if (x < el.scrollLeft) el.scrollLeft = x;
    if (x + LABEL + width > el.scrollLeft + el.clientWidth)
      el.scrollLeft = x + LABEL + width - el.clientWidth;
    if (y < el.scrollTop) el.scrollTop = y;
    if (y + ROW + 33 > el.scrollTop + el.clientHeight)
      el.scrollTop = y + ROW + 33 - el.clientHeight;
  }, [cell, keyboardFocus, width]);

  function addNote(midi: number, col: number) {
    const note = {
      id: uid(),
      midi,
      col,
      len: score.timing.defaultLen,
      fromCommands: false,
    };
    commit({
      ...score,
      cols: Math.max(score.cols, Math.ceil((col + note.len + 1) / 16) * 16),
      notes: [...score.notes.filter((n) => n.col !== col), note],
    });
    select(note.id);
    preview(midi);
  }

  function add(event: PointerEvent<HTMLDivElement>) {
    if (
      locked ||
      event.button !== 0 ||
      tool !== "draw" ||
      event.target !== event.currentTarget
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) / width);
    const midi = 83 - Math.floor((event.clientY - rect.top) / ROW);
    if (midi < 48 || col < 0) return;
    setCell({ midi, col });
    addNote(midi, col);
  }

  function down(event: PointerEvent<HTMLButtonElement>, note: Note) {
    if (locked || event.button !== 0) return;
    event.stopPropagation();
    if (tool === "erase") {
      commit({ ...score, notes: score.notes.filter((n) => n.id !== note.id) });
      select(null);
      return;
    }
    select(note.id);
    if (note.midi !== null) preview(note.midi);
    const resize =
      event.clientX > event.currentTarget.getBoundingClientRect().right - 9;
    drag.current = {
      id: note.id,
      x: event.clientX,
      y: event.clientY,
      note,
      resize,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = Math.round((event.clientX - state.x) / width);
    const dy = Math.round((event.clientY - state.y) / ROW);
    if (
      Math.abs(event.clientX - state.x) < 3 &&
      Math.abs(event.clientY - state.y) < 3
    )
      return;
    state.changed = true;
    const next = state.resize
      ? {
          ...state.note,
          len: Math.max(
            1,
            Math.min(
              6000 /
                (((60000 / score.timing.bpm) * 4) / score.timing.gridFactor),
              Math.round(state.note.len) + dx,
            ),
          ),
        }
      : {
          ...state.note,
          col: Math.max(0, Math.round(state.note.col) + dx),
          midi:
            state.note.midi === null
              ? null
              : Math.min(83, Math.max(48, state.note.midi - dy)),
        };
    if (next.midi !== null) delete next.keys;
    setDraft(next);
  }

  function up() {
    if (drag.current?.changed && draft)
      commit({
        ...score,
        cols: Math.max(
          score.cols,
          Math.ceil((draft.col + draft.len + 1) / 16) * 16,
        ),
        notes: score.notes
          .filter((n) => n.id === draft.id || n.col !== draft.col)
          .map((n) => (n.id === draft.id ? draft : n)),
      });
    drag.current = null;
    setDraft(null);
  }

  return (
    <div
      className={`roll-viewport tool-${tool}`}
      ref={viewport}
      data-testid="piano-roll"
    >
      <div
        className="roll-sheet"
        style={{ width: count * width + LABEL, minWidth: "100%" }}
      >
        <div className="ruler">
          <div className="ruler-label">
            音高<span>小节 / 拍</span>
          </div>
          <div className="ruler-ticks" style={{ width: count * width }}>
            {Array.from({ length: Math.min(count, 20000) }, (_, col) => (
              <button
                key={col}
                style={{ left: col * width, width }}
                onClick={() => seek(col)}
                className={
                  startCol === col
                    ? "chosen"
                    : col % (beat * 4) === 0
                      ? "bar-tick"
                      : ""
                }
                title={`从第 ${col + 1} 格开始`}
                aria-label={`起点 ${col + 1}`}
              >
                {col % (beat * 4) === 0
                  ? String(col / (beat * 4) + 1).padStart(2, "0")
                  : col % beat === 0
                    ? "·"
                    : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="roll-body" style={{ height }}>
          <div className="pitch-labels">
            {[...pitches].reverse().map((p) => (
              <button
                key={p.midi}
                className={`${p.black ? "accidental" : ""} ${p.midi % 12 === 0 ? "octave-edge" : ""} ${score.notes.find((n) => n.id === activeNote)?.midi === p.midi ? "sounding" : ""}`}
                style={{ height: ROW }}
                onClick={() => preview(p.midi)}
                title={`${p.name} · ${p.keys}`}
              >
                <span>{p.name}</span>
                <small>
                  {p.keys.replace("Shift+", "⇧").replace("Ctrl+", "⌃")}
                </small>
              </button>
            ))}
            {hasCommands && (
              <div className="command-label" style={{ height: ROW }}>
                命令
              </div>
            )}
          </div>
          <div
            className="note-grid"
            tabIndex={0}
            role="group"
            onFocus={(e) => {
              if (e.target === e.currentTarget) setKeyboardFocus(true);
            }}
            onBlur={() => setKeyboardFocus(false)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || locked) return;
              if (e.key.startsWith("Arrow")) {
                e.preventDefault();
                e.stopPropagation();
                setCell((v) => ({
                  col: Math.max(
                    0,
                    Math.min(
                      count - 1,
                      v.col +
                        (e.key === "ArrowRight"
                          ? 1
                          : e.key === "ArrowLeft"
                            ? -1
                            : 0),
                    ),
                  ),
                  midi: Math.max(
                    48,
                    Math.min(
                      83,
                      v.midi +
                        (e.key === "ArrowUp"
                          ? 1
                          : e.key === "ArrowDown"
                            ? -1
                            : 0),
                    ),
                  ),
                }));
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                const existing = score.notes.find(
                  (n) => n.col === cell.col && n.midi === cell.midi,
                );
                if (existing) {
                  select(existing.id);
                  preview(cell.midi);
                } else addNote(cell.midi, cell.col);
              }
            }}
            onPointerDown={add}
            style={
              {
                width: count * width,
                height,
                "--cell": `${width}px`,
                "--row": `${ROW}px`,
                "--beat": `${width * beat}px`,
              } as CSSProperties
            }
            onContextMenu={(e) => e.preventDefault()}
            aria-label="钢琴卷音符区"
          >
            {keyboardFocus && (
              <>
                <div
                  className="keyboard-cursor"
                  style={{
                    left: cell.col * width,
                    top: (83 - cell.midi) * ROW,
                    width,
                    height: ROW,
                  }}
                />
                <span className="sr-only" role="status">
                  {pitchOf(cell.midi)?.name}，第 {cell.col + 1}{" "}
                  格。方向键移动，Enter 写入或选择音符。
                </span>
              </>
            )}
            {Array.from({ length: 36 }, (_, i) => (
              <div
                key={i}
                className={`pitch-band ${(83 - i) % 12 === 0 ? "octave-edge" : ""} ${pitchOf(83 - i)?.black ? "accidental" : ""}`}
                style={{ top: i * ROW, height: ROW }}
              />
            ))}
            <div className="start-line" style={{ left: startCol * width }} />
            {playCol !== null && (
              <div className="playhead" style={{ left: playCol * width }} />
            )}
            {notes.map((n) => (
              <button
                key={n.id}
                className={`roll-note octave-${n.midi === null ? "command" : Math.floor((n.midi - 48) / 12)} ${selected === n.id ? "selected" : ""} ${activeNote === n.id ? "sounding" : ""}`}
                style={{
                  left: n.col * width + 1,
                  top: (n.midi === null ? 36 : 83 - n.midi) * ROW + 3,
                  width: Math.max(8, n.len * width - 2),
                  height: ROW - 5,
                }}
                aria-label={`音符 ${pitchOf(n.midi)?.name ?? n.keys} 第${n.col + 1}格`}
                aria-pressed={selected === n.id}
                onClick={(e) => {
                  if (e.detail === 0 && !locked) {
                    select(n.id);
                    if (n.midi !== null) preview(n.midi);
                  }
                }}
                onPointerDown={(e) => down(e, n)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={() => {
                  drag.current = null;
                  setDraft(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!locked) {
                    commit({
                      ...score,
                      notes: score.notes.filter((note) => note.id !== n.id),
                    });
                    select(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (locked) return;
                  if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    e.stopPropagation();
                    commit({
                      ...score,
                      notes: score.notes.filter((note) => note.id !== n.id),
                    });
                    select(null);
                  }
                }}
                title={`${pitchOf(n.midi)?.name ?? n.keys} · ${n.keys ?? pitchOf(n.midi)?.keys} · ${n.len.toFixed(2).replace(/\.00$/, "")} 格`}
              >
                <span>{pitchOf(n.midi)?.name ?? n.keys}</span>
                <i />
              </button>
            ))}
            {!notes.length && (
              <div className="roll-empty">
                <Music2 size={30} />
                <strong>点击写谱</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
