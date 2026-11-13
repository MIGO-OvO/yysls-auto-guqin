import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Score } from './score';

export const native = isTauri();
export type InputMode = 'foregroundScan' | 'foregroundVirtual' | 'background';
export interface Target { id: string; pid: number; title: string; processName: string }
export interface Settings { theme: 'dark' | 'light' | 'system'; volume: number; mode: InputMode; warmupMs: number; startShortcut: string; stopShortcut: string; closeToTray: boolean; autoUpdate: boolean }
export interface Workspace { version: number; scores: Score[]; activeId: string; settings: Settings }
export interface Playback { status: 'idle' | 'countdown' | 'playing' | 'paused' | 'finished' | 'error'; elapsedMs: number; durationMs: number; activeId: string | null; message: string }
export interface Permissions { platform: string; accessibility: boolean; inputMonitoring: boolean; message: string }
export interface Program { score: Score; target: Target | null; mode: InputMode; warmupMs: number; startCol: number }
export const defaultSettings: Settings = { theme: 'dark', volume: 0.5, mode: 'foregroundScan', warmupMs: 3000, startShortcut: 'F8', stopShortcut: 'F9', closeToTray: true, autoUpdate: true };
export const idlePlayback: Playback = { status: 'idle', elapsedMs: 0, durationMs: 0, activeId: null, message: '' };

export async function loadWorkspace(): Promise<Workspace | null> {
  if (native) return invoke('load_workspace');
  const raw = localStorage.getItem('qin-workspace');
  return raw ? JSON.parse(raw) : null;
}
export async function saveWorkspace(workspace: Workspace) {
  if (native) await invoke('save_workspace', { workspace });
  else localStorage.setItem('qin-workspace', JSON.stringify(workspace));
}
export const listTargets = () => native ? invoke<Target[]>('list_targets') : Promise.resolve<Target[]>([]);
export const permissions = (prompt = false) => native ? invoke<Permissions>('permissions', { prompt }) : Promise.resolve<Permissions>({ platform: 'browser', accessibility: false, inputMonitoring: false, message: '请在桌面应用中连接游戏。' });
export const prepare = (program: Program) => invoke<void>('prepare', { program });
export const start = () => invoke<void>('start');
export const pause = () => invoke<void>('pause');
export const resume = () => invoke<void>('resume');
export const stop = () => invoke<void>('stop');
export const configureShortcuts = (startShortcut: string, stopShortcut: string) => invoke<void>('configure_shortcuts', { startShortcut, stopShortcut });
export const onPlayback = (callback: (playback: Playback) => void) => listen<Playback>('playback', event => callback(event.payload));
export const onError = (callback: (message: string) => void) => listen<string>('player-error', event => callback(event.payload));
export async function windowAction(action: 'minimize' | 'maximize' | 'close') {
  if (!native) return;
  const win = getCurrentWindow();
  if (action === 'minimize') await win.minimize();
  else if (action === 'maximize') await win.toggleMaximize();
  else await win.close();
}

export async function exportFile(name: string, contents: string) {
  if (native) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: name, filters: [{ name: name.endsWith('.json') ? 'JSON 乐谱' : 'TXT 命令', extensions: [name.split('.').at(-1)!] }] });
    if (!path) return false;
    await writeTextFile(path, contents);
  } else {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}
