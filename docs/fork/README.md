# kevinhojae fork: Markdown paste + annotations above embeddables

Based on upstream `2.28.1` (`128a9ef4`). Keeps the upstream plugin id, so it
replaces the community build instead of running next to it.

## What it adds

- **Paste Markdown as embeddable** (canvas context menu and command palette,
  no default hotkey). Saves the clipboard text unchanged as a new note in
  `<drawing folder>/Excalidraw Cards/` and embeds it at the pointer. The note
  is named after its first line; existing notes are never overwritten, and
  deleting or undoing the card keeps the note.
- **Annotations above embeddables.** Elements that follow an embeddable in
  scene order are painted above it, so `A -> line -> B` shows the line over A
  and under B. Applies to every embeddable, not only pasted cards. This needs
  the engine fork: `kevinhojae/excalidraw`, branch
  `feat/embeddable-overlay-bands`.

## Build

Node 22+, the engine fork checked out at `../excalidraw` with `yarn install`
done (or set `EXCALIDRAW_FORK_ROOT`):

```bash
npm ci
node scripts/build-with-engine-fork.mjs   # builds the engine, then dist/
node --test scripts/testing/unit/*.test.ts
```

## Install and roll back

Disable the plugin (or quit Obsidian) first.

```bash
node scripts/install-local.mjs --vault <vault path>            # dry run
node scripts/install-local.mjs --vault <vault path> --apply    # back up + install
node scripts/install-local.mjs --vault <vault path> --rollback <backup dir>
```

Backups go to `~/Obsidian-plugin-backups/obsidian-excalidraw-plugin/<time>/`
and include `data.json`, which the script never writes. Updating Excalidraw
from Obsidian's community plugin list overwrites this build with upstream;
drawings and card notes stay intact, annotations then show beneath embeddables
again.

## Known limits

- Selection handles are still painted beneath embeddables (upstream behaviour).
- Each embeddable with elements above it adds one viewport-sized canvas.
  Drawings that interleave many embeddables with shapes use more memory.
- Annotations stay at their canvas position; they do not follow text when a
  card is scrolled or edited.
- Image export is unchanged: embeddables export as placeholders, as upstream.

## Verification (macOS, Apple silicon, Obsidian 1.14.4, test vault)

| Check | Result |
|---|---|
| Paste creates one live card, no prompts, note byte-identical to clipboard | pass |
| Multiple H1, code highlighting, Korean, table render to the end | pass |
| New card is selected after paste | pass |
| line / arrow / freedraw above a card, 50% opacity uniform across the border | pass |
| `A -> line -> B -> line` depth order, B transparent | pass |
| Drawing over a card with real pointer input, visible while drawing | pass |
| Activate card, drag-select text beneath annotations | pass |
| Send to back / undo follow the scene order | pass |
| Save, reload the vault window: order and layers persist | pass |
| PNG export still works | pass |
| Install / rollback script on the test vault | pass |
| Cmd+C clipboard content, editing in a card, Korean IME | not tested |
| Full app quit and restart | not tested |
| Dark theme, popout window, frames, rotation, groups | not tested |
| Existing back-of-note (code block) cards | not tested |
| 20 cards + 200 annotations performance | not tested |
