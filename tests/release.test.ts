import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
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
    ["win", "guqin.exe"],
    ["arm", "guqin_aarch64.app.tar.gz"],
  ]) {
    const folder = path.join(root, dir);
    await mkdir(folder);
    await writeFile(path.join(folder, name), "fixture");
    await writeFile(path.join(folder, name + ".sig"), sig);
    if (dir !== "win")
      await writeFile(path.join(folder, "guqin_aarch64.dmg"), "fixture");
  }
  const { manifest, files } = await releaseManifest(
    root,
    "owner/repo",
    "0.1.0",
    "notes",
  );
  expect(Object.keys(manifest.platforms)).toEqual([
    "windows-x86_64",
    "darwin-aarch64",
  ]);
  expect(files).toHaveLength(5);
  expect(manifest.platforms["windows-x86_64"].url).toContain("/guqin.exe");
  const intel = path.join(root, "arm", "guqin_x64.app.tar.gz");
  await writeFile(intel, "unsupported");
  await expect(releaseManifest(root, "owner/repo", "0.1.0")).rejects.toThrow(
    "macOS Intel",
  );
  await rm(intel);
  await rename(
    path.join(root, "arm", "guqin_aarch64.dmg"),
    path.join(root, "arm", "琴笺.dmg"),
  );
  await expect(releaseManifest(root, "owner/repo", "0.1.0")).rejects.toThrow(
    "ASCII",
  );
  await rm(path.join(root, "win", "guqin.exe.sig"));
  await expect(releaseManifest(root, "owner/repo", "0.1.0")).rejects.toThrow();
});
