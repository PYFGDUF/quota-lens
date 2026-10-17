// Frontend Logic for Quota Lens UI Extension
// Antigravity Auxiliary Pane - Per-Turn & Global Quota Tracking
// Full i18n Architecture (zh-CN & en-US) & Restrained Aesthetic

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // i18n Dictionary
  // ---------------------------------------------------------------------------
  const I18N = {
    'zh-CN': {
      'app.title': '配额透视',
      'app.subtitle': '单次对话限额细分监控',
      'btn.refresh': '刷新',
      'btn.refreshTitle': '刷新最新配额数据',
      'btn.resetBaseline': '重设基准',
      'btn.resetBaselineTitle': '重设会话配额起始统计基准',
      'btn.langToggle': '切换为英文 / Switch to English',
      'convo.detecting': '正在同步当前会话...',
      'convo.live': '实时追踪',
      'convo.baselineStart': '基准起点: {time} (初始快照)',
      'convo.baselineSyncing': '基准起点: 实时同步中',
      'tab.gemini': 'Gemini 模型组',
      'tab.3p': 'Claude & GPT 组',
      'latest.title': '刚刚这一轮对话消耗',
      'latest.desc': '最近一次提问与智能体回复所产生的单独限额消耗',
      'latest.turnChip': '第 {n} 轮问答',
      'latest.noTurnChip': '暂无问答',
      'latest.waitingPrompt': '“等待对话中...”',
      'latest.noInteraction': '“当前对话尚无问答交互”',
      'latest.systemInput': '“（系统输入）”',
      'quota.5hLabel': '5 小时配额消耗',
      'quota.weeklyLabel': '每周配额消耗',
      'meta.tokens': 'Token: {n}',
      'meta.duration': '耗时: {n}秒',
      'meta.steps': '步骤: {n}步',
      'meta.cacheHit': '缓存: {pct}%',
      'turns.title': '交互轮次清单明细',
      'turns.desc': '每一轮“提问 -> 回复”的单独配额与 Token 消耗列表',
      'turns.sortNewest': '最新在最前',
      'turns.sortOldest': '最早在最前',
      'turns.empty': '暂无轮次交互记录',
      'turns.turnPill': '第 {n} 轮问答',
      'turns.textReply': '纯文字回复',
      'turns.toolTypes': '{n} 类工具',
      'turns.tokenDetail': 'Token: <b>{tot}</b> (入: {in}, 产: {out})',
      'turns.tokenDetailWithSub': 'Token: <b>{tot}</b> (主: {main}, 子: {sub})',
      'subagents.label': '子代理',
      'subagents.count': '{n} 个子代理',
      'subagents.toggleView': '展开 {n} 个子代理明细',
      'subagents.toggleHide': '收起子代理明细',
      'subagents.sessionSubStat': '子代理 ({n} 个) 消耗: 5h -{h5}% | 周 -{wk}%',
      'approval.approved': '已批准计划',
      'approval.declined': '已驳回计划',
      'approval.feedback': '工件反馈',
      'approval.commentPrefix': '附言',
      'session.title': '本次会话累计总消耗',
      'session.totalBadge': '5h: -{h5}% | 周: -{wk}%',
      'session.5hLabel': '5 小时总计消耗',
      'session.weeklyLabel': '每周总计消耗',
      'session.detail': '起点: {base}% -> 当前: {curr}%',
      'session.detailRefreshed': '起点: {base}% -> 当前: {curr}% (会话期间已刷新)',
      'session.totTokens': '总 Token: {n}',
      'session.inTokens': '输入: {n}',
      'session.outTokens': '生成: {n}',
      'session.cacheRatio': '缓存: {pct}%',
      'global.title': '全局账户配额健康度',
      'global.5hBadge': '5h剩余: {pct}%',
      'global.5hTitle': '5 小时配额限制',
      'global.weeklyTitle': '每周配额限制',
      'global.remainLabel': '剩余',
      'global.countdownLabel': '刷新倒计时:',
      'global.calculating': '计算中...',
      'global.noLimit': '无配额限制',
      'global.fullyRefreshed': '已完全刷新',
      'global.refreshingSoon': '即将刷新 / 已完全重置',
      'global.countdownDays': '{d} 天 {h} 小时 {m} 分',
      'global.countdownHours': '{h} 小时 {m} 分 {s} 秒',
      'global.countdownMins': '{m} 分 {s} 秒',
      'confirm.resetBaseline': '确认将当前时刻设为会话的新基准点？本次对话消耗统计将从此刻重新开始计算。',
      'tip.footer': '提示：用户发送一次提问至 Agent 回复完成计为“一次对话”。配额按 Token 成本加权扣减，5 小时配额平滑突发请求，每周配额锚定个人订阅层级。'
    },
    'en-US': {
      'app.title': 'Quota Lens',
      'app.subtitle': 'Per-Turn Quota & Limit Tracker',
      'btn.refresh': 'Refresh',
      'btn.refreshTitle': 'Refresh latest quota metrics',
      'btn.resetBaseline': 'Reset Base',
      'btn.resetBaselineTitle': 'Reset quota tracking baseline to current moment',
      'btn.langToggle': '切换为中文 / Switch to Chinese',
      'convo.detecting': 'Syncing active conversation...',
      'convo.live': 'Live Tracking',
      'convo.baselineStart': 'Baseline Start: {time} (Initial Snapshot)',
      'convo.baselineSyncing': 'Baseline: Syncing...',
      'tab.gemini': 'Gemini Models',
      'tab.3p': 'Claude & GPT Models',
      'latest.title': 'Latest Turn Quota Consumption',
      'latest.desc': 'Quota consumed specifically by the most recent prompt & reply turn',
      'latest.turnChip': 'Turn #{n}',
      'latest.noTurnChip': 'No Turns',
      'latest.waitingPrompt': '“Waiting for interactions...”',
      'latest.noInteraction': '“No interaction turns in this conversation yet”',
      'latest.systemInput': '“(System Input)”',
      'quota.5hLabel': '5-Hour Quota Consumed',
      'quota.weeklyLabel': 'Weekly Quota Consumed',
      'meta.tokens': 'Tokens: {n}',
      'meta.duration': 'Duration: {n}s',
      'meta.steps': 'Steps: {n} steps',
      'meta.cacheHit': 'Cache: {pct}%',
      'turns.title': 'Interaction Turns Breakdown',
      'turns.desc': 'Turn-by-turn quota and token consumption history',
      'turns.sortNewest': 'Newest First',
      'turns.sortOldest': 'Oldest First',
      'turns.empty': 'No interaction turns recorded yet',
      'turns.turnPill': 'Turn #{n}',
      'turns.textReply': 'Text response',
      'turns.toolTypes': '{n} tool types',
      'turns.tokenDetail': 'Tokens: <b>{tot}</b> (In: {in}, Out: {out})',
      'turns.tokenDetailWithSub': 'Tokens: <b>{tot}</b> (Main: {main}, Sub: {sub})',
      'subagents.label': 'Subagents',
      'subagents.count': '{n} subagents',
      'subagents.toggleView': 'View {n} subagents',
      'subagents.toggleHide': 'Hide details',
      'subagents.sessionSubStat': 'Subagents ({n}) usage: 5h -{h5}% | Wk -{wk}%',
      'approval.approved': 'Plan Approved',
      'approval.declined': 'Plan Declined',
      'approval.feedback': 'Artifact Feedback',
      'approval.commentPrefix': 'Note',
      'session.title': 'Session Cumulative Total',
      'session.totalBadge': '5h: -{h5}% | Wk: -{wk}%',
      'session.5hLabel': '5-Hour Total Consumed',
      'session.weeklyLabel': 'Weekly Total Consumed',
      'session.detail': 'Base: {base}% -> Now: {curr}%',
      'session.detailRefreshed': 'Base: {base}% -> Now: {curr}% (Refreshed in session)',
      'session.totTokens': 'Total Tokens: {n}',
      'session.inTokens': 'Input: {n}',
      'session.outTokens': 'Output: {n}',
      'session.cacheRatio': 'Cache: {pct}%',
      'global.title': 'Global Account Quota Health',
      'global.5hBadge': '5h Left: {pct}%',
      'global.5hTitle': '5-Hour Limit',
      'global.weeklyTitle': 'Weekly Limit',
      'global.remainLabel': 'left',
      'global.countdownLabel': 'Refresh In:',
      'global.calculating': 'Calculating...',
      'global.noLimit': 'No limit',
      'global.fullyRefreshed': 'Fully refreshed',
      'global.refreshingSoon': 'Resetting soon / Refreshed',
      'global.countdownDays': '{d}d {h}h {m}m',
      'global.countdownHours': '{h}h {m}m {s}s',
      'global.countdownMins': '{m}m {s}s',
      'confirm.resetBaseline': 'Reset baseline to current moment? Quota consumption will be counted from now onward.',
      'tip.footer': 'Note: One user prompt to completed agent response counts as one turn. Quota is deducted based on token cost. 5-hour limit smooths spikes; weekly limit anchors your tier.'
    }
  };

  // State
  let currentLang = 'zh-CN';
  let currentConvId = window.sidecar?.conversationId || null;
  let activeGroup = 'gemini'; // 'gemini' | '3p'
  let autoRefresh = true;
  let pollIntervalMs = 8000;
  let pollTimer = null;
  let countdownTimer = null;
  let cachedData = null;
  let sortNewestFirst = true;

  // Header Elements
  const btnLangToggle = document.getElementById('btn-lang-toggle');
  const langLabel = document.getElementById('lang-label');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnResetBaseline = document.getElementById('btn-reset-baseline');
  const convoTitle = document.getElementById('convo-title');
  const convoShortId = document.getElementById('convo-short-id');
  const convoBaselineTime = document.getElementById('convo-baseline-time');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const btnSortTurns = document.getElementById('btn-sort-turns');

  // Latest Turn Elements
  const latestTurnChip = document.getElementById('latest-turn-chip');
  const latestTurnTime = document.getElementById('latest-turn-time');
  const latestPromptQuote = document.getElementById('latest-prompt-quote');
  const latestTurn5h = document.getElementById('latest-turn-5h');
  const latestTurnWeekly = document.getElementById('latest-turn-weekly');
  const latestTurnTokens = document.getElementById('latest-turn-tokens');
  const latestTurnDuration = document.getElementById('latest-turn-duration');
  const latestTurnSteps = document.getElementById('latest-turn-steps');
  const latestTurnCache = document.getElementById('latest-turn-cache');

  // Turns List
  const turnsList = document.getElementById('turns-list');

  // Session Total Elements
  const sessionTotalBadge = document.getElementById('session-total-badge');
  const valDelta5h = document.getElementById('val-delta-5h');
  const barDelta5h = document.getElementById('bar-delta-5h');
  const deltaDetail5h = document.getElementById('delta-detail-5h');

  const valDeltaWeekly = document.getElementById('val-delta-weekly');
  const barDeltaWeekly = document.getElementById('bar-delta-weekly');
  const deltaDetailWeekly = document.getElementById('delta-detail-weekly');

  const sessionTotTokens = document.getElementById('session-tot-tokens');
  const sessionPromptTokens = document.getElementById('session-prompt-tokens');
  const sessionOutputTokens = document.getElementById('session-output-tokens');
  const sessionCacheRatio = document.getElementById('session-cache-ratio');

  // Global Health Elements
  const global5hBadge = document.getElementById('global-5h-badge');
  const globalRemain5h = document.getElementById('global-remain-5h');
  const globalBar5h = document.getElementById('global-bar-5h');
  const countdown5h = document.getElementById('countdown-5h');

  const globalRemainWeekly = document.getElementById('global-remain-weekly');
  const globalBarWeekly = document.getElementById('global-bar-weekly');
  const countdownWeekly = document.getElementById('countdown-weekly');

  // ---------------------------------------------------------------------------
  // i18n Engine
  // ---------------------------------------------------------------------------
  function t(key, params = {}) {
    const dict = I18N[currentLang] || I18N['zh-CN'];
    let text = dict[key] || I18N['zh-CN'][key] || key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return text;
  }

  function applyI18nToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      if (key) el.title = t(key);
    });

    langLabel.textContent = currentLang === 'zh-CN' ? 'EN' : '中文';
    btnLangToggle.title = t('btn.langToggle');
    const sortLabel = document.getElementById('sort-label');
    if (sortLabel) {
      sortLabel.textContent = sortNewestFirst ? t('turns.sortNewest') : t('turns.sortOldest');
    }
  }

  function setLanguage(lang) {
    currentLang = lang === 'en-US' ? 'en-US' : 'zh-CN';
    try {
      localStorage.setItem('quota_lens_lang', currentLang);
    } catch {}

    if (window.sidecar?.fetch) {
      window.sidecar.fetch('/api/save-config', {
        method: 'POST',
        body: JSON.stringify({ lang: currentLang })
      }).catch(() => {});
    }

    applyI18nToDOM();
    if (cachedData) render(cachedData);
  }

  function initLanguage(savedLang) {
    if (savedLang === 'en-US' || savedLang === 'zh-CN') {
      currentLang = savedLang;
    } else {
      try {
        const local = localStorage.getItem('quota_lens_lang');
        if (local === 'en-US' || local === 'zh-CN') {
          currentLang = local;
        } else {
          const nav = navigator.language || '';
          currentLang = nav.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
        }
      } catch {
        currentLang = 'zh-CN';
      }
    }
    applyI18nToDOM();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatNumber(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return n.toLocaleString(currentLang === 'zh-CN' ? 'zh-CN' : 'en-US');
  }

  function formatTime(isoString) {
    if (!isoString) return '--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--';
    const pad = (v) => String(v).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDuration(targetIso) {
    if (!targetIso) return t('global.fullyRefreshed');
    const target = new Date(targetIso).getTime();
    const now = Date.now();
    const diffSec = Math.floor((target - now) / 1000);

    if (diffSec <= 0) return t('global.refreshingSoon');

    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;

    if (days > 0) return t('global.countdownDays', { d: days, h: hours, m: mins });
    if (hours > 0) return t('global.countdownHours', { h: hours, m: mins, s: secs });
    return t('global.countdownMins', { m: mins, s: secs });
  }

  function getBarColor(fraction) {
    if (fraction > 0.4) return '#10b981';
    if (fraction > 0.15) return '#f59e0b';
    return '#ef4444';
  }

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  async function fetchSummary() {
    try {
      const convId = currentConvId || window.sidecar?.conversationId;
      const res = await window.sidecar.fetch('/api/quota-summary', {
        method: 'POST',
        body: JSON.stringify({ conversationId: convId })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cachedData = data;
      render(data);
    } catch (err) {
      console.error('[Quota Lens] Fetch error:', err);
    }
  }

  async function resetBaseline() {
    try {
      const convId = currentConvId || window.sidecar?.conversationId;
      const res = await window.sidecar.fetch('/api/reset-baseline', {
        method: 'POST',
        body: JSON.stringify({ conversationId: convId })
      });
      if (res.ok) {
        await fetchSummary();
      }
    } catch (err) {
      console.error('[Quota Lens] Reset baseline error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render(data) {
    if (!data) return;

    // 1. Current Conversation Bar
    currentConvId = data.conversationId;
    convoTitle.textContent = data.title || t('convo.detecting');
    convoShortId.textContent = data.conversationId ? `ID: ${data.conversationId.slice(0, 8)}` : 'ID: --';

    // 2. Baseline Timestamp
    if (data.session?.baselineTime) {
      convoBaselineTime.textContent = t('convo.baselineStart', { time: formatTime(data.session.baselineTime) });
    } else {
      convoBaselineTime.textContent = t('convo.baselineSyncing');
    }

    // 3. Resolve Active Bucket IDs
    const bucket5hKey = activeGroup === 'gemini' ? 'gemini-5h' : '3p-5h';
    const bucketWeeklyKey = activeGroup === 'gemini' ? 'gemini-weekly' : '3p-weekly';

    const delta5h = data.session?.deltas?.[bucket5hKey];
    const deltaWeekly = data.session?.deltas?.[bucketWeeklyKey];

    // 4. Render Latest Turn Card
    const latest = data.latestTurn;
    const latestModelBadge = document.getElementById('latest-turn-model-badge');
    if (latest) {
      latestTurnChip.textContent = t('latest.turnChip', { n: latest.turnIndex });
      if (latestModelBadge) {
        latestModelBadge.style.display = 'inline-flex';
        latestModelBadge.className = `turn-model-badge ${latest.modelGroup === '3p' ? 'model-3p' : 'model-gemini'}`;
        latestModelBadge.textContent = latest.modelGroup === '3p' ? 'Claude / GPT' : 'Gemini';
      }
      latestTurnTime.textContent = formatTime(latest.startTime);
      latestPromptQuote.innerHTML = renderTurnPromptHtml(latest);

      const q = latest.quota?.[activeGroup] || { consumed5h: 0, consumedWeekly: 0 };
      latestTurn5h.textContent = `-${q.consumed5h.toFixed(2)}%`;
      latestTurnWeekly.textContent = `-${q.consumedWeekly.toFixed(2)}%`;

      latestTurnTokens.textContent = t('meta.tokens', { n: formatNumber(latest.totalTokens) });
      latestTurnDuration.textContent = t('meta.duration', { n: latest.durationSec || 0 });
      latestTurnSteps.textContent = t('meta.steps', { n: latest.plannerCount || 0 });
      latestTurnCache.textContent = t('meta.cacheHit', { pct: latest.cacheHitRatio || 0 });
    } else {
      latestTurnChip.textContent = t('latest.noTurnChip');
      if (latestModelBadge) latestModelBadge.style.display = 'none';
      latestTurnTime.textContent = '--';
      latestPromptQuote.textContent = t('latest.noInteraction');
      latestTurn5h.textContent = '-0.00%';
      latestTurnWeekly.textContent = '-0.00%';
      latestTurnTokens.textContent = t('meta.tokens', { n: '0' });
      latestTurnDuration.textContent = t('meta.duration', { n: '0' });
      latestTurnSteps.textContent = t('meta.steps', { n: '0' });
      latestTurnCache.textContent = t('meta.cacheHit', { pct: '0' });
    }

    // 5. Render All Turns List
    renderTurnsList(data.turns || []);

    // 6. Render Session Total Summary
    const tot5h = delta5h?.consumedPercent || 0;
    const totWeekly = deltaWeekly?.consumedPercent || 0;
    sessionTotalBadge.textContent = t('session.totalBadge', { h5: tot5h.toFixed(2), wk: totWeekly.toFixed(2) });

    valDelta5h.textContent = `-${tot5h.toFixed(2)}%`;
    barDelta5h.style.width = `${Math.min(100, (tot5h / 15) * 100)}%`;
    const detailKey5h = delta5h?.refreshed ? 'session.detailRefreshed' : 'session.detail';
    deltaDetail5h.textContent = t(detailKey5h, {
      base: delta5h?.baselineFraction ?? '--',
      curr: delta5h?.currentFraction ?? '--'
    });

    valDeltaWeekly.textContent = `-${totWeekly.toFixed(2)}%`;
    barDeltaWeekly.style.width = `${Math.min(100, (totWeekly / 8) * 100)}%`;
    const detailKeyWeekly = deltaWeekly?.refreshed ? 'session.detailRefreshed' : 'session.detail';
    deltaDetailWeekly.textContent = t(detailKeyWeekly, {
      base: deltaWeekly?.baselineFraction ?? '--',
      curr: deltaWeekly?.currentFraction ?? '--'
    });

    const m = data.metrics || {};
    sessionTotTokens.textContent = t('session.totTokens', { n: formatNumber(m.totalTokensOverall || 0) });
    sessionPromptTokens.textContent = t('session.inTokens', { n: formatNumber(m.totalInputTokens || 0) });
    sessionOutputTokens.textContent = t('session.outTokens', { n: formatNumber(m.totalOutputTokens || 0) });
    sessionCacheRatio.textContent = t('session.cacheRatio', { pct: m.cacheHitRatio || 0 });

    // 7. Render Session Subagents Breakdown
    const sessionSubagentBar = document.getElementById('session-subagent-bar');
    const sessionSubagentCountText = document.getElementById('session-subagent-count-text');
    const sessionSubagentUsageText = document.getElementById('session-subagent-usage-text');
    if (sessionSubagentBar) {
      const bd = data.session?.breakdown;
      if (bd && bd.subagentCount > 0) {
        sessionSubagentBar.style.display = 'flex';
        sessionSubagentCountText.textContent = t('subagents.count', { n: bd.subagentCount });
        const h5 = activeGroup === 'gemini' ? bd.subagentGemini5h : (bd.subagent3p5h ?? 0);
        const wk = activeGroup === 'gemini' ? bd.subagentGeminiWeekly : (bd.subagent3pWeekly ?? 0);
        sessionSubagentUsageText.textContent = t('subagents.sessionSubStat', {
          n: bd.subagentCount,
          h5: (h5 || 0).toFixed(2),
          wk: (wk || 0).toFixed(2)
        });
      } else {
        sessionSubagentBar.style.display = 'none';
      }
    }

    // 8. Render Global Health & Countdowns
    const current5h = data.currentBuckets?.[bucket5hKey];
    const currentWeekly = data.currentBuckets?.[bucketWeeklyKey];

    if (current5h) {
      const frac = current5h.remainingFraction;
      const pct = (frac * 100).toFixed(1);
      global5hBadge.textContent = t('global.5hBadge', { pct });
      globalRemain5h.textContent = `${pct}%`;
      globalBar5h.style.width = `${pct}%`;
      globalBar5h.style.background = getBarColor(frac);
      countdown5h.textContent = formatDuration(current5h.resetTime);
      countdown5h.dataset.resetTime = current5h.resetTime || '';
    }

    if (currentWeekly) {
      const frac = currentWeekly.remainingFraction;
      const pct = (frac * 100).toFixed(1);
      globalRemainWeekly.textContent = `${pct}%`;
      globalBarWeekly.style.width = `${pct}%`;
      globalBarWeekly.style.background = getBarColor(frac);
      countdownWeekly.textContent = formatDuration(currentWeekly.resetTime);
      countdownWeekly.dataset.resetTime = currentWeekly.resetTime || '';
    }
  }

  function renderTurnsList(turns) {
    if (!turnsList) return;

    if (!Array.isArray(turns) || turns.length === 0) {
      turnsList.innerHTML = `<div class="empty-state card"><span>${t('turns.empty')}</span></div>`;
      return;
    }

    const displayTurns = [...turns];
    if (sortNewestFirst) {
      displayTurns.reverse();
    }

    turnsList.innerHTML = '';

    for (const tItem of displayTurns) {
      const card = document.createElement('div');
      card.className = 'card turn-card';

      const q = tItem.quota?.[activeGroup] || { consumed5h: 0, consumedWeekly: 0 };
      const toolEntries = Object.entries(tItem.tools || {});
      const toolLabel = toolEntries.length > 0
        ? t('turns.toolTypes', { n: toolEntries.length })
        : t('turns.textReply');
      const toolTooltip = toolEntries.length > 0
        ? toolEntries.map(([k, v]) => `${k} x${v}`).join(', ')
        : t('turns.textReply');

      const hasSubagents = Array.isArray(tItem.subagents) && tItem.subagents.length > 0;
      const subCount = hasSubagents ? tItem.subagents.length : 0;

      let tokenDetail = '';
      if (hasSubagents) {
        tokenDetail = t('turns.tokenDetailWithSub', {
          tot: formatNumber(tItem.totalTokens),
          main: formatNumber(tItem.mainTokens?.total || 0),
          sub: formatNumber(tItem.subagentTokens?.total || 0)
        });
      } else {
        tokenDetail = t('turns.tokenDetail', {
          tot: formatNumber(tItem.totalTokens),
          in: formatNumber(tItem.inputTokens),
          out: formatNumber(tItem.outputTokens)
        });
      }

      let subagentsHtml = '';
      if (hasSubagents) {
        const subItemsHtml = tItem.subagents.map((sub, idx) => {
          const subQ = sub.quota?.[activeGroup] || { consumed5h: 0, consumedWeekly: 0 };
          return `
            <div class="subagent-card-item">
              <div class="subagent-item-top">
                <span class="subagent-role-name">
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
                    <circle cx="12" cy="12" r="5"/>
                  </svg>
                  ${escapeHtml(sub.role)}
                </span>
                <span class="subagent-model-tag">${escapeHtml(sub.typeName || sub.model || 'subagent')}</span>
              </div>
              <div class="subagent-metrics-row">
                <span>Token: ${formatNumber(sub.totalTokens)} (${sub.stepCount}步${sub.durationSec ? ` · ${sub.durationSec}s` : ''})</span>
                <span class="subagent-quota-val">5h: -${subQ.consumed5h.toFixed(2)}% | 周: -${subQ.consumedWeekly.toFixed(2)}%</span>
              </div>
            </div>
          `;
        }).join('');

        subagentsHtml = `
          <div class="turn-subagent-row">
            <span class="turn-subagent-summary">
              <svg class="subagent-icon-mini" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              <span>${t('subagents.count', { n: subCount })} · ${formatNumber(tItem.subagentTokens?.total || 0)} Tokens</span>
            </span>
            <button class="turn-subagent-toggle" data-target="drawer-turn-${tItem.turnIndex}">
              <span class="subagent-toggle-text">${t('subagents.toggleView', { n: subCount })}</span>
              <svg class="subagent-chevron-icon" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
          <div class="subagent-drawer" id="drawer-turn-${tItem.turnIndex}" style="display: none;">
            ${subItemsHtml}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="turn-card-top">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="turn-badge-pill">${t('turns.turnPill', { n: tItem.turnIndex })}</span>
            <span class="turn-model-badge ${tItem.modelGroup === '3p' ? 'model-3p' : 'model-gemini'}">${escapeHtml(tItem.modelGroup === '3p' ? 'Claude / GPT' : 'Gemini')}</span>
          </div>
          <span class="turn-time-stamp">${formatTime(tItem.startTime)} (${tItem.durationSec || 0}s)</span>
        </div>
        <div class="turn-prompt-snippet">
          ${renderTurnPromptHtml(tItem)}
        </div>
        ${subagentsHtml}
        <div class="turn-quota-pills">
          <div class="quota-pill pill-5h">
            <span>${t('quota.5hLabel')}:</span>
            <span class="pill-num">-${q.consumed5h.toFixed(2)}%</span>
          </div>
          <div class="quota-pill pill-weekly">
            <span>${t('quota.weeklyLabel')}:</span>
            <span class="pill-num">-${q.consumedWeekly.toFixed(2)}%</span>
          </div>
        </div>
        <div class="turn-footer-row">
          <span>${tokenDetail}</span>
          <span class="turn-tools-badge" title="${escapeHtml(toolTooltip)}">${toolLabel}</span>
        </div>
      `;

      turnsList.appendChild(card);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderTurnPromptHtml(tItem) {
    if (!tItem) return `<i>${t('latest.systemInput')}</i>`;

    if (tItem.isArtifactAction && tItem.artifactName) {
      const action = tItem.artifactAction || 'approved';
      let iconSvg = '';
      let actionLabel = '';

      if (action === 'approved') {
        actionLabel = t('approval.approved');
        iconSvg = `
          <svg class="artifact-action-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
      } else if (action === 'declined') {
        actionLabel = t('approval.declined');
        iconSvg = `
          <svg class="artifact-action-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        `;
      } else {
        actionLabel = t('approval.feedback');
        iconSvg = `
          <svg class="artifact-action-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        `;
      }

      let commentHtml = '';
      if (tItem.userComment) {
        commentHtml = `<div class="artifact-comment-quote">${escapeHtml(tItem.userComment)}</div>`;
      }

      return `
        <div class="artifact-action-container">
          <div class="artifact-action-badge ${action}">
            ${iconSvg}
            <span class="artifact-action-label">${actionLabel}</span>
            <span class="artifact-action-name">${escapeHtml(tItem.artifactName)}</span>
          </div>
          ${commentHtml}
        </div>
      `;
    }

    if (tItem.userPrompt) {
      return `“${escapeHtml(tItem.userPrompt)}”`;
    }

    return `<i>${t('latest.systemInput')}</i>`;
  }

  // ---------------------------------------------------------------------------
  // Countdown Ticker
  // ---------------------------------------------------------------------------
  function startCountdownTicker() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (countdown5h.dataset.resetTime) {
        countdown5h.textContent = formatDuration(countdown5h.dataset.resetTime);
      }
      if (countdownWeekly.dataset.resetTime) {
        countdownWeekly.textContent = formatDuration(countdownWeekly.dataset.resetTime);
      }
    }, 1000);
  }

  // ---------------------------------------------------------------------------
  // Polling Loop
  // ---------------------------------------------------------------------------
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (!autoRefresh) return;
    pollTimer = setInterval(fetchSummary, pollIntervalMs);
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------
  btnRefresh.addEventListener('click', () => {
    btnRefresh.classList.add('loading');
    fetchSummary().finally(() => {
      btnRefresh.classList.remove('loading');
    });
  });

  btnResetBaseline.addEventListener('click', () => {
    if (confirm(t('confirm.resetBaseline'))) {
      resetBaseline();
    }
  });

  btnLangToggle.addEventListener('click', () => {
    const nextLang = currentLang === 'zh-CN' ? 'en-US' : 'zh-CN';
    setLanguage(nextLang);
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGroup = btn.dataset.group;
      if (cachedData) render(cachedData);
    });
  });

  btnSortTurns.addEventListener('click', () => {
    sortNewestFirst = !sortNewestFirst;
    const sortLabel = document.getElementById('sort-label');
    if (sortLabel) {
      sortLabel.textContent = sortNewestFirst ? t('turns.sortNewest') : t('turns.sortOldest');
    }
    if (cachedData) renderTurnsList(cachedData.turns || []);
  });

  if (turnsList) {
    turnsList.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.turn-subagent-toggle');
      if (!toggleBtn) return;
      const targetId = toggleBtn.dataset.target;
      if (!targetId) return;
      const drawer = document.getElementById(targetId);
      if (!drawer) return;

      const isHidden = drawer.style.display === 'none';
      drawer.style.display = isHidden ? 'flex' : 'none';
      toggleBtn.classList.toggle('expanded', isHidden);

      const labelSpan = toggleBtn.querySelector('.subagent-toggle-text');
      if (labelSpan) {
        if (isHidden) {
          labelSpan.textContent = t('subagents.toggleHide');
        } else {
          const count = drawer.querySelectorAll('.subagent-card-item').length;
          labelSpan.textContent = t('subagents.toggleView', { n: count });
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  initLanguage();
  fetchSummary();
  startPolling();
  startCountdownTicker();

})();
