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

function parsePromptMetadata(raw) {
  if (!raw || typeof raw !== 'string') {
    return {
      text: '',
      isArtifactAction: false,
      artifactAction: null,
      artifactName: null,
      userComment: null
    };
  }

  const cleaned = cleanPromptText(raw);

  // Match: Comments on artifact URI: file:///.../xxx.md
  const artifactMatch = raw.match(/Comments on artifact URI:\s*(?:file:\/\/[^\s\n]+[\\/]([^\s\n\/\\]+))/i);

  if (artifactMatch) {
    const artifactName = artifactMatch[1];
    let action = 'feedback';
    if (/The user has approved this document/i.test(raw)) {
      action = 'approved';
    } else if (/The user declined this document/i.test(raw)) {
      action = 'declined';
    }

    // Extract any user comment outside of the boilerplate system text
    let userComment = cleaned
      .replace(/Comments on artifact URI:\s*file:\/\/[^\s]+/gi, '')
      .replace(/The user has approved this document\.?/gi, '')
      .replace(/The user declined this document\.?/gi, '')
      .trim();

    const actionText = action === 'approved' ? '已批准计划' : (action === 'declined' ? '已驳回计划' : '工件反馈');
    const fallbackText = `[${actionText}] ${artifactName}${userComment ? ` (${userComment})` : ''}`;

    return {
      text: fallbackText,
      isArtifactAction: true,
      artifactAction: action,
      artifactName,
      userComment: userComment || null
    };
  }

  return {
    text: cleaned,
    isArtifactAction: false,
    artifactAction: null,
    artifactName: null,
    userComment: null
  };
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

function getStepFromFullTranscriptSync(convId, lineIndex) {
  try {
    const p = join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript_full.jsonl');
    if (!existsSync(p)) return null;
    const content = readFileSync(p, 'utf8');
    const lines = content.split('\n');
    if (lines[lineIndex]) {
      return JSON.parse(lines[lineIndex]);
    }
  } catch {}
  return null;
}

function parseSubagentMetaFromArgs(rawArgs, fullStep) {
  if (fullStep && Array.isArray(fullStep.tool_calls)) {
    const fullTc = fullStep.tool_calls.find(t => t.name === 'invoke_subagent');
    if (fullTc?.args?.Subagents && Array.isArray(fullTc.args.Subagents)) {
      return fullTc.args.Subagents;
    }
  }

  if (Array.isArray(rawArgs)) return rawArgs;
  if (Array.isArray(rawArgs?.Subagents)) return rawArgs.Subagents;
  if (Array.isArray(rawArgs?.subagents)) return rawArgs.subagents;

  let str = '';
  if (typeof rawArgs === 'string') str = rawArgs;
  else if (typeof rawArgs?.Subagents === 'string') str = rawArgs.Subagents;
  else if (typeof rawArgs?.subagents === 'string') str = rawArgs.subagents;

  if (str) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {}

    try {
      const sanitized = str.replace(/[\u0000-\u001f]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
      });
      const parsed = JSON.parse(sanitized);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {}

    const results = [];
    const roleMatches = [...str.matchAll(/["']Role["']\s*:\s*["']([^"']+)["']/g)];
    const typeMatches = [...str.matchAll(/["']TypeName["']\s*:\s*["']([^"']+)["']/g)];
    const modelMatches = [...str.matchAll(/["']Model["']\s*:\s*["']([^"']+)["']/g)];
    const count = Math.max(roleMatches.length, typeMatches.length, 1);
    for (let i = 0; i < count; i++) {
      results.push({
        Role: roleMatches[i]?.[1] || 'Subagent',
        TypeName: typeMatches[i]?.[1] || 'subagent',
        Model: modelMatches[i]?.[1] || 'inherit'
      });
    }
    return results;
  }
  return [];
}

function parseSubagentTranscript(subId, meta) {
  const defaultRes = {
    conversationId: subId,
    role: meta?.Role || meta?.role || meta?.TypeName || meta?.typeName || 'Subagent',
    typeName: meta?.TypeName || meta?.typeName || 'subagent',
    model: meta?.Model || meta?.model || 'inherit',
    promptSnippet: (meta?.Prompt || meta?.prompt || '').slice(0, 100),
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    stepCount: 0,
    durationSec: 0,
    quota: {
      gemini: { consumed5h: 0, consumedWeekly: 0 },
      '3p': { consumed5h: 0, consumedWeekly: 0 }
    }
  };

  const p = join(BRAIN_DIR, subId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!existsSync(p)) return defaultRes;

  try {
    const content = readFileSync(p, 'utf8');
    const lines = content.split('\n');
    let subIn = 0;
    let subCache = 0;
    let subOut = 0;
    let startTime = null;
    let endTime = null;
    let stepCount = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      stepCount++;
      try {
        const step = JSON.parse(line);
        if (step.created_at) {
          if (!startTime) startTime = step.created_at;
          endTime = step.created_at;
        }
        if (step.type === 'PLANNER_RESPONSE') {
          subIn += Number(step.input_tokens) || 0;
          subCache += Number(step.cache_read_tokens) || 0;
          subOut += Number(step.output_tokens) || 0;
        }
      } catch {}
    }

    let durationSec = 0;
    if (startTime && endTime) {
      durationSec = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000));
    }

    // Gemini weight: 1*in + 3*out + 0.05*cache  (calibrated denom=280000)
    const costWeight = subIn + (3.0 * subOut) + (0.05 * subCache);
    const consumed5h = costWeight / 280000;
    const consumedWeekly = consumed5h / 4.0;
    // 3P (Claude/GPT) weight: 1*in + 5*out + 0.1*cache  (calibrated denom=138000; weekly=5h/2.0)
    const cost3p = subIn + (5.0 * subOut) + (0.1 * subCache);
    const consumed3p5h = cost3p / 138000;
    const consumed3pWeekly = consumed3p5h / 2.0;

    return {
      conversationId: subId,
      role: meta?.Role || meta?.role || meta?.TypeName || meta?.typeName || 'Subagent',
      typeName: meta?.TypeName || meta?.typeName || 'subagent',
      model: meta?.Model || meta?.model || 'inherit',
      promptSnippet: (meta?.Prompt || meta?.prompt || '').slice(0, 100),
      totalTokens: subIn + subOut,
      inputTokens: subIn,
      outputTokens: subOut,
      cacheReadTokens: subCache,
      stepCount,
      durationSec,
      quota: {
        gemini: {
          consumed5h: Math.round(consumed5h * 100) / 100,
          consumedWeekly: Math.round(consumedWeekly * 100) / 100
        },
        '3p': {
          consumed5h: Math.round(consumed3p5h * 100) / 100,
          consumedWeekly: Math.round(consumed3pWeekly * 100) / 100
        }
      }
    };
  } catch {
    return defaultRes;
  }
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
      mainTokensOverall: 0,
      subagentTokensOverall: 0,
      subagentCount: 0,
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

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);

        if (step.type === 'USER_INPUT') {
          turnIndex++;
          userMessageCount++;
          const promptMeta = parsePromptMetadata(step.content);

          currentTurn = {
            turnIndex,
            userPrompt: promptMeta.text || (step.content || '').slice(0, 80),
            isArtifactAction: promptMeta.isArtifactAction,
            artifactAction: promptMeta.artifactAction,
            artifactName: promptMeta.artifactName,
            userComment: promptMeta.userComment,
            startTime: step.created_at,
            endTime: step.created_at,
            inputTokens: 0,
            cacheReadTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            stepCount: 1,
            plannerCount: 0,
            tools: {},
            subagents: []
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

                if (name === 'invoke_subagent') {
                  let fullStep = null;
                  if (Array.isArray(step.truncated_fields) && step.truncated_fields.includes('tool_calls')) {
                    fullStep = getStepFromFullTranscriptSync(convId, lineIndex);
                  }
                  let rawArgs = tc.args || {};
                  if (typeof rawArgs === 'string') {
                    try { rawArgs = JSON.parse(rawArgs); } catch {}
                  }
                  if (tc.argumentsJson && !tc.args) {
                    try { rawArgs = JSON.parse(tc.argumentsJson); } catch {}
                  }
                  const subArray = parseSubagentMetaFromArgs(rawArgs, fullStep);

                  // Look ahead in subsequent steps for subagent creation result
                  for (let j = lineIndex + 1; j < Math.min(lines.length, lineIndex + 8); j++) {
                    if (!lines[j]?.trim()) continue;
                    try {
                      const nextStep = JSON.parse(lines[j]);
                      if (nextStep.type === 'GENERIC' && nextStep.content && nextStep.content.includes('Created the following subagents')) {
                        const ids = [...nextStep.content.matchAll(/["']conversationId["']\s*:\s*["']([a-f0-9\-]+)["']/g)].map(m => m[1]);
                        for (let k = 0; k < ids.length; k++) {
                          const subId = ids[k];
                          if (!currentTurn.subagents.some(s => s.conversationId === subId)) {
                            const meta = subArray[k] || {};
                            const subStats = parseSubagentTranscript(subId, meta);
                            currentTurn.subagents.push(subStats);
                          }
                        }
                      }
                    } catch {}
                  }
                }
              }
            }
          }
        }
      } catch {}
    }

    // Process turn statistics & subagent breakdown
    let allSubagentsCount = 0;
    let totalSubInput = 0;
    let totalSubOutput = 0;
    let totalSubCache = 0;

    for (const t of turns) {
      let subIn = 0;
      let subOut = 0;
      let subCache = 0;

      if (Array.isArray(t.subagents)) {
        for (const sub of t.subagents) {
          subIn += sub.inputTokens || 0;
          subOut += sub.outputTokens || 0;
          subCache += sub.cacheReadTokens || 0;
          allSubagentsCount++;
        }
      }

      totalSubInput += subIn;
      totalSubOutput += subOut;
      totalSubCache += subCache;

      t.mainTokens = {
        input: t.inputTokens,
        output: t.outputTokens,
        cache: t.cacheReadTokens,
        total: t.inputTokens + t.outputTokens
      };

      t.subagentTokens = {
        input: subIn,
        output: subOut,
        cache: subCache,
        total: subIn + subOut
      };

      t.totalTokens = t.mainTokens.total + t.subagentTokens.total;
      const promptTot = t.mainTokens.input + t.mainTokens.cache + subIn + subCache;
      const totalCacheRead = t.mainTokens.cache + subCache;
      t.cacheHitRatio = promptTot > 0 ? Math.round((totalCacheRead / promptTot) * 1000) / 10 : 0;

      if (t.startTime && t.endTime) {
        const diffMs = new Date(t.endTime).getTime() - new Date(t.startTime).getTime();
        t.durationSec = Math.max(0, Math.round(diffMs / 1000));
      } else {
        t.durationSec = 0;
      }
    }

    const combinedInput = totalInput + totalSubInput;
    const combinedCache = totalCache + totalSubCache;
    const combinedOutput = totalOutput + totalSubOutput;
    const combinedPrompt = combinedInput + combinedCache;
    const totalTokensOverall = combinedPrompt + combinedOutput;
    const cacheHitRatio = combinedPrompt > 0 ? (combinedCache / combinedPrompt) * 100 : 0;

    return {
      stepCount: lines.length,
      userMessageCount,
      plannerCount,
      totalInputTokens: combinedInput,
      totalCacheReadTokens: combinedCache,
      totalOutputTokens: combinedOutput,
      totalPromptTokens: combinedPrompt,
      totalTokensOverall,
      mainTokensOverall: (totalInput + totalCache) + totalOutput,
      subagentTokensOverall: (totalSubInput + totalSubCache) + totalSubOutput,
      subagentCount: allSubagentsCount,
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
      mainTokensOverall: 0,
      subagentTokensOverall: 0,
      subagentCount: 0,
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
    // Main agent cost weight
    const mainIn = t.mainTokens?.input || t.inputTokens || 0;
    const mainOut = t.mainTokens?.output || t.outputTokens || 0;
    const mainCache = t.mainTokens?.cache || t.cacheReadTokens || 0;

    // Gemini weight: 1*in + 3*out + 0.05*cache  (calibrated denom=280000)
    const mainCostWeight = mainIn + (3.0 * mainOut) + (0.05 * mainCache);
    const mainConsumed5h = mainCostWeight / 280000;
    const mainConsumedWeekly = mainConsumed5h / 4.0;
    // 3P (Claude/GPT) weight: 1*in + 5*out + 0.1*cache  (calibrated denom=138000; weekly=5h/2.0)
    const mainCost3p = mainIn + (5.0 * mainOut) + (0.1 * mainCache);
    const mainConsumed3p5h = mainCost3p / 138000;
    const mainConsumed3pWeekly = mainConsumed3p5h / 2.0;

    // Subagents cost summation
    let subConsumed5h = 0;
    let subConsumedWeekly = 0;
    let subConsumed3p5h = 0;
    let subConsumed3pWeekly = 0;

    if (Array.isArray(t.subagents)) {
      for (const sub of t.subagents) {
        subConsumed5h += sub.quota?.gemini?.consumed5h || 0;
        subConsumedWeekly += sub.quota?.gemini?.consumedWeekly || 0;
        subConsumed3p5h += sub.quota?.['3p']?.consumed5h || 0;
        subConsumed3pWeekly += sub.quota?.['3p']?.consumedWeekly || 0;
      }
    }

    t.mainQuota = {
      gemini: {
        consumed5h: Math.round(mainConsumed5h * 100) / 100,
        consumedWeekly: Math.round(mainConsumedWeekly * 100) / 100
      },
      '3p': {
        consumed5h: Math.round(mainConsumed3p5h * 100) / 100,
        consumedWeekly: Math.round(mainConsumed3pWeekly * 100) / 100
      }
    };

    t.subagentQuota = {
      gemini: {
        consumed5h: Math.round(subConsumed5h * 100) / 100,
        consumedWeekly: Math.round(subConsumedWeekly * 100) / 100
      },
      '3p': {
        consumed5h: Math.round(subConsumed3p5h * 100) / 100,
        consumedWeekly: Math.round(subConsumed3pWeekly * 100) / 100
      }
    };

    t.quota = {
      gemini: {
        consumed5h: Math.round((mainConsumed5h + subConsumed5h) * 100) / 100,
        consumedWeekly: Math.round((mainConsumedWeekly + subConsumedWeekly) * 100) / 100
      },
      '3p': {
        consumed5h: Math.round((mainConsumed3p5h + subConsumed3p5h) * 100) / 100,
        consumedWeekly: Math.round((mainConsumed3pWeekly + subConsumed3pWeekly) * 100) / 100
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

  let sessionMainGemini5h = 0;
  let sessionMainGeminiWeekly = 0;
  let sessionSubagentGemini5h = 0;
  let sessionSubagentGeminiWeekly = 0;

  for (const t of activeTurns) {
    sessionGemini5h += t.quota?.gemini?.consumed5h || 0;
    sessionGeminiWeekly += t.quota?.gemini?.consumedWeekly || 0;
    session3p5h += t.quota?.['3p']?.consumed5h || 0;
    session3pWeekly += t.quota?.['3p']?.consumedWeekly || 0;

    sessionMainGemini5h += t.mainQuota?.gemini?.consumed5h || 0;
    sessionMainGeminiWeekly += t.mainQuota?.gemini?.consumedWeekly || 0;
    sessionSubagentGemini5h += t.subagentQuota?.gemini?.consumed5h || 0;
    sessionSubagentGeminiWeekly += t.subagentQuota?.gemini?.consumedWeekly || 0;
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
    sessionBreakdown: {
      mainGemini5h: Math.round(sessionMainGemini5h * 100) / 100,
      mainGeminiWeekly: Math.round(sessionMainGeminiWeekly * 100) / 100,
      subagentGemini5h: Math.round(sessionSubagentGemini5h * 100) / 100,
      subagentGeminiWeekly: Math.round(sessionSubagentGeminiWeekly * 100) / 100,
      subagentCount: transcriptStats.subagentCount || 0
    },
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
      deltas: sessionAnalysis.sessionDeltas,
      breakdown: sessionAnalysis.sessionBreakdown
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
