import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { releaseManifest } from "../scripts/release-manifest.mjs";
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
it("publishes only a complete matrix with unique asset names and signatures", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "guqin-release-"));
  directories.push(root);
  const sig = Buffer.from(
    "untrusted comment: test\npublic-signature\ntrusted comment: test\npublic-data",
  ).toString("base64");
  for (const [dir, name] of [
    ["win", "琴笺.exe"],
    ["arm", "琴笺_aarch64.app.tar.gz"],
    ["intel", "琴笺_x64.app.tar.gz"],
  ]) {
    const folder = path.join(root, dir);
    await mkdir(folder);
    await writeFile(path.join(folder, name), "fixture");
    await writeFile(path.join(folder, name + ".sig"), sig);
    if (dir !== "win")
      await writeFile(path.join(folder, `琴笺_${dir}.dmg`), "fixture");
  }
  const { manifest, files } = await releaseManifest(
    root,
    "owner/repo",
    "0.1.0",
    "notes",
  );
  expect(Object.keys(manifest.platforms)).toHaveLength(3);
  expect(files).toHaveLength(8);
  expect(manifest.platforms["windows-x86_64"].url).toContain("%E7%90%B4");
  await rm(path.join(root, "win", "琴笺.exe.sig"));
  await expect(releaseManifest(root, "owner/repo", "0.1.0")).rejects.toThrow();
});
