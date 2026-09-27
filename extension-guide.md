# Building a mcbCode Studio Extension

This is a reference for the `.studiomcbc` extension format used by mcbCode Studio
(studio.mcbcode.com). It describes what is **actually implemented right now**, not
where the format is eventually headed — anything declared-but-not-enforced is
called out explicitly so you don't build against a feature that doesn't run yet.

---

## 1. What a `.studiomcbc` file is

A `.studiomcbc` file is plain JSON with exactly two top-level keys:

```json
{
  "manifest": { ... },
  "code": "// raw javascript, as a single string"
}
```

- `manifest` — metadata + permission declarations (see section 2).
- `code` — the extension's actual JavaScript source, as one string. This runs
  inside a sandboxed `<iframe sandbox="allow-scripts">` with no access to the
  main page's DOM, cookies, or storage. The only way in or out is the small
  bridge API described in section 3.

There is no separate `main.js` file, no folder structure, and no zip — it's
one JSON file with the code inlined as a string.

## 2. The manifest object

```json
{
  "formatVersion": 1,
  "id": "yourname.your-extension",
  "name": "Your Extension",
  "version": "1.0.0",
  "description": "One sentence describing what it does.",
  "author": "Your Name",
  "main": "main.js",
  "icon": "https://example.com/icon.png",
  "permissions": {
    "network": ["https://api.example.com"],
    "workspace": ["read"],
    "editor": ["read"]
  },
  "contributes": {
    "commands": ["yourext.doThing"],
    "panels": [],
    "editor": {}
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `formatVersion` | number | Always `1` for now. |
| `id` | string | Must be unique. Convention: `namespace.extension-name` (e.g. `community.mcfunction-tools`). This is the key used everywhere (install, enable/disable, uninstall). |
| `name` | string | Display name shown in the Extensions manager. |
| `version` | string | Free-form (semver recommended). Not currently checked against anything. |
| `description` | string | Shown under the name in the manager and install-review screen. |
| `author` | string | Display only. |
| `main` | string | **Cosmetic only right now.** The runtime doesn't read a separate file — it executes `code` directly. Keep it for future-proofing, but don't rely on it doing anything today. |
| `icon` | string (https URL) | Loaded as a normal `<img src>` on the host page — any https URL works, it isn't restricted by the extension's own sandbox. |
| `permissions` | object | See section 4. |
| `contributes` | object | `commands` / `panels` / `editor` — declared for documentation purposes. **Not read or enforced by the UI yet** (it isn't shown in the manager, and doesn't need to match what your code actually registers). Fill it in honestly anyway so it's ready for when the manager starts using it. |

## 3. The runtime API (what your `code` can actually call)

Inside the sandboxed iframe, your code gets a `studio` global with **exactly
two working methods**:

```js
studio.ui.registerCommand({
  id: 'yourext.doThing',       // should match something in contributes.commands
  label: 'Do The Thing',       // shown next to the Run button in the manager
  run: function () {
    // your logic here
  }
});

studio.ui.registerStatusBarItem({
  id: 'yourext.status',
  text: 'Ready'                // plain text only, rendered with textContent (no HTML)
});
```

That's the entire surface area right now. Specifically:

- **`registerCommand`** — registers a function the user can trigger manually
  from the extension's **Manage → Commands** section in the Extensions
  manager (there's a "Run" button next to each one). There is no command
  palette, no keybinding, and no way to trigger it from elsewhere in the
  editor yet — the user has to open your extension's details and click Run.
- **`registerStatusBarItem`** — adds a text label to the status bar strip at
  the bottom of the editor. Text-only, updates require calling it again with
  a new item of the same `id` is not currently supported — call it once at
  startup.

Because the sandbox has `allow-scripts` but **not** `allow-same-origin`, your
code cannot:
- touch `document` on the parent page, read the open file's content, or edit
  the editor
- make real `fetch()` calls out to the internet (even to a URL you declared
  under `permissions.network` — see section 4)
- read `localStorage`, cookies, or anything else belonging to mcbcode.com

If your extension needs any of that, it isn't possible yet — build the
smallest thing that's useful within `registerCommand` +
`registerStatusBarItem` for now (e.g. a status bar reminder, a command that
opens a link with `window.open` — note even that runs *inside the iframe*, so
test that it actually pops a new tab rather than being blocked).

## 4. Permissions

```json
"permissions": {
  "network": ["https://api.example.com"],
  "workspace": ["read", "write"],
  "editor": ["read", "modify"],
  "ui": ["registerCommands", "registerPanels"],
  "bedrock": ["read", "modify"]
}
```

**Important:** every category below is *shown to the user* on the
install-review and permissions screens, so they know what you're asking for
— but only the `ui` capabilities that map to `registerCommand` /
`registerStatusBarItem` (section 3) are actually wired up to do anything.
`network`, `workspace`, `editor`, and `bedrock` permissions are declarative
only right now: listing them doesn't grant your code real access, and your
code can't actually reach those things yet regardless of what you declare.

Declare them anyway if your extension is designed around them — it costs
nothing, keeps the manifest honest about intent, and means you won't have to
change it later when those capabilities go live. Just don't ship an
extension whose *only* feature depends on one of these, because it won't
work today.

| Category | Example values | Currently enforced? |
|---|---|---|
| `network` | full URLs, e.g. `https://api.curseforge.com` | No — shown to the user, not actually reachable from the sandbox. |
| `workspace` | `read`, `write` | No — declarative only. |
| `editor` | `read`, `modify` | No — declarative only. |
| `ui` | `registerCommands`, `registerPanels`, `registerToolbarItems`, `registerStatusBarItems` | Partially — `registerCommand`/`registerStatusBarItem` calls work (section 3); the others aren't implemented, so declaring them is just a statement of intent. |
| `bedrock` | `read`, `modify` | No — declarative only. |

An extension with no `permissions` object at all is valid and shows
"This extension requests no special permissions."

## 5. A complete working example

Save this as `wiki-lite.studiomcbc`:

```json
{
  "manifest": {
    "formatVersion": 1,
    "id": "yourname.wiki-lite",
    "name": "Wiki Lite",
    "version": "1.0.0",
    "description": "Adds a status bar reminder and a command that opens the Bedrock wiki.",
    "author": "yourname",
    "main": "main.js",
    "icon": "https://mcbcode.com/img/icons/blank-transparent.png",
    "permissions": {
      "network": ["https://wiki.bedrock.dev"]
    },
    "contributes": {
      "commands": ["wikilite.open"],
      "panels": [],
      "editor": {}
    }
  },
  "code": "studio.ui.registerCommand({ id: 'wikilite.open', label: 'Open Bedrock Wiki', run: function () { window.open('https://wiki.bedrock.dev', '_blank'); } }); studio.ui.registerStatusBarItem({ id: 'wikilite.status', text: 'Wiki Lite ready' });"
}
```

Note `code` is a single string — if you're writing multi-line JS, either
keep it minified on one line as above, or `JSON.stringify()` your source so
newlines get escaped correctly rather than typing `\n` by hand.

## 6. Installing it

There's no public submission process yet — the Marketplace tab is a fixed,
hand-picked list. The only way to get an extension running today is:

1. Open **Extensions → Manage Extensions** (menu bar, or the Extensions icon
   in the activity bar).
2. **Install Extension ▾ → Import .studiomcbc**.
3. Pick your file. You'll land on the install-review screen showing your
   name, description, and the permissions you declared.
4. Click **Install Extension**.

Extensions installed this way are always marked **Unverified** (only the
hardcoded Marketplace entries can be Verified) and are stored in the
browser's `localStorage`, per-browser — not tied to your mcbCode account, so
they won't follow you to another device or browser yet.

## 7. Checklist before sharing a `.studiomcbc` file

- [ ] `manifest.id` is unique and namespaced (`yourname.thing`, not just `thing`)
- [ ] `code` is valid as a single JS string and only calls `studio.ui.registerCommand` / `studio.ui.registerStatusBarItem`
- [ ] every `permissions` category you list is one you'd be honest about even though most aren't enforced yet
- [ ] `contributes.commands` lists the same command ids your `code` actually registers
- [ ] you've tested it via **Import .studiomcbc** yourself before sending it to anyone else

## 8. Known limitations (as of this writing)

- No command palette or keybindings — commands only run via the manual
  "Run" button in the extension's details view.
- No real network, file, or editor access from extension code — only the UI
  bridge in section 3 works.
- No update mechanism — reinstalling an already-installed `id` just returns
  the existing record rather than overwriting it, so bump the file yourself
  and have users uninstall + reinstall for now.
- Extensions live in browser `localStorage`, not your mcbCode account —
  they don't sync across devices.
