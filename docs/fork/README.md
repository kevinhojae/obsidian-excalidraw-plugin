# kevinhojae fork: Markdown paste + annotations above embeddables

Based on upstream `2.28.1` (`128a9ef4`). Keeps the upstream plugin id, so it
replaces the community build instead of running next to it.

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
  the engine fork: `kevinhojae/excalidraw`, branch
  `feat/embeddable-overlay-bands`.

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
the current stroke color.

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
| Cmd+C of selected card text | blocked: a synthetic key press copied the element instead; needs one manual check |
| Editing in a card, Korean IME | not tested |
| Full app quit and restart | not tested |
| Popout window, frames, rotation, groups | not tested |
| Pan / zoom frame times with 20 cards + 200 annotations | not tested |
