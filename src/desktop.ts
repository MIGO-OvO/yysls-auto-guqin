import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Score } from "./score";
import type { MidiMessage, MidiPort, MidiTake } from "./midi";

export const native = isTauri();
export type InputMode = "foregroundScan" | "foregroundVirtual" | "background";
export interface Target {
  id: string;
  pid: number;
  title: string;
  processName: string;
}
export interface Settings {
  appearanceVersion?: number;
  theme: "dark" | "light" | "system";
  volume: number;
  mode: InputMode;
  warmupMs: number;
  startShortcut: string;
  stopShortcut: string;
  closeToTray: boolean;
  autoUpdate: boolean;
}
export interface Workspace {
  version: number;
  scores: Score[];
  activeId: string;
  settings: Settings;
}
export interface Playback {
  status: "idle" | "countdown" | "playing" | "paused" | "finished" | "error";
  elapsedMs: number;
  durationMs: number;
  activeId: string | null;
  message: string;
}
export interface Permissions {
  platform: string;
  accessibility: boolean;
  inputMonitoring: boolean;
  message: string;
}
export interface Program {
  score: Score;
  target: Target | null;
  mode: InputMode;
  warmupMs: number;
  startCol: number;
}
export const defaultSettings: Settings = {
  appearanceVersion: 1,
  theme: "light",
  volume: 0.5,
  mode: "foregroundScan",
  warmupMs: 3000,
  startShortcut: "F11",
  stopShortcut: "F12",
  closeToTray: true,
  autoUpdate: true,
};
export const idlePlayback: Playback = {
  status: "idle",
  elapsedMs: 0,
  durationMs: 0,
  activeId: null,
  message: "",
};

export async function loadWorkspace(): Promise<Workspace | null> {
  if (native) return invoke("load_workspace");
  const raw = localStorage.getItem("qin-workspace");
  return raw ? JSON.parse(raw) : null;
}
export async function saveWorkspace(workspace: Workspace) {
  if (native) await invoke("save_workspace", { workspace });
  else localStorage.setItem("qin-workspace", JSON.stringify(workspace));
}
export const listTargets = () =>
  native ? invoke<Target[]>("list_targets") : Promise.resolve<Target[]>([]);
export const permissions = (prompt = false) =>
  native
    ? invoke<Permissions>("permissions", { prompt })
    : Promise.resolve<Permissions>({
        platform: "browser",
        accessibility: false,
        inputMonitoring: false,
        message: "请在桌面应用中连接游戏。",
      });
export const prepare = (program: Program) =>
  invoke<void>("prepare", { program });
export const start = () => invoke<void>("start");
export const pause = () => invoke<void>("pause");
export const resume = () => invoke<void>("resume");
export const stop = () => invoke<void>("stop");
export const configureShortcuts = (
  startShortcut: string,
  stopShortcut: string,
) => invoke<void>("configure_shortcuts", { startShortcut, stopShortcut });
export const setShortcutRecording = (recording: boolean) =>
  native
    ? invoke<void>("set_shortcut_recording", { recording })
    : Promise.resolve();
export const onPlayback = (callback: (playback: Playback) => void) =>
  listen<Playback>("playback", (event) => callback(event.payload));
export const onError = (callback: (message: string) => void) =>
  listen<string>("player-error", (event) => callback(event.payload));
export const onPreviewStop = (callback: () => void) =>
  listen("stop-preview", callback);
export const midiInputs = () =>
  native ? invoke<MidiPort[]>("midi_inputs") : Promise.resolve<MidiPort[]>([]);
export const connectMidi = (portId: string) =>
  invoke<void>("connect_midi", { portId });
export const disconnectMidi = () =>
  native
    ? invoke<MidiTake>("disconnect_midi")
    : Promise.resolve<MidiTake>({ notes: [], durationMs: 0 });
export const startMidiRecording = () => invoke<void>("start_midi_recording");
export const stopMidiRecording = () => invoke<MidiTake>("stop_midi_recording");
export const onMidiInput = (callback: (message: MidiMessage) => void) =>
  listen<MidiMessage>("midi-input", (event) => callback(event.payload));
export async function windowAction(action: "minimize" | "maximize" | "close") {
  if (!native) return;
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "maximize") await win.toggleMaximize();
  else await win.close();
}

export async function exportFile(name: string, contents: string | Uint8Array) {
  if (native) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: name,
      filters: [
        {
          name: name.endsWith(".mid")
            ? "MIDI 录音"
            : name.endsWith(".json")
              ? "JSON 乐谱"
              : "TXT 命令",
          extensions: [name.split(".").at(-1)!],
        },
      ],
    });
    if (!path) return false;
    if (typeof contents === "string") await writeTextFile(path, contents);
    else await writeFile(path, contents);
  } else {
    const url = URL.createObjectURL(
      new Blob(
        [
          typeof contents === "string"
            ? contents
            : new Uint8Array(contents).buffer,
        ],
        {
          type:
            typeof contents === "string"
              ? "text/plain;charset=utf-8"
              : "audio/midi",
        },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}
