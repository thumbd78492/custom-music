import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const provenance = JSON.parse(
  readFileSync(path.join(root, "docs/sample-provenance.json"), "utf8"),
);
let files = 0;
let bytes = 0;
for (const [id, instrument] of Object.entries(provenance.instruments)) {
  if (
    instrument.license !== "CC0-1.0" ||
    !instrument.licenseVerifiedBeforeDownload
  )
    throw new Error(`${id}: missing reviewed redistribution license`);
  const license = readFileSync(
    path.join(root, `src/instruments/${id}/samples/LICENSE-CC0.txt`),
  );
  if (
    createHash("sha256").update(license).digest("hex") !==
    instrument.licenseSha256
  )
    throw new Error(`${id}: license changed`);
  let total = 0;
  for (const sample of instrument.files) {
    const prefix = `src/instruments/${id}/samples/`;
    if (!sample.file.startsWith(prefix) || sample.file.includes(".."))
      throw new Error(`${id}: sample escapes its plugin`);
    const file = path.join(root, sample.file);
    const data = readFileSync(file);
    if (createHash("sha256").update(data).digest("hex") !== sample.outputSha256)
      throw new Error(`Hash mismatch: ${sample.file}`);
    if (data.length !== sample.outputBytes || statSync(file).size < 100)
      throw new Error(`Size mismatch: ${sample.file}`);
    const header = data.toString("ascii", 0, 4);
    if (header !== "RIFF" && header !== "fLaC")
      throw new Error(`Invalid audio header: ${sample.file}`);
    total += data.length;
    files++;
  }
  if (total !== instrument.totalOutputBytes)
    throw new Error(`${id}: total size mismatch`);
  bytes += total;
  console.log(
    `${id}: ${instrument.files.length} CC0 audio files, ${total} bytes; all SHA-256 match`,
  );
}
console.log(
  `PASS: ${files} verified sample files, ${bytes} bytes. Source identity is recorded in docs/sample-provenance.json.`,
);
