# kevinhojae fork: Markdown paste + annotations above embeddables

Based on upstream `2.29.2` (engine `0.18.147`). Keeps the upstream plugin id,
so it replaces the community build instead of running next to it.

This file is the inventory of what the fork must keep working. Add every new
fork feature here, with a row in the verification table, and re-run the table
after each upstream merge.

## What it adds

- **Paste Markdown as embeddable** (canvas context menu and command palette,
  no default hotkey). Saves the clipboard text unchanged as a new note in
  `<drawing folder>/Excalidraw Cards/` and embeds it at the pointer. The note
  gets a unique id as its name (`<timestamp>-<random>.md`); existing notes are
  never overwritten, and deleting or undoing the card keeps the note.
- **Annotations above embeddables.** Elements that follow an embeddable in
  scene order are painted above it, so `A -> line -> B` shows the line over A
  and under B, and clicking such an element selects it rather than the
  embeddable beneath. Applies to every embeddable, not only pasted cards. This needs
  the engine fork: `kevinhojae/excalidraw`, branch `master`.
- **Vault `.html` embeds.** `[[x.html]]` embeddables render the file in an
  iframe `srcdoc` with the same sandbox and CSP as `data:` URLs. Dropping an
  `.html` file on the canvas inserts it as an embeddable.
- **Option+drag selects text in Markdown embeds.** While Option (Alt) is held,
  Markdown cards take the pointer and the interactive canvas drops beneath
  them, so rendered text can be drag-selected without activating the card or
  entering edit mode. Works on locked elements. Option+drag duplication is
  unavailable over Markdown cards; Cmd+D still duplicates.
- **Copy canvas annotations as feedback** (command
  `excalidraw-export-canvas-annotations`). Turns the selected document card and
  the pen marks and sticky notes on it into plannotator-style "Markdown
  Annotations" with file path, line numbers and quoted source text, and copies
  it to the clipboard. Pairing comments with marks uses `claude -p`; see
  `docs/superpowers/specs/2026-11-05-canvas-annotation-export-design.md`.
- **Shortcuts on non-Latin keyboard layouts** (engine fork). Tool and picker
  single-letter shortcuts work with Korean 2-set input.

Vault setting, not code: `modifierKeyOverrides` in the vault's `data.json`
adds `Mod+d` and `Mod+Shift+l` so these Excalidraw shortcuts are not consumed
by Obsidian hotkeys. The install script never writes `data.json`.

## Build

Node 22+, the engine fork checked out at `../excalidraw` with `yarn install`
done (or set `EXCALIDRAW_FORK_ROOT`):

```bash
npm ci
node scripts/build-with-engine-fork.mjs   # builds the engine, then dist/
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

It also fixes an upstream glitch: enlarging a Markdown embeddable left the
newly revealed area blank until the card was edited, because the reading view
was never told about the new size.

Pasted cards (Markdown and code block) get a transparent border regardless of
the current stroke color, and their height is fitted to the rendered note
(80 to 10000 px; a longer note scrolls inside the card). They are 800 px wide.

## Known limits

- Selection handles are painted above embeddables, except while an embeddable
  is active (it then has to receive the pointer).
- Each visible embeddable with elements above it adds one viewport-sized
  canvas. Measured worst case: 20 cards with 10 lines after each, all on
  screen, created 21 canvases of 1164x1741 px, about 170 MB of canvas memory
  in a half-width pane (roughly 2.5x that in a full window).
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
| Activate card, drag-select a full sentence beneath annotations | pass |
| Pasted card links by full vault path | pass |
| Existing back-of-note (code block) card with an arrow above it | pass |
| Dark theme: annotations above cards | pass |
| Click a line / shape above a card selects it; bare card area selects the card; card centre activates it | pass |
| Enlarging a card renders the newly revealed part of the note | pass (scripted resize) |
| Selection handles of a line above a card are visible; an activated card still takes the pointer; outside click deactivates | pass |
| Pasted Markdown and code block cards have a transparent border | pass |
| Send to back / undo follow the scene order | pass |
| Save, reload the vault window: order and layers persist | pass |
| PNG export still works | pass |
| Install / rollback script on the test vault | pass |
| `[[x.html]]` embed renders inside a sandboxed iframe (postMessage probe) | pass |
| Option held: hit-test over Markdown card text returns the text, not the canvas; click neither selects nor activates the card; release restores | pass (scripted) |
| Option+drag text selection in a Markdown card, also on a locked element | pass (manual) |
| Copy canvas annotations: quotes and line numbers match the source note | not recorded here yet |
| Tool shortcuts with Korean 2-set input | not recorded here yet |
| Cmd+C of selected card text | blocked: a synthetic key press copied the element instead; needs one manual check |
| Editing in a card, Korean IME | not tested |
| Full app quit and restart | not tested |
| Popout window, frames, rotation, groups | not tested |
| Pan / zoom frame times with 20 cards + 200 annotations | not tested |
