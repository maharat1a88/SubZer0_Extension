const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8787';

document.addEventListener('DOMContentLoaded', async () => {
  const backendUrl = document.getElementById('backendUrl');
  const saved = await chrome.storage.local.get({ backendUrl: DEFAULT_BACKEND_URL });
  backendUrl.value = saved.backendUrl;

  backendUrl.addEventListener('change', () => {
    chrome.storage.local.set({ backendUrl: backendUrl.value.trim() || DEFAULT_BACKEND_URL });
  });

  bind('freezeBtn', () => send('FREEZE', { lock: true }));
  bind('unfreezeBtn', () => send('UNFREEZE'));
  bind('liveEditBtn', () => send('LIVE_EDIT'));
  bind('successBtn', () => send('SUCCESS_RELOAD'));
  bind('highlightBtn', () => send('HIGHLIGHT'));
  bind('undoBtn', () => send('UNDO'));
  bind('searchReplaceBtn', () => send('SEARCH_REPLACE', getReplacePayload()));
  bind('agentReplaceBtn', () => sendAgent('smart-replace', getReplacePayload()));
  bind('freezeAgentBtn', () => sendAgent('freeze-guardian', { lock: true }));
});

function bind(id, fn) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function getReplacePayload() {
  return {
    s: document.getElementById('searchTerm').value,
    r: document.getElementById('replaceTerm').value,
    scope: document.getElementById('scope').value,
    visibleOnly: document.getElementById('visibleOnly').checked,
    smart: document.getElementById('smart').checked,
    includeCode: document.getElementById('includeCode').checked,
    backendSmart: document.getElementById('backendSmart').checked,
    backendUrl: document.getElementById('backendUrl').value.trim() || DEFAULT_BACKEND_URL,
    includeAttributes: true,
    includeForms: true,
    includeComments: true
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(action, data = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) return setStatus('No active tab');

  chrome.runtime.sendMessage({
    type: 'SUBZER0_EXEC',
    tabId: tab.id,
    action,
    data
  }, setStatusFromResponse);
}

async function sendAgent(agentId, data = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) return setStatus('No active tab');

  chrome.runtime.sendMessage({
    type: 'SUBZER0_AGENT',
    tabId: tab.id,
    agentId,
    data
  }, setStatusFromResponse);
}

function setStatusFromResponse(response) {
  if (chrome.runtime.lastError) {
    setStatus(chrome.runtime.lastError.message);
    return;
  }

  if (!response) {
    setStatus('No response');
    return;
  }

  if (response.error) {
    setStatus(response.error);
    return;
  }

  if (response.detail?.total !== undefined) {
    setStatus('Updated ' + response.detail.total + ' matches');
    return;
  }

  setStatus(response.message || 'Done');
}

function setStatus(message) {
  const status = document.getElementById('status');
  if (status) status.textContent = message;
}
