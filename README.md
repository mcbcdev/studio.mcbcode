# studio.mcbcode
developer ide for all things minecraft

## what is this?
a developer ide for all things minecraft

maybe a little less "beginner friendly bedrock editor" and more "i create addons like for real"

this is a better, more professional, cleaner, and more useful editor.

useful for both local files and massive mcbCode projects.

## how to use?
go to [studio.mcbcode](https://studio.mcbcode.com) and click the download icon on the right side of the url bar.
or use the in-browser version, whatever's fine.

## importing bedrock packs
in studio, choose **open file → open .mcpack / .mcaddon**. the pack opens as a temporary local workspace; edit text files in the explorer, then choose **file → export imported pack** to download the updated archive. imports are processed in the browser and aren't uploaded to your mcbCode account. PNG and TGA images can be previewed; OGG files play in the sound viewer, and FSB5 banks expose their samples with playback for browser-compatible PCM/MPEG streams. media previews are read-only and remain in the imported archive.

## bedrock workbench
- **workspace search** searches open text buffers and filenames in the active project. unopened cloud-file contents are not searched.
- **pack doctor** checks accessible `manifest.json` files for valid JSON, required header fields, UUIDs, versions, module declarations, dependencies, and referenced script entries. it is a static check, not a Minecraft runtime test.
- **function index** lists project `.mcfunction` files and extracts `function namespace:path` references from open function buffers.
- **file builder** generates a manifest, script starter, `functions/tick.json`, and a matching function file under `functions/` in scratch tabs. scratch tabs are not inserted into the active project; use **file > download active file** to save the selected tab, then place downloaded function files in the pack's `functions/` folder.
- **editor preferences** adjust font size, indentation, line numbers, and soft wrapping for this browser.
- **view → toggle console** shows or hides the latest Pack Doctor findings.

workspace search and editor find have different scopes: **edit → find** searches the active file, while the activity-bar search checks open buffers and project paths.

## source layout
the page markup and base styles are in `index.html`. `css/studio.css` contains only additive styles for the new panels. the app's javascript is split into ordered files in `js/` by feature area; `js/studio-workbench.js` contains the search, preferences, diagnostics, and builder tools. `js/local-files.js` handles local files and pack archive import/export.
