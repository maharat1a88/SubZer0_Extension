(() => {
  const VERSION = '3.0.0';
  const TOOL_KEY = '__SUBZER0_MAIN__';
  const FREEZE_STYLE_ID = 'subzer0-freeze-style';
  const FREEZE_LAYER_ID = 'subzer0-freeze-layer';
  const DIGIT_CLASS = 'subzer0-digit';
  const DIGIT_STYLE_ID = 'subzer0-digit-style';
  const LIVE_PANEL_ID = 'subzer0-live-panel';
  const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8787';

  if (window[TOOL_KEY]) {
    window[TOOL_KEY].status('SubZer0 main already loaded');
    return;
  }

  const state = {
    frozen: false,
    scrollX: 0,
    scrollY: 0,
    freezeSnapshot: null,
    freezeObserver: null,
    freezeTimer: null,
    freezePaused: false,
    freezeRestoring: false,
    frozenMedia: [],
    agents: new Map(),
    history: []
  };

  function status(message, detail) {
    const label = '[SubZer0] ' + message;
    if (detail) {
      console.log(label, detail);
    } else {
      console.log(label);
    }
    return { ok: true, message, detail };
  }

  function isToolNode(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return Boolean(el && el.closest('[data-subzer0-tool="true"]'));
  }

  function isVisible(el) {
    if (!el || el === document.documentElement || el === document.body) return true;
    const style = getComputedStyle(el);
    return !(
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      (el.getClientRects().length === 0 && el.offsetWidth === 0 && el.offsetHeight === 0)
    );
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildMatcher(find, options = {}) {
    if (!find) return null;

    const flags = options.caseSensitive ? 'g' : 'gi';
    if (options.matcherPattern) {
      try {
        return new RegExp(options.matcherPattern, options.matcherFlags || flags);
      } catch (error) {
        console.warn('[SubZer0] Invalid backend matcher, falling back', error);
      }
    }

    const source = options.smart
      ? String(find)
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(escapeRegExp)
          .join('[\\s\\-_.,:;\\/\\\\]*')
      : escapeRegExp(find);

    if (!source) return null;
    return new RegExp(source, flags);
  }

  function countMatches(value, matcher) {
    if (typeof value !== 'string') return 0;
    matcher.lastIndex = 0;
    const matches = value.match(matcher);
    matcher.lastIndex = 0;
    return matches ? matches.length : 0;
  }

  function replaceString(value, matcher, replacement) {
    if (typeof value !== 'string') return null;
    matcher.lastIndex = 0;
    if (!matcher.test(value)) return null;
    matcher.lastIndex = 0;
    return value.replace(matcher, () => replacement);
  }

  function detachToolNodes() {
    const nodes = Array.from(document.querySelectorAll('[data-subzer0-tool="true"]'));
    nodes.forEach(node => node.remove());
    return nodes;
  }

  function reattachToolNodes(nodes) {
    nodes.forEach(node => {
      if (!node.isConnected) document.body.appendChild(node);
    });
  }

  function captureSnapshot() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-subzer0-tool="true"]').forEach(node => node.remove());
    return {
      html: clone.outerHTML,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot?.html) return false;

    const toolNodes = detachToolNodes();
    const parsed = new DOMParser().parseFromString(snapshot.html, 'text/html');

    Array.from(document.documentElement.attributes).forEach(attr => {
      document.documentElement.removeAttribute(attr.name);
    });
    Array.from(parsed.documentElement.attributes).forEach(attr => {
      document.documentElement.setAttribute(attr.name, attr.value);
    });

    document.head.innerHTML = parsed.head ? parsed.head.innerHTML : '';
    document.body.innerHTML = parsed.body ? parsed.body.innerHTML : '';
    reattachToolNodes(toolNodes);
    ensureDigitStyle();
    window.scrollTo(snapshot.scrollX || 0, snapshot.scrollY || 0);
    return true;
  }

  function withSubZer0Mutation(fn) {
    state.freezePaused = true;
    try {
      const result = fn();
      if (state.frozen) refreshFreezeSnapshot();
      return result;
    } finally {
      setTimeout(() => {
        state.freezePaused = false;
      }, 0);
    }
  }

  function refreshFreezeSnapshot() {
    if (!state.frozen) return;
    state.freezeSnapshot = captureSnapshot();
  }

  function startFreezeLock() {
    stopFreezeLock();
    state.freezeSnapshot = captureSnapshot();
    state.freezeObserver = new MutationObserver(mutations => {
      if (!state.frozen || state.freezePaused || state.freezeRestoring) return;
      if (!mutations.some(mutation => !isToolNode(mutation.target))) return;
      scheduleFreezeRestore();
    });
    state.freezeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  function stopFreezeLock() {
    state.freezeObserver?.disconnect();
    state.freezeObserver = null;
    state.freezeSnapshot = null;
    clearTimeout(state.freezeTimer);
    state.freezeTimer = null;
  }

  function scheduleFreezeRestore() {
    if (state.freezeTimer) return;
    state.freezeTimer = setTimeout(() => {
      state.freezeTimer = null;
      restoreFrozenDom();
    }, 25);
  }

  function restoreFrozenDom() {
    if (!state.freezeSnapshot || state.freezePaused || state.freezeRestoring) return;
    state.freezeRestoring = true;
    restoreSnapshot(state.freezeSnapshot);
    setTimeout(() => {
      state.freezeRestoring = false;
    }, 0);
  }

  function freeze(options = {}) {
    if (state.frozen) return status('Freeze already active');

    state.frozen = true;
    state.scrollX = window.scrollX;
    state.scrollY = window.scrollY;

    document.body.style.position = 'fixed';
    document.body.style.top = '-' + state.scrollY + 'px';
    document.body.style.left = '-' + state.scrollX + 'px';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    const style = document.createElement('style');
    style.id = FREEZE_STYLE_ID;
    style.textContent = `
      *, *::before, *::after {
        animation-play-state: paused !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
      html, body { overscroll-behavior: none !important; }
    `;
    document.head.appendChild(style);

    state.frozenMedia = [];
    document.querySelectorAll('video,audio').forEach(media => {
      try {
        state.frozenMedia.push({ media, paused: media.paused });
        media.pause();
      } catch (error) {}
    });

    const layer = document.createElement('div');
    layer.id = FREEZE_LAYER_ID;
    layer.setAttribute('data-subzer0-tool', 'true');
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.12)',
      zIndex: '2147483646',
      pointerEvents: 'none'
    });
    document.body.appendChild(layer);

    if (options.lock !== false) startFreezeLock();
    return status('Freeze active', { lock: options.lock !== false });
  }

  function unfreeze() {
    if (!state.frozen) return status('Freeze already off');

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(state.scrollX, state.scrollY);

    document.getElementById(FREEZE_LAYER_ID)?.remove();
    document.getElementById(FREEZE_STYLE_ID)?.remove();
    stopFreezeLock();

    state.frozenMedia.forEach(({ media, paused }) => {
      if (!paused && media.isConnected) {
        try {
          media.play();
        } catch (error) {}
      }
    });
    state.frozenMedia = [];
    state.frozen = false;
    return status('Freeze off');
  }

  async function getBackendMatcher(find, options = {}) {
    if (!options.backendSmart) return options;

    const backendUrl = (options.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
    try {
      const response = await fetch(backendUrl + '/api/smart-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          find,
          smart: options.smart !== false,
          caseSensitive: Boolean(options.caseSensitive)
        })
      });

      if (!response.ok) throw new Error('Backend returned ' + response.status);
      const data = await response.json();
      if (!data.pattern) return options;

      return {
        ...options,
        matcherPattern: data.pattern,
        matcherFlags: data.flags || (options.caseSensitive ? 'g' : 'gi')
      };
    } catch (error) {
      console.warn('[SubZer0] Backend smart search unavailable, using local matcher', error);
      return options;
    }
  }

  function shouldSkipElement(el, options = {}) {
    if (!el || isToolNode(el)) return true;
    if (options.visibleOnly && document.body.contains(el) && !isVisible(el)) return true;
    return false;
  }

  function replaceTextNodes(matcher, replacement, options, detail) {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent, options)) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return countMatches(node.nodeValue, matcher) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const matches = countMatches(node.nodeValue, matcher);
      const next = replaceString(node.nodeValue, matcher, replacement);
      if (next === null) return;
      node.nodeValue = next;
      detail.text += matches;
    });
  }

  function replaceAttributes(matcher, replacement, options, detail) {
    document.querySelectorAll('*').forEach(el => {
      if (shouldSkipElement(el, options)) return;
      Array.from(el.attributes).forEach(attr => {
        const matches = countMatches(attr.value, matcher);
        if (!matches) return;
        const next = replaceString(attr.value, matcher, replacement);
        if (next === null) return;
        el.setAttribute(attr.name, next);
        detail.attributes += matches;
      });
    });
  }

  function replaceFormValues(matcher, replacement, options, detail) {
    document.querySelectorAll('input, textarea, select, option').forEach(el => {
      if (shouldSkipElement(el, options) || !('value' in el)) return;
      const matches = countMatches(el.value, matcher);
      if (!matches) return;
      const next = replaceString(el.value, matcher, replacement);
      if (next === null) return;
      el.value = next;
      if (el.hasAttribute('value')) el.setAttribute('value', next);
      detail.forms += matches;
    });
  }

  function replaceComments(matcher, replacement, options, detail) {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT, {
      acceptNode(node) {
        if (node.parentElement && shouldSkipElement(node.parentElement, options)) {
          return NodeFilter.FILTER_REJECT;
        }
        return countMatches(node.nodeValue, matcher) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const matches = countMatches(node.nodeValue, matcher);
      const next = replaceString(node.nodeValue, matcher, replacement);
      if (next === null) return;
      node.nodeValue = next;
      detail.comments += matches;
    });
  }

  function replaceScriptAndStyle(matcher, replacement, options, detail) {
    document.querySelectorAll('script, style, noscript, template').forEach(el => {
      if (shouldSkipElement(el, { ...options, visibleOnly: false })) return;
      const matches = countMatches(el.textContent, matcher);
      if (!matches) return;
      const next = replaceString(el.textContent, matcher, replacement);
      if (next === null) return;
      el.textContent = next;
      detail.code += matches;
    });
  }

  function replaceFullHtml(matcher, replacement, detail) {
    const snapshot = captureSnapshot();
    const matches = countMatches(snapshot.html, matcher);
    if (!matches) return 0;
    const nextHtml = replaceString(snapshot.html, matcher, replacement);
    if (nextHtml === null) return 0;
    restoreSnapshot({ ...snapshot, html: nextHtml });
    detail.fullHtml = matches;
    return matches;
  }

  async function searchReplace(input = {}) {
    const find = input.s ?? input.find ?? '';
    const replacement = input.r ?? input.replace ?? '';
    if (!find) return { ok: false, error: 'Missing search text' };

    const options = await getBackendMatcher(find, {
      scope: input.scope || 'everything',
      visibleOnly: Boolean(input.visibleOnly),
      smart: input.smart !== false,
      caseSensitive: Boolean(input.caseSensitive),
      includeAttributes: input.includeAttributes !== false,
      includeForms: input.includeForms !== false,
      includeComments: input.includeComments !== false,
      includeCode: Boolean(input.includeCode),
      backendSmart: Boolean(input.backendSmart),
      backendUrl: input.backendUrl || DEFAULT_BACKEND_URL
    });

    const matcher = buildMatcher(find, options);
    if (!matcher) return { ok: false, error: 'Could not build matcher' };

    const before = captureSnapshot();
    const detail = { text: 0, attributes: 0, forms: 0, comments: 0, code: 0, fullHtml: 0 };

    const total = withSubZer0Mutation(() => {
      if (options.scope === 'fullHtml') return replaceFullHtml(matcher, replacement, detail);

      replaceTextNodes(matcher, replacement, options, detail);
      if (options.scope !== 'textOnly') {
        if (options.includeAttributes) replaceAttributes(matcher, replacement, options, detail);
        if (options.includeForms) replaceFormValues(matcher, replacement, options, detail);
        if (options.includeComments) replaceComments(matcher, replacement, options, detail);
        if (options.includeCode) replaceScriptAndStyle(matcher, replacement, options, detail);
      }

      return Object.values(detail).reduce((sum, count) => sum + count, 0);
    });

    if (total) state.history.push({ type: 'snapshot', snapshot: before });
    return status('Search/replace complete', { total, detail });
  }

  function ensureDigitStyle() {
    if (document.getElementById(DIGIT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = DIGIT_STYLE_ID;
    style.textContent = `
      .${DIGIT_CLASS} {
        color: #00ff66 !important;
        background: rgba(0,0,0,0.15) !important;
        border-radius: 3px !important;
        font-weight: 700 !important;
        padding: 1px 2px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function highlightDigits() {
    ensureDigitStyle();
    let count = 0;
    withSubZer0Mutation(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.parentElement || isToolNode(node.parentElement) || node.parentElement.closest('.' + DIGIT_CLASS)) {
            return NodeFilter.FILTER_REJECT;
          }
          return /[0-9]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const next = node.nodeValue.replace(/(\$?\d[\d,]*(\.\d+)?)/g, `<span class="${DIGIT_CLASS}">$1</span>`);
        if (next === node.nodeValue) return;
        const span = document.createElement('span');
        span.innerHTML = next;
        node.replaceWith(span);
        count++;
      });
    });
    return status('Highlighted digits', { nodes: count });
  }

  function makeMovable(el, handle = el) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target.closest('button,input,textarea,select,label')) return;
      dragging = true;
      offsetX = event.clientX - el.offsetLeft;
      offsetY = event.clientY - el.offsetTop;
      event.preventDefault();
    });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
      el.style.left = Math.min(Math.max(0, event.clientX - offsetX), maxLeft) + 'px';
      el.style.top = Math.min(Math.max(0, event.clientY - offsetY), maxTop) + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function openLiveEditor() {
    const old = document.getElementById(LIVE_PANEL_ID);
    if (old) {
      old.remove();
      return status('Live HTML editor closed');
    }

    const panel = document.createElement('div');
    panel.id = LIVE_PANEL_ID;
    panel.setAttribute('data-subzer0-tool', 'true');
    Object.assign(panel.style, {
      position: 'fixed',
      top: '50px',
      left: '50px',
      width: '85vw',
      height: '80vh',
      background: '#080808',
      color: '#00ff66',
      zIndex: '2147483647',
      border: '2px solid #00ff66',
      padding: '10px',
      boxSizing: 'border-box',
      resize: 'both',
      overflow: 'auto',
      fontFamily: 'Consolas, monospace'
    });
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;">
        <strong>SubZer0 Live HTML</strong>
        <button id="subzer0-live-close">Close</button>
      </div>
      <textarea id="subzer0-live-code" spellcheck="false" style="margin-top:8px;width:100%;height:calc(100% - 58px);box-sizing:border-box;background:#111;color:#00ff66;border:1px solid #135;padding:8px;"></textarea>
      <button id="subzer0-live-apply" style="margin-top:8px;">Apply HTML</button>
    `;
    document.body.appendChild(panel);
    makeMovable(panel, panel.firstElementChild);

    const code = panel.querySelector('#subzer0-live-code');
    code.value = captureSnapshot().html;
    panel.querySelector('#subzer0-live-close').onclick = () => panel.remove();
    panel.querySelector('#subzer0-live-apply').onclick = () => {
      withSubZer0Mutation(() => {
        const before = captureSnapshot();
        if (restoreSnapshot({ html: code.value, scrollX: window.scrollX, scrollY: window.scrollY })) {
          state.history.push({ type: 'snapshot', snapshot: before });
        }
      });
    };
    return status('Live HTML editor open');
  }

  function undo() {
    const last = state.history.pop();
    if (!last) return { ok: false, error: 'Nothing to undo' };
    withSubZer0Mutation(() => restoreSnapshot(last.snapshot));
    return status('Undo complete');
  }

  function successReload() {
    unfreeze();
    setTimeout(() => window.location.reload(), 100);
    return status('Reloading page');
  }

  function registerAgent(agent) {
    if (!agent?.id || typeof agent.run !== 'function') {
      throw new Error('Agent must include id and run(payload, api)');
    }
    state.agents.set(agent.id, agent);
    return status('Agent registered', { id: agent.id, name: agent.name || agent.id });
  }

  async function runAgent(agentId, payload = {}) {
    const agent = state.agents.get(agentId);
    if (!agent) return { ok: false, error: 'Agent not loaded: ' + agentId };
    return agent.run(payload, window[TOOL_KEY].api);
  }

  async function run(action, data = {}) {
    switch (action) {
      case 'PING':
        return { ok: true, status: 'ready', version: VERSION, agents: Array.from(state.agents.keys()) };
      case 'FREEZE':
        return freeze(data);
      case 'UNFREEZE':
        return unfreeze();
      case 'TOGGLE_FREEZE':
        return state.frozen ? unfreeze() : freeze(data);
      case 'SEARCH_REPLACE':
        return searchReplace(data);
      case 'HIGHLIGHT':
        return highlightDigits();
      case 'LIVE_EDIT':
        return openLiveEditor();
      case 'UNDO':
        return undo();
      case 'SUCCESS_RELOAD':
        return successReload();
      case 'RUN_AGENT':
        return runAgent(data.agentId, data.payload || {});
      case 'GET_AGENTS':
        return { ok: true, agents: Array.from(state.agents.values()).map(agent => ({ id: agent.id, name: agent.name, description: agent.description })) };
      default:
        return { ok: false, error: 'Unknown action: ' + action };
    }
  }

  window[TOOL_KEY] = {
    version: VERSION,
    status,
    run,
    registerAgent,
    api: {
      freeze,
      unfreeze,
      searchReplace,
      highlightDigits,
      openLiveEditor,
      undo,
      successReload,
      captureSnapshot,
      restoreSnapshot,
      withSubZer0Mutation,
      status
    }
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    run(request.action, request.data || request).then(sendResponse).catch(error => {
      console.error('[SubZer0] Command failed', error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });
    return true;
  });

  status('Main loaded', { version: VERSION });
})();
