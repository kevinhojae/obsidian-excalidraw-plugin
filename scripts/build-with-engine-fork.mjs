/**
 * Build the plugin against the local engine fork (../excalidraw or
 * EXCALIDRAW_FORK_ROOT) instead of the published @zsviczian/excalidraw package.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forkRoot = resolve(
  process.env.EXCALIDRAW_FORK_ROOT || join(pluginRoot, "../excalidraw"),
);
const run = (file, args, cwd) =>
  execFileSync(file, args, { cwd, stdio: "inherit" });
const revision = (root) =>
  execFileSync("git", ["describe", "--always", "--dirty"], { cwd: root })
    .toString()
    .trim();

run("yarn", ["build:obsidian"], join(forkRoot, "packages/excalidraw"));
for (const name of [
  "excalidraw.production.min.js",
  "excalidraw.production.min.css",
  "excalidraw.development.js",
  "excalidraw.development.css",
]) {
  copyFileSync(
    join(forkRoot, "packages/excalidraw/dist/obsidian", name),
    join(pluginRoot, "node_modules/@zsviczian/excalidraw/dist/obsidian", name),
  );
}
run("npm", ["run", "build"], pluginRoot);
console.log(`plugin ${revision(pluginRoot)} built with engine ${revision(forkRoot)}`);
