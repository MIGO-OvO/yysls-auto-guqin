import { expect, test } from "@playwright/test";

test("migrates an existing dark workspace to beige once and preserves later choices", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() =>
    Boolean(localStorage.getItem("qin-workspace")),
  );
  const original = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("qin-workspace")!);
    workspace.settings.theme = "dark";
    workspace.settings.startShortcut = "F8";
    workspace.settings.stopShortcut = "F9";
    delete workspace.settings.appearanceVersion;
    localStorage.setItem("qin-workspace", JSON.stringify(workspace));
    return { scores: workspace.scores, activeId: workspace.activeId };
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "向游戏演奏 F8", exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem("qin-workspace")!);
    return (
      workspace.settings.theme === "light" &&
      workspace.settings.appearanceVersion === 1
    );
  });
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("qin-workspace")!).settings.theme ===
      "dark",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => {
      const workspace = JSON.parse(localStorage.getItem("qin-workspace")!);
      return { scores: workspace.scores, activeId: workspace.activeId };
    }),
  ).toEqual(original);
});

test("edits, imports, undo/redo, exports and persists an actual score", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByLabel("曲谱名称")).toHaveValue("山间清音");
  await page.getByLabel("新建曲谱", { exact: true }).click();
  await page.getByLabel("曲谱名称").fill("测试曲谱");
  await page.getByRole("button", { name: "粘贴", exact: true }).click();
  await page.getByLabel("导入内容").fill("1 2 3 #4 b3 5'");
  await expect(page.getByText("6 个音符", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "替换当前曲谱" }).click();
  await expect(page.getByLabel("曲谱名称")).toHaveValue("导入的曲谱");
  await page.getByLabel("撤销", { exact: true }).click();
  await expect(page.getByLabel("曲谱名称")).toHaveValue("测试曲谱");
  await page.getByLabel("重做", { exact: true }).click();
  await expect(page.getByLabel("曲谱名称")).toHaveValue("导入的曲谱");
  const note = page.getByRole("button", { name: "音符 1 第1格", exact: true });
  await note.click();
  await expect(page.getByLabel("所选音高")).toHaveValue("60");
  await page.getByLabel("所选音长").fill("2");
  await expect(note).toHaveAttribute("title", /2 格/);
  const bpm = page.getByLabel("BPM", { exact: true });
  await bpm.focus();
  await bpm.press("ControlOrMeta+A");
  await bpm.press("Backspace");
  await bpm.pressSequentially("125");
  await bpm.press("Tab");
  await expect(bpm).toHaveValue("125");
  await page.getByRole("button", { name: "导出「导入的曲谱」", exact: true }).click();
  await page.getByRole("button", { name: "TXT 演奏命令" }).click();
  await expect(page.locator(".export-preview")).toContainText("KEY Shift+F");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
  await page.reload();
  await expect(page.getByLabel("曲谱名称")).toHaveValue("导入的曲谱");
  expect(errors).toEqual([]);
});

test("draws, drags, resizes and deletes notes with pointer input", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("新建曲谱", { exact: true }).click();
  const grid = page.getByLabel("钢琴卷音符区");
  const box = await grid.boundingBox();
  const viewport = await page.getByTestId("piano-roll").boundingBox();
  if (!box || !viewport) throw new Error("roll missing");
  const x = box.x + 5 * 28 + 10;
  const y = viewport.y + 100;
  await page.mouse.click(x, y);
  const note = page.locator(".roll-note");
  await expect(note).toHaveCount(1);
  const initial = await note.boundingBox();
  if (!initial) throw new Error("note missing");
  await page.mouse.move(initial.x + 7, initial.y + 7);
  await page.mouse.down();
  await page.mouse.move(initial.x + 63, initial.y + 7, { steps: 6 });
  await page.mouse.up();
  await expect(note).toHaveAttribute("aria-label", /第8格/);
  const moved = await note.boundingBox();
  if (!moved) throw new Error("note missing");
  await page.mouse.move(moved.x + moved.width - 3, moved.y + 7);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width + 52, moved.y + 7, { steps: 6 });
  await page.mouse.up();
  await expect(note).toHaveAttribute("title", /3 格/);
  await note.click({ button: "right" });
  await expect(note).toHaveCount(0);
  await page.getByLabel("撤销", { exact: true }).click();
  await expect(note).toHaveCount(1);
});

test("creates and selects notes with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("新建曲谱", { exact: true }).click();
  const grid = page.getByLabel("钢琴卷音符区");
  await grid.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  const note = page.getByRole("button", { name: "音符 #1 第2格", exact: true });
  await expect(note).toHaveCount(1);
  await note.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("所选音高")).toHaveValue("61");
  await page.getByLabel("所选音长").fill("3");
  await note.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".roll-note")).toHaveCount(0);
  await page.getByLabel("撤销", { exact: true }).click();
  await expect(page.locator(".roll-note")).toHaveCount(1);
});

test("preview pauses/stops and every shipped layout renders", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "向游戏演奏 F11" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "试听 Space", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停试听 Space", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "暂停试听 Space", exact: true })
    .click();
  await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
  await page.getByLabel("停止", { exact: true }).click();
  await page.screenshot({ path: ".impeccable/review/desktop.png" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "后台定向输入", exact: true }).check();
  await expect(page.getByText("游戏接收未验证", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/background.png" });
  await page.getByRole("radio", { name: "前台演奏", exact: true }).check();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: ".impeccable/review/light.png" });
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: ".impeccable/review/dark.png" });
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await page.setViewportSize({ width: 950, height: 650 });
  await page.getByLabel("关闭演奏面板", { exact: true }).click();
  await page.screenshot({ path: ".impeccable/review/compact.png" });
  await page.getByRole("button", { name: "粘贴", exact: true }).click();
  await page.getByLabel("导入内容").fill("KEY Q invalid");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/import-error.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("manages the intended library row without switching the active score", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("新建曲谱", { exact: true }).click();
  await page.getByLabel("曲谱名称").fill("当前曲谱");
  const demo = page.locator(".score-item").filter({ hasText: "山间清音" });
  await expect(demo.getByLabel("导出「山间清音」")).toHaveAttribute("title", "导出「山间清音」");
  await demo.getByLabel("导出「山间清音」").click();
  await expect(page.locator(".export-preview")).toContainText('"title": "山间清音"');
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("山间清音.json");
  await expect(page.getByLabel("曲谱名称")).toHaveValue("当前曲谱");

  await demo.getByLabel("删除「山间清音」").click();
  await expect(page.getByRole("dialog", { name: "删除「山间清音」？" })).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(demo).toBeVisible();
  await demo.getByLabel("删除「山间清音」").click();
  await page.getByRole("button", { name: "删除曲谱", exact: true }).click();
  await expect(demo).toHaveCount(0);
  await expect(page.getByLabel("曲谱名称")).toHaveValue("当前曲谱");
  await page.reload();
  await expect(page.locator(".score-item")).toHaveCount(1);
  await expect(page.getByLabel("曲谱名称")).toHaveValue("当前曲谱");

  await page.getByLabel("删除「当前曲谱」").click();
  await page.getByRole("button", { name: "删除曲谱", exact: true }).click();
  await expect(page.locator(".score-item")).toHaveCount(1);
  await expect(page.getByLabel("曲谱名称")).toHaveValue("未命名曲谱");
});

test("records hotkeys, cancels capture and persists combinations", async ({ page }) => {
  await page.goto("/");
  await page.locator(".inspector-tabs").getByRole("button", { name: "设置", exact: true }).click();
  const start = page.getByLabel("演奏快捷键", { exact: true });
  const stop = page.getByLabel("停止快捷键", { exact: true });
  const apply = page.getByRole("button", { name: "应用快捷键", exact: true });
  await expect(start).toHaveValue("F11");
  await expect(stop).toHaveValue("F12");
  await start.click();
  await expect(start).toHaveAttribute("placeholder", "按下快捷键…");
  await page.keyboard.down("Control");
  await expect(start).toHaveValue("");
  await page.keyboard.up("Control");
  await start.press("Escape");
  await expect(start).toHaveValue("F11");
  await expect(start).not.toBeFocused();
  await start.click();
  await start.press("Tab");
  await expect(stop).toBeFocused();
  await stop.press("F12");
  await expect(stop).toHaveValue("F12");
  await start.click();
  await start.press("Control+Alt+KeyP");
  await expect(start).toHaveValue("Ctrl+Alt+P");
  await expect(start).not.toBeFocused();
  await stop.click();
  await stop.press("Control+Alt+KeyP");
  await apply.click();
  await expect(page.getByText("演奏和停止快捷键需要不同的组合", { exact: true })).toBeVisible();
  await stop.click();
  await stop.press("Control+Shift+F12");
  await expect(stop).toHaveValue("Ctrl+Shift+F12");
  await apply.click();
  await expect(page.getByText("快捷键已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "向游戏演奏 Ctrl+Alt+P", exact: true })).toBeVisible();
  await page.locator(".inspector-tabs").getByRole("button", { name: "设置", exact: true }).click();
  await expect(start).toHaveValue("Ctrl+Alt+P");
  await expect(stop).toHaveValue("Ctrl+Shift+F12");
  await start.click();
  await start.press("Meta+KeyK");
  await expect(start).toHaveValue("Super+K");
  await start.click();
  await start.press("Alt+Digit1");
  await expect(start).toHaveValue("Alt+1");
  await stop.click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(stop).not.toBeFocused();
  await expect(stop).toHaveValue("Ctrl+Shift+F12");
  await page.screenshot({ path: ".impeccable/review/shortcut-recorder.png" });
});

test("waits for native hotkey suspension and allows applying after a restore error", async ({ page }) => {
  await page.addInitScript(() => {
    const state = Object.assign(window, {
      isTauri: true,
      __shortcutCalls: [] as { command: string; args: Record<string, unknown> }[],
      __releaseRecording: () => {},
      __failRestore: false,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
    });
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        transformCallback: () => 0,
        invoke: async (command: string, args: Record<string, unknown>) => {
          switch (command) {
            case "load_workspace":
              return JSON.parse(localStorage.getItem("qin-workspace") ?? "null");
            case "save_workspace":
              localStorage.setItem("qin-workspace", JSON.stringify(args.workspace));
              return;
            case "permissions":
              return { platform: "windows", accessibility: true, inputMonitoring: true, message: "" };
            case "list_targets": return [];
            case "configure_shortcuts":
              state.__shortcutCalls.push({ command, args });
              return;
            case "set_shortcut_recording":
              state.__shortcutCalls.push({ command, args });
              if (args.recording)
                await new Promise<void>((resolve) => { state.__releaseRecording = resolve; });
              else if (state.__failRestore) throw new Error("模拟恢复失败");
              return;
            default: return null;
          }
        },
      },
    });
  });
  await page.goto("/");
  await page.locator(".inspector-tabs").getByRole("button", { name: "设置", exact: true }).click();
  const start = page.getByLabel("演奏快捷键", { exact: true });
  await expect(start).toHaveValue("F11");
  await start.click();
  await expect(start).toHaveAttribute("placeholder", "准备录制…");
  await expect.poll(() => page.evaluate(() =>
    Reflect.get(window, "__shortcutCalls").at(-1),
  )).toEqual({ command: "set_shortcut_recording", args: { recording: true } });
  await start.press("F11");
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("");
  await page.evaluate(() => Reflect.get(window, "__releaseRecording")());
  await expect(start).toHaveAttribute("placeholder", "按下快捷键…");
  await page.evaluate(() => Reflect.set(window, "__failRestore", true));
  await start.press("Control+Alt+Shift+F11");
  await expect(start).toHaveValue("Ctrl+Alt+Shift+F11");
  await expect(start).not.toBeFocused();
  await expect(page.getByText(/恢复快捷键失败：模拟恢复失败/)).toBeVisible();
  await page.getByRole("button", { name: "应用快捷键", exact: true }).click();
  await expect(page.getByText("快捷键已保存", { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => Reflect.get(window, "__shortcutCalls"));
  expect(calls.slice(-3)).toEqual([
    { command: "set_shortcut_recording", args: { recording: true } },
    { command: "set_shortcut_recording", args: { recording: false } },
    { command: "configure_shortcuts", args: { startShortcut: "Ctrl+Alt+Shift+F11", stopShortcut: "F12" } },
  ]);
});
