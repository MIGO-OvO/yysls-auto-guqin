import { check, type Update } from '@tauri-apps/plugin-updater';

export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';
export interface UpdateState { phase: UpdatePhase; version?: string; notes?: string; downloaded: number; total?: number; error?: string }
export const initialUpdate: UpdateState = { phase: 'idle', downloaded: 0 };

export class Updates {
  private update: Update | null = null;
  constructor(private changed: (state: UpdateState) => void) {}

  async check() {
    this.changed({ phase: 'checking', downloaded: 0 });
    try {
      if (this.update) { await this.update.close(); this.update = null; }
      this.update = await check({ timeout: 20000 });
      this.changed(this.update ? { phase: 'available', version: this.update.version, notes: this.update.body, downloaded: 0 } : { phase: 'current', downloaded: 0 });
    } catch (error) { this.fail(error); }
  }

  async download() {
    if (!this.update) return;
    let downloaded = 0;
    let total: number | undefined;
    this.changed({ phase: 'downloading', version: this.update.version, downloaded });
    try {
      await this.update.download(event => {
        if (event.event === 'Started') total = event.data.contentLength;
        if (event.event === 'Progress') downloaded += event.data.chunkLength;
        this.changed({ phase: 'downloading', version: this.update!.version, downloaded, total });
      });
      this.changed({ phase: 'ready', version: this.update.version, downloaded, total });
    } catch (error) { this.fail(error); }
  }

  async install() {
    if (!this.update) return;
    try { await this.update.install(); const { relaunch } = await import('@tauri-apps/plugin-process'); await relaunch(); }
    catch (error) { this.fail(error); }
  }

  private fail(error: unknown) { this.changed({ phase: 'error', downloaded: 0, error: String(error) }); }
}
