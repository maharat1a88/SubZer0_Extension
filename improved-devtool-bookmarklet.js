(function () {
  const TOOL_KEY = '__DEVTOOL_V2';
  const TOOL_ID = 'dt_box';
  const PANEL_ID = 'dt_search_panel';
  const FREEZE_LAYER_ID = '__freeze_layer';
  const FREEZE_STYLE_ID = '__freeze_style';
  const DIGIT_STYLE_ID = 'dt-digit-style';
  const TOKEN_STORAGE_KEY = 'dt_openai_token';
  const BACKEND_STORAGE_KEY = 'dt_backend_url';
  const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8787';

  if (window[TOOL_KEY]) {
    window[TOOL_KEY].destroy();
    return;
  }

  const state = {
    frozen: false,
    scrollY: 0,
    inspectMode: null,
    visibleOnly: false,
    lockDomWhileFrozen: true,
    history: [],
    listeners: [],
    observer: null,
    freezeObserver: null,
    freezeSnapshot: null,
    frozenMedia: [],
    freezePause: false,
    freezeRestoring: false,
    freezeRestoreTimer: null,
    bodySnapshot: null,
    bodyStyleSnapshot: ''
  };

  window[TOOL_KEY] = { destroy };

  function on(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    state.listeners.push({ target, event, handler, options });
  }

  function offAll() {
    state.listeners.forEach(({ target, event, handler, options }) => {
      target.removeEventListener(event, handler, options);
    });
    state.listeners = [];
  }

  function isToolNode(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest('[data-devtool="true"]'));
  }

  function isVisible(el) {
    if (!state.visibleOnly) return true;
    if (el === document.documentElement || el === document.body) return true;
    const s = getComputedStyle(el);
    return !(s.display === 'none' || s.visibility === 'hidden' || (el.getClientRects().length === 0 && el.offsetWidth === 0 && el.offsetHeight === 0));
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildMatcher(find, options = {}) {
    const flags = options.caseSensitive ? 'g' : 'gi';
    if (options.matcherPattern) {
      try {
        return new RegExp(options.matcherPattern, options.matcherFlags || flags);
      } catch (e) {}
    }

    const source = options.smart
      ? find
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(escapeRegExp)
          .join('[\\s\\-_.,:;\\/\\\\]*')
      : escapeRegExp(find);

    if (!source) return null;

    try {
      return new RegExp(source, flags);
    } catch (e) {
      return new RegExp(escapeRegExp(find), flags);
    }
  }

  function replaceString(value, matcher, replacement) {
    if (typeof value !== 'string') return null;
    matcher.lastIndex = 0;
    if (!matcher.test(value)) return null;
    matcher.lastIndex = 0;
    return value.replace(matcher, () => replacement);
  }

  function countMatches(value, matcher) {
    if (typeof value !== 'string') return 0;
    matcher.lastIndex = 0;
    const matches = value.match(matcher);
    matcher.lastIndex = 0;
    return matches ? matches.length : 0;
  }

  function detachToolNodes() {
    const nodes = Array.from(document.querySelectorAll('[data-devtool="true"]'));
    nodes.forEach(node => node.remove());
    return nodes;
  }

  function reattachToolNodes(nodes) {
    nodes.forEach(node => {
      if (!node.isConnected) document.body.appendChild(node);
    });
  }

  function captureDocumentSnapshot() {
    const html = document.documentElement.cloneNode(true);
    html.querySelectorAll('[data-devtool="true"]').forEach(node => node.remove());

    return {
      html: html.outerHTML,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  }

  function restoreDocumentSnapshot(snapshot) {
    if (!snapshot || !snapshot.html) return false;

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

  function withToolMutation(fn) {
    state.freezePause = true;
    try {
      const result = fn();
      if (state.frozen && state.lockDomWhileFrozen) refreshFreezeSnapshot();
      return result;
    } finally {
      window.setTimeout(() => {
        state.freezePause = false;
      }, 0);
    }
  }

  function ensureDigitStyle() {
    if (document.getElementById(DIGIT_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = DIGIT_STYLE_ID;
    style.textContent = `
      .dt-digit {
        color: #00ff66 !important;
        font-weight: 700 !important;
        background: rgba(0,0,0,0.15);
        padding: 1px 2px;
        border-radius: 3px;
      }
    `;
    document.head.appendChild(style);
  }

  function colorizeDigits(root = document.body) {
    if (!root || isToolNode(root)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || isToolNode(node.parentElement) || node.parentElement.closest('.dt-digit')) {
          return NodeFilter.FILTER_REJECT;
        }
        return /[0-9]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const text = node.nodeValue;
      const replaced = text.replace(/(\$?\d[\d,]*(\.\d+)?)/g, '<span class="dt-digit">$1</span>');
      if (replaced === text) return;

      const span = document.createElement('span');
      span.innerHTML = replaced;
      node.replaceWith(span);
    });
  }

  function makeMovable(el, handle = el) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    on(handle, 'mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('button,input,textarea,select,label')) return;

      dragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      e.preventDefault();
    });

    on(document, 'mousemove', e => {
      if (!dragging) return;

      const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
      el.style.left = Math.min(Math.max(0, e.clientX - offsetX), maxLeft) + 'px';
      el.style.top = Math.min(Math.max(0, e.clientY - offsetY), maxTop) + 'px';
      el.style.right = 'auto';
    });

    on(document, 'mouseup', () => {
      dragging = false;
    });
  }

  function snapshotBody() {
    if (state.bodySnapshot) return;
    state.bodySnapshot = captureDocumentSnapshot();
  }

  function restoreBodySnapshot() {
    if (!state.bodySnapshot) return false;

    restoreDocumentSnapshot(state.bodySnapshot);
    state.bodySnapshot = null;
    refreshFreezeSnapshot();
    return true;
  }

  function shouldSkipElement(el, options = {}) {
    if (!el || isToolNode(el)) return true;
    if (state.visibleOnly && options.respectVisibility !== false && document.body.contains(el) && !isVisible(el)) {
      return true;
    }
    return false;
  }

  function replaceEverywhere(find, replacement, options = {}) {
    const matcher = buildMatcher(find, options);
    if (!matcher) return { total: 0, detail: {} };

    const before = captureDocumentSnapshot();
    const detail = {
      text: 0,
      attributes: 0,
      forms: 0,
      comments: 0,
      code: 0,
      fullHtml: 0
    };

    const total = withToolMutation(() => {
      if (options.scope === 'fullHtml') {
        return replaceFullDocumentHtml(matcher, replacement, detail);
      }

      replaceTextNodes(matcher, replacement, options, detail);

      if (options.scope !== 'textOnly') {
        if (options.includeAttributes) replaceAttributes(matcher, replacement, detail);
        if (options.includeForms) replaceFormValues(matcher, replacement, detail);
        if (options.includeComments) replaceComments(matcher, replacement, detail);
        if (options.includeCode) replaceScriptAndStyleText(matcher, replacement, detail);
      }

      return Object.values(detail).reduce((sum, count) => sum + count, 0);
    });

    if (total > 0) {
      state.history.push({ type: 'pageSnapshot', snapshot: before });
    }

    return { total, detail };
  }

  function replaceTextNodes(matcher, replacement, options, detail) {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
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

  function replaceAttributes(matcher, replacement, detail) {
    document.querySelectorAll('*').forEach(el => {
      if (shouldSkipElement(el)) return;

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

  function replaceFormValues(matcher, replacement, detail) {
    document.querySelectorAll('input, textarea, select, option').forEach(el => {
      if (shouldSkipElement(el)) return;
      if (!('value' in el)) return;

      const matches = countMatches(el.value, matcher);
      if (!matches) return;

      const next = replaceString(el.value, matcher, replacement);
      if (next === null) return;
      el.value = next;
      if (el.hasAttribute('value')) el.setAttribute('value', next);
      detail.forms += matches;
    });
  }

  function replaceComments(matcher, replacement, detail) {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT, {
      acceptNode(node) {
        if (node.parentElement && shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
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

  function replaceScriptAndStyleText(matcher, replacement, detail) {
    document.querySelectorAll('script, style, noscript, template').forEach(el => {
      if (shouldSkipElement(el, { respectVisibility: false })) return;

      const matches = countMatches(el.textContent, matcher);
      if (!matches) return;

      const next = replaceString(el.textContent, matcher, replacement);
      if (next === null) return;
      el.textContent = next;
      detail.code += matches;
    });
  }

  function replaceFullDocumentHtml(matcher, replacement, detail) {
    const snapshot = captureDocumentSnapshot();
    const matches = countMatches(snapshot.html, matcher);
    if (!matches) return 0;

    const nextHtml = replaceString(snapshot.html, matcher, replacement);
    if (nextHtml === null) return 0;

    restoreDocumentSnapshot({
      html: nextHtml,
      scrollX: snapshot.scrollX,
      scrollY: snapshot.scrollY
    });
    detail.fullHtml = matches;
    return matches;
  }

  function createTool() {
    const box = document.createElement('div');
    box.id = TOOL_ID;
    box.setAttribute('data-devtool', 'true');

    Object.assign(box.style, {
      position: 'fixed',
      top: '10px',
      left: '10px',
      width: '320px',
      background: '#111',
      color: '#fff',
      zIndex: '2147483647',
      padding: '12px',
      borderRadius: '8px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      cursor: 'move',
      boxSizing: 'border-box'
    });

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <b style="font-size:16px;">DEV TOOL</b>
        <button id="dt_close" title="Close" style="background:#900;color:#fff;border:0;border-radius:4px;padding:4px 8px;cursor:pointer;">X</button>
      </div>

      <hr style="border:0;border-top:1px solid #333;margin:10px 0;">

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
        <button id="dt_freeze">Freeze</button>
        <button id="dt_inspect">Inspect Text</button>
        <button id="dt_css">Edit CSS</button>
        <button id="dt_inputs">Edit Input</button>
        <button id="dt_digits">Digits</button>
        <button id="dt_search">Search/Replace</button>
        <button id="dt_livehtml">Live HTML</button>
        <button id="dt_undo">Undo</button>
      </div>

      <button id="dt_success"
        style="width:100%;margin-top:10px;background:#087a2f;color:#fff;border:0;border-radius:4px;padding:8px;cursor:pointer;font-weight:700;">
        Success - reload fresh
      </button>

      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;">
        <input type="checkbox" id="dt_visible">
        Visible only
      </label>

      <label style="display:flex;align-items:center;gap:6px;margin-top:6px;">
        <input type="checkbox" id="dt_lock_freeze" checked>
        Lock live changes while frozen
      </label>

      <label style="display:block;margin-top:10px;">
        <span style="display:block;margin-bottom:4px;color:#ccc;">OpenAI API key / token (optional)</span>
        <input id="dt_token" type="password" placeholder="sk-... or token" autocomplete="off"
          style="width:100%;box-sizing:border-box;background:#1d1d1d;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;">
      </label>

      <label style="display:block;margin-top:10px;">
        <span style="display:block;margin-bottom:4px;color:#ccc;">Local backend URL</span>
        <input id="dt_backend_url" placeholder="http://127.0.0.1:8787" autocomplete="off"
          style="width:100%;box-sizing:border-box;background:#1d1d1d;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;">
      </label>

      <div style="display:flex;gap:6px;margin-top:6px;">
        <button id="dt_save_token" style="flex:1;">Save Token</button>
        <button id="dt_clear_token" style="flex:1;">Clear</button>
      </div>
      <div id="dt_status" style="min-height:18px;margin-top:8px;color:#9f9;"></div>
    `;

    document.body.appendChild(box);
    makeMovable(box);

    box.querySelector('#dt_token').value = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    box.querySelector('#dt_backend_url').value = localStorage.getItem(BACKEND_STORAGE_KEY) || DEFAULT_BACKEND_URL;
    box.querySelector('#dt_close').onclick = destroy;
    box.querySelector('#dt_digits').onclick = () => withToolMutation(() => colorizeDigits(document.body));
    box.querySelector('#dt_visible').onchange = e => {
      state.visibleOnly = e.target.checked;
    };
    box.querySelector('#dt_lock_freeze').onchange = e => {
      state.lockDomWhileFrozen = e.target.checked;
      if (state.frozen && state.lockDomWhileFrozen) startFreezeLock();
      if (state.frozen && !state.lockDomWhileFrozen) stopFreezeLock();
    };
    box.querySelector('#dt_freeze').onclick = toggleFreeze;
    box.querySelector('#dt_inspect').onclick = () => setInspectMode('text');
    box.querySelector('#dt_css').onclick = () => setInspectMode('css');
    box.querySelector('#dt_inputs').onclick = () => setInspectMode('input');
    box.querySelector('#dt_search').onclick = openSearchPanel;
    box.querySelector('#dt_livehtml').onclick = openLiveHtmlPanel;
    box.querySelector('#dt_undo').onclick = undo;
    box.querySelector('#dt_success').onclick = successAndReload;
    box.querySelector('#dt_save_token').onclick = () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, box.querySelector('#dt_token').value.trim());
      localStorage.setItem(BACKEND_STORAGE_KEY, box.querySelector('#dt_backend_url').value.trim() || DEFAULT_BACKEND_URL);
      setStatus('Settings saved locally.');
    };
    box.querySelector('#dt_clear_token').onclick = () => {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      box.querySelector('#dt_token').value = '';
      setStatus('Token cleared.');
    };
  }

  function setStatus(message) {
    const status = document.querySelector('#dt_status');
    if (!status) return;
    status.textContent = message;
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, 2500);
  }

  async function getBackendSmartOptions(find, options) {
    const backendUrl = (localStorage.getItem(BACKEND_STORAGE_KEY) || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

    try {
      const response = await fetch(backendUrl + '/api/smart-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          find,
          caseSensitive: options.caseSensitive,
          smart: options.smart
        })
      });

      if (!response.ok) throw new Error('Backend returned ' + response.status);

      const data = await response.json();
      if (!data || !data.pattern) return options;

      return {
        ...options,
        matcherPattern: data.pattern,
        matcherFlags: data.flags || (options.caseSensitive ? 'g' : 'gi')
      };
    } catch (e) {
      srStatus('Backend unavailable, using browser smart search.');
      return options;
    }
  }

  function setInspectMode(mode) {
    state.inspectMode = mode;
    setStatus(mode === 'text' ? 'Click an element to edit text.' : mode === 'css' ? 'Click an element to edit CSS.' : 'Click an input to edit value.');
  }

  function refreshFreezeSnapshot() {
    if (!state.frozen || !state.lockDomWhileFrozen) return;
    state.freezeSnapshot = captureDocumentSnapshot();
  }

  function startFreezeLock() {
    stopFreezeLock();
    state.freezeSnapshot = captureDocumentSnapshot();
    state.freezeObserver = new MutationObserver(mutations => {
      if (!state.frozen || !state.lockDomWhileFrozen || state.freezePause || state.freezeRestoring) return;
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
    window.clearTimeout(state.freezeRestoreTimer);
    state.freezeRestoreTimer = null;
  }

  function scheduleFreezeRestore() {
    if (state.freezeRestoreTimer) return;
    state.freezeRestoreTimer = window.setTimeout(() => {
      state.freezeRestoreTimer = null;
      restoreFrozenDom();
    }, 25);
  }

  function restoreFrozenDom() {
    if (!state.freezeSnapshot || state.freezePause || state.freezeRestoring) return;

    state.freezeRestoring = true;
    restoreDocumentSnapshot(state.freezeSnapshot);
    window.setTimeout(() => {
      state.freezeRestoring = false;
    }, 0);
  }

  function toggleFreeze() {
    state.frozen = !state.frozen;
    const btn = document.querySelector('#dt_freeze');

    if (state.frozen) {
      state.scrollY = window.scrollY;
      if (btn) btn.textContent = 'Unfreeze';

      document.body.style.position = 'fixed';
      document.body.style.top = '-' + state.scrollY + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      const freezeStyle = document.createElement('style');
      freezeStyle.id = FREEZE_STYLE_ID;
      freezeStyle.textContent = `
        *, *::before, *::after {
          animation-play-state: paused !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
        html, body {
          overscroll-behavior: none !important;
        }
      `;
      document.head.appendChild(freezeStyle);

      state.frozenMedia = [];
      document.querySelectorAll('video,audio').forEach(media => {
        try {
          state.frozenMedia.push({ media, paused: media.paused });
          media.pause();
        } catch (e) {}
      });

      const layer = document.createElement('div');
      layer.id = FREEZE_LAYER_ID;
      Object.assign(layer.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.15)',
        zIndex: '2147483646',
        pointerEvents: 'none'
      });
      document.body.appendChild(layer);
      if (state.lockDomWhileFrozen) startFreezeLock();
      return;
    }

    unfreeze();
    if (btn) btn.textContent = 'Freeze';
  }

  function unfreeze() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, state.scrollY);
    document.getElementById(FREEZE_LAYER_ID)?.remove();
    document.getElementById(FREEZE_STYLE_ID)?.remove();
    stopFreezeLock();
    state.frozenMedia.forEach(({ media, paused }) => {
      if (!paused && media.isConnected) {
        try { media.play(); } catch (e) {}
      }
    });
    state.frozenMedia = [];
    state.frozen = false;
  }

  function openSearchPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
      return;
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('data-devtool', 'true');
    Object.assign(panel.style, {
      position: 'fixed',
      top: '90px',
      left: '360px',
      width: '360px',
      background: '#161616',
      color: '#fff',
      zIndex: '2147483647',
      padding: '12px',
      borderRadius: '8px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      cursor: 'move',
      boxSizing: 'border-box'
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <b>Search / Replace</b>
        <div>
          <button id="dt_sr_min" title="Hide">_</button>
          <button id="dt_sr_close" title="Close">X</button>
        </div>
      </div>
      <hr style="border:0;border-top:1px solid #333;margin:10px 0;">
      <label style="display:block;margin-bottom:8px;">
        Find
        <input id="dt_find" style="width:100%;box-sizing:border-box;background:#1d1d1d;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;">
      </label>
      <label style="display:block;margin-bottom:8px;">
        Replace
        <input id="dt_replace" style="width:100%;box-sizing:border-box;background:#1d1d1d;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;">
      </label>

      <label style="display:block;margin-bottom:8px;">
        Scope
        <select id="dt_scope" style="width:100%;box-sizing:border-box;background:#1d1d1d;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;">
          <option value="everything">Everything in DOM</option>
          <option value="textOnly">Text only</option>
          <option value="fullHtml">Full document HTML</option>
        </select>
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="dt_smart" checked> Smart similar</label>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="dt_case"> Case sensitive</label>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="dt_attrs" checked> Attributes</label>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="dt_forms" checked> Form values</label>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="dt_comments" checked> Comments</label>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="dt_code" checked> Script/style</label>
        <label style="display:flex;align-items:center;gap:6px;grid-column:1 / -1;"><input type="checkbox" id="dt_backend_smart"> Ask local backend for smarter matching</label>
      </div>

      <div style="display:flex;gap:6px;">
        <button id="dt_replace_all" style="flex:1;">Replace All</button>
        <button id="dt_snapshot_undo" style="flex:1;">Restore Page</button>
      </div>
      <div id="dt_sr_status" style="min-height:18px;margin-top:8px;color:#9f9;"></div>
    `;

    document.body.appendChild(panel);
    makeMovable(panel);

    panel.querySelector('#dt_sr_min').onclick = () => {
      panel.style.display = 'none';
    };
    panel.querySelector('#dt_sr_close').onclick = () => {
      panel.remove();
    };
    panel.querySelector('#dt_snapshot_undo').onclick = () => {
      const restored = withToolMutation(() => restoreBodySnapshot());
      srStatus(restored ? 'Page restored.' : 'Nothing to restore.');
    };
    panel.querySelector('#dt_replace_all').onclick = async () => {
      const find = panel.querySelector('#dt_find').value;
      const replacement = panel.querySelector('#dt_replace').value;
      const options = {
        scope: panel.querySelector('#dt_scope').value,
        smart: panel.querySelector('#dt_smart').checked,
        caseSensitive: panel.querySelector('#dt_case').checked,
        includeAttributes: panel.querySelector('#dt_attrs').checked,
        includeForms: panel.querySelector('#dt_forms').checked,
        includeComments: panel.querySelector('#dt_comments').checked,
        includeCode: panel.querySelector('#dt_code').checked,
        backendSmart: panel.querySelector('#dt_backend_smart').checked
      };

      if (!find) {
        srStatus('Enter something to find.');
        return;
      }

      snapshotBody();
      srStatus(options.backendSmart ? 'Asking local backend...' : 'Searching...');
      const effectiveOptions = options.backendSmart ? await getBackendSmartOptions(find, options) : options;
      const result = replaceEverywhere(find, replacement, effectiveOptions);
      const parts = Object.entries(result.detail)
        .filter(([, count]) => count)
        .map(([name, count]) => name + ': ' + count)
        .join(', ');
      srStatus(result.total ? 'Updated ' + result.total + ' match' + (result.total === 1 ? '' : 'es') + ' (' + parts + ').' : 'No matches found.');
    };
  }

  function srStatus(message) {
    const status = document.querySelector('#dt_sr_status');
    if (status) status.textContent = message;
  }

  function openLiveHtmlPanel() {
    const oldPanel = document.getElementById('dt_live_html_panel');
    if (oldPanel) {
      oldPanel.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'dt_live_html_panel';
    panel.setAttribute('data-devtool', 'true');
    Object.assign(panel.style, {
      position: 'fixed',
      top: '50px',
      left: '50px',
      width: '85%',
      height: '80%',
      background: '#000',
      color: '#0f0',
      zIndex: '2147483647',
      padding: '10px',
      border: '2px solid #0f0',
      resize: 'both',
      overflow: 'auto',
      boxSizing: 'border-box',
      cursor: 'move'
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>LIVE HTML EDITOR</b>
        <button id="dt_live_close">Close</button>
      </div>
      <hr>
      <input id="dt_live_find" placeholder="Find..." style="width:35%;">
      <input id="dt_live_rep" placeholder="Replace..." style="width:35%;">
      <button id="dt_live_replace">Replace All</button>
      <br><br>
      <textarea id="dt_live_box" style="width:100%;height:70%;background:#111;color:#0f0;box-sizing:border-box;"></textarea>
      <br><br>
      <button id="dt_live_apply">Apply</button>
    `;

    document.body.appendChild(panel);
    makeMovable(panel);

    const htmlBox = panel.querySelector('#dt_live_box');
    htmlBox.value = document.documentElement.outerHTML;

    panel.querySelector('#dt_live_replace').onclick = () => {
      const f = panel.querySelector('#dt_live_find').value;
      const r = panel.querySelector('#dt_live_rep').value;
      if (f) htmlBox.value = htmlBox.value.split(f).join(r);
    };
    panel.querySelector('#dt_live_apply').onclick = () => {
      withToolMutation(() => {
        snapshotBody();
        const temp = document.createElement('html');
        temp.innerHTML = htmlBox.value;
        const newBody = temp.querySelector('body');
        if (!newBody) return;

        const toolNodes = detachToolNodes();
        document.body.innerHTML = newBody.innerHTML;
        reattachToolNodes(toolNodes);
        ensureDigitStyle();
        colorizeDigits(document.body);
      });
    };
    panel.querySelector('#dt_live_close').onclick = () => panel.remove();
  }

  function undo() {
    const last = state.history.pop();
    if (!last) {
      setStatus('Nothing to undo.');
      return;
    }

    withToolMutation(() => {
      if (last.type === 'pageSnapshot') restoreDocumentSnapshot(last.snapshot);
      if (last.type === 'text' && last.el.isConnected) last.el.textContent = last.old;
      if (last.type === 'css' && last.el.isConnected) last.el.style.cssText = last.old;
      if (last.type === 'input' && last.el.isConnected) last.el.value = last.old;
      if (last.type === 'textNodes') {
        last.records.forEach(({ node, old }) => {
          if (node.isConnected) node.nodeValue = old;
        });
      }
      if (last.type === 'htmlBatch') {
        last.records.forEach(({ el, old }) => {
          if (el.isConnected) el.innerHTML = old;
        });
      }
    });

    setStatus('Undone.');
  }

  function successAndReload() {
    setStatus('Success. Reloading...');
    if (state.frozen) unfreeze();
    stopFreezeLock();
    state.observer?.disconnect();
    offAll();

    document.getElementById(TOOL_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById('dt_live_html_panel')?.remove();
    document.getElementById(FREEZE_LAYER_ID)?.remove();
    document.getElementById(FREEZE_STYLE_ID)?.remove();
    delete window[TOOL_KEY];

    window.setTimeout(() => {
      window.location.reload();
    }, 150);
  }

  function handleInspectClick(e) {
    if (!state.inspectMode || isToolNode(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    if (state.inspectMode === 'input') {
      if (!('value' in el)) {
        setStatus('That element has no value.');
        state.inspectMode = null;
        return;
      }
      const old = el.value;
      const val = prompt('Value:', old);
      if (val !== null) {
        withToolMutation(() => {
          state.history.push({ type: 'input', el, old });
          el.value = val;
        });
      }
    }

    if (state.inspectMode === 'text') {
      const old = el.textContent;
      const val = prompt('Text:', old);
      if (val !== null) {
        withToolMutation(() => {
          state.history.push({ type: 'text', el, old });
          el.textContent = val;
        });
      }
    }

    if (state.inspectMode === 'css') {
      const old = el.style.cssText;
      const val = prompt('CSS:', old);
      if (val !== null) {
        withToolMutation(() => {
          state.history.push({ type: 'css', el, old });
          el.style.cssText = val;
        });
      }
    }

    state.inspectMode = null;
  }

  function init() {
    ensureDigitStyle();
    colorizeDigits(document.body);

    state.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && !isToolNode(node)) colorizeDigits(node);
        });
      });
    });
    state.observer.observe(document.body, { childList: true, subtree: true });

    createTool();
    on(document, 'click', handleInspectClick, true);
  }

  function destroy() {
    if (state.frozen) unfreeze();
    stopFreezeLock();
    state.observer?.disconnect();
    offAll();

    document.getElementById(TOOL_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById('dt_live_html_panel')?.remove();
    document.getElementById(FREEZE_LAYER_ID)?.remove();
    document.getElementById(FREEZE_STYLE_ID)?.remove();

    delete window[TOOL_KEY];
  }

  if (document.readyState === 'loading') {
    on(document, 'DOMContentLoaded', init);
  } else {
    init();
  }
})();
