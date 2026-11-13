import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "导出", exact: true }).click();
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
    page.getByRole("button", { name: "向游戏演奏 F8" }),
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
