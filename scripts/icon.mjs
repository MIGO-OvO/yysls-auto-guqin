import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0}</style>${await readFile('src-tauri/icons/source.svg', 'utf8')}`);
  await page.screenshot({ path: 'src-tauri/icons/source.png' });
} finally { await browser.close(); }
