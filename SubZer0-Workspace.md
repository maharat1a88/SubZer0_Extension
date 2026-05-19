SubZer0-Workspace/
├── .git/                  <-- Initialize Git here to save all history
├── extension/             <-- The Chrome Extension (Unpacked)
│   ├── manifest.json      (V3 Manifest)
│   ├── background.js      (The Command Bridge)
│   ├── popup.html         (The Dashboard UI)
│   ├── popup.js           (Button Logic)
│   └── icon.png
├── server/                <-- Your Local "Safe" Backend
│   ├── devtool.js         (THE SOURCE OF TRUTH - All your logic here)
│   ├── devtool-server.js  (Node/Deno server to host the file)
│   └── start-server.ps1   (PowerShell script to launch)
└── snippets/
    └── console-load.txt   (The fallback one-liner)