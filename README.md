# studio.mcbcode

developer ide for all things minecraft

## what is this?

a developer ide for addon creators: professional, direct, and useful for both local packs and mcbCode cloud projects.

## how to use?

go to [studio.mcbcode](https://studio.mcbcode.com) and click the download icon on the right side of the url bar, or use the in-browser version.

## navigation and files

- **quick open** (`ctrl/cmd+p`) searches files in the active project and open editor tabs.
- **command palette** (`ctrl/cmd+shift+p`) runs editor, view, and Bedrock tool commands.
- the Explorer shows the active project's real file tree, or the tabs that are actually open. it shows **no files** when there is no project or open tab.
- **open file → open .mcpack / .mcaddon** imports a temporary local workspace. imports stay in the browser and are not uploaded to mcbCode. PNG/TGA images and supported audio formats have read-only previews.

## search and Bedrock tools

- **workspace search** checks open buffers and project paths. choose **Search all project files** to explicitly scan text-file contents, including unopened cloud files. scans are bounded to 300 files, 2 mb per file, and 32 mb total; unavailable and oversized files are reported. regular expressions are length-limited and reject common nested-repetition patterns for search safety.
- project-wide replace is review-first. inspect the preview, then apply it. cloud changes are saved only after choosing **Apply replacements**; imported-pack edits remain in the browser until the pack is exported.
- **Tools → Pack Doctor** checks accessible manifests and references. **Tools → Function Index** lists `.mcfunction` files and open-buffer call references. **Tools → File Builder** generates common pack files; it adds them to an imported pack when a valid destination exists, otherwise it opens scratch tabs. the current cloud api does not expose project file creation.
- JSON editors offer conservative Bedrock key/value hints with `ctrl/cmd+space` and manifest structure diagnostics. these are guidance, not a complete versioned schema or Minecraft runtime test. identifiers are suggested from open buffers and may be incomplete.
- **view → preview geometry** renders supported `minecraft:geometry` cubes as a live isometric preview. cube rotations, textures, and animations are not rendered yet.
- **Preferences → Bedrock authoring profile** stores a target Minecraft version and optional experiment notes per workspace in this browser. profile values do not modify pack files or replace testing in game.
- **view → toggle console** shows the latest Pack Doctor findings.

editor find (`edit → find`) searches only the active file; workspace search covers files and paths in the project.

## source layout

the page shell is `index.html`; additive interface styles live in `css/studio.css`. JavaScript is split by feature under `js/`: `command-palette.js` handles quick open and commands, `project-search.js` handles explicit project-content scans and reviewed replacement, `bedrock-intelligence.js` provides editor hints, `geometry-preview.js` renders basic geometry, `studio-workbench.js` contains Bedrock tools and preferences, and `local-files.js` handles archive import, export, and local file creation. `cloud-projects.js` handles project browsing and cloud file access.
