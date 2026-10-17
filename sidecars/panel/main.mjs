// Backend for Quota Lens UI Extension
// Tracks and displays 5-hour quota and weekly quota consumption for Antigravity conversations
// Supports detailed per-turn (单次问答交互) quota and token breakdown with full i18n support

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { Response, SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DATA_DIR = join(homedir(), '.gemini', 'antigravity');
const BRAIN_DIR = join(APP_DATA_DIR, 'brain');
const DATA_DIR = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(HERE, '.data');
const SESSIONS_STORE_FILE = join(DATA_DIR, 'quota_sessions.json');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

const app = new SidecarApp();

// ---------------------------------------------------------------------------
// Static File Helpers
// ---------------------------------------------------------------------------
const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');

app.page('/', () => readLocal('index.html'));
app.page('/app.js', () => readLocal('app.js'));
app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return { autoRefresh: true, refreshIntervalSec: 8, defaultGroup: 'gemini', lang: 'auto' };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { autoRefresh: true, refreshIntervalSec: 8, defaultGroup: 'gemini', lang: 'auto' };
  }
}

function saveConfig(cfg) {
  ensureDataDir();
  const current = loadConfig();
  const updated = { ...current, ...cfg };
  writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

function loadSessionStore() {
  if (!existsSync(SESSIONS_STORE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SESSIONS_STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSessionStore(store) {
  ensureDataDir();
  writeFileSync(SESSIONS_STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Language Server ConnectRPC Quota Client
// ---------------------------------------------------------------------------
let lastSuccessfulQuota = null;
let lastQuotaFetchTime = 0;

async function fetchUserQuotaSummary() {
  const lsAddress = process.env.ANTIGRAVITY_LS_ADDRESS;
  const csrfToken = process.env.ANTIGRAVITY_CSRF_TOKEN;

  if (!lsAddress || !csrfToken) {
    if (lastSuccessfulQuota) return lastSuccessfulQuota;
    return null;
  }

  // Cache quota for 2 seconds to avoid excessive requests
  const now = Date.now();
  if (lastSuccessfulQuota && now - lastQuotaFetchTime < 2000) {
    return lastSuccessfulQuota;
  }

  return new Promise((resolve) => {
    const postData = JSON.stringify({});
    let [host, port] = lsAddress.split(':');
    if (!port && host) {
      port = host;
      host = '127.0.0.1';
    }
    if (!host) host = '127.0.0.1';

    const req = http.request({
      host,
      port: parseInt(port, 10),
      path: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': csrfToken,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 4000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json?.response?.groups) {
            lastSuccessfulQuota = json.response;
            lastQuotaFetchTime = Date.now();
            resolve(json.response);
            return;
          }
          resolve(lastSuccessfulQuota);
        } catch {
          resolve(lastSuccessfulQuota);
        }
      });
    });

    req.on('error', () => resolve(lastSuccessfulQuota));
    req.on('timeout', () => {
      req.destroy();
      resolve(lastSuccessfulQuota);
    });

    req.write(postData);
    req.end();
  });
}

function normalizeBuckets(quotaResponse) {
  const map = {};
  if (!quotaResponse || !Array.isArray(quotaResponse.groups)) return map;

  for (const group of quotaResponse.groups) {
    const groupName = group.displayName || 'Unknown';
    if (Array.isArray(group.buckets)) {
      for (const bucket of group.buckets) {
        const id = bucket.bucketId || bucket.window || 'unknown';
        map[id] = {
          bucketId: id,
          groupName,
          window: bucket.window, // '5h' or 'weekly'
          displayName: bucket.displayName,
          remainingFraction: typeof bucket.remainingFraction === 'number' ? bucket.remainingFraction : 1.0,
          resetTime: bucket.resetTime || null,
          description: bucket.description || ''
        };
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Conversation Title & Transcript Analysis
// ---------------------------------------------------------------------------
function cleanPromptText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/<USER_REQUEST>/g, '')
    .replace(/<\/USER_REQUEST>/g, '')
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
    .trim();
}

function getConversationTitle(convId) {
  try {
    const dbPath = join(APP_DATA_DIR, 'conversation_summaries.db');
    if (existsSync(dbPath)) {
      const escapedId = convId.replace(/"/g, '""');
      const out = execFileSync(
        'sqlite3',
        [dbPath, `SELECT title FROM conversation_summaries WHERE conversation_id = "${escapedId}" LIMIT 1;`],
        { encoding: 'utf8', timeout: 500 }
      ).trim();
      if (out) return out;
    }
  } catch {}

  // Fallback: extract from first message in transcript.jsonl
  try {
    const p = join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
    if (existsSync(p)) {
      const fd = openSync(p, 'r');
      const buf = Buffer.alloc(8192);
      const bytesRead = readSync(fd, buf, 0, 8192, 0);
      closeSync(fd);
      if (bytesRead > 0) {
        const text = buf.toString('utf8', 0, bytesRead);
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.content && typeof obj.content === 'string') {
              const cleaned = cleanPromptText(obj.content);
              if (cleaned && cleaned.length > 2) {
                return cleaned.slice(0, 42) + (cleaned.length > 42 ? '…' : '');
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  return `会话 ${convId.slice(0, 8)}`;
}

// Parses transcript.jsonl into overall metrics and individual turns
function parseTranscriptTurns(convId) {
  const p = join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!existsSync(p)) {
    return {
      stepCount: 0,
      userMessageCount: 0,
      plannerCount: 0,
      totalInputTokens: 0,
      totalCacheReadTokens: 0,
      totalOutputTokens: 0,
      totalPromptTokens: 0,
      totalTokensOverall: 0,
      cacheHitRatio: 0,
      tools: {},
      turns: []
    };
  }

  try {
    const content = readFileSync(p, 'utf8');
    const lines = content.split('\n');

    let totalInput = 0;
    let totalCache = 0;
    let totalOutput = 0;
    let userMessageCount = 0;
    let plannerCount = 0;
    const globalTools = {};

    let currentTurn = null;
    let turnIndex = 0;
    const turns = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);

        if (step.type === 'USER_INPUT') {
          turnIndex++;
          userMessageCount++;
          const prompt = cleanPromptText(step.content) || (step.content || '').slice(0, 80);

          currentTurn = {
            turnIndex,
            userPrompt: prompt,
            startTime: step.created_at,
            endTime: step.created_at,
            inputTokens: 0,
            cacheReadTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            stepCount: 1,
            plannerCount: 0,
            tools: {}
          };
          turns.push(currentTurn);
        } else if (currentTurn) {
          currentTurn.stepCount++;
          if (step.created_at) {
            currentTurn.endTime = step.created_at;
          }

          if (step.type === 'PLANNER_RESPONSE') {
            plannerCount++;
            currentTurn.plannerCount++;

            const input = Number(step.input_tokens) || 0;
            const cache = Number(step.cache_read_tokens) || 0;
            const output = Number(step.output_tokens) || 0;

            totalInput += input;
            totalCache += cache;
            totalOutput += output;

            currentTurn.inputTokens += input;
            currentTurn.cacheReadTokens += cache;
            currentTurn.outputTokens += output;

            if (Array.isArray(step.tool_calls)) {
              for (const tc of step.tool_calls) {
                const name = tc.name || 'unknown';
                globalTools[name] = (globalTools[name] || 0) + 1;
                currentTurn.tools[name] = (currentTurn.tools[name] || 0) + 1;
              }
            }
          }
        }
      } catch {}
    }

    // Process turn statistics
    for (const t of turns) {
      t.totalTokens = t.inputTokens + t.outputTokens;
      const promptTot = t.inputTokens + t.cacheReadTokens;
      t.cacheHitRatio = promptTot > 0 ? Math.round((t.cacheReadTokens / promptTot) * 1000) / 10 : 0;

      if (t.startTime && t.endTime) {
        const diffMs = new Date(t.endTime).getTime() - new Date(t.startTime).getTime();
        t.durationSec = Math.max(0, Math.round(diffMs / 1000));
      } else {
        t.durationSec = 0;
      }

      // Compute turn cost weight for quota distribution:
      // Output tokens cost ~3-4x input, Cache read tokens cost ~0.05x input
      t.costWeight = t.inputTokens + (3.0 * t.outputTokens) + (0.05 * t.cacheReadTokens);
    }

    const totalPrompt = totalInput + totalCache;
    const totalTokens = totalPrompt + totalOutput;
    const cacheHitRatio = totalPrompt > 0 ? (totalCache / totalPrompt) * 100 : 0;

    return {
      stepCount: lines.length,
      userMessageCount,
      plannerCount,
      totalInputTokens: totalInput,
      totalCacheReadTokens: totalCache,
      totalOutputTokens: totalOutput,
      totalPromptTokens: totalPrompt,
      totalTokensOverall: totalTokens,
      cacheHitRatio: Math.round(cacheHitRatio * 10) / 10,
      tools: globalTools,
      turns
    };
  } catch (err) {
    return {
      stepCount: 0,
      userMessageCount: 0,
      plannerCount: 0,
      totalInputTokens: 0,
      totalCacheReadTokens: 0,
      totalOutputTokens: 0,
      totalPromptTokens: 0,
      totalTokensOverall: 0,
      cacheHitRatio: 0,
      tools: {},
      turns: []
    };
  }
}

function getLatestConversationId() {
  if (!existsSync(BRAIN_DIR)) return null;
  try {
    const entries = readdirSync(BRAIN_DIR, { withFileTypes: true });
    let latestId = null;
    let latestMtime = 0;
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
      const transcriptPath = join(BRAIN_DIR, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
      if (existsSync(transcriptPath)) {
        try {
          const st = statSync(transcriptPath);
          if (st.mtimeMs > latestMtime) {
            latestMtime = st.mtimeMs;
            latestId = ent.name;
          }
        } catch {}
      }
    }
    return latestId;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-Turn & Session Quota Delta Calculation
// ---------------------------------------------------------------------------
function calculateSessionAndTurnDeltas(convId, currentBuckets, transcriptStats) {
  const store = loadSessionStore();
  let session = store[convId];
  const now = Date.now();

  if (!session) {
    const baselineBuckets = {};
    for (const [id, b] of Object.entries(currentBuckets)) {
      baselineBuckets[id] = {
        fraction: b.remainingFraction,
        resetTime: b.resetTime,
        timestamp: now
      };
    }
    session = {
      conversationId: convId,
      baselineTime: now,
      baselineBuckets,
      baselineTurnIndex: 0,
      lastUpdated: now
    };
    store[convId] = session;
    saveSessionStore(store);
  }

  // 1. Process all turns with deterministic token-based quota physics engine
  const turns = transcriptStats.turns || [];
  for (const t of turns) {
    // Input tokens: base weight 1.0
    // Output tokens: base weight 3.0
    // Cache read tokens: cached discount weight 0.10
    const costWeight = (t.inputTokens || 0) + 
                       (3.0 * (t.outputTokens || 0)) + 
                       (0.10 * (t.cacheReadTokens || 0));

    // Capacity constants based on empirical Antigravity telemetry:
    // 5-hour quota full capacity: 2,500,000 weighted token units (100%)
    // Weekly quota full capacity: 10,000,000 weighted token units (100%)
    // Strict periodic ratio: 5h / Weekly == 4.0000
    const consumed5h = costWeight / 25000;
    const consumedWeekly = consumed5h / 4.0;

    // 3P models (Claude 3.7 Sonnet / Opus) cost multiplier: ~2.0x
    const consumed3p5h = (costWeight * 2.0) / 25000;
    const consumed3pWeekly = consumed3p5h / 4.0;

    t.quota = {
      gemini: {
        consumed5h: Math.round(consumed5h * 100) / 100,
        consumedWeekly: Math.round(consumedWeekly * 100) / 100
      },
      '3p': {
        consumed5h: Math.round(consumed3p5h * 100) / 100,
        consumedWeekly: Math.round(consumed3pWeekly * 100) / 100
      }
    };
  }

  // 2. Sum session cumulative consumed quota
  // If baselineTurnIndex is set (e.g. from manual baseline reset), sum only turns after that index
  const baselineIndex = session.baselineTurnIndex || 0;
  const activeTurns = turns.filter(t => t.turnIndex > baselineIndex);

  let sessionGemini5h = 0;
  let sessionGeminiWeekly = 0;
  let session3p5h = 0;
  let session3pWeekly = 0;

  for (const t of activeTurns) {
    sessionGemini5h += t.quota?.gemini?.consumed5h || 0;
    sessionGeminiWeekly += t.quota?.gemini?.consumedWeekly || 0;
    session3p5h += t.quota?.['3p']?.consumed5h || 0;
    session3pWeekly += t.quota?.['3p']?.consumedWeekly || 0;
  }

  // 3. Calculate session deltas & detect global bucket refresh/recovery
  const sessionDeltas = {};
  for (const [id, curr] of Object.entries(currentBuckets)) {
    const base = session.baselineBuckets?.[id];
    const baseFraction = typeof base?.fraction === 'number' ? base.fraction : curr.remainingFraction;
    const currFraction = curr.remainingFraction;

    // Detect if bucket was reset or refreshed:
    // (a) current remaining fraction is higher than base fraction by > 2%
    // (b) resetTime changed to a new cycle
    let refreshed = false;
    if (currFraction > baseFraction + 0.02 || (base?.resetTime && curr.resetTime && base.resetTime !== curr.resetTime)) {
      refreshed = true;
    }

    let consumedPercent = 0;
    if (id === 'gemini-5h') consumedPercent = sessionGemini5h;
    else if (id === 'gemini-weekly') consumedPercent = sessionGeminiWeekly;
    else if (id === '3p-5h') consumedPercent = session3p5h;
    else if (id === '3p-weekly') consumedPercent = session3pWeekly;

    sessionDeltas[id] = {
      bucketId: id,
      window: curr.window,
      displayName: curr.displayName,
      groupName: curr.groupName,
      baselineFraction: Math.round(baseFraction * 10000) / 100,
      currentFraction: Math.round(currFraction * 10000) / 100,
      consumedPercent: Math.round(consumedPercent * 100) / 100,
      refreshed,
      resetTime: curr.resetTime,
      description: curr.description
    };
  }

  session.lastUpdated = now;
  store[convId] = session;
  saveSessionStore(store);

  return {
    baselineTime: session.baselineTime,
    baselineTurnIndex: session.baselineTurnIndex || 0,
    sessionDeltas,
    turns
  };
}

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------

// POST /api/quota-summary
app.api('/api/quota-summary', async (data) => {
  const reqConvId = data?.conversationId;
  const convId = reqConvId && reqConvId.trim() ? reqConvId.trim() : (getLatestConversationId() || 'default');

  const quotaResponse = await fetchUserQuotaSummary();
  const currentBuckets = normalizeBuckets(quotaResponse);
  const transcriptStats = parseTranscriptTurns(convId);
  const sessionAnalysis = calculateSessionAndTurnDeltas(convId, currentBuckets, transcriptStats);
  const title = getConversationTitle(convId);
  const config = loadConfig();

  const turns = sessionAnalysis.turns || [];
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return {
    status: 'ok',
    conversationId: convId,
    title,
    rawQuota: quotaResponse,
    currentBuckets,
    session: {
      baselineTime: sessionAnalysis.baselineTime,
      deltas: sessionAnalysis.sessionDeltas
    },
    metrics: {
      ...transcriptStats,
      turns: undefined
    },
    turns,
    latestTurn,
    config
  };
});

// POST /api/reset-baseline
app.api('/api/reset-baseline', async (data) => {
  const convId = data?.conversationId || getLatestConversationId();
  if (!convId) return { status: 'error', message: 'No conversation ID' };

  const quotaResponse = await fetchUserQuotaSummary();
  const currentBuckets = normalizeBuckets(quotaResponse);
  const store = loadSessionStore();
  const now = Date.now();

  const baselineBuckets = {};
  for (const [id, b] of Object.entries(currentBuckets)) {
    baselineBuckets[id] = {
      fraction: b.remainingFraction,
      resetTime: b.resetTime,
      timestamp: now
    };
  }

  const transcriptStats = parseTranscriptTurns(convId);
  const currentTurnCount = (transcriptStats.turns || []).length;

  store[convId] = {
    conversationId: convId,
    baselineTime: now,
    baselineTurnIndex: currentTurnCount,
    baselineBuckets,
    lastUpdated: now
  };
  saveSessionStore(store);

  const sessionAnalysis = calculateSessionAndTurnDeltas(convId, currentBuckets, transcriptStats);

  return {
    status: 'ok',
    conversationId: convId,
    baselineTime: now,
    session: sessionAnalysis
  };
});

// POST /api/save-config
app.api('/api/save-config', (data) => {
  const saved = saveConfig(data || {});
  return { status: 'ok', config: saved };
});

app.run();
