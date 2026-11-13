import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
import { Updates, type UpdateState } from "../src/updates";
beforeEach(() => vi.clearAllMocks());
it("handles no update, metadata, progress and a separate confirmed installation", async () => {
  const states: UpdateState[] = [];
  const updater = new Updates((state) => states.push(state));
  mocks.check.mockResolvedValueOnce(null);
  await updater.check();
  expect(states.at(-1)?.phase).toBe("current");
  const install = vi.fn();
  const close = vi.fn();
  mocks.check.mockResolvedValueOnce({
    version: "1.1.0",
    body: "修复演奏",
    install,
    close,
    download: async (progress: (e: unknown) => void) => {
      progress({ event: "Started", data: { contentLength: 10 } });
      progress({ event: "Progress", data: { chunkLength: 10 } });
    },
  });
  await updater.check();
  expect(states.at(-1)?.version).toBe("1.1.0");
  await updater.download();
  expect(states.at(-1)).toMatchObject({
    phase: "ready",
    notes: "修复演奏",
    downloaded: 10,
    total: 10,
  });
  expect(install).not.toHaveBeenCalled();
  await updater.install();
  expect(install).toHaveBeenCalledOnce();
  expect(mocks.relaunch).toHaveBeenCalledOnce();
});
it("surfaces network and signature/download failures and allows recheck", async () => {
  const states: UpdateState[] = [];
  const updater = new Updates((state) => states.push(state));
  mocks.check.mockRejectedValueOnce(new Error("offline"));
  await updater.check();
  expect(states.at(-1)?.error).toContain("offline");
  mocks.check.mockResolvedValueOnce({
    version: "2",
    close: vi.fn(),
    download: vi.fn().mockRejectedValue(new Error("signature mismatch")),
  });
  await updater.check();
  await updater.download();
  expect(states.at(-1)).toMatchObject({
    phase: "error",
    error: "Error: signature mismatch",
  });
});
