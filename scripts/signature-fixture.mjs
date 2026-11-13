import { readFile, writeFile } from "node:fs/promises";
const [publicFile] = process.argv.slice(2);
await writeFile(
  "tests/fixtures/signing-public.txt",
  Buffer.from((await readFile(publicFile, "utf8")).trim(), "base64"),
);
await writeFile(
  "tests/fixtures/signing-signature.txt",
  Buffer.from(
    (await readFile("tests/fixtures/signed-payload.bin.sig", "utf8")).trim(),
    "base64",
  ),
);
