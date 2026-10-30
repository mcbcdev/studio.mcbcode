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
in studio, choose **open file → open .mcpack / .mcaddon**. the pack opens as a temporary local workspace; edit text files in the explorer, then choose **file → export imported pack** to download the updated archive. imports are processed in the browser and aren't uploaded to your mcbCode account. PNG and TGA images can be previewed; OGG files play in the sound viewer, and FSB5 banks expose their samples with playback for browser-compatible PCM/MPEG streams. Media previews are read-only and remain in the imported archive.

## source layout
the page markup and base styles are in `index.html`; `css/studio.css` contains the refreshed workbench theme and responsive layout. the app's javascript is split into ordered files in `js/` by feature area. `js/local-files.js` handles local files and pack archive import/export, while `js/studio-workbench.js` provides search, editor preferences, pack checks, and starter generators.

## workbench tools

- **workspace search** searches file names across the active project and text inside files already open in editor tabs. it does not download unopened cloud-file contents in the background; use the editor's find bar for the active file.
- **editor preferences** keeps font size, indentation style, line numbers, and soft wrap settings in local browser storage.
- **bedrock workbench** includes a static manifest/UUID/module checker, a `.mcfunction` index, and starter generators for manifests and function registration files. generated files open in scratch tabs and can be downloaded with **file → download active file**; they are not silently inserted into cloud projects or imported archives.
- **problems panel** displays pack doctor findings. it is not a Minecraft runtime or command console, so it does not claim to test in-game behavior.
