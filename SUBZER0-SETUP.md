# SubZer0 Setup

SubZer0 is the main Chrome extension. Helper agents live in `agents/` and are loaded by `background.js` only when the popup asks for them.

## Load The Extension

1. Open Chrome or Edge.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Turn on Developer mode.
4. Choose **Load unpacked**.
5. Select:

```text
C:\Users\ashc0\OneDrive\SubZer0_Extension
```

## Optional Local Backend

The extension works without the backend. Start the backend only when you want local smart matching or helper-folder discovery.

```powershell
cd "C:\Users\ashc0\OneDrive\SubZer0_Extension"
.\start-subzer0-server.ps1
```

Health check:

```text
http://127.0.0.1:8787/health
```

## Agents

Current agents:

- `smart-replace`: wide visible/hidden search and replace helper
- `freeze-guardian`: freeze helper that locks live DOM changes

To add another agent:

1. Create a file in `agents/`.
2. Register it with `window.__SUBZER0_MAIN__.registerAgent(...)`.
3. Add the file path to `AGENT_FILES` in `background.js`.

No API token is needed for the current setup.
