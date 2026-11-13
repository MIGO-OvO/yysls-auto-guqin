import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Eraser,
  FolderOpen,
  Keyboard,
  Maximize2,
  Minus,
  Monitor,
  Moon,
  MousePointer2,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings2,
  SkipBack,
  Square,
  Sun,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import PianoRoll, { type Tool } from "./PianoRoll";
import { PreviewAudio } from "./audio";
import {
  appendScore,
  demoScore,
  emptyScore,
  exportCommands,
  exportJson,
  formatTime,
  importMidi,
  importText,
  pitchOf,
  pitches,
  schedule,
  stepMs,
  uid,
  type ImportResult,
  type Note,
  type Score,
} from "./score";
import * as desktop from "./desktop";
import { Updates, initialUpdate } from "./updates";
import { version } from "../package.json";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const iconSize = 16;
function IconButton({
  label,
  children,
  onClick,
  disabled,
  active,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide-dialog" : ""}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <IconButton label="关闭对话框" onClick={close}>
          <X size={18} />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}

export default function App() {
  const [scores, setScores] = useState<Score[]>([]);
  const [activeId, setActiveId] = useState("");
  const [settings, setSettings] = useState(desktop.defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(false);
  const [saved, setSaved] = useState(false);
  const [past, setPast] = useState<Score[]>([]);
  const [future, setFuture] = useState<Score[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("draw");
  const [zoom, setZoom] = useState(1);
  const [startCol, setStartCol] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<desktop.Target[]>([]);
  const [target, setTarget] = useState<desktop.Target | null>(null);
  const [permission, setPermission] = useState<desktop.Permissions | null>(
    null,
  );
  const [playback, setPlayback] = useState(desktop.idlePlayback);
  const [previewState, setPreviewState] = useState<
    "stopped" | "playing" | "paused"
  >("stopped");
  const [previewMs, setPreviewMs] = useState(0);
  const [hit, setHit] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importTitle, setImportTitle] = useState("导入的曲谱");
  const [midiResult, setMidiResult] = useState<ImportResult | null>(null);
  const [append, setAppend] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<"json" | "txt">("json");
  const [deleteScore, setDeleteScore] = useState(false);
  const [shortcuts, setShortcuts] = useState({ start: "F8", stop: "F9" });
  const [hotkeyStatus, setHotkeyStatus] = useState("");
  const [update, setUpdate] = useState(initialUpdate);
  const [installConfirm, setInstallConfirm] = useState(false);
  const audio = useRef(new PreviewAudio());
  const updater = useRef(new Updates(setUpdate));
  const saveQueue = useRef(Promise.resolve());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programReady = useRef(Promise.resolve());
  const score = scores.find((s) => s.id === activeId) ?? scores[0];
  const [bpmDraft, setBpmDraft] = useState("120");
  useEffect(() => {
    if (score) setBpmDraft(String(score.timing.bpm));
  }, [score?.id, score?.timing.bpm]);
  const plan = useMemo(
    () => (score ? schedule(score, startCol) : { notes: [], durationMs: 0 }),
    [score, startCol],
  );
  const nativeActive = ["playing", "paused", "countdown"].includes(
    playback.status,
  );
  const busy = nativeActive || previewState !== "stopped";
  const note = score?.notes.find((n) => n.id === selected);
  const elapsed =
    nativeActive || playback.status === "finished"
      ? playback.elapsedMs
      : previewMs;
  const currentNote =
    previewState === "playing"
      ? (plan.notes.find(
          (n) => previewMs >= n.atMs && previewMs < n.atMs + n.holdMs,
        )?.id ?? null)
      : playback.activeId;
  const playCol = busy ? startCol + elapsed / stepMs(score) : null;

  const notify = useCallback((text: string) => setMessage(text), []);
  const safely = useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        notify(errorText(error));
      }
    },
    [notify],
  );

  useEffect(() => {
    let mounted = true;
    load();
    async function load() {
      try {
        const workspace = await desktop.loadWorkspace();
        if (!mounted) return;
        const initial = workspace?.scores.length
          ? workspace.scores
          : [demoScore()];
        setScores(initial);
        setActiveId(workspace?.activeId ?? initial[0].id);
        const prefs = { ...desktop.defaultSettings, ...workspace?.settings };
        setSettings(prefs);
        setShortcuts({ start: prefs.startShortcut, stop: prefs.stopShortcut });
        setStorageOk(true);
        if (desktop.native) {
          try {
            await desktop.configureShortcuts(
              prefs.startShortcut,
              prefs.stopShortcut,
            );
            setHotkeyStatus("已注册");
          } catch (error) {
            setHotkeyStatus(errorText(error));
          }
          if (prefs.autoUpdate) void updater.current.check();
        }
      } catch (error) {
        notify(
          `读取曲库失败：${errorText(error)}。请先导出当前编辑内容，再检查数据文件。`,
        );
        const initial = demoScore();
        setScores([initial]);
        setActiveId(initial.id);
      } finally {
        if (mounted) setLoaded(true);
      }
    }
    return () => {
      mounted = false;
    };
  }, [notify]);

  useEffect(() => {
    if (!loaded || !storageOk) return;
    setSaved(false);
    const workspace = { version: 1, scores, activeId, settings };
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => desktop.saveWorkspace(workspace));
    void saveQueue.current
      .then(() => setSaved(true))
      .catch((error) => {
        setSaved(false);
        notify(`保存失败：${errorText(error)}`);
      });
  }, [scores, activeId, settings, loaded, storageOk, notify]);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    apply();
    media.addEventListener("change", apply);
    audio.current.volume = settings.volume;
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, settings.volume]);

  useEffect(() => {
    if (!desktop.native || !score || busy) return;
    programReady.current = desktop.prepare({
      score,
      target,
      mode: settings.mode,
      warmupMs: settings.warmupMs,
      startCol,
    });
    void programReady.current.catch((error) => notify(errorText(error)));
  }, [score, target, settings.mode, settings.warmupMs, startCol, busy, notify]);

  useEffect(() => {
    if (!desktop.native) {
      void desktop.permissions().then(setPermission);
      return;
    }
    const off = desktop.onPlayback(setPlayback);
    const errors = desktop.onError(notify);
    const previewStop = desktop.onPreviewStop(() => {
      audio.current.stop();
      setPreviewState("stopped");
      setPreviewMs(0);
    });
    void safely(async () => {
      setPermission(await desktop.permissions());
      setTargets(await desktop.listTargets());
    });
    const timer = setInterval(() => {
      void safely(async () => {
        const list = await desktop.listTargets();
        setTargets(list);
        setTarget((current) =>
          current &&
          list.some((t) => t.id === current.id && t.pid === current.pid)
            ? current
            : null,
        );
      });
    }, 2000);
    return () => {
      clearInterval(timer);
      void off.then((fn) => fn());
      void errors.then((fn) => fn());
      void previewStop.then((fn) => fn());
    };
  }, [notify, safely]);

  useEffect(() => {
    if (nativeActive) {
      audio.current.stop();
      setPreviewState("stopped");
    }
  }, [nativeActive]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (previewState !== "playing") return;
    let frame = 0;
    const tick = () => {
      const ms = audio.current.elapsedMs;
      setPreviewMs(ms);
      if (ms >= plan.durationMs) {
        audio.current.stop();
        setPreviewState("stopped");
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [previewState, plan.durationMs]);

  function commit(next: Score) {
    if (!score || busy) return;
    setPast((stack) => [...stack.slice(-119), score]);
    setFuture([]);
    setScores((all) => all.map((s) => (s.id === score.id ? next : s)));
  }
  function undo() {
    if (busy || !past.length) return;
    const previous = past.at(-1)!;
    setFuture((all) => [score, ...all]);
    setPast((all) => all.slice(0, -1));
    setScores((all) => all.map((s) => (s.id === score.id ? previous : s)));
  }
  function redo() {
    if (busy || !future.length) return;
    const next = future[0];
    setPast((all) => [...all, score]);
    setFuture((all) => all.slice(1));
    setScores((all) => all.map((s) => (s.id === score.id ? next : s)));
  }
  function choose(id: string) {
    if (busy) return;
    setActiveId(id);
    setPast([]);
    setFuture([]);
    setSelected(null);
    setStartCol(0);
    setPreviewMs(0);
    setPlayback(desktop.idlePlayback);
  }
  function create() {
    if (busy) return;
    const next = emptyScore();
    setScores((all) => [...all, next]);
    choose(next.id);
  }
  function modifyNote(changes: Partial<Note>) {
    if (!note) return;
    commit({
      ...score,
      notes: score.notes.map((n) =>
        n.id === selected
          ? {
              ...n,
              ...changes,
              keys:
                changes.midi !== undefined && changes.midi !== null
                  ? undefined
                  : n.keys,
            }
          : n,
      ),
    });
  }
  const preview = useCallback(
    (midi: number) => {
      if (nativeActive) return;
      void safely(async () => {
        await audio.current.unlock();
        audio.current.tone(midi);
        setHit(midi);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setHit(null), 180);
      });
    },
    [nativeActive, safely],
  );

  async function togglePreview() {
    if (nativeActive || !plan.notes.length) return;
    if (previewState === "playing") {
      setPreviewMs(audio.current.elapsedMs);
      audio.current.stop();
      setPreviewState("paused");
    } else {
      await audio.current.play(
        score,
        startCol,
        previewState === "paused" ? previewMs : 0,
      );
      setPlayback(desktop.idlePlayback);
      setPreviewState("playing");
    }
  }
  async function stopAll() {
    audio.current.stop();
    setPreviewState("stopped");
    setPreviewMs(0);
    if (desktop.native) await desktop.stop();
  }
  async function playGame() {
    if (!desktop.native) {
      notify("请运行桌面应用后选择游戏窗口。");
      return;
    }
    if (previewState !== "stopped") {
      audio.current.stop();
      setPreviewState("stopped");
    }
    if (playback.status === "playing" || playback.status === "countdown")
      await desktop.pause();
    else if (playback.status === "paused") await desktop.resume();
    else {
      await programReady.current;
      await desktop.prepare({
        score,
        target,
        mode: settings.mode,
        warmupMs: settings.warmupMs,
        startCol,
      });
      await desktop.start();
    }
  }

  useEffect(() => {
    function key(event: KeyboardEvent) {
      const editing =
        event.target instanceof HTMLElement &&
        (event.target.closest("input, textarea, select, dialog") ||
          event.target.isContentEditable);
      if (editing) return;
      if (
        event.target instanceof HTMLButtonElement &&
        ["Space", "Enter"].includes(event.code)
      )
        return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.code === "KeyZ") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (command && event.code === "KeyS") {
        event.preventDefault();
        setExportOpen(true);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void safely(togglePreview);
        return;
      }
      if (event.code === "Escape") {
        void safely(stopAll);
        return;
      }
      if (event.code === "Home" && !busy) {
        event.preventDefault();
        setStartCol(0);
        return;
      }
      if (
        (event.code === "Delete" || event.code === "Backspace") &&
        note &&
        !busy
      ) {
        event.preventDefault();
        commit({
          ...score,
          notes: score.notes.filter((n) => n.id !== note.id),
        });
        setSelected(null);
        return;
      }
      if (event.repeat || event.altKey || event.metaKey) return;
      const keys = `${event.ctrlKey ? "Ctrl+" : ""}${event.shiftKey ? "Shift+" : ""}${event.code.replace("Key", "")}`;
      const p = pitches.find((p) => p.keys === keys);
      if (p) {
        event.preventDefault();
        preview(p.midi);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  async function openFile(file?: File) {
    if (busy) return;
    let bytes: Uint8Array;
    let name: string;
    if (file) {
      if (file.size > 20 * 1024 * 1024) throw new Error("文件超过 20MB");
      name = file.name;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (desktop.native) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        multiple: false,
        filters: [
          {
            name: "曲谱 / MIDI / 命令",
            extensions: ["json", "mid", "midi", "txt"],
          },
        ],
      });
      if (!path) return;
      name = path.split(/[\\/]/).at(-1)!;
      bytes = await readFile(path);
    } else {
      document.getElementById("file-input")?.click();
      return;
    }
    const title = name.replace(/\.[^.]+$/, "");
    setImportTitle(title);
    setAppend(false);
    if (/\.midi?$/i.test(name)) {
      setMidiResult(importMidi(bytes, title, score.timing));
      setImportValue("");
    } else {
      setMidiResult(null);
      setImportValue(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    setImportOpen(true);
  }
  const parsed = useMemo(() => {
    if (midiResult) return { result: midiResult, error: "" };
    if (!score || !importValue.trim()) return { result: null, error: "" };
    try {
      return {
        result: importText(importValue, importTitle, score.timing),
        error: "",
      };
    } catch (error) {
      return { result: null, error: errorText(error) };
    }
  }, [importValue, importTitle, midiResult, score]);
  function applyImport() {
    if (!parsed.result) return;
    const imported = parsed.result.score;
    if (append) commit(appendScore(score, imported));
    else commit({ ...imported, id: score.id });
    setStartCol(0);
    setSelected(null);
    setImportOpen(false);
    notify(`已导入 ${imported.notes.length} 个音符`);
  }
  async function exportNow() {
    if (
      await desktop.exportFile(
        `${score.title}.${exportKind}`,
        exportKind === "json" ? exportJson(score) : exportCommands(score),
      )
    ) {
      setExportOpen(false);
      notify("已导出曲谱");
    }
  }
  async function refreshTargets() {
    setPermission(await desktop.permissions());
    const list = await desktop.listTargets();
    setTargets(list);
    if (target && !list.some((t) => t.id === target.id && t.pid === target.pid))
      setTarget(null);
  }

  if (!loaded || !score)
    return (
      <div className="loading-workbench">
        <AudioLines size={36} />
        <span>正在打开曲库</span>
      </div>
    );

  return (
    <div
      className={`app ${libraryOpen ? "" : "library-collapsed"} ${inspectorOpen ? "" : "inspector-collapsed"}`}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void safely(() => openFile(file));
      }}
    >
      <header
        className="titlebar"
        data-tauri-drag-region
        onDoubleClick={(e) => {
          if (!(e.target instanceof HTMLElement && e.target.closest("button")))
            void safely(() => desktop.windowAction("maximize"));
        }}
      >
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          <strong>燕云琴笺</strong>
          <span className="brand-divider" />
          <span>自由演奏工作台</span>
        </div>
        <div className="titlebar-center" data-tauri-drag-region>
          {score.title}
        </div>
        <div className="window-buttons">
          <IconButton
            label="最小化"
            onClick={() => void safely(() => desktop.windowAction("minimize"))}
          >
            <Minus size={15} />
          </IconButton>
          <IconButton
            label="最大化"
            onClick={() => void safely(() => desktop.windowAction("maximize"))}
          >
            <Maximize2 size={13} />
          </IconButton>
          <IconButton
            label="关闭窗口"
            onClick={() =>
              void safely(async () => {
                await saveQueue.current;
                await desktop.windowAction("close");
              })
            }
          >
            <X size={16} />
          </IconButton>
        </div>
      </header>

      <aside className="library">
        <div className="library-heading">
          <h2>我的曲谱</h2>
          <IconButton label="新建曲谱" onClick={create} disabled={busy}>
            <Plus size={18} />
          </IconButton>
        </div>
        <label className="search">
          <Search size={15} />
          <input
            placeholder="搜索曲谱"
            aria-label="搜索曲谱"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="library-list">
          {scores
            .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
            .map((s) => (
              <button
                className={`score-item ${s.id === score.id ? "selected" : ""}`}
                key={s.id}
                onClick={() => choose(s.id)}
                disabled={busy}
              >
                <Music2 size={18} />
                <span>
                  <strong>{s.title}</strong>
                  <small>
                    {s.notes.length} 音符<span>·</span>
                    {s.timing.bpm} BPM
                  </small>
                </span>
                {s.id === score.id && <span className="score-current" />}
              </button>
            ))}
          {!scores.some((s) =>
            s.title.toLowerCase().includes(query.toLowerCase()),
          ) && <p className="small-empty">没有匹配的曲谱</p>}
        </div>
        <button
          className="import-library"
          onClick={() => void safely(() => openFile())}
          disabled={busy}
        >
          <ArrowDownToLine size={16} />
          导入曲谱<span>JSON · MIDI · TXT</span>
        </button>
        <footer className="library-footer">
          <button
            onClick={() => {
              setSettingsOpen((v) => !v);
              setInspectorOpen(true);
            }}
            className={settingsOpen ? "active" : ""}
          >
            <Settings2 size={17} />
            设置
            {update.phase === "available" && <span className="update-dot" />}
          </button>
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            使用说明
          </button>
          <div className="library-signature">
            <span>一曲入山河</span>
            <small>v{version}</small>
          </div>
        </footer>
      </aside>

      <main className="workspace">
        <div className="score-heading">
          <div className="score-title-group">
            <IconButton
              label={libraryOpen ? "收起曲库" : "展开曲库"}
              onClick={() => setLibraryOpen((v) => !v)}
            >
              {libraryOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </IconButton>
            <input
              className="score-title"
              value={score.title}
              maxLength={100}
              aria-label="曲谱名称"
              disabled={busy}
              onChange={(e) =>
                setScores((all) =>
                  all.map((s) =>
                    s.id === score.id ? { ...s, title: e.target.value } : s,
                  ),
                )
              }
            />
            <span className="save-state">
              <Check size={12} />
              {saved ? "已保存" : storageOk ? "保存中" : "保存异常"}
            </span>
          </div>
          <div className="heading-actions">
            <button
              className="quiet-button"
              onClick={() => {
                setImportValue("");
                setMidiResult(null);
                setImportTitle("导入的曲谱");
                setImportOpen(true);
              }}
              disabled={busy}
            >
              <Copy size={15} />
              粘贴
            </button>
            <button
              className="quiet-button"
              onClick={() => setExportOpen(true)}
            >
              <ArrowUpFromLine size={15} />
              导出
            </button>
            <IconButton
              label={inspectorOpen ? "收起设置" : "展开设置"}
              onClick={() => setInspectorOpen((v) => !v)}
            >
              {inspectorOpen ? (
                <PanelRightClose size={18} />
              ) : (
                <PanelRightOpen size={18} />
              )}
            </IconButton>
          </div>
        </div>
        <div className="editor-toolbar">
          <div className="tool-group" role="group" aria-label="编辑工具">
            <IconButton
              label="画笔"
              active={tool === "draw"}
              onClick={() => setTool("draw")}
              disabled={busy}
            >
              <Pencil size={iconSize} />
            </IconButton>
            <IconButton
              label="选择"
              active={tool === "select"}
              onClick={() => setTool("select")}
              disabled={busy}
            >
              <MousePointer2 size={iconSize} />
            </IconButton>
            <IconButton
              label="橡皮"
              active={tool === "erase"}
              onClick={() => setTool("erase")}
              disabled={busy}
            >
              <Eraser size={iconSize} />
            </IconButton>
            <span className="separator" />
            <IconButton
              label="撤销"
              onClick={undo}
              disabled={busy || !past.length}
            >
              <Undo2 size={iconSize} />
            </IconButton>
            <IconButton
              label="重做"
              onClick={redo}
              disabled={busy || !future.length}
            >
              <Redo2 size={iconSize} />
            </IconButton>
          </div>
          <div className="timing-group">
            <label>
              BPM
              <input
                type="number"
                aria-label="BPM"
                min={30}
                max={300}
                step={1}
                value={bpmDraft}
                disabled={busy}
                onChange={(e) => setBpmDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={() => {
                  const value = Number(bpmDraft);
                  if (value >= 30 && value <= 300) {
                    if (value !== score.timing.bpm)
                      commit({
                        ...score,
                        timing: { ...score.timing, bpm: value },
                      });
                  } else {
                    setBpmDraft(String(score.timing.bpm));
                    notify("BPM 需在 30–300 之间");
                  }
                }}
              />
            </label>
            <span className="separator" />
            <label>
              网格
              <select
                aria-label="网格"
                disabled={busy}
                value={score.timing.gridFactor}
                onChange={(e) =>
                  commit({
                    ...score,
                    timing: {
                      ...score.timing,
                      gridFactor: Number(e.target.value),
                    },
                  })
                }
              >
                {[4, 8, 16, 32].map((v) => (
                  <option value={v} key={v}>
                    1/{v}
                  </option>
                ))}
              </select>
            </label>
            <label className="length-control">
              音长
              <select
                aria-label="新音长"
                disabled={busy}
                value={score.timing.defaultLen}
                onChange={(e) =>
                  commit({
                    ...score,
                    timing: {
                      ...score.timing,
                      defaultLen: Number(e.target.value),
                    },
                  })
                }
              >
                {[1, 2, 4, 8, 16].map((v) => (
                  <option key={v} value={v}>
                    {v} 格
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="zoom-group">
            <IconButton
              label="缩小"
              onClick={() => setZoom((v) => Math.max(0.5, v - 0.25))}
              disabled={zoom <= 0.5}
            >
              <Minus size={14} />
            </IconButton>
            <span>{Math.round(zoom * 100)}%</span>
            <IconButton
              label="放大"
              onClick={() => setZoom((v) => Math.min(3, v + 0.25))}
              disabled={zoom >= 3}
            >
              <Plus size={14} />
            </IconButton>
          </div>
        </div>
        <PianoRoll
          score={score}
          commit={commit}
          selected={selected}
          select={setSelected}
          tool={tool}
          zoom={zoom}
          startCol={startCol}
          seek={(col) => {
            if (!busy) {
              setStartCol(col);
              setPreviewMs(0);
            }
          }}
          playCol={playCol}
          activeNote={currentNote}
          preview={preview}
          locked={busy}
        />
        <div className="roll-caption">
          <span>
            {note
              ? `${pitchOf(note.midi)?.name ?? note.keys} · 第 ${(note.col + 1).toFixed(2).replace(/\.00$/, "")} 格 · ${Math.round(note.len * stepMs(score))} ms`
              : "点击写入 · 拖动移动 · 拖右缘改音长 · 右键删除"}
          </span>
          <span>
            36 键<span className="caption-dot" />
            C3–B5
          </span>
        </div>
        <div className="overview" aria-label="曲谱概览">
          <svg
            viewBox={`0 0 ${score.cols} 40`}
            preserveAspectRatio="none"
            onClick={(e) => {
              if (!busy)
                setStartCol(
                  Math.floor(
                    ((e.clientX -
                      e.currentTarget.getBoundingClientRect().left) /
                      e.currentTarget.clientWidth) *
                      score.cols,
                  ),
                );
            }}
          >
            {score.notes.map((n) => (
              <rect
                key={n.id}
                x={n.col}
                y={n.midi === null ? 34 : 34 - (n.midi - 48) * 0.8}
                width={Math.max(0.4, n.len)}
                height={2.5}
              />
            ))}
            <line
              x1={playCol ?? startCol}
              x2={playCol ?? startCol}
              y1={0}
              y2={40}
            />
          </svg>
          <span>{formatTime(schedule(score).durationMs)}</span>
        </div>
        <section className="keyboard-section">
          <div className="keyboard-heading">
            <h2>
              <Keyboard size={16} />
              试听琴键
            </h2>
            <span>Shift 升半音 · Ctrl 降半音</span>
            <label className="volume">
              <Volume2 size={15} />
              <input
                type="range"
                aria-label="试听音量"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(e) =>
                  setSettings((v) => ({ ...v, volume: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          {[2, 1, 0].map((octave) => (
            <div className={`keyboard-row octave-${octave}`} key={octave}>
              <span className="octave-name">
                {["低音", "中音", "高音"][octave]}
              </span>
              {pitches
                .filter((p) => p.octave === octave)
                .map((p) => (
                  <button
                    key={p.midi}
                    className={`${p.black ? "black-key" : "white-key"} ${hit === p.midi || score.notes.find((n) => n.id === currentNote)?.midi === p.midi ? "sounding" : ""}`}
                    onClick={() => preview(p.midi)}
                    aria-label={`试听 ${p.name}`}
                    disabled={nativeActive}
                  >
                    <strong>{p.name.replace(/[',]/, "")}</strong>
                    <small>
                      {p.keys.replace("Shift+", "⇧ ").replace("Ctrl+", "⌃ ")}
                    </small>
                  </button>
                ))}
            </div>
          ))}
        </section>
        <footer className="transport">
          <div className="transport-buttons">
            <IconButton
              label="回到开头"
              disabled={busy}
              onClick={() => {
                setStartCol(0);
                setPreviewMs(0);
                setPlayback(desktop.idlePlayback);
              }}
            >
              <SkipBack size={18} />
            </IconButton>
            <button
              className={`preview-button ${previewState === "playing" ? "active" : ""}`}
              onClick={() => void safely(togglePreview)}
              disabled={nativeActive || !plan.notes.length}
            >
              {previewState === "playing" ? (
                <Pause size={17} />
              ) : (
                <Play size={17} />
              )}
              <span>
                {previewState === "paused"
                  ? "继续试听"
                  : previewState === "playing"
                    ? "暂停试听"
                    : "试听"}
              </span>
              <kbd>Space</kbd>
            </button>
            <IconButton
              label="停止"
              disabled={!busy}
              onClick={() => void safely(stopAll)}
            >
              <Square size={17} />
            </IconButton>
          </div>
          <div className="time-display">
            <strong>{formatTime(elapsed)}</strong>
            <span>/ {formatTime(plan.durationMs)}</span>
            <small>
              {playback.status === "countdown"
                ? playback.message
                : previewState === "paused" || playback.status === "paused"
                  ? "已暂停"
                  : nativeActive
                    ? "向游戏演奏中"
                    : previewState === "playing"
                      ? "试听中"
                      : `起点 ${startCol + 1}`}
            </small>
          </div>
          <button
            className="game-play"
            disabled={!plan.notes.length || previewState === "playing"}
            onClick={() => void safely(playGame)}
          >
            {nativeActive && playback.status !== "paused" ? (
              <Pause size={17} />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
            <span>
              {playback.status === "paused"
                ? "继续演奏"
                : nativeActive
                  ? "暂停演奏"
                  : "向游戏演奏"}
            </span>
            <kbd>{settings.startShortcut}</kbd>
          </button>
        </footer>
      </main>

      <aside className="inspector">
        <div className="inspector-heading">
          <div className="inspector-tabs">
            <button
              className={!settingsOpen ? "selected" : ""}
              onClick={() => setSettingsOpen(false)}
            >
              演奏
            </button>
            <button
              className={settingsOpen ? "selected" : ""}
              onClick={() => setSettingsOpen(true)}
            >
              设置
            </button>
          </div>
          <IconButton
            label="关闭演奏面板"
            onClick={() => setInspectorOpen(false)}
          >
            <PanelRightClose size={16} />
          </IconButton>
        </div>
        <div className="inspector-content">
          {!settingsOpen ? (
            <>
              <section>
                <div className="section-heading">
                  <h2>目标窗口</h2>
                  <IconButton
                    label="刷新窗口"
                    onClick={() => void safely(refreshTargets)}
                    disabled={nativeActive}
                  >
                    <RefreshCw size={14} />
                  </IconButton>
                </div>
                <label className="target-select">
                  <Monitor size={18} />
                  <select
                    aria-label="目标游戏窗口"
                    value={target?.id ?? ""}
                    disabled={!desktop.native || nativeActive}
                    onChange={(e) =>
                      setTarget(
                        targets.find((t) => t.id === e.target.value) ?? null,
                      )
                    }
                  >
                    <option value="">选择游戏窗口</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.processName} ({t.pid})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <p className="connection-state">
                  <span className={`status-dot ${target ? "connected" : ""}`} />
                  {target
                    ? target.processName
                    : desktop.native
                      ? "尚未选择窗口"
                      : "桌面应用中可连接"}
                </p>
              </section>
              <section>
                <h2>输入方式</h2>
                <div className="mode-options">
                  {(
                    [
                      {
                        value: "foregroundScan",
                        title: "前台演奏",
                        desc:
                          permission?.platform === "macos"
                            ? "Quartz · 切换窗口即停止"
                            : "扫描码 · 切换窗口即停止",
                      },
                      {
                        value: "foregroundVirtual",
                        title: "前台兼容模式",
                        desc: "虚拟键 · 切换窗口即停止",
                      },
                      {
                        value: "background",
                        title: "后台定向输入",
                        desc: "实验性 · 游戏接收未验证",
                      },
                    ] as const
                  ).map((mode) => (
                    <label
                      key={mode.value}
                      className={settings.mode === mode.value ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="input-mode"
                        value={mode.value}
                        checked={settings.mode === mode.value}
                        disabled={nativeActive}
                        onChange={() =>
                          setSettings((v) => ({ ...v, mode: mode.value }))
                        }
                      />
                      <span>
                        <strong>{mode.title}</strong>
                        <small>{mode.desc}</small>
                      </span>
                      {settings.mode === mode.value && <Check size={14} />}
                    </label>
                  ))}
                </div>
                {settings.mode === "background" && (
                  <p className="mode-note">
                    需要游戏逐音验证 36 键及
                    Shift/Ctrl。系统发送成功不能证明游戏收到了音符。
                  </p>
                )}
              </section>
              <section className="performance-options">
                <label>
                  开始前预留
                  <span>
                    <input
                      type="number"
                      aria-label="开始前预留毫秒"
                      min={0}
                      max={10000}
                      step={100}
                      value={settings.warmupMs}
                      disabled={nativeActive}
                      onChange={(e) =>
                        setSettings((v) => ({
                          ...v,
                          warmupMs: Math.min(
                            10000,
                            Math.max(0, Number(e.target.value)),
                          ),
                        }))
                      }
                    />
                    ms
                  </span>
                </label>
                <p>点击演奏后，在倒计时内切换到已选游戏。</p>
              </section>
              <section>
                <h2>音符</h2>
                {note ? (
                  <div className="note-inspector">
                    <label>
                      音高
                      <select
                        aria-label="所选音高"
                        value={note.midi ?? ""}
                        disabled={busy || note.midi === null}
                        onChange={(e) =>
                          modifyNote({ midi: Number(e.target.value) })
                        }
                      >
                        {note.midi === null && (
                          <option value="">{note.keys}</option>
                        )}
                        {[...pitches].reverse().map((p) => (
                          <option value={p.midi} key={p.midi}>
                            {p.name} · {p.keys}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <label>
                        位置
                        <input
                          type="number"
                          aria-label="所选位置"
                          min={1}
                          max={1000000}
                          value={Number((note.col + 1).toFixed(3))}
                          disabled={busy}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (value >= 1) modifyNote({ col: value - 1 });
                          }}
                        />
                      </label>
                      <label>
                        音长
                        <input
                          type="number"
                          aria-label="所选音长"
                          min={0.01}
                          max={512}
                          step={0.25}
                          value={Number(note.len.toFixed(3))}
                          disabled={busy}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (value > 0 && value <= 512)
                              modifyNote({ len: value });
                          }}
                        />
                      </label>
                    </div>
                    <button
                      className="quiet-button danger-text"
                      disabled={busy}
                      onClick={() => {
                        commit({
                          ...score,
                          notes: score.notes.filter((n) => n.id !== selected),
                        });
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={14} />
                      删除音符
                    </button>
                  </div>
                ) : (
                  <p className="inspector-hint">
                    选中音符后调整音高、位置与音长。
                  </p>
                )}
              </section>
              <div className="shortcut-reference">
                <div>
                  <kbd>{settings.startShortcut}</kbd>
                  <span>开始 / 暂停 / 继续</span>
                </div>
                <div>
                  <kbd>{settings.stopShortcut}</kbd>
                  <span>停止并松开按键</span>
                </div>
                <small
                  className={
                    hotkeyStatus && hotkeyStatus !== "已注册"
                      ? "danger-text"
                      : ""
                  }
                >
                  {desktop.native ? hotkeyStatus : "全局快捷键在桌面应用中生效"}
                </small>
              </div>
            </>
          ) : (
            <>
              <section>
                <h2>外观</h2>
                <div className="theme-options">
                  {(
                    [
                      { value: "dark", icon: <Moon size={16} />, text: "深色" },
                      { value: "light", icon: <Sun size={16} />, text: "浅色" },
                      {
                        value: "system",
                        icon: <Monitor size={16} />,
                        text: "系统",
                      },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.value}
                      className={settings.theme === t.value ? "selected" : ""}
                      onClick={() =>
                        setSettings((v) => ({ ...v, theme: t.value }))
                      }
                    >
                      {t.icon}
                      {t.text}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2>全局快捷键</h2>
                <div className="hotkey-fields">
                  <label>
                    开始 / 暂停
                    <input
                      aria-label="演奏快捷键"
                      value={shortcuts.start}
                      onChange={(e) =>
                        setShortcuts((v) => ({ ...v, start: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    紧急停止
                    <input
                      aria-label="停止快捷键"
                      value={shortcuts.stop}
                      onChange={(e) =>
                        setShortcuts((v) => ({ ...v, stop: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  disabled={!desktop.native || nativeActive}
                  onClick={() =>
                    void safely(async () => {
                      await desktop.configureShortcuts(
                        shortcuts.start,
                        shortcuts.stop,
                      );
                      setSettings((v) => ({
                        ...v,
                        startShortcut: shortcuts.start,
                        stopShortcut: shortcuts.stop,
                      }));
                      setHotkeyStatus("已注册");
                      notify("快捷键已保存");
                    })
                  }
                >
                  应用快捷键
                </button>
                <p className="inspector-hint">
                  例如 F8 或 Ctrl+Alt+P。按键被其他程序占用时会保留原设置。
                </p>
              </section>
              <section>
                <h2>窗口与权限</h2>
                <label className="check-setting">
                  <span>关闭窗口时留在托盘</span>
                  <input
                    type="checkbox"
                    checked={settings.closeToTray}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        closeToTray: e.target.checked,
                      }))
                    }
                  />
                </label>
                <p className="inspector-hint">
                  {permission?.message ?? "正在检查系统权限"}
                </p>
                {permission?.platform === "macos" && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void safely(async () =>
                        setPermission(await desktop.permissions(true)),
                      )
                    }
                  >
                    申请辅助功能权限
                  </button>
                )}
                <button
                  className="quiet-button"
                  onClick={() => void safely(refreshTargets)}
                >
                  <RefreshCw size={14} />
                  重新检测
                </button>
              </section>
              <section className="updates">
                <div className="section-heading">
                  <h2>软件更新</h2>
                  <small>v{version}</small>
                </div>
                <label className="check-setting">
                  <span>启动时检查更新</span>
                  <input
                    type="checkbox"
                    checked={settings.autoUpdate}
                    onChange={(e) =>
                      setSettings((v) => ({
                        ...v,
                        autoUpdate: e.target.checked,
                      }))
                    }
                  />
                </label>
                {update.phase === "idle" && (
                  <p className="inspector-hint">
                    通过 GitHub Releases 获取签名更新。
                  </p>
                )}
                {update.phase === "checking" && <p>正在检查更新…</p>}
                {update.phase === "current" && (
                  <p className="success-text">已是最新版本</p>
                )}
                {["available", "downloading", "ready"].includes(
                  update.phase,
                ) && (
                  <>
                    <p>新版本 {update.version}</p>
                    {update.notes && (
                      <pre className="release-notes">{update.notes}</pre>
                    )}
                  </>
                )}
                {update.phase === "error" && (
                  <p className="danger-text update-error">
                    检查或下载失败：{update.error}
                  </p>
                )}
                {update.phase === "downloading" && (
                  <>
                    <progress
                      max={update.total ?? undefined}
                      value={update.total ? update.downloaded : undefined}
                    />
                    <small>
                      {(update.downloaded / 1024 / 1024).toFixed(1)} MB
                      {update.total
                        ? ` / ${(update.total / 1024 / 1024).toFixed(1)} MB`
                        : ""}
                    </small>
                  </>
                )}
                {update.phase === "available" ? (
                  <button
                    className="secondary-button"
                    onClick={() => void updater.current.download()}
                  >
                    下载更新
                  </button>
                ) : update.phase === "ready" ? (
                  <button
                    className="secondary-button"
                    onClick={() => setInstallConfirm(true)}
                  >
                    安装并重启
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={
                      !desktop.native ||
                      ["checking", "downloading"].includes(update.phase)
                    }
                    onClick={() => void updater.current.check()}
                  >
                    <RefreshCw size={14} />
                    检查更新
                  </button>
                )}
              </section>
              <section>
                <h2>曲谱管理</h2>
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => {
                    const copy = {
                      ...structuredClone(score),
                      id: uid(),
                      title: `${score.title} 副本`,
                    };
                    setScores((all) => [...all, copy]);
                    choose(copy.id);
                  }}
                >
                  <Copy size={14} />
                  复制当前曲谱
                </button>
                <button
                  className="quiet-button danger-text"
                  disabled={busy}
                  onClick={() => setDeleteScore(true)}
                >
                  <Trash2 size={14} />
                  删除当前曲谱
                </button>
              </section>
            </>
          )}
        </div>
      </aside>

      <footer className="statusbar">
        <span>
          <span className={`status-dot ${desktop.native ? "connected" : ""}`} />
          {desktop.native
            ? `${permission?.platform === "macos" ? "macOS" : "Windows"} 桌面版`
            : "浏览器编排模式"}
        </span>
        <span>
          {playback.status === "error"
            ? playback.message
            : nativeActive
              ? playback.message
              : `${score.notes.length} 个音符 · 每格 ${Math.round(stepMs(score))} ms`}
        </span>
        <span>
          <span className="safety-dot" />
          {settings.stopShortcut} 紧急停止
        </span>
      </footer>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <IconButton label="关闭提示" onClick={() => setMessage("")}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <input
        id="file-input"
        type="file"
        accept=".json,.txt,.mid,.midi"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void safely(() => openFile(f));
          e.target.value = "";
        }}
      />

      {importOpen && (
        <Dialog title="导入曲谱" close={() => setImportOpen(false)} wide>
          <div className="dialog-content">
            <div className="import-source">
              <button
                className="secondary-button"
                onClick={() => void safely(() => openFile())}
              >
                <FolderOpen size={16} />
                选择文件
              </button>
              <span>JSON、MIDI、TXT，或在下方粘贴简谱</span>
            </div>
            {!midiResult && (
              <textarea
                className="import-text"
                aria-label="导入内容"
                placeholder={"1 2 3 5 3 2 1\n或 KEY Shift+Q 250"}
                value={importValue}
                onChange={(e) => setImportValue(e.target.value)}
                autoFocus
              />
            )}
            {parsed.error && (
              <p className="danger-text" role="alert">
                {parsed.error}
              </p>
            )}
            {parsed.result && (
              <div className="import-summary">
                <strong>{parsed.result.score.notes.length} 个音符</strong>
                <span>
                  {parsed.result.score.timing.bpm} BPM ·{" "}
                  {formatTime(schedule(parsed.result.score).durationMs)}
                </span>
                {parsed.result.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
            <label className="check-setting">
              <span>追加到当前曲谱末尾</span>
              <input
                type="checkbox"
                checked={append}
                onChange={(e) => setAppend(e.target.checked)}
              />
            </label>
          </div>
          <footer>
            <button
              className="quiet-button"
              onClick={() => setImportOpen(false)}
            >
              取消
            </button>
            <button
              className="primary-button"
              disabled={!parsed.result}
              onClick={applyImport}
            >
              {append ? "追加音符" : "替换当前曲谱"}
            </button>
          </footer>
        </Dialog>
      )}
      {exportOpen && (
        <Dialog title="导出曲谱" close={() => setExportOpen(false)} wide>
          <div className="dialog-content">
            <div className="export-tabs">
              <button
                className={exportKind === "json" ? "selected" : ""}
                onClick={() => setExportKind("json")}
              >
                JSON 乐谱
              </button>
              <button
                className={exportKind === "txt" ? "selected" : ""}
                onClick={() => setExportKind("txt")}
              >
                TXT 演奏命令
              </button>
            </div>
            <pre className="export-preview">
              {exportKind === "json"
                ? exportJson(score)
                : exportCommands(score)}
            </pre>
          </div>
          <footer>
            <button
              className="quiet-button"
              onClick={() =>
                void safely(async () => {
                  await navigator.clipboard.writeText(
                    exportKind === "json"
                      ? exportJson(score)
                      : exportCommands(score),
                  );
                  notify("已复制");
                })
              }
            >
              <Copy size={14} />
              复制
            </button>
            <button
              className="primary-button"
              onClick={() => void safely(exportNow)}
            >
              <ArrowUpFromLine size={15} />
              保存文件
            </button>
          </footer>
        </Dialog>
      )}
      {help && (
        <Dialog title="使用说明" close={() => setHelp(false)} wide>
          <div className="dialog-content help-content">
            <h3>编排到演奏</h3>
            <ol>
              <li>
                点击网格写入音符，拖动音符移动，拖右缘调整音长；右键删除。
              </li>
              <li>
                空格试听，Ctrl / ⌘ + Z 撤销，Ctrl / ⌘ + Shift + Z 重做。Home
                回到开头。
              </li>
              <li>
                选择游戏窗口，进入游戏的 36
                键自由演奏，点击“向游戏演奏”并在倒计时内切回游戏。
              </li>
              <li>
                {settings.startShortcut} 开始、暂停或继续；
                {settings.stopShortcut}{" "}
                停止。暂停会松开当前音符，继续时从后续音符演奏。
              </li>
            </ol>
            <h3>后台模式</h3>
            <p>
              Windows 使用窗口消息，macOS 使用进程定向 Quartz
              事件。游戏可能忽略这些事件或不识别修饰键。请先验证 36 个音与
              Shift/Ctrl，确认后台切换时仍然正确。游戏未验证时使用前台模式。
            </p>
            <h3>导入与保存</h3>
            <p>
              支持原项目 JSON、简谱、键位链、MIDI 与 TXT 命令。MIDI
              按网格量化、同列取最高音。曲库自动保存在本机；导出 JSON
              可跨电脑保存。示例“山间清音”为内置原创练习旋律。
            </p>
            <h3>权限</h3>
            <p>
              Windows 与游戏保持同等权限。macOS
              需要在系统设置中允许辅助功能与事件发送。选择后台模式不会自动切换窗口。
            </p>
            <p>
              <a
                href="https://github.com/Kukiisama/yysls-freeplay-arranger"
                target="_blank"
                rel="noreferrer"
              >
                原项目 · Kukisama
              </a>
              <span> · MIT</span>
            </p>
          </div>
        </Dialog>
      )}
      {deleteScore && (
        <Dialog
          title={`删除「${score.title}」？`}
          close={() => setDeleteScore(false)}
        >
          <div className="dialog-content">
            <p>当前曲谱将从本机曲库移除。需要保留时先导出 JSON。</p>
          </div>
          <footer>
            <button
              className="quiet-button"
              onClick={() => setDeleteScore(false)}
            >
              取消
            </button>
            <button
              className="danger-button"
              onClick={() => {
                const rest = scores.filter((s) => s.id !== score.id);
                const next = rest.length ? rest : [emptyScore()];
                setScores(next);
                choose(next[0].id);
                setDeleteScore(false);
              }}
            >
              删除曲谱
            </button>
          </footer>
        </Dialog>
      )}
      {installConfirm && (
        <Dialog
          title={`安装 ${update.version}？`}
          close={() => setInstallConfirm(false)}
        >
          <div className="dialog-content">
            <p>曲谱将保存，演奏会停止。安装后重新启动应用。</p>
          </div>
          <footer>
            <button
              className="quiet-button"
              onClick={() => setInstallConfirm(false)}
            >
              稍后
            </button>
            <button
              className="primary-button"
              onClick={() =>
                void safely(async () => {
                  await stopAll();
                  await saveQueue.current;
                  setInstallConfirm(false);
                  await updater.current.install();
                })
              }
            >
              安装并重启
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
