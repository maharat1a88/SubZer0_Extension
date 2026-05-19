const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HOST = process.env.SUBZER0_HOST || '127.0.0.1';
const PORT = Number(process.env.SUBZER0_PORT || 8787);
const HELPER_DIRS = (process.env.SUBZER0_HELPER_DIRS || 'agents;can-you-fix-this-code-so')
  .split(';')
  .map(item => item.trim())
  .filter(Boolean);

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type + '; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localSmartPattern(find) {
  return String(find)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[\\s\\-_.,:;\\/\\\\]*');
}

function safeResolve(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function listHelperFolders() {
  return HELPER_DIRS.map(relativePath => {
    const fullPath = safeResolve(relativePath);
    if (!fullPath || !fs.existsSync(fullPath)) {
      return { path: relativePath, exists: false, files: [] };
    }

    const files = fs.readdirSync(fullPath, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(js|json|md|txt)$/i.test(entry.name))
      .map(entry => entry.name);

    return { path: relativePath, exists: true, files };
  });
}

async function handleSmartPattern(req, res) {
  try {
    const body = await readJson(req);
    const find = String(body.find || '');
    if (!find.trim()) {
      send(res, 400, JSON.stringify({ error: 'Missing find text' }));
      return;
    }

    const flags = body.caseSensitive ? 'g' : 'gi';
    const pattern = body.smart === false ? escapeRegExp(find) : localSmartPattern(find);

    send(res, 200, JSON.stringify({
      pattern,
      flags,
      source: 'subzer0-local'
    }));
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message || String(error) }));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, JSON.stringify({
      ok: true,
      name: 'SubZer0 local backend',
      helperFolders: listHelperFolders()
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/helpers') {
    send(res, 200, JSON.stringify({ helpers: listHelperFolders() }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/smart-pattern') {
    await handleSmartPattern(req, res);
    return;
  }

  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`SubZer0 backend running at http://${HOST}:${PORT}`);
  console.log('Health check: http://' + HOST + ':' + PORT + '/health');
});
