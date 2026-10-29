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
in studio, choose **open file → open .mcpack / .mcaddon**. the pack opens as a temporary local workspace; edit text files in the explorer, then choose **file → export imported pack** to download the updated archive. imports are processed in the browser and aren't uploaded to your mcbCode account. binary assets can be kept in the archive but aren't editable in the text editor.

## source layout
the page markup and styles are in `index.html`. the app's javascript is split into ordered files in `js/` by feature area. `js/local-files.js` handles local files and pack archive import/export.
