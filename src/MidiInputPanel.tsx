import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Play, RefreshCw, Square, ArrowDownToLine } from "lucide-react";
import * as desktop from "./desktop";
import { PreviewAudio } from "./audio";
import {
  exportMidiTake,
  type MidiConversion,
  type MidiPort,
  type MidiTake,
} from "./midi";
import {
  formatTime,
  importMidiTake,
  schedule,
  type Score,
  type Timing,
} from "./score";

const pianoNotes = Array.from({ length: 88 }, (_, i) => 21 + i);
const noteName = (midi: number) =>
  `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function MidiInputPanel({
  take,
  onTake,
  timing,
  volume,
  onCreate,
  onBusy,
}: {
  take: MidiTake | null;
  onTake: (take: MidiTake) => void;
  timing: Timing;
  volume: number;
  onCreate: (score: Score) => void;
  onBusy: (pending: boolean) => void;
}) {
  const [ports, setPorts] = useState<MidiPort[]>([]);
  const [portId, setPortId] = useState("");
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [exported, setExported] = useState(false);
  const [title, setTitle] = useState("MIDI 录制");
  const [tempo, setTempo] = useState(timing.bpm);
  const [grid, setGrid] = useState(timing.gridFactor);
  const [mode, setMode] = useState<MidiConversion>("smart");
  const [elapsed, setElapsed] = useState(take?.durationMs ?? 0);
  const [count, setCount] = useState(0);
  const [pressed, setPressed] = useState<number[]>([]);
  const [preview, setPreview] = useState<"none" | "raw" | "adapted">("none");
  const audio = useRef(new PreviewAudio());
  const inputListener = useRef<Promise<() => void> | null>(null);
  const recordingAt = useRef(0);
  const recordingNow = useRef(false);
  const connectedPort = useRef("");
  const previewNow = useRef(preview);
  previewNow.current = preview;
  const onTakeRef = useRef(onTake);
  onTakeRef.current = onTake;
  const parsed = useMemo(() => {
    if (!take?.notes.length) return { result: null, error: "" };
    try {
      return {
        result: importMidiTake(
          take,
          title.trim() || "MIDI 录制",
          { ...timing, bpm: tempo, gridFactor: grid },
          mode,
          true,
        ),
        error: "",
      };
    } catch (e) {
      return { result: null, error: errorText(e) };
    }
  }, [take, title, timing, tempo, grid, mode]);

  async function act(work: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    onBusy(pending);
  }, [pending, onBusy]);
  function stopAudio() {
    audio.current.stop();
    setPreview("none");
  }
  async function finish() {
    const recorded = await desktop.stopMidiRecording();
    recordingNow.current = false;
    setRecording(false);
    setElapsed(recorded.durationMs);
    onTakeRef.current(recorded);
    if (!recorded.notes.length) setError("没有录到音符，请弹奏后再试");
  }
  async function refresh() {
    const expectedPort = connectedPort.current;
    const devices = await desktop.midiInputs();
    setPorts(devices);
    if (
      expectedPort &&
      expectedPort === connectedPort.current &&
      !devices.some((p) => p.id === expectedPort)
    ) {
      const recorded = await desktop.disconnectMidi();
      connectedPort.current = "";
      recordingNow.current = false;
      setPortId("");
      setRecording(false);
      setPressed([]);
      stopAudio();
      if (recorded.notes.length) onTakeRef.current(recorded);
      setError("MIDI 设备已断开，已保留录制内容。重新连接后可继续录制新曲目。");
    }
  }
  useEffect(() => {
    audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    let mounted = true;
    const listener = desktop.native
      ? desktop.onMidiInput((event) => {
          if (!mounted || event.portId !== connectedPort.current) return;
          const [status, midi, velocity] = event.data;
          const channel = status & 15;
          if ((status & 0xf0) === 0x90 && velocity > 0 && channel !== 9) {
            if (recordingNow.current) setCount((n) => n + 1);
            setPressed((p) => [...new Set([...p, midi])]);
            if (previewNow.current === "none")
              audio.current.tone(midi, 0.7, undefined, velocity / 127);
          } else if (
            (status & 0xf0) === 0x80 ||
            ((status & 0xf0) === 0x90 && velocity === 0)
          ) {
            setPressed((p) => p.filter((n) => n !== midi));
          } else if ((status & 0xf0) === 0xb0 && [120, 123].includes(midi)) {
            setPressed([]);
          }
          if (event.error)
            void act(async () => {
              await finish();
              setError(event.error!);
            });
        })
      : null;
    inputListener.current = listener;
    if (listener)
      void listener.catch((e) => {
        if (mounted) setError(errorText(e));
      });
    void refresh().catch((e) => {
      if (mounted) setError(errorText(e));
    });
    const timer = setInterval(() => {
      if (mounted) void refresh().catch((e) => setError(errorText(e)));
    }, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
      if (listener) void listener.then((off) => off()).catch(() => {});
      audio.current.stop();
    };
  }, []);
  useEffect(() => {
    if (!recording && preview === "none") return;
    const timer = setInterval(() => {
      if (recording) setElapsed(performance.now() - recordingAt.current);
      else if (preview !== "none") {
        const duration =
          preview === "raw"
            ? take!.durationMs
            : parsed.result
              ? schedule(parsed.result.score).durationMs
              : 0;
        if (audio.current.elapsedMs >= duration) stopAudio();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [recording, preview, take, parsed.result]);
  useEffect(stopAudio, [mode, tempo, grid]);

  return (
    <>
      <div className="dialog-content midi-panel">
        <div className="midi-device-row">
          <label>
            MIDI 输入设备
            <select
              aria-label="MIDI 输入设备"
              value={portId}
              disabled={!desktop.native || recording || pending}
              onChange={(e) => {
                const id = e.target.value;
                void act(async () => {
                  await audio.current.unlock();
                  await inputListener.current;
                  connectedPort.current = "";
                  setPortId("");
                  if (id) await desktop.connectMidi(id);
                  else await desktop.disconnectMidi();
                  connectedPort.current = id;
                  setPortId(id);
                  setPressed([]);
                });
              }}
            >
              <option value="">
                {ports.length ? "选择 MIDI 键盘" : "未发现 MIDI 输入设备"}
              </option>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="刷新 MIDI 设备"
            title="刷新 MIDI 设备"
            disabled={!desktop.native || pending}
            onClick={() => void act(refresh)}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {!desktop.native && (
          <p className="muted-text">请在桌面应用中连接 MIDI 键盘。</p>
        )}
        <div className="midi-keyboard" aria-label="88 键输入状态" role="img">
          {pianoNotes.map((midi) => (
            <span
              key={midi}
              title={noteName(midi)}
              className={`${[1, 3, 6, 8, 10].includes(midi % 12) ? "accidental" : ""} ${pressed.includes(midi) ? "sounding" : ""}`}
            />
          ))}
        </div>
        <div className="midi-record-bar">
          <span className={recording ? "midi-recording" : ""} role="status">
            <Circle size={12} fill={recording ? "currentColor" : "none"} />
            {recording ? "正在录制" : portId ? "设备已连接" : "未连接设备"}
          </span>
          <time>{formatTime(elapsed)}</time>
          <span>{recording ? count : (take?.notes.length ?? 0)} 个音符</span>
          <button
            className={recording ? "danger-button" : "primary-button"}
            disabled={pending || !portId}
            onClick={() =>
              void act(async () => {
                if (recording) await finish();
                else {
                  stopAudio();
                  await audio.current.unlock();
                  await desktop.startMidiRecording();
                  recordingAt.current = performance.now();
                  recordingNow.current = true;
                  setExported(false);
                  setRecording(true);
                  setCount(0);
                  setElapsed(0);
                }
              })
            }
          >
            {recording ? <Square size={14} /> : <Circle size={14} />}
            {recording
              ? "停止录制"
              : take?.notes.length
                ? "重新录制"
                : "开始录制"}
          </button>
        </div>
        {error && (
          <p className="danger-text" role="alert">
            {error}
          </p>
        )}
        {!recording && take?.notes.length ? (
          <>
            <div className="midi-conversion-fields">
              <label>
                曲名
                <input
                  aria-label="MIDI 曲名"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                BPM
                <input
                  aria-label="录制 BPM"
                  type="number"
                  min={30}
                  max={300}
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                />
              </label>
              <label>
                网格
                <select
                  aria-label="录制网格"
                  value={grid}
                  onChange={(e) => setGrid(Number(e.target.value))}
                >
                  {[4, 8, 16, 32].map((n) => (
                    <option key={n} value={n}>
                      1/{n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="midi-conversion-mode">
              转换方式
              <select
                aria-label="MIDI 转换方式"
                value={mode}
                onChange={(e) => setMode(e.target.value as MidiConversion)}
                title="智能适配结合音高、力度、音长与声部连续性选择旋律，再按乐句调整八度，保留原调和旋律走向。"
              >
                <option value="smart">智能适配 · 旋律优先</option>
                <option value="fold">八度折叠 · 同列最高音</option>
              </select>
            </label>
            {parsed.error && (
              <p className="danger-text" role="alert">
                {parsed.error}
              </p>
            )}
            {parsed.result && (
              <>
                <div className="midi-conversion-summary">
                  <strong>
                    {take.notes.length} 音符 →{" "}
                    {parsed.result.score.notes.length} 音符
                  </strong>
                  <span>
                    36 键 ·{" "}
                    {formatTime(schedule(parsed.result.score).durationMs)}
                  </span>
                </div>
                <svg
                  className="midi-score-preview"
                  viewBox={`0 0 ${Math.max(32, parsed.result.score.cols)} 40`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="36 键转换预览"
                >
                  {parsed.result.score.notes.map((n) => (
                    <rect
                      key={n.id}
                      x={n.col}
                      y={83 - n.midi!}
                      width={Math.max(0.5, n.len)}
                      height="1.6"
                    />
                  ))}
                </svg>
                <div className="midi-preview-actions">
                  {(["raw", "adapted"] as const).map((kind) => (
                    <button
                      key={kind}
                      className="secondary-button"
                      disabled={pending}
                      onClick={() =>
                        void act(async () => {
                          if (preview === kind) stopAudio();
                          else {
                            stopAudio();
                            if (kind === "raw")
                              await audio.current.playMidi(take);
                            else
                              await audio.current.play(parsed.result!.score, 0);
                            setPreview(kind);
                          }
                        })
                      }
                    >
                      {preview === kind ? (
                        <Square size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                      {preview === kind
                        ? "停止试听"
                        : kind === "raw"
                          ? "试听录音"
                          : "试听 36 键"}
                    </button>
                  ))}
                </div>
                <div className="midi-conversion-notes">
                  {parsed.result.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
      <footer>
        {exported && (
          <span className="midi-saved" role="status">
            录制 MIDI 已保存
          </span>
        )}
        <button
          className="quiet-button"
          disabled={recording || pending || !take?.notes.length}
          onClick={() =>
            void act(async () => {
              if (
                await desktop.exportFile(
                  `${title.trim() || "MIDI 录制"}.mid`,
                  exportMidiTake(take!),
                )
              )
                setExported(true);
            })
          }
        >
          <ArrowDownToLine size={15} />
          保存录制 MIDI
        </button>
        <button
          className="primary-button"
          disabled={recording || pending || !parsed.result}
          onClick={() => {
            stopAudio();
            if (parsed.result) onCreate(parsed.result.score);
          }}
        >
          保存为新曲谱
        </button>
      </footer>
    </>
  );
}
