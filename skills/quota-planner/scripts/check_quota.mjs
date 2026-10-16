#!/usr/bin/env node

/**
 * check_quota.mjs
 * Native CLI helper to inspect current Antigravity quota balances via ConnectRPC.
 * Zero external dependencies.
 *
 * Usage:
 *   node check_quota.mjs         # Human-readable summary
 *   node check_quota.mjs --json  # Machine-readable JSON output for Agent
 */

import http from 'node:http';

const isJson = process.argv.includes('--json');

const lsAddress = process.env.ANTIGRAVITY_LS_ADDRESS || '127.0.0.1:5387';
const csrfToken = process.env.ANTIGRAVITY_CSRF_TOKEN || '';

let [host, port] = lsAddress.split(':');
if (!port && host) {
  port = host;
  host = '127.0.0.1';
}
if (!host) host = '127.0.0.1';

function formatDuration(resetTimeIso) {
  if (!resetTimeIso) return '未知';
  const target = new Date(resetTimeIso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  if (diffMs <= 0) return '即将刷新';

  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const remainingMin = totalMin % 60;

  if (days > 0) {
    return `${days}天 ${remainingHours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时 ${remainingMin}分钟`;
  }
  return `${remainingMin}分钟`;
}

function queryQuota() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    const req = http.request({
      host,
      port: parseInt(port || '5387', 10),
      path: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': csrfToken,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 3500
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json?.response?.groups) {
            resolve(json.response);
          } else {
            reject(new Error(json?.message || 'Invalid ConnectRPC response'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ConnectRPC request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

function processQuota(raw) {
  const groups = [];
  let geminiGroup = null;

  for (const g of raw.groups || []) {
    const isGemini = g.displayName?.toLowerCase().includes('gemini');
    const bucketMap = {};
    for (const b of g.buckets || []) {
      const windowKey = b.window || (b.bucketId?.includes('5h') ? '5h' : 'weekly');
      bucketMap[windowKey] = {
        bucketId: b.bucketId,
        displayName: b.displayName,
        remainingFraction: typeof b.remainingFraction === 'number' ? b.remainingFraction : 1.0,
        remainingPercent: Number(((typeof b.remainingFraction === 'number' ? b.remainingFraction : 1.0) * 100).toFixed(2)),
        resetTime: b.resetTime,
        resetCountdown: formatDuration(b.resetTime)
      };
    }

    const groupInfo = {
      name: g.displayName,
      description: g.description,
      buckets: bucketMap
    };
    groups.push(groupInfo);
    if (isGemini) {
      geminiGroup = groupInfo;
    }
  }

  // Active primary group defaults to Gemini or first group
  const primary = geminiGroup || groups[0] || { buckets: {} };
  const rem5h = primary.buckets['5h']?.remainingPercent ?? 100.0;
  const remWk = primary.buckets['weekly']?.remainingPercent ?? 100.0;

  // Recommended safe budget:
  // Safe single task quota is capped at 25% of current remaining 5h quota
  const safe5hBudget = Number((rem5h * 0.25).toFixed(2));
  const safeWkBudget = Number((safe5hBudget / 4.0).toFixed(2));

  // Risk Level
  let riskLevel = 'green';
  if (rem5h < 15 || remWk < 10) {
    riskLevel = 'red';
  } else if (rem5h < 35 || remWk < 25) {
    riskLevel = 'yellow';
  }

  return {
    timestamp: new Date().toISOString(),
    primaryGroupName: primary.name,
    status: riskLevel,
    current: {
      limit5h: {
        remainingPercent: rem5h,
        resetCountdown: primary.buckets['5h']?.resetCountdown || '未知',
        resetTime: primary.buckets['5h']?.resetTime || null
      },
      limitWeekly: {
        remainingPercent: remWk,
        resetCountdown: primary.buckets['weekly']?.resetCountdown || '未知',
        resetTime: primary.buckets['weekly']?.resetTime || null
      }
    },
    safeRecommendedBudget: {
      max5hDeltaPercent: safe5hBudget,
      maxWeeklyDeltaPercent: safeWkBudget
    },
    allGroups: groups
  };
}

async function main() {
  try {
    const raw = await queryQuota();
    const result = processQuota(raw);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('====================================================');
    console.log('  Quota Lens - 配额状态实时报告');
    console.log('====================================================');
    console.log(`模型分组:   ${result.primaryGroupName}`);
    console.log(`健康状态:   [${result.status.toUpperCase()}]`);
    console.log(`5小时配额:  剩余 ${result.current.limit5h.remainingPercent}% (刷新倒计时: ${result.current.limit5h.resetCountdown})`);
    console.log(`每周配额:   剩余 ${result.current.limitWeekly.remainingPercent}% (刷新倒计时: ${result.current.limitWeekly.resetCountdown})`);
    console.log('----------------------------------------------------');
    console.log(`单次任务推荐安全预算: <= ${result.safeRecommendedBudget.max5hDeltaPercent}% (5h) / <= ${result.safeRecommendedBudget.maxWeeklyDeltaPercent}% (每周)`);
    console.log('====================================================');
  } catch (err) {
    if (isJson) {
      console.log(JSON.stringify({
        error: true,
        message: err.message,
        timestamp: new Date().toISOString()
      }, null, 2));
      process.exit(1);
    }
    console.error(`[Quota Lens] 获取配额失败: ${err.message}`);
    process.exit(1);
  }
}

main();
