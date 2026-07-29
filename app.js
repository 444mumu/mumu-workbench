/* ============================================================
   牟牟工作台 · 纯前端单页应用（localStorage 持久化）
   数据命名空间：mumu.* ｜ 七大独立模块：计划/记账/存款/资讯/爆款/运营/复盘
   ============================================================ */
'use strict';

/* ============ 基础工具 ============ */
const PREFIX = 'mumu.';
const load = (k, d) => { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
let _syncing = false, _autoSyncTimer = null;
const save = (k, v) => {
  try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {}
  scheduleAutoSync();
};
function scheduleAutoSync() {
  if (_syncing) return;
  const s = settings();
  if (!s.syncAuto || !s.syncToken || !s.syncGist) return;
  if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(() => { doSyncPush().catch(() => {}); }, 1500);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const money = (n) => (isFinite(n) ? Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '0');
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function toast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1900);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
  toast('已复制到剪贴板');
}
function notify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { try { new Notification(title, { body }); } catch (e) {} }
}

/* ============ 数据状态（相互隔离） ============ */
const getPlan = (d) => load('plan.' + d, { todos: [] });
const setPlan = (d, v) => save('plan.' + d, v);
const getReview = (d) => load('review.' + d, { text: '' });
const setReview = (d, v) => save('review.' + d, v);
const ledger = () => load('ledger', []);
const SAVINGS_SEED = () => [
  { id: uid(), name: '银行卡', account: '银行卡', goal: 0, balance: 0 },
  { id: uid(), name: '支付宝', account: '支付宝', goal: 0, balance: 0 },
  { id: uid(), name: '微信', account: '微信', goal: 0, balance: 0 },
];
const savings = () => {
  const v = load('savings', null);
  if (v == null) { const seed = SAVINGS_SEED(); save('savings', seed); return seed; }
  return v;
};
const videos = () => load('videos', []);
const ops = () => load('ops', []);
const newsFav = () => load('news.fav', []);
const setNewsFav = (v) => save('news.fav', v);
const settings = () => load('settings', { newsRefresh: 0, notify: false, ledgerBudget: 0, syncToken: '', syncGist: '', syncAuto: false, syncLast: '' });

const EXP_CATS = ['餐饮', '交通', '购物', '居住', '水电', '医疗', '娱乐', '宠物', '育儿', '学习', '人情', '其他'];
const INC_CATS = ['工资', '兼职', '红包', '理财', '其他收入'];
const ACCOUNTS = ['银行卡', '支付宝', '微信', '现金'];

let currentPlanDate = todayStr();
let currentReviewDate = todayStr();
let currentView = 'plan';

/* ============ 每日激励语（开页即见，按日变化） ============ */
const QUOTES = [
  '今天也要做闪闪发光的牟牟呀 ✨',
  '小步快跑，也能到达远方 🐑',
  '存下的每一分，都是给未来的自由 💰',
  '复盘不是为了自责，而是为了更从容 🌿',
  '爆款背后都是用心，你也可以 🎬',
  '运营没有捷径，只有日拱一卒 📚',
  '可爱不是软弱，是你最硬的铠甲 🌸',
  '今天的努力，是明天惊喜的伏笔 🎁',
  '照顾好自己，才有力气照顾世界 🐶',
  '钱要花在刀刃上，爱要落在细节里 💗',
  '坚持记录，时间会给你答案 📝',
  '别急，最好的总在慢慢来的路上 🌈',
  '把今天过好，就是最好的计划 🐏',
  '每只小羊都有自己的山坡，慢慢走 🌼',
];
function dailyQuote() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const dayIdx = Math.floor((d - start) / 86400000);
  return QUOTES[dayIdx % QUOTES.length];
}

/* ============ 1. 每日计划 ============ */
function renderPlan() {
  const d = currentPlanDate;
  const data = getPlan(d);
  const todos = data.todos || [];
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  const rate = total ? Math.round(done / total * 100) : 0;
  const list = todos.map(t => `
    <li class="${t.done ? 'done' : ''}">
      <input type="checkbox" data-act="toggle-todo" data-id="${t.id}" ${t.done ? 'checked' : ''}>
      <span class="txt"><input type="text" value="${esc(t.text)}" data-act="edit-todo" data-id="${t.id}"></span>
      <button class="del" data-act="del-todo" data-id="${t.id}" title="删除">✕</button>
    </li>`).join('') || '<li class="muted">还没有计划，添加一条今天的待办吧 🐑</li>';
  document.getElementById('planBody').innerHTML = `
    <div class="card">
      <div class="row">
        <input type="date" id="planDate" value="${d}" data-act="plan-date">
        <span class="chip">${d}</span>
        <button class="btn sm ghost" data-act="copy-plan">📋 复制到明天</button>
      </div>
      <div class="kpi" style="margin-top:12px">
        <div class="b"><b>${done}/${total}</b><small>已完成 / 总数</small></div>
        <div class="b"><b>${rate}%</b><small>今日完成率</small></div>
        <div class="b"><b>${total - done}</b><small>待完成</small></div>
      </div>
      <div class="progress" style="margin:4px 0 12px"><span style="width:${rate}%"></span></div>
      <ul class="checklist">${list}</ul>
      <div class="row" style="margin-top:12px">
        <input id="newTodo" placeholder="添加今日待办（如：拍一条抖音 / 给宠物梳毛）" style="flex:1;min-width:220px">
        <button class="btn" data-act="add-todo">添加</button>
      </div>
    </div>`;
}

/* ============ 2. 日常记账本（类目饼图 + 本月收支结余） ============ */
const DONUT_COLORS = ['#ff7eb3', '#ff9500', '#34c759', '#5ac8fa', '#af52de', '#ff453a', '#5856d6', '#ffd166', '#30c4c9', '#ff9ec7', '#a2845e', '#9aa0a6'];
function renderDonut(rows, total) {
  if (!rows.length || !total) return '<p class="muted">本月暂无支出数据</p>';
  const r = 60, cx = 80, cy = 80, C = 2 * Math.PI * r;
  let off = 0; const segs = []; const legend = [];
  rows.forEach((row, i) => {
    const frac = row.v / total;
    const len = frac * C;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    segs.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`);
    off += len;
    legend.push(`<div class="li"><span class="dot" style="background:${color}"></span>${esc(row.cat)}<span class="v">${money(row.v)} · ${(frac * 100).toFixed(0)}%</span></div>`);
  });
  return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 160 160">${segs.join('')}<text x="80" y="74" text-anchor="middle" font-size="14" fill="#9a8a92">支出</text><text x="80" y="96" text-anchor="middle" font-size="16" font-weight="700" fill="#ff3d8b">${money(total)}</text></svg><div class="legend">${legend.join('')}</div></div>`;
}
function renderLedger() {
  const budget = settings().ledgerBudget || 0;
  const list = ledger();
  const ym = todayStr().slice(0, 7);
  const month = list.filter(e => e.date.slice(0, 7) === ym);
  const exp = month.filter(e => e.type === 'expense');
  const inc = month.filter(e => e.type === 'income');
  const expSum = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const incSum = inc.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const balance = incSum - expSum;
  const byCat = {};
  exp.forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + (Number(e.amount) || 0); });
  const rows = Object.keys(byCat).map(c => ({ cat: c, v: byCat[c] })).sort((a, b) => b.v - a.v);
  const body = list.slice().reverse().map(e => `
    <tr>
      <td><input type="date" value="${e.date}" data-act="lg-date" data-id="${e.id}"></td>
      <td><select data-act="lg-type" data-id="${e.id}">
        <option value="expense" ${e.type === 'expense' ? 'selected' : ''}>支出</option>
        <option value="income" ${e.type === 'income' ? 'selected' : ''}>收入</option>
      </select></td>
      <td><select data-act="lg-cat" data-id="${e.id}">${(e.type === 'income' ? INC_CATS : EXP_CATS).map(c => `<option ${c === e.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td><select data-act="lg-account" data-id="${e.id}">${ACCOUNTS.map(a => `<option ${a === e.account ? 'selected' : ''}>${a}</option>`).join('')}</select></td>
      <td><input type="number" value="${e.amount}" data-act="lg-amt" data-id="${e.id}" style="width:90px"></td>
      <td><input value="${esc(e.note || '')}" data-act="lg-note" data-id="${e.id}" style="min-width:120px"></td>
      <td><button class="delrow" data-act="lg-del" data-id="${e.id}">删除</button></td>
    </tr>`).join('');
  document.getElementById('ledgerBody').innerHTML = `
    <div class="card">
      <div class="kpi">
        <div class="b"><b>${money(expSum)}</b><small>本月支出</small></div>
        <div class="b"><b>${money(incSum)}</b><small>本月收入</small></div>
        <div class="b"><b style="color:${balance >= 0 ? 'var(--green)' : 'var(--red)'}">${money(balance)}</b><small>本月结余</small></div>
      </div>
      <h3>${budget > 0 && expSum > budget ? `<div class="note" style="margin-top:10px">⚠️ 本月支出已超预算 ${money(expSum - budget)} 元，注意控量～</div>` : ''}
    <div class="row" style="margin-top:10px"><span>🎯 本月预算</span><input type="number" id="lgBudget" value="${budget}" data-act="lg-budget" style="width:120px"> <span class="muted">元（超出标红提醒）</span></div>
    <h3><span class="ic">🍩</span>本月支出类目占比</h3>
      ${renderDonut(rows, expSum)}
    </div>
    <div class="card">
      <h3><span class="ic">?</span>记账明细</h3>
      <div class="tbl-wrap"><table>
        <thead><tr><th>日期</th><th>类型</th><th>类目</th><th>账户</th><th>金额</th><th>备注</th><th></th></tr></thead>
        <tbody>${body || '<tr><td colspan="7" class="muted">还没有记账，记下第一笔吧～</td></tr>'}</tbody>
      </table></div>
      <div class="row" style="margin-top:12px">
        <input type="date" id="lgNewDate" value="${todayStr()}">
        <select id="lgNewType" data-act="lg-newtype"><option value="expense">支出</option><option value="income">收入</option></select>
        <select id="lgNewCat">${EXP_CATS.map(c => `<option>${c}</option>`).join('')}</select>
        <select id="lgNewAccount">${ACCOUNTS.map(a => `<option>${a}</option>`).join('')}</select>
        <input type="number" id="lgNewAmt" placeholder="金额" style="width:100px">
        <input id="lgNewNote" placeholder="备注" style="flex:1;min-width:140px">
        <button class="btn" data-act="lg-add">记一笔</button>
      </div>
      <div class="row" style="margin-top:8px"><span class="muted">支出类目含：餐饮/交通/购物/居住/水电/医疗/娱乐/宠物/育儿/学习/人情/其他；账户支持银行卡/支付宝/微信/现金</span></div>
    </div>`;
}

/* ============ 3. 存款计划（账户余额 + 总资产实时合计） ============ */
function renderSavings() {
  const rows = savings();
  const total = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const gap = rows.reduce((s, r) => s + ((Number(r.goal) || 0) - (Number(r.balance) || 0)), 0);
  const body = rows.map(r => {
    const goal = Number(r.goal) || 0;
    const bal = Number(r.balance) || 0;
    const pct = goal > 0 ? Math.min(100, bal / goal * 100) : 0;
    return `<tr>
      <td><input value="${esc(r.name)}" data-act="sv-name" data-id="${r.id}"></td>
      <td><select data-act="sv-account" data-id="${r.id}">${ACCOUNTS.map(a => `<option ${a === r.account ? 'selected' : ''}>${a}</option>`).join('')}</select></td>
      <td><input type="number" value="${r.goal}" data-act="sv-goal" data-id="${r.id}" placeholder="目标" style="width:100px"></td>
      <td><input type="number" value="${r.balance}" data-act="sv-balance" data-id="${r.id}" style="width:110px"></td>
      <td>${goal > 0 ? `<div class="progress"><span style="width:${pct}%"></span></div><small class="muted">${pct.toFixed(0)}%</small>` : '<span class="muted">未设目标</span>'}</td>
      <td><button class="delrow" data-act="sv-del" data-id="${r.id}">删除</button></td>
    </tr>`;
  }).join('');
  document.getElementById('savingsBody').innerHTML = `
    <div class="card">
      <div class="kpi">
        <div class="b"><b id="svTotal">${money(total)}</b><small>小金库总资产</small></div>
        <div class="b"><b>${rows.length}</b><small>账户数</small></div>
        <div class="b"><b>${money(gap)}</b><small>距目标差额</small></div>
      </div>
      <h3><span class="ic">🐑</span>各账户余额（修改即实时合计）</h3>
      <div class="tbl-wrap"><table>
        <thead><tr><th>账户名称</th><th>类型</th><th>目标金额</th><th>当前余额</th><th>完成度</th><th></th></tr></thead>
        <tbody>${body || '<tr><td colspan="6" class="muted">还没有账户，点击下方添加</td></tr>'}</tbody>
      </table></div>
      <div class="row" style="margin-top:12px"><button class="btn sm" data-act="sv-add">➕ 新增账户</button></div>
      <div class="row" style="margin-top:6px"><span class="muted">在「当前余额」输入数字，上方总资产会实时更新 💡</span></div>
    </div>`;
}

/* ============ 4. 每日实时资讯 ============ */
let newsCache = { douyin: [], weibo: [], guimie: [], daily60: [] };
let newsUpdated = {};
function newsTabDefs() {
  return [
    { id: 'douyin', label: '抖音热点' },
    { id: 'weibo', label: '微博热点' },
    { id: 'guimie', label: '鬼灭·二次元' },
    { id: 'daily60', label: '每日60秒' },
  ];
}
function renderNews() {
  const tab = (document.getElementById('newsTab') || {}).value || 'douyin';
  const defs = newsTabDefs();
  const tabsHtml = defs.map(t => `<button data-act="news-tab" data-tab="${t.id}" class="${t.id === tab ? 'active' : ''}">${t.label}</button>`).join('');
  const isManual = (tab === 'guimie');
  let html = `<div class="card">
    <div class="newstabs">${tabsHtml}</div>
    <div class="row">
      <button class="btn sm" data-act="news-refresh">🔄 刷新</button>
      <span class="chip">${newsCache[tab].length ? '已加载 ' + newsCache[tab].length + ' 条' + (newsUpdated[tab] ? ' · ' + fmtTime(newsUpdated[tab]) : '') : (isManual ? '手动追踪板' : '点击刷新获取')}</span>
    </div>`;
  if (isManual) {
    html += `<div class="note">鬼灭咒术 / 二次元新品实时追踪板：官方新品多先在小红书、微博超话、B 站公布，每天把看到的新品资讯贴进来就好啦 🎴</div>
      <div class="row" style="margin-top:8px">
        <input id="gmTitle" placeholder="新品名称（如：鬼灭之刃 柱训练篇 手办）" style="flex:1;min-width:180px">
        <input id="gmSource" placeholder="来源/平台" style="width:120px">
        <input id="gmUrl" placeholder="链接(可选)" style="flex:1;min-width:140px">
        <button class="btn" data-act="gm-add">添加</button>
      </div>`;
  }
  html += `</div>`;
  const list = newsCache[tab] || [];
  const items = list.map((it, i) => `
    <li>
      <span class="idx">${i + 1}</span>
      <span class="body">
        <div>${esc(it.title)}</div>
        ${it.url ? `<div class="meta"><a href="${esc(it.url)}" target="_blank" rel="noopener">查看原文</a>${it.hot ? ' · 🔥 ' + esc(it.hot) : ''}</div>` : (it.hot ? `<div class="meta">🔥 ${esc(it.hot)}</div>` : '')}
      </span>
      <span class="acts">
        <button data-act="news-fav" data-tab="${tab}" data-i="${i}">收藏</button>
        <button data-act="news-copy" data-tab="${tab}" data-i="${i}">复制</button>
      </span>
    </li>`).join('') || (isManual ? '<li class="muted">还没有追踪的新品，添加第一条吧～</li>' : '<li class="muted">暂无数据，点击上方「刷新」获取今日热点；若长时间为空，可能是接口暂不可达，可改用「鬼灭·二次元」手动追踪板。</li>');
  const favs = newsFav();
  const favHtml = favs.length ? `<div class="card"><h3><span class="ic">⭐</span>我的收藏</h3><ul class="favlist">${favs.map((f, i) => `<li><span>${esc(f.title)} <small class="muted">- ${esc(f.source || '')}</small></span><button class="x" data-act="fav-del" data-i="${i}">✕</button></li>`).join('')}</ul><button class="btn ghost sm" data-act="fav-copy-all" style="margin-top:8px">一键复制全部收藏</button></div>` : '';
  document.getElementById('newsBody').innerHTML = html + `<ul class="newslist">${items}</ul>` + favHtml;
}
function normalizeHot(j) {
  let list = null;
  if (Array.isArray(j)) list = j;
  else if (j.data && Array.isArray(j.data)) list = j.data;
  else if (j.data && Array.isArray(j.data.list)) list = j.data.list;
  else if (j.data && Array.isArray(j.data.data)) list = j.data.data;
  else if (Array.isArray(j.result)) list = j.result;
  else if (j.result && Array.isArray(j.result.list)) list = j.result.list;
  else if (Array.isArray(j.list)) list = j.list;
  if (!list) return [];
  return list.slice(0, 30).map(it => {
    if (typeof it === 'string') return { title: it };
    const title = it.title || it.name || it.word || it.hotword || it.query || '';
    const url = it.url || it.link || it.href || '';
    const hot = it.hot || it.hotScore || it.score || it.num || it.hot_value || '';
    return { title: String(title), url: String(url || ''), hot: hot ? String(hot) : '' };
  }).filter(x => x.title);
}
async function fetchHot(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json();
  return normalizeHot(j);
}
const NEWS_SOURCES = {
  douyin: ['https://api.vvhan.com/api/hotlist/douyinHot', 'https://uapis.cn/api/douyinHot', 'https://api.oioweb.cn/api/common/DouYinHot'],
  weibo: ['https://api.vvhan.com/api/hotlist/wbHot', 'https://uapis.cn/api/wbHot', 'https://api.oioweb.cn/api/common/WeiBoHot'],
};
const XHS_SOURCES = ['https://tenapi.cn/v2/xiaohongshuSearch?keyword=自媒体运营', 'https://api.vvhan.com/api/redbook'];
function fmtTime(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
async function fetchXhsPosts() {
  for (const u of XHS_SOURCES) { try { const r = await fetch(u, { cache: 'no-store' }); const j = await r.json(); const arr = normalizeXhs(j); if (arr.length) return arr; } catch (e) {} }
  return [];
}
function normalizeXhs(j) {
  let list = null;
  if (Array.isArray(j)) list = j;
  else if (j.data && Array.isArray(j.data)) list = j.data;
  else if (j.data && Array.isArray(j.data.list)) list = j.data.list;
  else if (j.data && Array.isArray(j.data.data)) list = j.data.data;
  else if (Array.isArray(j.result)) list = j.result;
  if (!list) return [];
  return list.slice(0, 12).map(it => {
    if (typeof it === 'string') return { title: it };
    const title = it.title || it.note_title || it.display_title || (it.content || it.desc || '').toString().slice(0, 50) || '';
    const url = it.url || it.note_url || it.link || '';
    const note = it.desc || it.content || it.note || '';
    return { title: String(title).slice(0, 60), url: String(url || ''), note: String(note).slice(0, 90) };
  }).filter(x => x.title);
}
const OPS_SEED = [
  { title: '小红书运营起号：3 天破千粉的选题公式', note: '爆款 = 情绪价值 + 实用干货 + 强封面；标题用「数字 + 痛点 + 结果」', source: '小红书' },
  { title: '自媒体运营必备：一篇笔记的发布 SOP', note: '封面 -> 标题 -> 正文前 3 行埋钩子 -> 话题标签 5-8 个 -> 发布时间 19-22 点', source: '小红书' },
  { title: '谷子 / 二次元账号如何做内容差异化', note: '从「开箱」卷到「测评 + 避坑」，建立人设比追热点更持久', source: '小红书' },
  { title: '小红书涨粉：评论区运营比发笔记更重要', note: '每条笔记主动回复前 10 条评论，引导互动提升权重', source: '小红书' },
  { title: '爆款标题的 8 种钩子写法', note: '反差、悬念、数字、痛点、身份、对比、干货、情绪，照着套', source: '小红书' },
];
function seedOpsIfEmpty() { if (ops().length) return; save('ops', OPS_SEED.map(s => ({ id: uid(), title: s.title, source: s.source, date: todayStr(), note: s.note, url: '' }))); }

async function fetchNews(tab) {
  try {
    if (tab === 'daily60') { const r = await fetch('https://60s.viki.moe/v2/60s', { cache: 'no-store' }); const j = await r.json(); if (j && j.code === 200 && Array.isArray(j.data.news)) { newsCache.daily60 = j.data.news.map(t => ({ title: t, source: '60s ' + (j.data.date || '') })); newsUpdated.daily60 = Date.now(); return true; } return false; }
    if (tab === 'douyin' || tab === 'weibo') { const urls = NEWS_SOURCES[tab] || []; for (const u of urls) { try { const arr = await fetchHot(u); if (arr && arr.length) { newsCache[tab] = arr; newsUpdated[tab] = Date.now(); return true; } } catch (e) {} } return false; }

    if (tab === 'daily60') {
      const r = await fetch('https://60s.viki.moe/v2/60s', { cache: 'no-store' });
      const j = await r.json();
      if (j && j.code === 200 && Array.isArray(j.data.news)) { newsCache.daily60 = j.data.news.map(t => ({ title: t, source: '60s ' + (j.data.date || '') })); return true; }
      return false;
    }
    return false;
  } catch (e) { return false; }
}

/* ============ 5. 爆款视频 ============ */
function renderVideos() {
  const list = videos();
  const body = list.slice().reverse().map(v => `
    <div class="vcard">
      <div class="vh">🎬 ${esc(v.title)} <span class="src">${esc(v.platform || '抖音')}</span></div>
      <div class="hook"><b>💥 爆点：</b>${esc(v.hook || '—')}</div>
      <div class="learn"><b>📚 可学：</b>${esc(v.learn || '—')}</div>
      <div class="meta"><span>📅 ${esc(v.date)}</span>${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">原视频</a>` : ''}</div>
      <div class="acts"><button class="btn ghost sm" data-act="vid-del" data-id="${v.id}">删除</button></div>
    </div>`).join('') || '<p class="muted">还没有收集爆款视频，每天加一条，慢慢建起自己的素材库 🎞️</p>';
  document.getElementById('videosBody').innerHTML = `
    <div class="card">
      <h3><span class="ic">?</span><span class="ic">➕</span>添加一条爆款视频</h3>
      <div class="row">
        <input id="vidTitle" placeholder="视频主题（如：鬼灭周边开箱）" style="flex:2;min-width:180px">
        <select id="vidPlatform">${['抖音', '小红书', 'B站', '快手', '微博', '其他'].map(p => `<option>${p}</option>`).join('')}</select>
        <input id="vidDate" type="date" value="${todayStr()}">
      </div>
      <div class="row" style="margin-top:8px"><input id="vidUrl" placeholder="原视频链接(可选)" style="flex:1;min-width:200px"></div>
      <div class="row" style="margin-top:8px"><input id="vidHook" placeholder="💥 爆点是什么？（标题/画面/节奏/人设）" style="flex:1;min-width:200px"></div>
      <div class="row" style="margin-top:8px"><input id="vidLearn" placeholder="📚 我能学到什么？（可复用的做法）" style="flex:1;min-width:200px"></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="vid-add">保存这条爆款</button></div>
    </div>
    <div class="grid">${body}</div>`;
}

/* ============ 6. 运营学习 ============ */
function renderOps() {
  const list = ops();
  const body = list.slice().reverse().map(o => `
    <div class="vcard">
      <div class="vh">📚 ${esc(o.title)} <span class="src">${esc(o.source || '抖音')}</span></div>
      <div class="field"><b>要点：</b>${esc(o.note || '—')}</div>
      <div class="meta"><span>📅 ${esc(o.date)}</span>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">原文</a>` : ''}</div>
      <div class="acts"><button class="btn ghost sm" data-act="ops-del" data-id="${o.id}">删除</button></div>
    </div>`).join('') || '<p class="muted">还没有运营学习素材，来自抖音 / 小红书 / 播客 / 微博 的干货都可以记下来 🎧</p>';
  document.getElementById('opsBody').innerHTML = `
    <div class="card">
      <h3><span class="ic">?</span><span class="ic">➕</span>添加一条运营学习</h3>
      <div class="row">
        <input id="opsTitle" placeholder="主题（如：小红书标题公式）" style="flex:2;min-width:180px">
        <select id="opsSource">${['抖音', '小红书', '播客', '微博', '公众号', '其他'].map(p => `<option>${p}</option>`).join('')}</select>
        <input id="opsDate" type="date" value="${todayStr()}">
      </div>
      <div class="row" style="margin-top:8px"><input id="opsUrl" placeholder="链接(可选)" style="flex:1;min-width:200px"></div>
      <div class="row" style="margin-top:8px"><input id="opsNote" placeholder="📝 核心要点 / 一句话总结" style="flex:1;min-width:200px"></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="ops-add">保存这条学习</button><button class="btn blue sm" data-act="ops-fetch-xhs">📡 抓取小红书运营帖</button></div>
    </div>
    <div class="grid">${body}</div>`;
}

/* ============ 7. 每日复盘 ============ */
function renderReview() {
  const d = currentReviewDate;
  const data = getReview(d);
  document.getElementById('reviewBody').innerHTML = `
    <div class="card">
      <div class="row">
        <input type="date" id="reviewDate" value="${d}" data-act="review-date">
        <span class="chip">${d}</span>
      </div>
      <h3 style="margin-top:12px"><span class="ic">✍️</span>今日工作 & 生活复盘</h3>
      <textarea id="reviewText" rows="10" placeholder="今天做了什么？最有成就感的一件事？踩了什么坑？明天想改进什么？🐑">${esc(data.text || '')}</textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn sm" data-act="review-save">💾 保存复盘</button>
        <span class="muted">会自动按日期保存，可随时回看</span>
      </div>
    </div>
    <div class="card">
      <h3><span class="ic">📊</span>周度数据分析</h3>
      <p class="muted">一键生成本周（周一至今）7 大模块的数据汇总，并给出 AI 洞察建议。</p>
      <button class="btn primary" data-act="week-analysis">📈 生成本周数据分析</button>
    </div>`;
}

/* ============ 周度数据分析 + AI 洞察 ============ */
function weekRange() {
  const day = (new Date().getDay() + 6) % 7; // 0=周一
  const mon = addDays(todayStr(), -day);
  const sun = addDays(mon, 6);
  return { mon, sun };
}
function weekDates() {
  const { mon } = weekRange(); const arr = [];
  for (let i = 0; i < 7; i++) arr.push(addDays(mon, i));
  return arr;
}
function buildInsights(d) {
  const out = [];
  out.push(`🐑 本周共 <b>${d.planDays}</b> 天有计划，平均完成率 <b>${d.planRate}%</b>。` + (d.planRate >= 80 ? '节奏很稳，保持住！' : d.planRate >= 50 ? '完成度中等，试试把任务拆细一点 ⏱️' : '完成率偏低，建议每天只定 3 件最重要的事，先动起来 💪'));
  if (d.expW > 0) out.push(`💸 本周支出 <b>${money(d.expW)}</b>，收入 <b>${money(d.incW)}</b>，结余 <b>${money(d.incW - d.expW)}</b>。` + (d.topCat ? `最大支出类目是「${d.topCat[0]}」(${money(d.topCat[1])})，下周可留意是否超预算。` : ''));
  else out.push('💸 本周还没记账，记得随手记一笔，数据才完整～');
  out.push(`💰 当前小金库总资产 <b>${money(d.totalAssets)}</b>。建议给账户设一个具体目标（如旅行基金 / 宠物医疗金），存钱更有动力 🐶。`);
  out.push(`🎬 本周收集爆款视频 <b>${d.vids}</b> 条，运营学习 <b>${d.opsN}</b> 条。` + (d.vids + d.opsN >= 5 ? '素材积累不错，可以开始复用里面的爆点啦！' : (d.vids + d.opsN === 0 ? '还没开始收集，每天加 1 条，一周就有 7 条灵感库 🧠' : '继续每天一小步，量变会引质变。')));
  out.push(`✍️ 本周完成复盘 <b>${d.reviewedDays}</b> 天。` + (d.reviewedDays >= 5 ? '复盘习惯很棒，思考会带来复利 🌱' : (d.reviewedDays === 0 ? '还没复盘哦，睡前花 5 分钟写几句，明天会更清醒。' : '复盘天数偏少，哪怕只写三行也有价值。')));
  out.push('🌸 牟牟专属建议：把「爆款视频的爆点」和「运营学习的要点」真正用在下一条内容里，比收藏 100 条更有用。');
  return out;
}
function openWeek() {
  const { mon, sun } = weekRange();
  const dates = weekDates();
  let planDays = 0, planDone = 0, planTotal = 0, reviewedDays = 0;
  dates.forEach(d => {
    const p = (getPlan(d).todos) || [];
    if (p.length) { planDays++; planTotal += p.length; planDone += p.filter(t => t.done).length; }
    if ((getReview(d).text || '').trim()) reviewedDays++;
  });
  const planRate = planTotal ? Math.round(planDone / planTotal * 100) : 0;
  const lg = ledger().filter(e => e.date >= mon && e.date <= sun);
  const expW = lg.filter(e => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const incW = lg.filter(e => e.type === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCat = {}; lg.filter(e => e.type === 'expense').forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + (Number(e.amount) || 0); });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const totalAssets = savings().reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const vids = videos().filter(e => e.date >= mon && e.date <= sun).length;
  const opsN = ops().filter(e => e.date >= mon && e.date <= sun).length;
  const favN = newsFav().length;
  const insights = buildInsights({ planDays, planRate, planTotal, planDone, expW, incW, topCat, totalAssets, vids, opsN, reviewedDays });
  const grid = `
    <div class="week-grid">
      <div class="w"><b>${planRate}%</b><small>计划平均完成率（${planDays}天有计划）</small></div>
      <div class="w"><b>${money(expW)}</b><small>本周支出</small></div>
      <div class="w"><b>${money(incW)}</b><small>本周收入</small></div>
      <div class="w"><b>${money(incW - expW)}</b><small>本周结余</small></div>
      <div class="w"><b>${money(totalAssets)}</b><small>小金库总资产</small></div>
      <div class="w"><b>${vids}</b><small>爆款视频收集</small></div>
      <div class="w"><b>${opsN}</b><small>运营学习收集</small></div>
      <div class="w"><b>${favN}</b><small>资讯收藏数</small></div>
      <div class="w"><b>${reviewedDays}/7</b><small>复盘天数</small></div>
    </div>`;
  const insHtml = `<div class="insight"><h3>🤖 AI 洞察与建议</h3><ul>${insights.map(s => `<li><span class="emoji">🌟</span>${s}</li>`).join('')}</ul></div>`;
  document.getElementById('weekBody').innerHTML = `<h3>📊 本周数据分析（${mon} ~ ${sun}）</h3>${grid}${insHtml}<div class="hint" style="margin-top:10px">数据来源于你本周在各模块的记录，全部保存在本地浏览器。</div>`;
  document.getElementById('weekModal').classList.add('show');
}

/* ============ AI 智能输入（自然语言解析） ============ */
const CAT_MAP = [
  ['工资', '工资'], ['兼职', '兼职'], ['红包', '红包'], ['理财', '理财'],
  ['餐饮', '饭|吃|外卖|奶茶|咖啡|餐厅|食|宵夜|下馆子'],
  ['交通', '打车|地铁|公交|高铁|火车|油|出行|机票|滴滴'],
  ['购物', '买|购|衣服|鞋|包|化妆品|口红'],
  ['宠物', '猫|狗|宠物|猫粮|狗粮|饲料|驱虫'],
  ['育儿', '娃|宝宝|育儿|奶粉|幼儿园|补习|早教'],
  ['医疗', '药|医院|看病|体检|牙|挂号'],
  ['娱乐', '电影|游戏|KTV|唱|剧本杀|游乐'],
  ['居住', '房租|物业|住宿|小区'],
  ['水电', '水费|电费|燃气|话费|物业'],
  ['学习', '书|课|培训|网课|资料|考证'],
  ['人情', '份子|礼金|随礼|人情'],
];
function smartLine(t) {
  const amtM = t.match(/(\d+(?:\.\d+)?)\s*元?/);
  const amount = amtM ? parseFloat(amtM[1]) : 0;
  let date = todayStr();
  if (/前天/.test(t)) date = addDays(todayStr(), -2);
  else if (/大后天/.test(t)) date = addDays(todayStr(), 3);
  else if (/后天/.test(t)) date = addDays(todayStr(), 2);
  else if (/昨天/.test(t)) date = addDays(todayStr(), -1);
  else if (/明天/.test(t)) date = addDays(todayStr(), 1);
  const isIncome = /收入|赚|工资|红包|理财|兼职|到账|进账|奖金/.test(t);
  const isExpense = /花|支|付|买|消费|开销|用了|花了|支出|购/.test(t);
  const account = /微信/.test(t) ? '微信' : /支付宝/.test(t) ? '支付宝' : /银行卡|银卡/.test(t) ? '银行卡' : /现金|钱包/.test(t) ? '现金' : '';
  if (isIncome) {
    let cat = '其他收入';
    for (const [c, kw] of CAT_MAP) { if (['工资', '兼职', '红包', '理财'].includes(c) && new RegExp(kw).test(t)) { cat = c; break; } }
    if (!amount) return { ok: false, text: '收入金额没听清，记得带上数字哦（如：工资到账8000）' };
    const lg = ledger(); lg.push({ id: uid(), date, type: 'income', cat, account: account || '银行卡', amount, note: '' }); save('ledger', lg);
    return { ok: true, text: `已记收入：${cat} ${money(amount)}元（${date}）` };
  }
  if (isExpense) {
    let cat = '其他';
    for (const [c, kw] of CAT_MAP) { if (!['工资', '兼职', '红包', '理财'].includes(c) && new RegExp(kw).test(t)) { cat = c; break; } }
    if (!amount) return { ok: false, text: '支出金额没听清，记得带上数字哦（如：吃饭花了35）' };
    const lg = ledger(); lg.push({ id: uid(), date, type: 'expense', cat, account: account || '微信', amount, note: '' }); save('ledger', lg);
    return { ok: true, text: `已记支出：${cat} ${money(amount)}元${account ? ' · ' + account : ''}（${date}）` };
  }
  if (/计划|待办|提醒|打卡|要做|记得|任务|背|跑步|看书|学习|运动|写|做|去/.test(t) || /明天|今天/.test(t)) {
    let txt = t.replace(/(今天|明天|后天|大后天|昨天|前天)/g, '')
      .replace(/(计划|待办|提醒我|提醒|记得|要做|任务|帮我|我想|我想去|去一下|一下)/g, '')
      .replace(/\s+/g, '').trim();
    if (!txt) txt = t;
    const dd = /明天/.test(t) ? addDays(todayStr(), 1) : date;
    const data = getPlan(dd); data.todos = data.todos || []; data.todos.push({ id: uid(), text: txt, done: false }); setPlan(dd, data);
    return { ok: true, text: `已加到${dd === todayStr() ? '今天' : '计划'}待办：「${txt}」` };
  }
  if (amount > 0) {
    const lg = ledger(); lg.push({ id: uid(), date, type: 'expense', cat: '其他', account: account || '微信', amount, note: '' }); save('ledger', lg);
    return { ok: true, text: `已记支出：其他 ${money(amount)}元${account ? ' · ' + account : ''}` };
  }
  return null;
}
function runSmart(raw) {
  const lines = raw.split(/[。\n！!？?；;]/).map(s => s.trim()).filter(Boolean);
  const msgs = [];
  lines.forEach(line => { const r = smartLine(line); if (r) msgs.push(r); });
  if (!msgs.length) msgs.push({ ok: false, text: '没太看懂，换个说法试试，例如「吃饭花了35微信」或「明天9点跑步」' });
  fullRender();
  return msgs;
}
function robotSend() {
  const inp = document.getElementById('robotInput');
  const text = inp.value.trim();
  if (!text) { toast('先说点什么吧～'); return; }
  const msgs = runSmart(text);
  document.getElementById('robotResult').innerHTML = msgs.map(m => `<div class="item"><span class="${m.ok ? 'ok' : 'err'}">${m.ok ? '✅' : '⚠️'} ${esc(m.text)}</span></div>`).join('');
}

/* ============ 设置 / 备份 / 安装 ============ */
function openSettings() {
  const s = settings();
  document.getElementById('modalBody').innerHTML = `
    <h3>⚙️ 通用设置</h3>
    <div class="field"><label>数据备份 / 恢复</label>
      <div class="row">
        <button class="btn green sm" data-set="export">⬇️ 导出备份(JSON)</button>
        <button class="btn ghost sm" data-set="import">⬆️ 导入备份</button>
        <input type="file" id="importFile" accept="application/json" style="display:none">
      </div>
      <div class="hint">本工作台为纯前端应用，数据存在你当前浏览器本地，不上传任何服务器。换设备可用导出/导入迁移数据。</div>
    </div>
    <div class="field"><label>☁️ 云同步（手机 ↔ 电脑 互通）</label>
      <div class="hint">借助你自己的 GitHub 私有 Gist 实现多端同步：数据只存到你自己的私有仓库，不经过任何第三方服务器。需要一个带 <b>gist</b> 权限的 GitHub 私人令牌（PAT）。</div>
      <div class="row"><input type="password" id="syncToken" value="${s.syncToken || ''}" data-set="sync-token" placeholder="GitHub 私人令牌(gist 权限)" style="width:240px"> <button class="btn blue sm" data-set="sync-create">① 创建同步空间</button></div>
      <div class="row">
        <button class="btn ghost sm" data-set="sync-push">⬆️ 本机→云(上传)</button>
        <button class="btn ghost sm" data-set="sync-pull">⬇️ 云→本机(拉取)</button>
        <label class="muted"><input type="checkbox" data-set="sync-auto" ${s.syncAuto ? 'checked' : ''}> 自动同步</label>
      </div>
      <div class="hint" id="syncStatus">${s.syncGist ? ('同步空间已就绪 · 上次同步：' + (s.syncLast || '无')) : '尚未创建同步空间（点「① 创建同步空间」一步搞定）'}</div>
    </div>
    <div class="field"><label>实时资讯自动刷新</label>
      <div class="row"><input type="number" value="${s.newsRefresh || 0}" data-set="newsRefresh" style="width:90px"> 分钟（0=不自动刷新）</div>
    </div>
    <div class="field"><label>桌面通知</label>
      <div class="row"><button class="btn ghost sm" data-set="req-notify">🔔 开启通知</button><span class="muted">开启后可在浏览器弹出提醒</span></div>
    </div>
    <div class="note">💡 小贴士：把这个网页「添加到主屏幕」，就能像 App 一样每天打开打卡；离线也能用。</div>`;
  document.getElementById('modal').classList.add('show');
}
function closeModal() { document.getElementById('modal').classList.remove('show'); }
function exportData() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
  const data = {}; keys.forEach(k => { try { data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {} });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'mumu-backup-' + todayStr() + '.json'; a.click(); toast('已导出备份');
}
function importData(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try { const data = JSON.parse(rd.result); Object.keys(data).forEach(k => save(k, data[k])); toast('导入成功，正在刷新'); fullRender(); }
    catch (e) { toast('文件解析失败'); }
  };
  rd.readAsText(file);
}

/* ============ ☁️ 云同步（GitHub 私有 Gist，多端互通） ============ */
const SYNC_FILE = 'mumu-workbench-sync.json';
function syncHeaders() {
  const t = settings().syncToken;
  return t ? { 'Authorization': 'token ' + t, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' } : null;
}
function buildSyncPayload() {
  const data = {};
  Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => {
    try { data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
  });
  return data;
}
// 以云端为主、尽量合并两端新增，避免任一侧数据丢失
function mergeSync(local, cloud) {
  const out = {};
  const ks = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  ks.forEach(k => {
    const lv = local ? local[k] : undefined, cv = cloud ? cloud[k] : undefined;
    if (Array.isArray(lv) && Array.isArray(cv)) {
      const seen = new Set(), arr = [];
      const uniq = (it) => { const id = it && (it.id || JSON.stringify(it)); if (id && seen.has(id)) return; if (id) seen.add(id); arr.push(it); };
      cv.forEach(uniq); lv.forEach(uniq); out[k] = arr;
    } else if (lv && typeof lv === 'object' && cv && typeof cv === 'object') {
      out[k] = mergeSync(lv, cv);
    } else {
      out[k] = (cv !== undefined) ? cv : lv;
    }
  });
  return out;
}
function applySyncPayload(payload) { Object.keys(payload || {}).forEach(k => save(k, payload[k])); fullRender(); }
async function gistGet(id) {
  const r = await fetch('https://api.github.com/gists/' + id, { headers: syncHeaders() });
  if (!r.ok) throw new Error('读取云端失败(' + r.status + ')');
  const j = await r.json();
  const c = j.files && j.files[SYNC_FILE] && j.files[SYNC_FILE].content;
  return c ? JSON.parse(c) : {};
}
async function gistCreate(payload) {
  const r = await fetch('https://api.github.com/gists', { method: 'POST', headers: syncHeaders(),
    body: JSON.stringify({ public: false, files: { [SYNC_FILE]: { content: JSON.stringify(payload, null, 2) } } }) });
  if (!r.ok) throw new Error('创建同步空间失败(' + r.status + ')');
  return (await r.json()).id;
}
async function gistUpdate(id, payload) {
  const r = await fetch('https://api.github.com/gists/' + id, { method: 'PATCH', headers: syncHeaders(),
    body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(payload, null, 2) } } }) });
  if (!r.ok) throw new Error('上传云端失败(' + r.status + ')');
}
async function doSyncCreate() {
  const s = settings();
  if (!s.syncToken) { toast('请先填写 GitHub 私人令牌'); return; }
  if (s.syncGist && !confirm('已存在同步空间，确定新建并覆盖吗？')) return;
  _syncing = true;
  try {
    const id = await gistCreate(buildSyncPayload());
    s.syncGist = id; save('settings', s);
    toast('同步空间已创建 ☁️'); openSettings();
  } catch (e) { toast(e.message); } finally { _syncing = false; }
}
async function doSyncPush() {
  const s = settings();
  if (!s.syncToken || !s.syncGist) { if (!s.syncAuto) toast('请先创建同步空间'); return; }
  _syncing = true;
  try {
    let payload = buildSyncPayload();
    try { payload = mergeSync(await gistGet(s.syncGist), payload); } catch (e) {}
    await gistUpdate(s.syncGist, payload);
    const ns = settings(); ns.syncLast = new Date().toLocaleString('zh-CN'); save('settings', ns);
    if (!s.syncAuto) toast('已上传到云端 ☁️');
  } finally { _syncing = false; }
}
async function doSyncPull() {
  const s = settings();
  if (!s.syncToken || !s.syncGist) { if (!s.syncAuto) toast('请先创建同步空间'); return; }
  _syncing = true;
  try {
    const merged = mergeSync(buildSyncPayload(), await gistGet(s.syncGist));
    applySyncPayload(merged);
    const ns = settings(); ns.syncLast = new Date().toLocaleString('zh-CN'); save('settings', ns);
    if (!s.syncAuto) toast('已从云端拉取并合并 ✅');
  } catch (e) { toast(e.message); } finally { _syncing = false; }
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
function openGuide() {
  const u = location.href;
  document.getElementById('modalBody').innerHTML = `
    <h3>📲 怎么装到手机（大白话版）</h3>
    <p>这个网页本身就是个 App。装好后手机桌面会多一个图标，点开就能每天打卡，数据存在你手机本地、不上传任何服务器。</p>
    <ol>
      <li>用手机浏览器打开这个地址（长按可复制）：<br><code style="word-break:break-all">${esc(u)}</code></li>
      <li>打开后点浏览器「分享 / 菜单」按钮（苹果在底部中间，安卓在右上角三点）。</li>
      <li>在菜单里选 <b>添加到主屏幕</b>（Add to Home Screen）。</li>
      <li>给图标起个名（默认 牟牟工作台），点「添加」。</li>
      <li>桌面出现图标，以后点它就进来，不用记网址。</li>
    </ol>
    <div class="note">装好之后，即便这个临时链接以后失效，已装好的图标也能离线打开（数据在你手机本地）。想换成长期不变的网址，可以让我帮你部署到云服务器。</div>`;
  document.getElementById('modal').classList.add('show');
}

/* ============ 视图切换（顶部菜单，每个模块单独一页） ============ */
const VIEWS = ['plan', 'ledger', 'savings', 'news', 'videos', 'ops', 'review'];
function switchView(v) {
  currentView = v;
  document.querySelectorAll('.menu-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  VIEWS.forEach(id => { const el = document.getElementById('view-' + id); if (el) el.hidden = (id !== v); });
  const c = document.getElementById('content'); if (c) c.scrollTop = 0;
  window.scrollTo(0, 0);
  if (v === 'news') { const tab = (document.getElementById('newsTab') || {}).value; if (tab && tab !== 'guimie' && !newsCache[tab].length) fetchNews(tab).then(() => renderNews()); }
}

/* ============ 事件处理 ============ */
function updateLedger(id, field, val) {
  const lg = ledger(); const e = lg.find(x => x.id === id);
  if (e) { e[field] = val; save('ledger', lg); }
}
function handleAct(el) {
  const act = el.dataset.act;
  const set = el.dataset.set;

  /* 计划 */
  if (act === 'add-todo') {
    const inp = document.getElementById('newTodo'); const v = inp.value.trim(); if (!v) return;
    const data = getPlan(currentPlanDate); data.todos = data.todos || []; data.todos.push({ id: uid(), text: v, done: false }); setPlan(currentPlanDate, data); inp.value = ''; renderPlan();
  } else if (act === 'toggle-todo') {
    const data = getPlan(currentPlanDate); const t = data.todos.find(x => x.id === el.dataset.id);
    if (t) { t.done = el.checked; setPlan(currentPlanDate, data); el.closest('li').classList.toggle('done', t.done); }
  } else if (act === 'edit-todo') {
    const data = getPlan(currentPlanDate); const t = data.todos.find(x => x.id === el.dataset.id); if (t) { t.text = el.value; setPlan(currentPlanDate, data); }
  } else if (act === 'del-todo') {
    const data = getPlan(currentPlanDate); data.todos = (data.todos || []).filter(x => x.id !== el.dataset.id); setPlan(currentPlanDate, data); renderPlan();
  } else if (act === 'plan-date') {
    currentPlanDate = el.value || todayStr(); renderPlan();
  } else if (act === 'copy-plan') {
    const d = currentPlanDate; const data = getPlan(d); const nd = addDays(d, 1); const ndData = getPlan(nd);
    ndData.todos = (ndData.todos || []).concat((data.todos || []).map(t => ({ id: uid(), text: t.text, done: false })));
    setPlan(nd, ndData); currentPlanDate = nd; renderPlan(); toast('已复制到 ' + nd);
  }

  /* 记账 */
  else if (act === 'lg-add') {
    const date = document.getElementById('lgNewDate').value || todayStr();
    const type = document.getElementById('lgNewType').value;
    const cat = document.getElementById('lgNewCat').value;
    const account = document.getElementById('lgNewAccount').value;
    const amount = Number(document.getElementById('lgNewAmt').value);
    if (!amount) { toast('请输入金额'); return; }
    const lg = ledger(); lg.push({ id: uid(), date, type, cat, account, amount, note: document.getElementById('lgNewNote').value }); save('ledger', lg); renderLedger();
  } else if (act === 'lg-del') { save('ledger', ledger().filter(x => x.id !== el.dataset.id)); renderLedger(); }
  else if (act === 'lg-date') { updateLedger(el.dataset.id, 'date', el.value); }
  else if (act === 'lg-type') {
    const lg = ledger(); const e = lg.find(x => x.id === el.dataset.id);
    if (e) { e.type = el.value; if (e.type === 'income' && !INC_CATS.includes(e.cat)) e.cat = '工资'; if (e.type === 'expense' && !EXP_CATS.includes(e.cat)) e.cat = '餐饮'; save('ledger', lg); renderLedger(); }
  } else if (act === 'lg-cat') { updateLedger(el.dataset.id, 'cat', el.value); }
  else if (act === 'lg-account') { updateLedger(el.dataset.id, 'account', el.value); }
  else if (act === 'lg-amt') { updateLedger(el.dataset.id, 'amount', Number(el.value)); }
  else if (act === 'lg-note') { updateLedger(el.dataset.id, 'note', el.value); }
  else if (act === 'lg-newtype') { const type = el.value; const sel = document.getElementById('lgNewCat'); const cats = type === 'income' ? INC_CATS : EXP_CATS; sel.innerHTML = cats.map(c => `<option>${c}</option>`).join(''); }
  else if (act === 'lg-budget') { const s = settings(); s.ledgerBudget = Number(el.value) || 0; save('settings', s); renderLedger(); }

  /* 存款 */
  else if (act === 'sv-add') { const r = savings(); r.push({ id: uid(), name: '新账户', account: '微信', goal: 0, balance: 0 }); save('savings', r); renderSavings(); }
  else if (act === 'sv-del') { save('savings', savings().filter(x => x.id !== el.dataset.id)); renderSavings(); }
  else if (act === 'sv-name') { const r = savings(); const x = r.find(y => y.id === el.dataset.id); if (x) { x.name = el.value; save('savings', r); } }
  else if (act === 'sv-account') { const r = savings(); const x = r.find(y => y.id === el.dataset.id); if (x) { x.account = el.value; save('savings', r); } }
  else if (act === 'sv-goal') { const r = savings(); const x = r.find(y => y.id === el.dataset.id); if (x) { x.goal = Number(el.value); save('savings', r); renderSavings(); } }
  else if (act === 'sv-balance') { const r = savings(); const x = r.find(y => y.id === el.dataset.id); if (x) { x.balance = Number(el.value); save('savings', r); renderSavings(); } }

  /* 资讯 */
  else if (act === 'news-tab') { document.getElementById('newsTab').value = el.dataset.tab; renderNews(); const tab = el.dataset.tab; if (tab !== 'guimie' && !newsCache[tab].length) fetchNews(tab).then(() => renderNews()); }
  else if (act === 'news-refresh') { const tab = (document.getElementById('newsTab') || {}).value; if (tab === 'guimie') { toast('追踪板无需刷新，直接添加即可'); return; } fetchNews(tab).then(ok => { renderNews(); toast(ok ? '已刷新' : '获取失败，接口可能暂不可达'); }); }
  else if (act === 'news-fav') {
    const tab = el.dataset.tab; const it = (newsCache[tab] || [])[Number(el.dataset.i)];
    if (it) { const f = newsFav(); if (!f.find(x => x.title === it.title)) { f.push({ title: it.title, source: it.source || tab }); setNewsFav(f); } renderNews(); toast('已收藏'); }
  } else if (act === 'news-copy') {
    const tab = el.dataset.tab; const it = (newsCache[tab] || [])[Number(el.dataset.i)]; if (it) copyText(it.title + (it.url ? '\n' + it.url : ''));
  } else if (act === 'fav-del') { const f = newsFav(); f.splice(Number(el.dataset.i), 1); setNewsFav(f); renderNews(); }
  else if (act === 'fav-copy-all') { const f = newsFav(); copyText(f.map(x => '· ' + x.title).join('\n')); }
  else if (act === 'gm-add') {
    const title = document.getElementById('gmTitle').value.trim(); if (!title) { toast('请输入新品名称'); return; }
    const source = document.getElementById('gmSource').value.trim();
    const url = document.getElementById('gmUrl').value.trim();
    newsCache.guimie.unshift({ title, source, url, manual: true });
    save('news.guimie', newsCache.guimie); renderNews(); toast('已添加追踪');
  }

  /* 爆款视频 */
  else if (act === 'vid-add') {
    const title = document.getElementById('vidTitle').value.trim(); if (!title) { toast('请输入视频主题'); return; }
    const v = videos(); v.push({ id: uid(), title, platform: document.getElementById('vidPlatform').value, date: document.getElementById('vidDate').value || todayStr(), hook: document.getElementById('vidHook').value, learn: document.getElementById('vidLearn').value, url: document.getElementById('vidUrl').value.trim() });
    save('videos', v); renderVideos();
  } else if (act === 'vid-del') { save('videos', videos().filter(x => x.id !== el.dataset.id)); renderVideos(); }

  /* 运营学习 */
  else if (act === 'ops-add') {
    const title = document.getElementById('opsTitle').value.trim(); if (!title) { toast('请输入主题'); return; }
    const o = ops(); o.push({ id: uid(), title, source: document.getElementById('opsSource').value, date: document.getElementById('opsDate').value || todayStr(), note: document.getElementById('opsNote').value, url: document.getElementById('opsUrl').value.trim() });
    save('ops', o); renderOps();
  } else if (act === 'ops-del') { save('ops', ops().filter(x => x.id !== el.dataset.id)); renderOps(); }
  else if (act === 'ops-fetch-xhs') { toast('正在抓取小红书运营帖…'); fetchXhsPosts().then(arr => { if (arr.length) { const o = ops(); arr.forEach(p => o.push({ id: uid(), title: p.title, source: '小红书', date: todayStr(), note: p.note, url: p.url })); save('ops', o); renderOps(); toast('已抓取 ' + arr.length + ' 条小红书帖'); } else { seedOpsIfEmpty(); renderOps(); toast('实时接口暂不可达，已展示内置示例'); } }); }

  /* 复盘 */
  else if (act === 'review-date') { currentReviewDate = el.value || todayStr(); renderReview(); }
  else if (act === 'review-save') { const data = getReview(currentReviewDate); data.text = document.getElementById('reviewText').value; setReview(currentReviewDate, data); toast('复盘已保存'); }
  else if (act === 'week-analysis') { openWeek(); }

  /* 设置 */
  else if (set === 'export') { exportData(); }
  else if (set === 'import') { document.getElementById('importFile').click(); }
  else if (set === 'newsRefresh') { const s = settings(); s.newsRefresh = Number(el.value) || 0; save('settings', s); }
  else if (set === 'req-notify') { if ('Notification' in window) Notification.requestPermission().then(p => { const s = settings(); s.notify = p === 'granted'; save('settings', s); toast(p === 'granted' ? '通知已开启' : '未授权通知'); }); }
  else if (set === 'sync-token') { const s = settings(); s.syncToken = el.value.trim(); save('settings', s); toast('令牌已保存（仅存于本机浏览器）'); }
  else if (set === 'sync-create') { doSyncCreate(); }
  else if (set === 'sync-push') { doSyncPush().catch(e => toast(e.message)); }
  else if (set === 'sync-pull') { doSyncPull().catch(e => toast(e.message)); }
  else if (set === 'sync-auto') {
    const s = settings(); s.syncAuto = el.checked; save('settings', s);
    if (s.syncAuto) { doSyncPull().then(() => doSyncPush()).catch(() => {}); toast('已开启自动同步'); }
    else toast('已关闭自动同步');
  }
}

function fullRender() {
  renderPlan(); renderLedger(); renderSavings(); renderNews(); renderVideos(); renderOps(); renderReview();
}

/* ============ 初始化 ============ */
function init() {
  const d = new Date();
  const label = document.getElementById('todayLabel'); if (label) label.textContent = todayStr() + ' ' + WEEK[d.getDay()];
  const q = dailyQuote();
  const qt = document.getElementById('quoteText'); if (qt) qt.textContent = q;
  const qd = document.getElementById('quoteDate'); if (qd) qd.textContent = '每日一句 · ' + todayStr();

  newsCache.guimie = load('news.guimie', []);
  seedOpsIfEmpty();
  fullRender();

  const st = settings();
  if (st.syncAuto && st.syncToken && st.syncGist) doSyncPull().then(() => {}).catch(() => {});

  fetchNews('daily60').then(() => { if (currentView === 'news') renderNews(); });
  const tab = (document.getElementById('newsTab') || {}).value;
  if (tab && tab !== 'guimie') fetchNews(tab).then(() => { if (currentView === 'news') renderNews(); });

  document.getElementById('btnSettings').onclick = openSettings;
  document.getElementById('btnBackup').onclick = exportData;
  document.getElementById('btnInstall').onclick = () => { if (deferredPrompt) { deferredPrompt.prompt(); if (deferredPrompt.userChoice) deferredPrompt.userChoice.then(() => { deferredPrompt = null; }); } else { openGuide(); } };
  document.getElementById('btnCloseModal').onclick = closeModal;
  document.getElementById('modal').onclick = (e) => { if (e.target.id === 'modal') e.currentTarget.classList.remove('show'); };
  document.getElementById('btnCloseWeek').onclick = () => document.getElementById('weekModal').classList.remove('show');
  document.getElementById('weekModal').onclick = (e) => { if (e.target.id === 'weekModal') e.currentTarget.classList.remove('show'); };
  document.getElementById('robotBtn').onclick = () => document.getElementById('robotPanel').classList.toggle('show');
  document.getElementById('robotClose').onclick = () => document.getElementById('robotPanel').classList.remove('show');
  document.getElementById('robotSend').onclick = robotSend;
  document.getElementById('robotClear').onclick = () => { document.getElementById('robotInput').value = ''; document.getElementById('robotResult').innerHTML = ''; };

  const s = settings();
  if (s.newsRefresh > 0) setInterval(() => { if (currentView === 'news') { const t = (document.getElementById('newsTab') || {}).value; if (t && t !== 'guimie') fetchNews(t).then(() => renderNews()); } }, s.newsRefresh * 60000);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* 事件委托 */
document.addEventListener('click', (e) => {
  const b = e.target.closest('.menu-item');
  if (b) { switchView(b.dataset.view); return; }
  const el = e.target.closest('[data-act],[data-set]');
  if (!el) return;
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
  handleAct(el);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'importFile') { if (e.target.files[0]) importData(e.target.files[0]); return; }
  const el = e.target.closest('[data-act],[data-set]');
  if (!el) return;
  handleAct(el);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.act === 'sv-balance') {
    const id = el.dataset.id; const rows = savings(); const r = rows.find(x => x.id === id);
    if (r) { r.balance = Number(el.value) || 0; save('savings', rows); const total = rows.reduce((s, x) => s + (Number(x.balance) || 0), 0); const tEl = document.getElementById('svTotal'); if (tEl) tEl.textContent = money(total); }
  }
});
