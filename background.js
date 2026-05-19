/// SubZer0 background bridge.
// This keeps devtool.js as the main brain and injects helper agents only when needed.

const MAIN_FILE = 'devtool.js';

const AGENT_FILES = {
  'smart-replace': 'agents/smart-replace-agent.js',
  'freeze-guardian': 'agents/freeze-guardian-agent.js',
  'network-agent': 'agents/network-agent.js'
};

async function getActiveTabId(tabId) {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ping(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: 'PING' });
  } catch (error) {
    return null;
  }
}

async function ensureMain(tabId) {
  const existing = await ping(tabId);
  if (existing?.status === 'ready') return existing;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [MAIN_FILE]
  });

  return ping(tabId);
}

async function injectAgent(tabId, agentId) {
  const file = AGENT_FILES[agentId];
  if (!file) throw new Error('Unknown agent: ' + agentId);

  await ensureMain(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [file]
  });
}

async function runCommand(request) {
  const tabId = await getActiveTabId(request.tabId);
  if (!tabId) throw new Error('No active tab available');

  await ensureMain(tabId);

  if (request.agentId) {
    await injectAgent(tabId, request.agentId);
    return chrome.tabs.sendMessage(tabId, {
      action: 'RUN_AGENT',
      data: {
        agentId: request.agentId,
        payload: request.data || {}
      }
    });
  }

  return chrome.tabs.sendMessage(tabId, {
    action: request.action || request.feature,
    data: request.data || {}
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.type?.startsWith('SUBZER0_')) return false;

  runCommand(request).then(sendResponse).catch(error => {
    console.error('[SubZer0] Background command failed', error);
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});
