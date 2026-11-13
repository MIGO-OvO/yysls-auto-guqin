import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const [endpoint = "http://127.0.0.1:9338", receiverTitle, receiverLog] =
  process.argv.slice(2);
if (!receiverTitle || !receiverLog)
  throw new Error("Pass an isolated Win32 receiver title and JSONL path");
const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.waitForEvent("page"));
await mkdir("artifacts", { recursive: true });
try {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const invoke = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  await page.getByLabel("曲谱名称").waitFor();
  await page.waitForFunction(async () =>
    Boolean(await window.__TAURI_INTERNALS__.invoke("load_workspace")),
  );
  const workspace = await invoke("load_workspace");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/native-workspace-before.json",
    JSON.stringify(workspace),
  );
  const permissions = await invoke("permissions", { prompt: false });
  assert.equal(permissions.platform, "windows");
  await page.getByLabel("关闭演奏面板", { exact: true }).click();
  await page.getByLabel("新建曲谱", { exact: true }).click();
  await page.getByRole("button", { name: "粘贴", exact: true }).click();
  await page
    .getByLabel("导入内容")
    .fill("KEY Q 150\nKEY Shift+Q 150\nKEY Ctrl+E 150");
  await page.getByRole("button", { name: "替换当前曲谱" }).click();
  await page.getByLabel("展开设置", { exact: true }).click();
  await page.getByLabel("刷新窗口", { exact: true }).click();
  const target = (await invoke("list_targets")).find(
    (t) => t.title === receiverTitle,
  );
  assert(target, "isolated receiver not listed");
  await page.getByLabel("目标游戏窗口").selectOption(target.id);
  await page.getByRole("radio", { name: "后台定向输入" }).check();
  await page.getByLabel("开始前预留毫秒").fill("100");
  await page.getByLabel("关闭演奏面板", { exact: true }).click();
  await page.evaluate(async () => {
    window.__smokePlayback = [];
    const handler = window.__TAURI_INTERNALS__.transformCallback((event) =>
      window.__smokePlayback.push(event.payload),
    );
    await window.__TAURI_INTERNALS__.invoke("plugin:event|listen", {
      event: "playback",
      target: { kind: "Any" },
      handler,
    });
  });
  await page
    .getByRole("button", { name: /^向游戏演奏 / })
    .click();
  await page.waitForFunction(
    () => window.__smokePlayback.some((p) => p.status === "finished"),
    null,
    { timeout: 12000 },
  );
  const events = await page.evaluate(() => window.__smokePlayback);
  assert(events.some((e) => e.status === "playing"));
  const deadline = Date.now() + 5000;
  let received = [];
  while (Date.now() < deadline) {
    const text = await readFile(receiverLog, "utf8").catch(() => "");
    received = text
      .slice(0, text.lastIndexOf("\n") + 1)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    if (received.length >= 10) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual(
    received.map((e) => e.key),
    [81, 81, 16, 81, 81, 16, 17, 69, 69, 17],
  );
  await page.getByLabel("曲谱名称").fill("原生冒烟");
  await page.waitForFunction(async () => {
    const workspace = await window.__TAURI_INTERNALS__.invoke("load_workspace");
    return workspace?.scores.some((score) => score.title === "原生冒烟");
  });
  await page.reload();
  await page.getByLabel("曲谱名称").waitFor();
  assert.equal(await page.getByLabel("曲谱名称").inputValue(), "原生冒烟");
  await page.screenshot({ path: "artifacts/native-workbench.png" });
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  for (const label of ["演奏快捷键", "停止快捷键"]) {
    const input = page.getByLabel(label);
    await input.click();
    await page.waitForFunction(() =>
      document.activeElement?.getAttribute("placeholder") === "按下快捷键…",
    );
    await input.press("F10");
  }
  await page.getByRole("button", { name: "应用快捷键", exact: true }).click();
  await page
    .getByText("演奏和停止快捷键需要不同的组合", { exact: true })
    .waitFor();
  await invoke("save_workspace", { workspace });
  await page.reload();
  await page.getByLabel("曲谱名称").waitFor();
  assert.equal(
    await page.getByLabel("曲谱名称").inputValue(),
    workspace.scores.find((score) => score.id === workspace.activeId).title,
  );
  await page.screenshot({ path: "artifacts/native-default.png" });
  await writeFile(
    "artifacts/native-smoke.json",
    JSON.stringify(
      {
        permissions,
        receivedMessages: received.length,
        events,
        persistence: true,
        hotkeyValidation: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  await invoke("stop");
  console.log(
    "Native checks passed. Original workspace restored; application left running.",
  );
} catch (error) {
  await page
    .screenshot({ path: "artifacts/native-failure.png" })
    .catch(() => {});
  await writeFile(
    "artifacts/native-failure.html",
    await page.content().catch(() => ""),
  );
  throw error;
} finally {
  await browser.close().catch(() => {});
}
