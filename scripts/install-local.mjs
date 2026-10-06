/**
 * Replace the Excalidraw plugin of a vault with the build in dist/.
 *
 *   node scripts/install-local.mjs --vault <path>             dry run
 *   node scripts/install-local.mjs --vault <path> --apply     back up, then install
 *   node scripts/install-local.mjs --vault <path> --rollback <backup dir>
 *
 * data.json (the plugin settings) is backed up but never written.
 * Disable the plugin or quit Obsidian before --apply / --rollback.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "obsidian-excalidraw-plugin";
const FILES = ["main.js", "styles.css", "manifest.json"];
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const hash = (path) =>
  existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex")
    : null;
const version = (dir) =>
  JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).version;

const vault = option("--vault");
if (!vault) {
  fail("--vault <path> is required");
}
const target = join(resolve(vault), ".obsidian/plugins", PLUGIN_ID);
if (!existsSync(target) || lstatSync(target).isSymbolicLink()) {
  fail(`Not an installed plugin folder (or a symlink): ${target}`);
}
if (JSON.parse(readFileSync(join(target, "manifest.json"), "utf8")).id !== PLUGIN_ID) {
  fail(`Unexpected plugin id in ${target}/manifest.json`);
}

const rollback = option("--rollback");
const source = rollback ? resolve(rollback) : join(pluginRoot, "dist");
for (const name of FILES) {
  if (!existsSync(join(source, name))) {
    fail(`Missing ${join(source, name)}`);
  }
}

console.log(`target:  ${target} (version ${version(target)})`);
console.log(`source:  ${source} (version ${version(source)})`);
for (const name of FILES) {
  const same = hash(join(source, name)) === hash(join(target, name));
  console.log(`  ${name}: ${same ? "unchanged" : "will be replaced"}`);
}
if (!args.includes("--apply") && !rollback) {
  console.log("Dry run. Re-run with --apply to back up and install.");
  process.exit(0);
}

const backup = join(
  homedir(),
  "Obsidian-plugin-backups",
  PLUGIN_ID,
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(backup, { recursive: true });
const record = { vault: resolve(vault), version: version(target), files: {} };
for (const name of [...FILES, "data.json"]) {
  if (existsSync(join(target, name))) {
    copyFileSync(join(target, name), join(backup, name));
    record.files[name] = hash(join(backup, name));
  }
}
writeFileSync(join(backup, "backup.json"), JSON.stringify(record, null, 2));
console.log(`backup:  ${backup}`);

for (const name of FILES) {
  // write next to the target and rename, so a sync client never sees a partial file
  const staged = join(target, `${name}.installing`);
  copyFileSync(join(source, name), staged);
  renameSync(staged, join(target, name));
}
console.log(`installed. To undo: node scripts/install-local.mjs --vault "${vault}" --rollback "${backup}"`);
