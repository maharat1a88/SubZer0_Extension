# SubZer0_Extension
# SubZer0 Agents

SubZer0 is the main extension. Agents are optional helper scripts injected by `background.js` when the popup asks for them.

An agent file should call:

```js
window.__SUBZER0_MAIN__.registerAgent({
  id: 'my-agent',
  name: 'My Agent',
  description: 'What it helps with',
  async run(payload, api) {
    return api.status('Agent ran');
  }
});
```

Available safe API methods:

- `api.searchReplace(payload)`
- `api.freeze({ lock: true })`
- `api.unfreeze()`
- `api.highlightDigits()`
- `api.openLiveEditor()`
- `api.undo()`
- `api.successReload()`
- `api.captureSnapshot()`
- `api.restoreSnapshot(snapshot)`
- `api.withSubZer0Mutation(fn)`
- `api.status(message, detail)`

Register new agent files in `background.js` under `AGENT_FILES`.

A Chrome extension project built by Tukaha.

## Installation
```bash
git clone git@github.com:maharat1a88/SubZer0_Extension.git
cd SubZer0_Extension
Features
Custom popup interface

Background script for automation

Manifest v3 support

When you click **Commit changes**, GitHub will render it beautifully — headings, lists, and code blocks will appear formatted.

---

### 🧠 Quick Tip
## Features
- Custom popup interface
- Background automation
- Manifest v3 support

## Usage
Load the extension in Chrome:
1. Go to chrome://extensions
2. Enable Developer Mode
3. Click “Load unpacked” and select your SubZer0_Extension folder
You can preview markdown directly in VS Code too:
- Open `README.md`
- Press **Ctrl + Shift + V** (Windows) or **Cmd + Shift + V** (Mac)
- It shows the formatted view side‑by‑side

---
# SubZer0_Extension
A Chrome extension project built by Tukaha.

## Installation
git clone git@github.com:maharat1a88/SubZer0_Extension.git
cd SubZer0_Extension

## Features
- Custom popup interface
- Background script for automation
- Manifest v3 support




