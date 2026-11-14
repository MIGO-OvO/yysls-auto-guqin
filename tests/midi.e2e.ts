import { expect, test, type Page } from "@playwright/test";
import { parseMidi } from "midi-file";

async function mockMidiDesktop(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: unknown) => void>();
    let callbackId = 0;
    const listeners = new Map<string, Set<number>>();
    const notes = [
      { midi: 21, startMs: 3000 },
      { midi: 44, startMs: 3350 },
      { midi: 60, startMs: 3350 },
      { midi: 62, startMs: 3700 },
      { midi: 64, startMs: 4050 },
      { midi: 108, startMs: 4400 },
    ].map((n) => ({ ...n, endMs: n.startMs + 250, channel: 0, velocity: 90 }));
    const state = Object.assign(window, {
      isTauri: true,
      __midiPorts: [{ id: "piano-1", name: "88-key USB Piano" }],
      __midiTake: { notes, durationMs: 4650 },
      __midiRecording: false,
      __midiCalls: [] as { command: string; args: unknown }[],
      __savedMidi: [] as number[],
      __failConnect: false,
      __emitMidi: (data: number[]) => {
        for (const id of listeners.get("midi-input") ?? [])
          callbacks.get(id)?.({ payload: { portId: "piano-1", data } });
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: (_event: string, id: number) =>
          callbacks.delete(id),
      },
    });
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (event: unknown) => void) => {
          const id = ++callbackId;
          callbacks.set(id, callback);
          return id;
        },
        invoke: async (command: string, args: Record<string, unknown>) => {
          state.__midiCalls.push({ command, args });
          switch (command) {
            case "load_workspace":
              return JSON.parse(
                localStorage.getItem("qin-workspace") ?? "null",
              );
            case "save_workspace":
              localStorage.setItem(
                "qin-workspace",
                JSON.stringify(args.workspace),
              );
              return;
            case "permissions":
              return {
                platform: "windows",
                accessibility: true,
                inputMonitoring: true,
                message: "",
              };
            case "list_targets":
              return [];
            case "plugin:event|listen": {
              const ids =
                listeners.get(String(args.event)) ?? new Set<number>();
              ids.add(Number(args.handler));
              listeners.set(String(args.event), ids);
              return args.handler;
            }
            case "plugin:event|unlisten":
              listeners.get(String(args.event))?.delete(Number(args.eventId));
              return;
            case "midi_inputs":
              return state.__midiPorts;
            case "connect_midi":
              if (state.__failConnect) throw new Error("设备被其他程序占用");
              return;
            case "start_midi_recording":
              state.__midiRecording = true;
              return;
            case "stop_midi_recording":
            case "disconnect_midi": {
              const take = state.__midiRecording
                ? state.__midiTake
                : { notes: [], durationMs: 0 };
              state.__midiRecording = false;
              return take;
            }
            case "plugin:dialog|save":
              return "C:/mock/recording.mid";
            case "plugin:fs|write_file":
              state.__savedMidi = Array.from(args as unknown as Uint8Array);
              return;
            default:
              return null;
          }
        },
      },
    });
  });
}

async function openAndConnect(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "MIDI 录制", exact: true }).click();
  await page.getByLabel("MIDI 输入设备").selectOption("piano-1");
  await expect(page.getByText("设备已连接", { exact: true })).toBeVisible();
}

test("explains desktop MIDI availability without offering unusable controls in the browser", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "MIDI 录制", exact: true }).click();
  await expect(
    page.getByText("请在桌面应用中连接 MIDI 键盘。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始录制", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("关闭对话框").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("records MIDI, compares conversion, exports the full-range take and saves a separate score", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockMidiDesktop(page);
  await openAndConnect(page);
  await page.getByRole("button", { name: "开始录制", exact: true }).click();
  await expect(page.getByText("正在录制", { exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.get(window, "__emitMidi")([0x90, 108, 90]));
  await expect(page.locator(".midi-keyboard .sounding")).toHaveCount(1);
  await page.evaluate(() => Reflect.get(window, "__emitMidi")([0x90, 108, 0]));
  await expect(page.locator(".midi-keyboard .sounding")).toHaveCount(0);
  await page.getByRole("button", { name: "停止录制", exact: true }).click();
  await expect(
    page.getByText("6 音符 → 5 音符", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("MIDI 曲名").fill("键盘录音");
  await page.getByLabel("录制 BPM").fill("0");
  await expect(page.getByRole("alert")).toContainText("BPM");
  await expect(
    page.getByRole("button", { name: "保存为新曲谱" }),
  ).toBeDisabled();
  await page.getByLabel("录制 BPM").fill("120");
  await page.getByLabel("MIDI 转换方式").selectOption("fold");
  await page.getByLabel("MIDI 转换方式").selectOption("smart");
  await page.getByRole("button", { name: "试听录音", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止试听", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止试听", exact: true }).click();
  await page.getByRole("button", { name: "试听 36 键", exact: true }).click();
  await page.getByRole("button", { name: "停止试听", exact: true }).click();
  await page
    .getByRole("button", { name: "保存录制 MIDI", exact: true })
    .click();
  await expect(
    page.getByText("录制 MIDI 已保存", { exact: true }),
  ).toBeVisible();
  const bytes = await page.evaluate(() => Reflect.get(window, "__savedMidi"));
  const exported = parseMidi(new Uint8Array(bytes));
  const on = exported.tracks[0].filter((e) => e.type === "noteOn");
  expect(on.map((e) => (e.type === "noteOn" ? e.noteNumber : null))).toEqual([
    21, 44, 60, 62, 64, 108,
  ]);
  await page.screenshot({ path: ".impeccable/review/midi-conversion.png" });
  await page.getByRole("button", { name: "保存为新曲谱", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("曲谱名称")).toHaveValue("键盘录音");
  await expect(page.locator(".score-item")).toHaveCount(2);
  const workspace = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qin-workspace")!),
  );
  const score = workspace.scores.find(
    (s: { id: string }) => s.id === workspace.activeId,
  );
  expect(score.notes).toHaveLength(5);
  expect(
    score.notes.every((n: { midi: number }) => n.midi >= 48 && n.midi <= 83),
  ).toBe(true);
  expect(score.notes[1].midi % 12).toBe(0);
  const calls = await page.evaluate(() => Reflect.get(window, "__midiCalls"));
  expect(
    calls
      .filter(
        (c: { command: string }) => c.command === "set_shortcut_recording",
      )
      .map((c: { args: unknown }) => c.args),
  ).toEqual([{ recording: true }, { recording: false }]);
  expect(
    calls.some((c: { command: string }) =>
      ["start", "resume"].includes(c.command),
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.getByLabel("曲谱名称")).toHaveValue("键盘录音");
  expect(errors).toEqual([]);
});

test("keeps a take after unplugging or closing during recording and recovers connection errors", async ({
  page,
}) => {
  await mockMidiDesktop(page);
  await page.goto("/");
  await page.getByRole("button", { name: "MIDI 录制", exact: true }).click();
  await page.evaluate(() => Reflect.set(window, "__failConnect", true));
  await page.getByLabel("MIDI 输入设备").selectOption("piano-1");
  await expect(page.getByRole("alert")).toContainText("设备被其他程序占用");
  await expect(
    page.getByRole("button", { name: "开始录制", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => Reflect.set(window, "__failConnect", false));
  await page.getByLabel("MIDI 输入设备").selectOption("piano-1");
  await page.getByRole("button", { name: "开始录制", exact: true }).click();
  await page.evaluate(() => Reflect.set(window, "__midiPorts", []));
  await page
    .getByRole("button", { name: "刷新 MIDI 设备", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("设备已断开");
  await expect(
    page.getByText("6 音符 → 5 音符", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "重新录制", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("关闭对话框").click();
  await page.getByRole("button", { name: "MIDI 录制", exact: true }).click();
  await expect(
    page.getByText("6 音符 → 5 音符", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Reflect.set(window, "__midiPorts", [
      { id: "piano-1", name: "88-key USB Piano" },
    ]),
  );
  await page
    .getByRole("button", { name: "刷新 MIDI 设备", exact: true })
    .click();
  await expect(page.getByLabel("MIDI 输入设备")).toHaveValue("");
  await page.getByLabel("MIDI 输入设备").selectOption("piano-1");
  await page.getByRole("button", { name: "重新录制", exact: true }).click();
  await page.getByLabel("关闭对话框").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "MIDI 录制", exact: true }).click();
  await expect(
    page.getByText("6 音符 → 5 音符", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 950, height: 650 });
  await page.screenshot({ path: ".impeccable/review/midi-compact.png" });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((d) => d.scrollWidth <= d.clientWidth),
  ).toBe(true);
});
