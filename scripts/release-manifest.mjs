import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function releaseManifest(
  directory,
  repository,
  version,
  notes = "",
) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)
  )
    throw new Error("Invalid release repository/version");
  const all = [];
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(full);
      else all.push(full);
    }
  }
  await scan(directory);
  const platforms = {};
  const files = [];
  for (const [platform, pattern] of [
    ["windows-x86_64", /\.exe$/i],
    ["darwin-aarch64", /_aarch64\.app\.tar\.gz$/],
    ["darwin-x86_64", /_x64\.app\.tar\.gz$/],
  ]) {
    const candidates = all.filter((file) => pattern.test(path.basename(file)));
    if (candidates.length !== 1)
      throw new Error(
        `${platform}: expected exactly one signed updater artifact, found ${candidates.length}`,
      );
    const file = candidates[0];
    const signature = (await readFile(file + ".sig", "utf8")).trim();
    const decoded = Buffer.from(signature, "base64").toString("utf8");
    if (
      !decoded.startsWith("untrusted comment:") ||
      !decoded.includes("trusted comment:")
    )
      throw new Error(`Invalid signature envelope: ${file}`);
    platforms[platform] = {
      signature,
      url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(path.basename(file))}`,
    };
    files.push(file, file + ".sig");
  }
  files.push(...all.filter((file) => /\.dmg$/i.test(file)));
  if (files.filter((f) => f.endsWith(".dmg")).length !== 2)
    throw new Error("Expected both macOS disk images");
  if (new Set(files.map((file) => path.basename(file))).size !== files.length)
    throw new Error("Release asset names collide");
  if (files.some((file) => !/^[A-Za-z0-9._-]+$/.test(path.basename(file))))
    throw new Error(
      "Release assets require ASCII names; GitHub rewrites other names",
    );
  return {
    manifest: { version, notes, pub_date: new Date().toISOString(), platforms },
    files,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [
    directory = "artifacts",
    repository = process.env.GITHUB_REPOSITORY,
    version,
    notesFile,
  ] = process.argv.slice(2);
  const notes = notesFile ? await readFile(notesFile, "utf8") : "";
  const result = await releaseManifest(directory, repository, version, notes);
  await writeFile(
    path.join(directory, "latest.json"),
    JSON.stringify(result.manifest, null, 2) + "\n",
  );
  console.log(
    `Validated ${Object.keys(result.manifest.platforms).length} signed update targets.`,
  );
}
