import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error(
    "Run updater installation checks only in an isolated CI runner",
  );
const [endpoint, expectedVersion] = process.argv.slice(2);
const marker = `更新验收 ${randomUUID()}`;
let browser;
let page;
await mkdir("artifacts", { recursive: true });
try {
  browser = await chromium.connectOverCDP(endpoint);
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const invoke = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  await page.getByLabel("曲谱名称").fill(marker);
  await page.waitForFunction(async (title) => {
    const workspace = await window.__TAURI_INTERNALS__.invoke("load_workspace");
    return workspace?.scores.some((score) => score.title === title);
  }, marker);
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page
    .getByText(`新版本 ${expectedVersion}`, { exact: true })
    .waitFor({ timeout: 60000 });
  assert(
    (await page.locator(".release-notes").innerText()).trim().length > 0,
    "release notes were not displayed",
  );
  await page.evaluate(() => {
    window.__updateProgress = [];
    new MutationObserver(() => {
      const progress = document.querySelector(".updates progress");
      if (progress)
        window.__updateProgress.push({
          value: progress.value,
          max: progress.max,
        });
    }).observe(document.querySelector(".updates"), {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
  await page.getByRole("button", { name: "下载更新", exact: true }).click();
  await page
    .getByRole("button", { name: "安装并重启", exact: true })
    .waitFor({ timeout: 90000 });
  const progress = await page.evaluate(() => window.__updateProgress);
  assert(
    progress.some((sample) => sample.value > 0),
    "download progress was not displayed",
  );
  assert(
    (await invoke("load_workspace")).scores.some(
      (score) => score.title === marker,
    ),
  );
  await page.screenshot({ path: "artifacts/native-update-ready.png" });
  await page.getByRole("button", { name: "安装并重启", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "稍后", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(page.isClosed(), false);
  await writeFile(
    "artifacts/native-update-request.json",
    JSON.stringify(
      {
        marker,
        expectedVersion,
        confirmationRequired: true,
        cancelPreservedApplication: true,
        progress,
      },
      null,
      2,
    ),
  );
  await page.getByRole("button", { name: "安装并重启", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "安装并重启", exact: true })
    .click()
    .catch((error) => {
      if (!page.isClosed()) throw error;
    });
  await browser.close().catch(() => {});
  browser = null;
  const deadline = Date.now() + 90000;
  let restarted = false;
  let restartError = "";
  while (Date.now() < deadline) {
    try {
      browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 });
      page = browser.contexts()[0].pages()[0];
      await page.getByLabel("曲谱名称").waitFor({ timeout: 5000 });
      await page
        .locator(".inspector-tabs")
        .getByRole("button", { name: "设置", exact: true })
        .click();
      if (
        await page
          .locator(".updates")
          .getByText(`v${expectedVersion}`, { exact: true })
          .isVisible()
      ) {
        restarted = true;
        break;
      }
    } catch (error) {
      restartError = String(error);
    }
    await browser?.close().catch(() => {});
    browser = null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(
    restarted,
    `updated application did not restart with the expected version: ${restartError}`,
  );
  assert.equal(await page.getByLabel("曲谱名称").inputValue(), marker);
  await page.waitForFunction(async () => {
    const workspace = await window.__TAURI_INTERNALS__.invoke("load_workspace");
    return (
      workspace.settings.theme === "light" &&
      workspace.settings.appearanceVersion === 1
    );
  });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  const workspace = await invoke("load_workspace");
  assert(workspace.scores.some((score) => score.title === marker));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "artifacts/native-update-restarted.png" });
  await writeFile(
    "artifacts/native-update.json",
    JSON.stringify(
      {
        version: expectedVersion,
        confirmationRequired: true,
        cancelPreservedApplication: true,
        progress,
        restarted: true,
        workspacePreserved: true,
        appearanceMigrated: true,
        theme: "light",
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Native updater installed ${expectedVersion}, restarted, and preserved the workspace.`,
  );
} catch (error) {
  await page
    ?.screenshot({ path: "artifacts/native-update-failure.png" })
    .catch(() => {});
  throw error;
} finally {
  await browser?.close().catch(() => {});
}
