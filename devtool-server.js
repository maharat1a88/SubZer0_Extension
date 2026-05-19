const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.DEVTOOL_HOST || '127.0.0.1';
const PORT = Number(process.env.DEVTOOL_PORT || 8787);
const CLIENT_FILE = path.join(__dirname, 'improved-devtool-bookmarklet.js');

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

async function openAiPattern(find) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'Return only JSON. Build a safe JavaScript regex source that finds close visual/text variants of the user phrase. Do not include leading or trailing slashes.'
        },
        {
          role: 'user',
          content: JSON.stringify({ phrase: String(find).slice(0, 500) })
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'smart_pattern',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pattern: { type: 'string' }
            },
            required: ['pattern']
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error('OpenAI API returned ' + response.status);
  }

  const data = await response.json();
  const text =
    data.output_text ||
    data.output?.flatMap(item => item.content || [])
      .map(part => part.text || '')
      .join('');

  if (!text) return null;

  const parsed = JSON.parse(text);
  return parsed.pattern || null;
}

async function handleSmartPattern(req, res) {
  try {
    const body = await readJson(req);
    const find = String(body.find || '');
    const flags = body.caseSensitive ? 'g' : 'gi';

    if (!find.trim()) {
      send(res, 400, JSON.stringify({ error: 'Missing find text' }));
      return;
    }

    let pattern = null;
    let source = 'local';

    try {
      pattern = await openAiPattern(find);
      if (pattern) source = 'openai';
    } catch (error) {
      pattern = null;
    }

    if (!pattern) pattern = body.smart === false ? escapeRegExp(find) : localSmartPattern(find);

    try {
      new RegExp(pattern, flags);
    } catch (error) {
      pattern = escapeRegExp(find);
      source = 'fallback';
    }

    send(res, 200, JSON.stringify({ pattern, flags, source }));
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
      openaiEnabled: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL)
    }));
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/devtool.js' || url.pathname === '/client.js')) {
    const code = fs.readFileSync(CLIENT_FILE, 'utf8');
    send(res, 200, code, 'application/javascript');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/loader.js') {
    send(
      res,
      200,
      "fetch('http://127.0.0.1:" + PORT + "/devtool.js').then(r=>r.text()).then(code=>(0,eval)(code));\n",
      'application/javascript'
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/smart-pattern') {
    await handleSmartPattern(req, res);
    return;
  }

  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`Dev tool server running at http://${HOST}:${PORT}`);
  console.log(`Paste this in DevTools Console:`);
  console.log(`fetch('http://${HOST}:${PORT}/devtool.js').then(r=>r.text()).then(code=>(0,eval)(code));`);
});
