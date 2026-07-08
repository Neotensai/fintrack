'use strict';
/* FinTrack v4
   Pay-period model. A "month" runs from one payday to the next.
   Payday = 27th, adjusted: Saturday 27th -> Friday 26th (back),
                           Sunday 27th  -> Monday 28th (forward).
   Income lands and credit clears on the adjusted payday.
   Ledger, net, savings target and pace are all scoped to the pay period. */

const TODAY = new Date();
const YEAR = TODAY.getFullYear();
const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ML = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CATS = ['Housing','Food','Utilities','Transport','Health','Entertainment','Shopping','Electronics','Travel','Tech','Subscriptions','Other'];
const CC = {Housing:'#6366f1',Food:'#34d399',Utilities:'#fbbf24',Transport:'#3b82f6',Health:'#ec4899',Entertainment:'#a855f7',Shopping:'#f97316',Electronics:'#06b6d4',Travel:'#84cc16',Tech:'#14b8a6',Subscriptions:'#e879f9',Other:'#64748b'};
const KEY = 'fintrack-v1';

function isoOf(d){ return d.toISOString().split('T')[0]; }
function dnum(d){ return d.getFullYear()*10000 + d.getMonth()*100 + d.getDate(); }

const DEFAULTS = {
  set: { startBal: 30000, startDate: isoOf(TODAY), income: 4500, incomeByMonth: {}, expByMonth: {},
         saveTarget: 500, saveByMonth: {}, fcIncome: '', fcExp: '', sbOverride: '', budgets: {}, hideBal: false, lastBackup: '' },
  txs: [],
  recurring: [],
  goals: [],
  wishlist: [],
};

let S = load();
S.tab = 'home';
S.editId = null;
S.forecastAmt = '';
S.fcMode = 'cash';
S.catScope = 'period';
S.viewYear = YEAR;
S.editYear = YEAR;
S.subview = null;
S.form = blankForm();

function blankForm() {
  return { desc:'', amt:'', date: isoOf(TODAY), type:'expense', pm:'cash', cat:'Food', recurring:false };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...JSON.parse(JSON.stringify(DEFAULTS)), ...p, set: { ...DEFAULTS.set, ...(p.set||{}) } };
    }
  } catch(e){}
  return JSON.parse(JSON.stringify(DEFAULTS));
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ set:S.set, txs:S.txs, recurring:S.recurring, goals:S.goals, wishlist:S.wishlist }));
  } catch(e){}
}

/* ---------- adjusted payday (the heart of v4) ---------- */
function adjustedPayday(y, m) {
  const d = new Date(y, m, 27, 12);
  const dow = d.getDay();           // 0 Sun ... 6 Sat
  if (dow === 6) d.setDate(26);     // Saturday -> Friday before
  else if (dow === 0) d.setDate(28);// Sunday   -> Monday after
  return d;
}
function nextPaydayAfter(y, m) {
  const ny = m === 11 ? y + 1 : y, nm = m === 11 ? 0 : m + 1;
  return adjustedPayday(ny, nm);
}
// which pay period a date falls in -> identified by {y,m} of the period's starting payday
function periodOf(date) {
  let y = date.getFullYear(), m = date.getMonth();
  if (dnum(date) < dnum(adjustedPayday(y, m))) { m--; if (m < 0) { m = 11; y--; } }
  return { y, m };
}
function inPeriod(dateStr, py, pm) {
  const d = new Date(dateStr + 'T12:00:00');
  const start = adjustedPayday(py, pm);
  const end = nextPaydayAfter(py, pm);
  return dnum(d) >= dnum(start) && dnum(d) < dnum(end);
}

/* ---------- per-month settings (keyed by the period's payday month) ---------- */
function incomeFor(y, m) {
  const v = S.set.incomeByMonth[`${y}-${m}`];
  return (v === undefined || v === null || v === '') ? S.set.income : +v;
}
function saveFor(y, m) {
  const v = S.set.saveByMonth[`${y}-${m}`];
  return (v === undefined || v === null || v === '') ? S.set.saveTarget : +v;
}
function expOv(y, m) {
  const v = S.set.expByMonth[`${y}-${m}`];
  return (v === undefined || v === null || v === '') ? null : +v;
}

/* ---------- recurring engine ---------- */
function postRecurring() {
  let posted = 0;
  for (const r of S.recurring) {
    let next = new Date(r.next + 'T12:00:00');
    while (dnum(next) <= dnum(TODAY)) {
      S.txs.push({ id: Date.now() + Math.random(), desc: r.desc, amt: r.amt, date: isoOf(next), type: r.type, pm: r.pm, cat: r.cat, fromRec: true });
      next.setMonth(next.getMonth() + 1);
      posted++;
    }
    r.next = isoOf(next);
  }
  if (posted) save();
  return posted;
}

/* ---------- helpers ---------- */
// credit clears 3 months after purchase, on that month's adjusted payday
function clrDate(ds){ const d = new Date(ds + 'T12:00:00'); d.setMonth(d.getMonth() + 3); return adjustedPayday(d.getFullYear(), d.getMonth()); }
function $$(n){ const s = n<0?'-':''; return s+'€'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function $0(n){ const s = n<0?'-':''; return s+'€'+Math.round(Math.abs(n)).toLocaleString('en-US'); }
// privacy mask for the overall balance when hidden
function maskBig(s){ return S.set.hideBal ? '€ ••••••' : s; }
function maskSm(s){ return S.set.hideBal ? '€••••' : s; }
const EYE_ON = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function toggleBal(){ S.set.hideBal = !S.set.hideBal; save(); render(); }

/* ---------- durability ---------- */
let PERSISTED = null; // null unknown, true granted, false best-effort
function backupInfo(pStart) {
  if (!S.set.lastBackup) return { fresh: false, label: 'never' };
  const lb = new Date(S.set.lastBackup + 'T12:00:00');
  const days = Math.max(0, Math.round((TODAY - lb) / 86400000));
  const fresh = dnum(lb) >= dnum(pStart); // backed up within the current pay period
  return { fresh, label: days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago' };
}
function sd(s){ return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function sdD(d){ return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function ld(d){ return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------- balance at any date ----------
   startBal is the balance ON startDate (already includes any pay received up to and
   including that day). Paydays strictly AFTER startDate accrue. Cash applies on its
   date; credit on its clearance (adjusted) date. All compared by calendar day. */
function balAt(date) {
  let b = S.set.startBal;
  const sd0 = new Date(S.set.startDate + 'T12:00:00');
  const dq = dnum(date), ds0 = dnum(sd0);
  let y = sd0.getFullYear(), m = sd0.getMonth();
  for (let i = 0; i < 1200; i++) {
    const pd = adjustedPayday(y, m);
    if (dnum(pd) > dq) break;
    if (dnum(pd) > ds0) b += incomeFor(y, m);
    m++; if (m > 11) { m = 0; y++; }
  }
  for (const t of S.txs) {
    const d = new Date(t.date + 'T12:00:00');
    if (t.type === 'income') { if (dnum(d) <= dq) b += t.amt; }
    else if (t.pm === 'cash') { if (dnum(d) <= dq) b -= t.amt; }
    else { if (dnum(clrDate(t.date)) <= dq) b -= t.amt; }
  }
  return b;
}

/* ---------- core computation ---------- */
function compute() {
  const { txs } = S;
  const now = TODAY;
  const nowNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

  const bal = balAt(now);

  const pend = [];
  for (const t of txs) {
    if (t.type === 'expense' && t.pm === 'credit') {
      const cd = clrDate(t.date);
      if (dnum(cd) > dnum(now)) pend.push({ ...t, cd });
    }
  }
  const d90 = new Date(nowNoon); d90.setDate(d90.getDate() + 90);
  const p90 = pend.filter(t => dnum(t.cd) <= dnum(d90)).reduce((s,t)=>s+t.amt, 0);
  const ptot = pend.reduce((s,t)=>s+t.amt, 0);
  const gm = {};
  for (const t of pend) {
    const k = dnum(t.cd);
    if (!gm[k]) gm[k] = { date: t.cd, items: [], total: 0 };
    gm[k].items.push(t); gm[k].total += t.amt;
  }
  const pGroups = Object.values(gm).sort((a,b)=>a.date-b.date);

  const ebm = {};
  for (const t of txs) {
    if (t.type === 'expense') {
      const d = new Date(t.date + 'T12:00:00');
      ebm[`${d.getFullYear()}-${d.getMonth()}`] = (ebm[`${d.getFullYear()}-${d.getMonth()}`]||0) + t.amt;
    }
  }
  const ev = Object.values(ebm);
  const cur = periodOf(now);
  const avgExpHist = ev.length ? ev.reduce((a,b)=>a+b,0)/ev.length : incomeFor(cur.y,cur.m) * 0.65;

  let inc12 = 0;
  for (let k = 0; k < 12; k++) {
    const fd = new Date(now.getFullYear(), now.getMonth() + k, 1);
    inc12 += incomeFor(fd.getFullYear(), fd.getMonth());
  }
  const avgInc12 = inc12 / 12;
  const fcIncome = (S.set.fcIncome !== '' && S.set.fcIncome != null && +S.set.fcIncome > 0) ? +S.set.fcIncome : avgInc12;
  const fcExp = (S.set.fcExp !== '' && S.set.fcExp != null && +S.set.fcExp > 0) ? +S.set.fcExp : avgExpHist;
  const sbManual = (S.set.sbOverride !== '' && S.set.sbOverride != null && +S.set.sbOverride > 0);
  const sb = sbManual ? +S.set.sbOverride : fcExp * 3;

  const pStart = adjustedPayday(cur.y, cur.m);
  const pEnd = nextPaydayAfter(cur.y, cur.m);
  const pTxs = txs.filter(t => inPeriod(t.date, cur.y, cur.m)).sort((a,b)=> new Date(b.date) - new Date(a.date));
  const pIncomeBase = incomeFor(cur.y, cur.m);
  const pExtra = pTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amt,0);
  const mInc = pIncomeBase + pExtra;
  const mCash = pTxs.filter(t=>t.type==='expense' && t.pm==='cash').reduce((s,t)=>s+t.amt,0);
  const mCredit = pTxs.filter(t=>t.type==='expense' && t.pm==='credit').reduce((s,t)=>s+t.amt,0);
  const mNet = mInc - mCash;
  const mCommitted = mCash + mCredit;
  const curExpPlan = expOv(cur.y, cur.m) ?? fcExp;
  const remainingExp = Math.max(0, curExpPlan - mCommitted); // expected spend still to come before next payday

  const totalDays = Math.max(1, Math.round((pEnd - pStart)/86400000));
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((nowNoon - pStart)/86400000)));
  const periodPct = (elapsedDays / totalDays) * 100;
  const spendPct = mInc > 0 ? (mCommitted / mInc) * 100 : 0;
  const pace = spendPct - periodPct;

  const sTarget = saveFor(cur.y, cur.m);
  const allowedSpend = Math.max(0, mInc - sTarget);
  const projSave = mInc - mCommitted;
  const savePct = allowedSpend > 0 ? (mCommitted / allowedSpend) * 100 : (mCommitted>0?999:0);
  const saveStatus = savePct >= 100 ? 'missed' : savePct >= 80 ? 'close' : 'ok';

  const daysToNext = Math.max(0, Math.round((pEnd - nowNoon)/86400000));
  const prog = Math.min(100, Math.max(0, ((nowNoon - pStart)/(pEnd - pStart))*100));
  const a27 = gm[dnum(pEnd)]?.total || 0;
  const payNext = incomeFor(pEnd.getFullYear(), pEnd.getMonth());

  const catSpend = {};
  for (const t of pTxs) if (t.type === 'expense') catSpend[t.cat] = (catSpend[t.cat]||0) + t.amt;

  const ydata = [];
  const VY = S.viewYear || YEAR;
  for (let m = 0; m < 12; m++) {
    const start = adjustedPayday(VY, m);
    const end = nextPaydayAfter(VY, m);
    let ce = 0, cc = 0, cp = 0, ei = 0;
    const mt = [];
    for (const t of txs) {
      if (inPeriod(t.date, VY, m)) {
        mt.push(t);
        if (t.type === 'income') ei += t.amt;
        else if (t.pm === 'cash') ce += t.amt;
        else cp += t.amt;
      }
      if (t.type === 'expense' && t.pm === 'credit') {
        const cd = clrDate(t.date);
        if (dnum(cd) >= dnum(start) && dnum(cd) < dnum(end)) cc += t.amt;
      }
    }
    const ti = incomeFor(VY, m) + ei;
    const net = ti - ce - cc;
    const endBal = balAt(new Date(end.getTime() - 86400000));
    const tgt = saveFor(VY, m);
    const saved = ti - ce - cp;
    const isCur = (m === cur.m && VY === cur.y);
    const isFut = dnum(start) > dnum(now);
    ydata.push({ m, start, end, mt, ti, ce, cc, cp, net, endBal, tgt, saved, isCur, isFut });
  }

  // honest-future pass: projected spend, net, and chained end balance
  const sd0d = dnum(new Date(S.set.startDate + 'T12:00:00'));
  let run = null;
  for (const md of ydata) {
    md.preStart = dnum(md.end) <= sd0d;               // period ended before tracking began
    md.heavy = md.isFut && md.cc >= 0.3 * Math.max(1, md.ti); // big clearance ahead
    if (!md.isFut) {
      md.pSpend = md.ce + md.cp;
      md.projNet = md.net;
      md.projEnd = md.isCur ? md.endBal - remainingExp : md.endBal;
    } else {
      md.pSpend = Math.max(expOv(VY, md.m) ?? fcExp, md.ce + md.cp); // period plan (or avg), unless known txs exceed it
      md.projNet = md.ti - md.pSpend - md.cc;
      md.projEnd = (run !== null ? run : bal) + md.projNet;
    }
    run = md.projEnd;
  }

  // category lens: previous period and full-year maps
  const prevM = cur.m === 0 ? 11 : cur.m - 1, prevY = cur.m === 0 ? cur.y - 1 : cur.y;
  const catPrev = {};
  for (const t of txs) if (t.type === 'expense' && inPeriod(t.date, prevY, prevM)) catPrev[t.cat] = (catPrev[t.cat]||0) + t.amt;
  const catYear = {};
  for (const md of ydata) for (const t of md.mt) if (t.type === 'expense') catYear[t.cat] = (catYear[t.cat]||0) + t.amt;

  let minYear = new Date(S.set.startDate + 'T12:00:00').getFullYear();
  for (const t of txs) { const ty = new Date(t.date + 'T12:00:00').getFullYear(); if (ty < minYear) minYear = ty; }

  // savings vs plan, year to date (periods since tracking began, current one projected)
  let ytdSaved = 0, ytdPlan = 0;
  for (const md of ydata) if (!md.isFut && !md.preStart) { ytdSaved += md.isCur ? projSave : md.saved; ytdPlan += md.tgt; }

  return { bal, cur, pStart, pEnd, pend, p90, ptot, pGroups, avgExpHist, avgInc12, fcIncome, fcExp, sb, sbManual, remainingExp,
           catPrev, catYear, ytdSaved, ytdPlan, minYear,
           daysToNext, prog, a27, payNext, pTxs, mInc, mCash, mCredit, mNet, mCommitted,
           pace, periodPct, spendPct, totalDays, elapsedDays,
           sTarget, allowedSpend, projSave, savePct, saveStatus, catSpend, ydata };
}

/* ---------- SVG charts ---------- */
function svgYearChart(C) {
  const W = 340, H = 150, padL = 6, padB = 16;
  const maxV = Math.max(1, ...C.ydata.map(d => Math.max(d.ti, d.pSpend + d.cc)));
  const bals = C.ydata.map(d => d.projEnd);
  const minB = Math.min(...bals, 0), maxB = Math.max(...bals, 1);
  const bw = (W - padL*2) / 12;
  let bars = '', line = '';
  C.ydata.forEach((d, i) => {
    const x = padL + i * bw;
    const hI = Math.max(2, (d.ti / maxV) * (H - padB - 8));
    const hE = Math.max(2, ((d.pSpend + d.cc) / maxV) * (H - padB - 8));
    bars += `<rect x="${(x+2).toFixed(1)}" y="${(H-padB-hI).toFixed(1)}" width="${(bw/2-3).toFixed(1)}" height="${hI.toFixed(1)}" rx="2" fill="rgba(52,211,153,.8)"/>`;
    bars += `<rect x="${(x+bw/2+1).toFixed(1)}" y="${(H-padB-hE).toFixed(1)}" width="${(bw/2-3).toFixed(1)}" height="${hE.toFixed(1)}" rx="2" fill="rgba(251,113,133,.75)"/>`;
    bars += `<text x="${(x+bw/2).toFixed(1)}" y="${H-3}" font-size="8" fill="#5d6b84" text-anchor="middle" font-weight="700">${MS[i]}</text>`;
    const ly = 8 + (1 - (d.projEnd - minB) / (maxB - minB || 1)) * (H - padB - 16);
    line += (i ? 'L' : 'M') + (x + bw/2).toFixed(1) + ',' + ly.toFixed(1) + ' ';
  });
  return `<svg class="svgline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and expenses per pay period for ${YEAR} with balance trend line">
    ${bars}<path d="${line}" stroke="#00a8ff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

/* ---------- forecast projection engine ----------
   base[] = projected balance now and at each of the next 11 months,
   fed by per-period incomes, avg expenses, and pending credit clearances.
   A simulated purchase subtracts its cost from the month it actually HITS:
   immediately for cash, on the payday ~3 months out for credit. */
function projBase(C) {
  const pendByMonth = {};
  for (const t of S.txs) {
    if (t.type === 'expense' && t.pm === 'credit') {
      const cd = clrDate(t.date);
      if (dnum(cd) > dnum(TODAY)) pendByMonth[`${cd.getFullYear()}-${cd.getMonth()}`] = (pendByMonth[`${cd.getFullYear()}-${cd.getMonth()}`]||0) + t.amt;
    }
  }
  const base = [C.bal], labels = ['Now'];
  for (let k = 1; k <= 11; k++) {
    const fd = new Date(TODAY.getFullYear(), TODAY.getMonth() + k, 1);
    const hit = pendByMonth[`${fd.getFullYear()}-${fd.getMonth()}`] || 0;
    base.push(base[base.length-1] + incomeFor(fd.getFullYear(), fd.getMonth()) - (expOv(fd.getFullYear(), fd.getMonth()) ?? C.fcExp) - hit);
    labels.push(MS[fd.getMonth()]);
  }
  return { base, labels };
}
function purchaseVerdict(C, base, cost, mode, buyK) {
  const lag = mode === 'credit' ? 3 : 0;
  const hitK = buyK + lag;
  if (hitK > 11) return null; // lands beyond the visible horizon
  const post = base.map((v,i) => i >= hitK ? v - cost : v);
  let minPost = Infinity, minIdx = hitK;
  for (let i = hitK; i < post.length; i++) if (post[i] < minPost) { minPost = post[i]; minIdx = i; }
  if (hitK === 0) {
    // the real low point of buying now: today's balance minus the purchase
    // minus what you're still expected to spend before the next payday
    const trough = base[0] - C.remainingExp - cost;
    if (trough < minPost) { minPost = trough; minIdx = -1; }
  }
  const gap = minPost - C.sb;
  const status = minPost < 0 ? 'red' : gap < 0 ? 'yellow' : 'green';
  return { post, minPost, minIdx, gap, status, hitK, lag };
}
function affordableFrom(C, base, labels, cost, mode) {
  const lag = mode === 'credit' ? 3 : 0;
  for (let k = 0; k + lag <= 11; k++) {
    const v = purchaseVerdict(C, base, cost, mode, k);
    if (v && v.status === 'green') return { k, label: k === 0 ? 'now' : labels[k] };
  }
  return null;
}
function svgProjection(C, base, post, labels, sc) {
  const W = 340, H = 150, padB = 16;
  const all = [...base, ...post, C.sb, 0];
  const mn = Math.min(...all), mx = Math.max(...all);
  const X = i => 8 + (i / 11) * (W - 16);
  const Y = v => 8 + (1 - (v - mn) / (mx - mn || 1)) * (H - padB - 14);
  const path = arr => arr.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' ');
  let lbls = '';
  [0,3,6,9,11].forEach(i => { lbls += `<text x="${X(i).toFixed(1)}" y="${H-3}" font-size="8" fill="#5d6b84" text-anchor="middle" font-weight="700">${labels[i]}</text>`; });
  return `<svg class="svgline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected balance over 12 months with and without the purchase">
    <line x1="8" y1="${Y(C.sb).toFixed(1)}" x2="${W-8}" y2="${Y(C.sb).toFixed(1)}" stroke="#5d6b84" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${W-10}" y="${(Y(C.sb)-4).toFixed(1)}" font-size="8" fill="#5d6b84" text-anchor="end" font-weight="700">buffer ${$0(C.sb)}</text>
    <line x1="8" y1="${Y(0).toFixed(1)}" x2="${W-8}" y2="${Y(0).toFixed(1)}" stroke="rgba(148,163,184,.25)" stroke-width="1"/>
    <path d="${path(base)}" stroke="#00a8ff" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="${path(post)}" stroke="${sc}" stroke-width="2" fill="none" stroke-dasharray="5,3" stroke-linecap="round"/>
    ${lbls}</svg>`;
}

/* ---------- shared fragments ---------- */
function txItem(t) {
  const isEd = S.editId === t.id;
  let edit = '';
  if (isEd) {
    const e = S.editForm;
    edit = `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">
      <div class="fg"><label class="flab">Description</label><input class="finp" id="ef-desc" value="${esc(e.desc)}"></div>
      <div class="fg2">
        <div class="fg"><label class="flab">Amount</label><input class="finp" id="ef-amt" type="number" inputmode="decimal" value="${e.amt}"></div>
        <div class="fg"><label class="flab">Date</label><input class="finp" id="ef-date" type="date" value="${e.date}"></div>
      </div>
      <div class="fg2">
        <div class="fg"><label class="flab">Type</label><select class="finp" id="ef-type" onchange="S.editForm.type=this.value;render()">
          <option value="income" ${e.type==='income'?'selected':''}>Income</option><option value="expense" ${e.type==='expense'?'selected':''}>Expense</option></select></div>
        <div class="fg"><label class="flab">Payment</label><select class="finp" id="ef-pm" ${e.type==='income'?'disabled style="opacity:.5"':''}>
          <option value="cash" ${e.pm==='cash'?'selected':''}>Cash</option><option value="credit" ${e.pm==='credit'?'selected':''}>Credit (3m)</option></select></div>
      </div>
      <div class="fg"><label class="flab">Category</label><select class="finp" id="ef-cat">
        ${CATS.map(c=>`<option ${e.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div style="display:flex;gap:8px"><button class="tbn" onclick="S.editId=null;render()">Cancel</button>
      <button class="tbn primary" onclick="saveEdit(${JSON.stringify(t.id)})">Save</button></div>
    </div>`;
  }
  return `<div class="txi">
    <div class="row">
      <div class="row" style="gap:0;min-width:0">
        <div class="txd" style="background:${CC[t.cat]||'#64748b'};color:${CC[t.cat]||'#64748b'}"></div>
        <div style="min-width:0">
          <div class="txn">${esc(t.desc)}</div>
          <div class="txs">${sd(t.date)} &middot; ${t.cat}
            ${t.type==='expense' ? ` <span class="pill ${t.pm==='credit'?'pk':'pc'}">${t.pm==='credit'?'CREDIT':'CASH'}</span>` : ''}
            ${t.fromRec ? ` <span class="pill pr">AUTO</span>` : ''}</div>
        </div>
      </div>
      <div class="txa" style="color:${t.type==='income'?'var(--grn)':'var(--red)'}">${t.type==='income'?'+':'-'}${$$(t.amt)}</div>
    </div>
    ${!isEd ? `<div class="txbtns">
      <button class="tbn" onclick="startEdit(${JSON.stringify(t.id)})">Edit</button>
      <button class="tbn danger" onclick="delTx(${JSON.stringify(t.id)})">Remove</button>
    </div>` : edit}
  </div>`;
}

/* ---------- views ---------- */
function vHome(C) {
  const paceColor = C.pace > 10 ? 'var(--red)' : C.pace > 0 ? 'var(--amb)' : 'var(--grn)';
  const paceMsg = C.pace > 10 ? 'Spending much faster than the period is passing'
    : C.pace > 0 ? 'Slightly ahead of pace — ease off a little'
    : 'On pace — spending is under control';
  const sCol = C.saveStatus==='missed' ? 'var(--red)' : C.saveStatus==='close' ? 'var(--amb)' : 'var(--grn)';
  const sMsg = C.saveStatus==='missed'
      ? `Target missed — spending exceeded your limit by ${$0(C.mCommitted - C.allowedSpend)}. Projected savings: ${$0(C.projSave)}.`
    : C.saveStatus==='close'
      ? `Careful — only ${$0(C.allowedSpend - C.mCommitted)} of spending left before you eat into your ${$0(C.sTarget)} target.`
      : `On track — you can still spend ${$0(C.allowedSpend - C.mCommitted)} and hit your ${$0(C.sTarget)} target.`;
  const periodLabel = `${sdD(C.pStart)} → ${sdD(C.pEnd)}`;
  return `
  <div class="pg">
    <div class="kpi hero">
      <div class="row"><div class="kl">Overall balance</div><div class="kl">${S.set.hideBal?'•••• deferred':$0(C.ptot)+' deferred'}</div></div>
      <div class="kv" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <span>${maskBig($$(C.bal))}</span>
        <button onclick="toggleBal()" aria-label="${S.set.hideBal?'Show balance':'Hide balance'}" style="background:rgba(255,255,255,.16);border:none;border-radius:10px;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0">${S.set.hideBal?EYE_OFF:EYE_ON}</button>
      </div>
      <div class="pt"><div class="pb" style="width:${Math.min(100,Math.max(3,C.bal/(C.bal+C.ptot+1)*100)).toFixed(1)}%"></div></div>
      <div class="ks">Period <b>${periodLabel}</b> &middot; next payday in ${C.daysToNext===0?'— today':C.daysToNext+'d'}: <b>+${$0(C.payNext)}</b>${C.a27>0?` &middot; clearing <b>−${$0(C.a27)}</b>`:''}</div>
    </div>
    <div class="k2">
      <div class="kpi sm">
        <div class="kl">Period net</div>
        <div class="kv" style="color:${C.mNet>=0?'var(--grn)':'var(--red)'}">${$0(C.mNet)}</div>
        <div class="row" style="margin-top:6px">
          <span style="font-size:13px;font-weight:800;color:var(--grn);font-variant-numeric:tabular-nums">IN ${$0(C.mInc)}</span>
          <span style="font-size:13px;font-weight:800;color:${C.mCash>0?'var(--red)':'var(--tx3)'};font-variant-numeric:tabular-nums">OUT ${$0(C.mCash)}</span>
        </div>
        <div class="gauge" style="margin-top:7px;height:5px"><div class="gfill" style="width:${C.mInc>0?Math.min(100,(C.mCash/C.mInc)*100).toFixed(1):0}%;background:var(--red);height:5px"></div></div>
        <div class="ks" style="color:var(--tx3)">${periodLabel}</div>
      </div>
      <div class="kpi sm">
        <div class="kl">Credit spent</div>
        <div class="kv" style="color:${C.mCredit>0?'var(--amb)':'var(--tx3)'}">${$0(C.mCredit)}</div>
        <div class="ks">this period, on card</div>
        <div class="ks" style="color:var(--tx3)">deducts in 3 months on payday</div>
      </div>
    </div>
    <div class="kpi sm" style="margin-bottom:11px">
      <div class="row"><div class="kl">Savings target</div>
        <div style="font-size:11px;font-weight:800;color:${sCol}">${$0(C.projSave)} / ${$0(C.sTarget)} projected</div></div>
      <div class="gauge" style="margin-top:9px;height:9px">
        <div class="gfill" style="width:${Math.min(100,C.savePct).toFixed(1)}%;background:${sCol}"></div>
      </div>
      <div class="ks" style="margin-top:7px;color:${sCol}">${sMsg}</div>
    </div>
    <div class="kpi sm" style="margin-bottom:11px">
      <div class="row"><div class="kl">Spending pace</div>
        <div style="font-size:11px;font-weight:800;color:${paceColor}">${Math.round(C.spendPct)}% committed &middot; day ${C.elapsedDays}/${C.totalDays}</div></div>
      <div class="gauge" style="margin-top:9px;height:9px">
        <div class="gfill" style="width:${Math.min(100,C.spendPct).toFixed(1)}%;background:${paceColor}"></div>
        <div style="position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--tx2);left:${Math.min(100,C.periodPct).toFixed(1)}%"></div>
      </div>
      <div class="ks" style="margin-top:7px;color:${paceColor}">${paceMsg}</div>
    </div>

    ${(() => {
      const bi = backupInfo(C.pStart);
      return bi.fresh ? '' : `<div class="kpi sm" style="margin-bottom:11px;border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.05)">
      <div class="row" style="gap:10px">
        <div><div class="kl" style="color:var(--amb)">Backup reminder</div>
        <div class="ks" style="margin-top:4px">Last backup: <b style="color:var(--amb)">${bi.label}</b>. Your data lives only on this phone — save a copy each period.</div></div>
        <button class="chip" style="flex-shrink:0;border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.12);color:var(--amb)" onclick="exportJSON()">Back up now</button>
      </div>
    </div>`;
    })()}
    <div class="sec-h"><div class="sec-t">Current period ledger</div>
      <button class="chip" onclick="S.tab='add';render()">+ Add</button></div>
    ${C.pTxs.length === 0
      ? `<div class="card"><div class="emp">No transactions yet this period.<br>Tap + Add to record your first one.</div></div>`
      : C.pTxs.map(txItem).join('')}

    <div class="sec-h" style="margin-top:16px"><div class="sec-t">Pending credit pipeline</div>
      <div class="sec-t" style="color:var(--amb)">${$0(C.ptot)}</div></div>
    ${C.pGroups.length === 0
      ? `<div class="card"><div class="emp">No pending credit deductions.<br>Credit purchases appear here with their future clearance date.</div></div>`
      : C.pGroups.map((g,i)=>{
        const dAway = Math.ceil((g.date - TODAY)/86400000);
        return `<div class="plg ${i===0?'nx':''}">
          <div class="row" style="margin-bottom:6px">
            <div><div class="pld" style="${i===0?'color:var(--amb)':''}">${ld(g.date)}</div>
            <div class="plds">${dAway<=0?'Today':dAway===1?'Tomorrow':'In '+dAway+' days'} &middot; payday too: +${$0(incomeFor(g.date.getFullYear(),g.date.getMonth()))}</div></div>
            <div class="plt">-${$$(g.total)}</div>
          </div>
          ${g.items.map(it=>`<div class="pli"><span style="color:var(--tx2)">${esc(it.desc)}</span><span style="font-weight:700">${$$(it.amt)}</span></div>`).join('')}
        </div>`;
      }).join('')}
  </div>`;
}

function vYear(C) {
  return `
  <div class="pg">
    <div class="card">
      <div class="row" style="margin-bottom:3px">
        <div class="ct">${S.viewYear} pay periods</div>
        <div style="display:flex;gap:6px">
          ${S.viewYear > C.minYear ? `<button class="tbn" style="flex:none;padding:4px 12px" onclick="S.viewYear--;render()">&lsaquo;</button>` : `<button class="tbn" style="flex:none;padding:4px 12px;opacity:.25">&lsaquo;</button>`}
          ${S.viewYear < YEAR ? `<button class="tbn" style="flex:none;padding:4px 12px" onclick="S.viewYear++;render()">&rsaquo;</button>` : `<button class="tbn" style="flex:none;padding:4px 12px;opacity:.25">&rsaquo;</button>`}
        </div>
      </div>
      <div class="cs" style="margin-bottom:10px">Each cycle runs payday to payday. Labelled by the month its payday falls in.</div>
      ${svgYearChart(C)}
      <div class="lgnd">
        <span class="lgi"><span class="lgbox" style="background:rgba(52,211,153,.8)"></span>Income</span>
        <span class="lgi"><span class="lgbox" style="background:rgba(251,113,133,.75)"></span>Expenses</span>
        <span class="lgi"><span class="lgline" style="background:#00a8ff"></span>Balance</span>
      </div>
    </div>
    ${(() => {
      if (!C.ytdPlan && !C.ytdSaved) return '';
      const pct = C.ytdPlan > 0 ? Math.max(0, Math.min(100, (C.ytdSaved / C.ytdPlan) * 100)) : 0;
      const diff = C.ytdSaved - C.ytdPlan;
      const col = diff >= 0 ? 'var(--grn)' : C.ytdSaved >= 0 ? 'var(--amb)' : 'var(--red)';
      return `<div class="card">
      <div class="row"><div class="ct">Savings vs plan &middot; YTD</div>
        <div style="font-size:12px;font-weight:800;color:${col}">${diff>=0?'+':''}${$0(diff)}</div></div>
      <div class="cs" style="margin:4px 0 10px">Saved ${$0(C.ytdSaved)} of ${$0(C.ytdPlan)} planned so far (current period projected).</div>
      <div class="gauge" style="height:8px"><div class="gfill" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>
      <div class="ks" style="margin-top:6px;color:${col}">${diff>=0?'Ahead of plan — the year is winning.':'Behind plan by '+$0(Math.abs(diff))+' — the remaining periods must carry it.'}</div>
    </div>`;
    })()}
    ${(() => {
      const src2 = S.catScope === 'year' ? C.catYear : C.catSpend;
      const keys = [...new Set([...Object.keys(src2), ...(S.catScope==='period'?Object.keys(C.catPrev):[])])]
        .filter(k => (src2[k]||0) > 0 || (S.catScope==='period' && (C.catPrev[k]||0) > 0))
        .sort((a,b)=>(src2[b]||0)-(src2[a]||0)).slice(0,6);
      if (!keys.length) return '';
      const mx = Math.max(1, ...keys.map(k=>src2[k]||0));
      const tot = Object.values(src2).reduce((a,b)=>a+b,0);
      return `<div class="card">
      <div class="row" style="margin-bottom:10px"><div class="ct">Where it goes</div>
        <div class="seg" style="width:170px"><button class="segb ${S.catScope==='period'?'a':''}" style="padding:6px" onclick="event.stopPropagation();S.catScope='period';render()">Period</button><button class="segb ${S.catScope==='year'?'a':''}" style="padding:6px" onclick="event.stopPropagation();S.catScope='year';render()">Year</button></div></div>
      ${keys.map(k => {
        const v = src2[k]||0, prev = C.catPrev[k]||0;
        let delta = '';
        if (S.catScope === 'period') {
          if (prev > 0 && v !== prev) { const p = Math.round(((v-prev)/prev)*100); delta = `<span style="color:${p>0?'var(--red)':'var(--grn)'};font-weight:700">${p>0?'▲ +':'▼ '}${p}%</span>`; }
          else if (prev === 0 && v > 0) delta = `<span style="color:var(--tx3);font-weight:700">new</span>`;
          else if (prev > 0 && v === prev) delta = `<span style="color:var(--tx3);font-weight:700">=</span>`;
        } else if (tot > 0) delta = `<span style="color:var(--tx3);font-weight:700">${Math.round((v/tot)*100)}%</span>`;
        return `<div class="cb" style="margin-bottom:9px">
          <div class="cbl" style="margin-bottom:4px">
            <span style="font-weight:600;display:flex;align-items:center;gap:7px;font-size:12px"><span style="width:7px;height:7px;background:${CC[k]||'#64748b'};display:inline-block;transform:rotate(45deg)"></span>${k}</span>
            <span style="display:flex;gap:9px;align-items:center;font-size:11px"><span style="color:var(--tx2);font-weight:700">${$0(v)}</span>${delta}</span></div>
          <div class="gauge" style="height:5px"><div class="gfill" style="width:${((v/mx)*100).toFixed(1)}%;background:${CC[k]||'#64748b'};height:5px"></div></div>
        </div>`;
      }).join('')}
      ${S.catScope==='period' ? `<div class="ks" style="margin-top:4px">vs previous period (${sdD(adjustedPayday(C.cur.m===0?C.cur.y-1:C.cur.y, C.cur.m===0?11:C.cur.m-1))} → ${sdD(C.pStart)})</div>` : ''}
    </div>`;
    })()}
    ${C.ydata.map(md => {
      const sPct = md.tgt > 0 ? Math.max(0, Math.min(100, (md.saved/md.tgt)*100)) : 0;
      const sCol = md.saved >= md.tgt ? 'var(--grn)' : md.saved >= md.tgt*0.5 ? 'var(--amb)' : 'var(--red)';
      return `
    <div class="mc ${md.isCur?'cur':''}" ${md.isFut?'style="opacity:.72"':md.preStart?'style="opacity:.45"':''} onclick="toggleM(${md.m})">
      <div class="row">
        <div class="mn">${ML[md.m]}
          ${md.isCur?`<span class="mtag" style="background:var(--ind);color:#fff">NOW</span>`:''}
          ${md.isFut?`<span class="mtag" style="color:var(--tx3);border:1px solid var(--bd)">projected</span>`:''}
          ${md.heavy?`<span class="mtag" style="color:var(--amb);border:1px solid rgba(251,191,36,.45)">CLEARANCE HIT</span>`:''}</div>
        <div style="font-size:15px;font-weight:800;color:${md.projNet>=0?'var(--grn)':'var(--red)'}">${md.isFut?'~':''}${md.projNet>=0?'+':''}${$0(md.projNet)}</div>
      </div>
      <div class="ks" style="margin-top:2px;color:var(--tx3)">${sdD(md.start)} → ${sdD(md.end)}</div>
      <div class="row" style="margin-top:7px;font-size:11px;color:var(--tx3)">
        <span>In <b style="color:var(--grn)">${$0(md.ti)}</b> &middot; ${md.isFut?`Est. spend <b style="color:var(--red)">${$0(md.pSpend)}</b>`:`Cash <b style="color:${md.ce>0?'var(--red)':'var(--tx3)'}">${$0(md.ce)}</b>`}${md.cp>0&&!md.isFut?` &middot; Card <b style="color:var(--amb)">${$0(md.cp)}</b>`:''}${md.cc>0?` &middot; Clears <b style="color:var(--amb)">${$0(md.cc)}</b>`:''}</span>
        <span>End: <b style="color:${md.projEnd>=0?'var(--tx)':'var(--red)'}">${(md.isFut||md.isCur)?'~':''}${$0(md.projEnd)}</b></span>
      </div>
      ${md.tgt>0 && !md.isFut && !md.preStart ? `<div style="margin-top:8px">
        <div class="row" style="font-size:10px;color:var(--tx3);margin-bottom:4px"><span>Saved ${$0(Math.max(0,md.saved))} of ${$0(md.tgt)} target</span><span style="color:${sCol};font-weight:700">${md.saved>=md.tgt?'reached':Math.round(sPct)+'%'}</span></div>
        <div class="gauge" style="height:5px"><div class="gfill" style="width:${sPct.toFixed(1)}%;background:${sCol};height:5px"></div></div>
      </div>`:''}
      ${S.expMonth===md.m ? `<div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--bd)">
        ${md.mt.length===0 ? `<div style="font-size:11px;color:var(--tx3);text-align:center;padding:4px 0">No transactions</div>`
        : md.mt.map(t=>`<div class="row" style="font-size:12px;padding:3px 0">
            <span style="color:var(--tx2);display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:${CC[t.cat]||'#64748b'};display:inline-block"></span>${esc(t.desc)}</span>
            <span style="font-weight:700;color:${t.type==='income'?'var(--grn)':'var(--red)'}">${t.type==='income'?'+':'-'}${$0(t.amt)}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>`;}).join('')}
  </div>`;
}

function vAdd() {
  const f = S.form;
  const showCredit = f.type==='expense' && f.pm==='credit' && f.date;
  return `
  <div class="pg">
    <div class="card">
      <div class="ct" style="font-size:15px;margin-bottom:14px">New transaction</div>
      <div class="fg"><label class="flab">Description</label>
        <input class="finp" id="f-desc" placeholder="e.g. Groceries, Rent..." value="${esc(f.desc)}" oninput="S.form.desc=this.value"></div>
      <div class="fg2">
        <div class="fg"><label class="flab">Amount (€)</label>
          <input class="finp" id="f-amt" type="number" inputmode="decimal" min="0" placeholder="0.00" value="${f.amt}" oninput="S.form.amt=this.value"></div>
        <div class="fg"><label class="flab">Date</label>
          <input class="finp" id="f-date" type="date" value="${f.date}" onchange="S.form.date=this.value;render()"></div>
      </div>
      <div class="fg"><label class="flab">Type</label>
        <div class="seg">
          <button class="segb ${f.type==='income'?'a':''}" onclick="S.form.type='income';S.form.pm='cash';render()">Income</button>
          <button class="segb ${f.type==='expense'?'a':''}" onclick="S.form.type='expense';render()">Expense</button>
        </div></div>
      ${f.type==='expense' ? `<div class="fg"><label class="flab">Payment method</label>
        <div class="seg">
          <button class="segb ${f.pm==='cash'?'a':''}" onclick="S.form.pm='cash';render()">Cash &middot; instant</button>
          <button class="segb ${f.pm==='credit'?'a':''}" onclick="S.form.pm='credit';render()">Credit &middot; 3-mo lag</button>
        </div></div>` : `<div class="cn" style="background:rgba(52,211,153,.06);border-color:rgba(52,211,153,.3)">Use this for extra income only (freelance, gifts, refunds). Your salary is added automatically on each payday — set the amounts in Settings &rarr; Income by period.</div>`}
      <div class="fg"><label class="flab">Category</label>
        <select class="finp" id="f-cat" onchange="S.form.cat=this.value">
          ${CATS.map(c=>`<option ${f.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <label class="chk fg"><input type="checkbox" ${f.recurring?'checked':''} onchange="S.form.recurring=this.checked">
        <span>Repeats monthly (subscription / bill)</span></label>
      ${showCredit ? `<div class="cn">Credit lag active: this charge deducts from your balance on <b style="color:var(--amb)">${ld(clrDate(f.date))}</b> — 3 months after purchase, on that period's payday. Until then it shows under "Credit spent", not in your period net.</div>` : ''}
      <button class="bp" onclick="addTx()">Add transaction</button>
    </div>
  </div>`;
}

/* ---------- forecast ---------- */
function fcResults(C) {
  const fc = parseFloat(S.forecastAmt);
  if (!(fc > 0)) return `<div class="emp">Enter an amount above to get a verdict.</div>`;
  const { base, labels } = projBase(C);
  const v = purchaseVerdict(C, base, fc, S.fcMode, 0);
  const VS = {
    green:{c:'var(--grn)',bg:'rgba(52,211,153,.07)',bd:'rgba(52,211,153,.35)',label:'SAFE TO PURCHASE'},
    yellow:{c:'var(--amb)',bg:'rgba(251,191,36,.07)',bd:'rgba(251,191,36,.35)',label:'PROCEED WITH CAUTION'},
    red:{c:'var(--red)',bg:'rgba(251,113,133,.07)',bd:'rgba(251,113,133,.35)',label:'NOT RECOMMENDED'},
  };
  const from = v.status === 'green' ? null : affordableFrom(C, base, labels, fc, S.fcMode);
  const minLabel = v.minIdx === -1 ? 'just before the next payday' : v.minIdx === 0 ? 'this month' : 'in ' + labels[v.minIdx];
  const hitTxt = S.fcMode === 'credit' ? `the charge lands on the ${labels[v.hitK]} payday` : 'the charge hits immediately';
  const surplus = C.fcIncome - C.fcExp;
  const recovMo = surplus > 0 ? Math.ceil(fc / surplus) : null;
  const recovDate = recovMo ? new Date(TODAY.getFullYear(), TODAY.getMonth()+recovMo, 1) : null;
  const disc = C.fcIncome * 0.30;
  const discMonths = disc > 0 ? fc / disc : 0;
  // period plan lens: commitment counts NOW in both modes (credit cash just leaves later)
  const planAfter = C.projSave - fc;
  const plan = planAfter >= C.sTarget
    ? { c:'var(--grn)', bd:'rgba(52,211,153,.35)', bg:'rgba(52,211,153,.05)',
        msg:`<b>This period's plan:</b> projected savings ${$0(C.projSave)} → ${$0(planAfter)}, still above your ${$0(C.sTarget)} target.` }
    : planAfter >= 0
    ? { c:'var(--amb)', bd:'rgba(251,191,36,.35)', bg:'rgba(251,191,36,.05)',
        msg:`<b>Plan warning:</b> projected savings drop ${$0(C.projSave)} → ${$0(planAfter)}, missing this period's ${$0(C.sTarget)} target by ${$0(C.sTarget - planAfter)}${S.fcMode==='credit' ? ' (committed now, even though the cash leaves in 3 months)' : ''}.` }
    : { c:'var(--red)', bd:'rgba(251,113,133,.35)', bg:'rgba(251,113,133,.05)',
        msg:`<b>Plan broken:</b> this purchase exceeds everything this period can give — projected savings go negative (${$0(planAfter)}).` };
  return `
  <div class="verd" style="background:${VS[v.status].bg};border:2px solid ${VS[v.status].bd}">
    <div class="vt" style="color:${VS[v.status].c}">${VS[v.status].label}</div>
    <div class="vd">${
      v.status==='green' ? `Buying now (${$$(fc)}, ${S.fcMode}): ${hitTxt}. Your lowest projected point is ${$$(v.minPost)} ${minLabel}, ${$$(v.gap)} above the ${$0(C.sb)} safety buffer.`
      : v.status==='yellow' ? `Survivable but thin: ${hitTxt}, and the projection dips to ${$$(v.minPost)} ${minLabel}, ${$$(Math.abs(v.gap))} short of the ${$0(C.sb)} buffer.${from && from.k>0 ? ` Waiting turns it green: <b style="color:var(--grn)">affordable from ${from.label}</b>.` : ''}`
      : `This drives your projected balance to ${$$(v.minPost)} ${minLabel}. ${from && from.k>0 ? `Delay it: <b style="color:var(--amb)">affordable from ${from.label}</b>.` : 'Not affordable within the next year at current cash flow.'}`
    }</div>
  </div>
  <div class="cn" style="background:${plan.bg};border-color:${plan.bd};color:var(--tx2)">${plan.msg}</div>
  ${v.status!=='green' && from ? `<div class="cg3" style="margin-bottom:13px">
    <div class="ccrd" style="border-color:rgba(52,211,153,.4)"><div class="ccl">Affordable from</div><div class="ccv" style="color:var(--grn)">${from.label.toUpperCase()}</div></div>
    <div class="ccrd"><div class="ccl">Hit lands</div><div class="ccv" style="color:var(--tx2)">${labels[v.hitK]==='Now'?'NOW':labels[v.hitK].toUpperCase()}</div></div>
    <div class="ccrd"><div class="ccl">Lowest point</div><div class="ccv" style="color:${VS[v.status].c}">${$0(v.minPost)}</div></div>
  </div>` : ''}
  <div class="fmlt">Cash flow recovery model</div>
  <div class="cg3" style="margin-bottom:13px">
    <div class="ccrd"><div class="ccl">Surplus / mo</div><div class="ccv" style="color:${surplus>=0?'var(--grn)':'var(--red)'}">${$0(surplus)}</div></div>
    <div class="ccrd"><div class="ccl">Recovery</div><div class="ccv" style="color:${recovMo?VS[v.status].c:'var(--red)'}">${recovMo?recovMo+' mo':'never'}</div></div>
    <div class="ccrd"><div class="ccl">Recovered by</div><div class="ccv" style="font-size:11.5px;color:var(--tx2)">${recovDate?recovDate.toLocaleDateString('en-US',{month:'short',year:'numeric'}):'—'}</div></div>
  </div>
  <div class="cn" style="background:rgba(0,168,255,.06);border-color:rgba(0,168,255,.3)">
    <b>50/30/20 check:</b> with ${$0(C.fcIncome)} income, your guideline discretionary (wants) budget is ${$0(disc)}/mo.
    This purchase equals <b>${discMonths.toFixed(1)} month${discMonths>=1.95?'s':''}</b> of that allowance${discMonths>3?' — consider spreading or delaying it':''}.
  </div>
  <div class="fmlt">12-month projection</div>
  ${svgProjection(C, base, v.post, labels, v.status==='red'?'#fb7185':v.status==='yellow'?'#fbbf24':'#34d399')}
  <div class="lgnd" style="margin-bottom:13px">
    <span class="lgi"><span class="lgline" style="background:#00a8ff"></span>Without purchase</span>
    <span class="lgi"><span class="lgline" style="background:${v.status==='red'?'#fb7185':v.status==='yellow'?'#fbbf24':'#34d399'}"></span>After purchase</span>
  </div>
  <div class="fmla">
    <div class="fmlt">Formula breakdown</div>
    min projected bal = <b style="color:${VS[v.status].c}">${$0(v.minPost)}</b> (${minLabel}) vs SB<br>
    SB = ${C.sbManual ? 'manual override' : 'exp × 3 = ' + $0(C.fcExp) + ' × 3'} = <b>${$0(C.sb)}</b><br>
    Recovery = cost ÷ surplus = ${$0(fc)} ÷ ${$0(surplus)}${recovMo?` ≈ <b>${recovMo} mo</b>`:''}
  </div>
  <div class="row" style="gap:8px;margin-top:13px">
    <input class="finp" id="wl-name" placeholder="Name this purchase..." style="flex:1">
    <button class="tbn primary" style="flex:none;padding:12px 14px" onclick="addWish()">+ Wishlist</button>
  </div>`;
}

function fcInput(v) {
  S.forecastAmt = v;
  const box = document.getElementById('fcres');
  if (box) box.innerHTML = fcResults(compute());
}

function vForecast(C) {
  const wl = (() => {
    if (!S.wishlist.length) return '';
    const { base, labels } = projBase(C);
    return `<div class="card">
      <div class="ct" style="margin-bottom:4px">Wishlist</div>
      <div class="cs" style="margin-bottom:12px">Saved purchases, re-judged live against your current projection. Tap one to load it into the simulator.</div>
      ${S.wishlist.map(w => {
        const v = purchaseVerdict(C, base, w.cost, w.mode, 0);
        const from = v && v.status !== 'green' ? affordableFrom(C, base, labels, w.cost, w.mode) : null;
        const chip = !v ? {t:'—', c:'var(--tx3)', bd:'var(--bd)'}
          : v.status === 'green' ? {t:'SAFE', c:'var(--grn)', bd:'rgba(52,211,153,.45)'}
          : from && from.k > 0 ? {t:'FROM ' + from.label.toUpperCase(), c:'var(--amb)', bd:'rgba(251,191,36,.45)'}
          : {t:'UNSAFE', c:'var(--red)', bd:'rgba(251,113,133,.45)'};
        return `<div class="txi" style="cursor:pointer" onclick="loadWish(${w.id})">
          <div class="row">
            <div style="min-width:0">
              <div class="txn">${esc(w.name)}</div>
              <div class="txs">${$0(w.cost)} <span class="pill ${w.mode==='credit'?'pk':'pc'}">${w.mode.toUpperCase()}</span></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="pill" style="color:${chip.c};border:1px solid ${chip.bd};background:transparent;padding:4px 9px">${chip.t}</span>
              <button class="tbn danger" style="flex:none;padding:4px 10px" onclick="event.stopPropagation();delWish(${w.id})">×</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  })();
  return `
  <div class="pg">
    <div class="card">
      <div class="ct" style="font-size:15px">Can I afford this?</div>
      <div class="cs" style="margin-bottom:13px">Judged on your real 12-month projection: per-period incomes, pending credit clearances, the 3-month buffer, the 50/30/20 guideline, and your recovery rate.</div>
      <div class="fbig"><label class="flab" style="text-align:center">Purchase amount (€)</label>
        <input class="fbiginp" type="number" inputmode="decimal" min="0" placeholder="0" value="${S.forecastAmt}" oninput="fcInput(this.value)"></div>
      <div class="fg"><div class="seg">
        <button class="segb ${S.fcMode==='cash'?'a':''}" onclick="S.fcMode='cash';render()">Cash &middot; hits now</button>
        <button class="segb ${S.fcMode==='credit'?'a':''}" onclick="S.fcMode='credit';render()">Credit &middot; 3-mo lag</button>
      </div></div>
      <div class="cg3">
        <div class="ccrd"><div class="ccl">Balance</div><div class="ccv" style="color:#7fc4ff">${$0(C.bal)}</div></div>
        <div class="ccrd"><div class="ccl">Pending 90d</div><div class="ccv" style="color:var(--amb)">${$0(C.p90)}</div></div>
        <div class="ccrd"><div class="ccl">Buffer SB &middot; ${C.sbManual?'manual':'auto'}</div><div class="ccv" style="color:var(--tx3)">${$0(C.sb)}</div></div>
      </div>
      <div class="fmlt" style="margin-top:2px">Model inputs — edit to match your situation</div>
      <div class="fg2" style="margin-bottom:13px">
        <div>
          <label class="flab">Avg monthly income</label>
          <input class="finp" type="number" inputmode="decimal" placeholder="${Math.round(C.avgInc12)}" value="${S.set.fcIncome}"
            onchange="S.set.fcIncome=this.value;save();render()">
          <div class="ks" style="margin-top:4px">blank = auto from your next 12 paydays (${$0(C.avgInc12)})</div>
        </div>
        <div>
          <label class="flab">Avg monthly expenses</label>
          <input class="finp" type="number" inputmode="decimal" placeholder="${Math.round(C.avgExpHist)}" value="${S.set.fcExp}"
            onchange="S.set.fcExp=this.value;save();render()">
          <div class="ks" style="margin-top:4px">blank = auto from your history (${$0(C.avgExpHist)})</div>
        </div>
        <div>
          <label class="flab">Safety buffer SB</label>
          <input class="finp" type="number" inputmode="decimal" placeholder="${Math.round(C.fcExp*3)}" value="${S.set.sbOverride}"
            onchange="S.set.sbOverride=this.value;save();render()">
          <div class="ks" style="margin-top:4px">blank = auto: 3 × expenses (${$0(C.fcExp*3)})</div>
        </div>
      </div>
      <div id="fcres">${fcResults(C)}</div>
    </div>
    ${wl}
  </div>`;
}

function vSettings(C) {
  if (S.subview === 'budgets') return vBudgets(C);
  if (S.subview === 'goals') return vGoals(C);
  if (S.subview === 'recurring') return vRecurring();
  if (S.subview === 'income') return vIncomeExp(C);
  if (S.subview === 'savings') return vMonthEditor('Savings target by period', 'saveByMonth', S.set.saveTarget, 'How much you want left over each period. Empty periods use the default');
  return `
  <div class="pg">
    <div class="card">
      <div class="ct" style="margin-bottom:6px">Income &amp; balance</div>
      <div class="set-row">
        <div><div class="set-l">Default income</div><div class="set-s">Lands on each payday (27th, shifted off weekends)</div></div>
        <input class="set-inp" type="number" inputmode="decimal" value="${S.set.income}" onchange="S.set.income=+this.value||0;save();render()">
      </div>
      <div class="set-row" onclick="S.subview='income';render()" style="cursor:pointer">
        <div><div class="set-l">Income &amp; expenses by period</div><div class="set-s">Actual income and expected spend, per period</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row">
        <div><div class="set-l">Default savings target</div><div class="set-s">How much you aim to keep each period</div></div>
        <input class="set-inp" type="number" inputmode="decimal" value="${S.set.saveTarget}" onchange="S.set.saveTarget=+this.value||0;save();render()">
      </div>
      <div class="set-row" onclick="S.subview='savings';render()" style="cursor:pointer">
        <div><div class="set-l">Savings target by period</div><div class="set-s">Set a different target per period</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row">
        <div><div class="set-l">Safety buffer</div><div class="set-s">Untouchable cushion for the forecast verdict. Blank = auto: 3 × avg expenses (${$0(C.fcExp*3)})</div></div>
        <input class="set-inp" type="number" inputmode="decimal" placeholder="${Math.round(C.fcExp*3)}" value="${S.set.sbOverride}" onchange="S.set.sbOverride=this.value;save();render()">
      </div>
      <div class="set-row">
        <div><div class="set-l">Balance</div><div class="set-s">Your liquidity on the date below</div></div>
        <input class="set-inp" type="number" inputmode="decimal" value="${S.set.startBal}" onchange="S.set.startBal=+this.value||0;save();render()">
      </div>
      <div class="set-row">
        <div><div class="set-l">As of date</div><div class="set-s">Set to today, after a payday, for the cleanest start</div></div>
        <input class="set-inp" style="width:150px" type="date" value="${S.set.startDate}" onchange="S.set.startDate=this.value;save();render()">
      </div>
    </div>
    <div class="card">
      <div class="ct" style="margin-bottom:6px">Tools</div>
      <div class="set-row" onclick="S.subview='budgets';render()" style="cursor:pointer">
        <div><div class="set-l">Category budgets</div><div class="set-s">Limits per category with spend bars</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="S.subview='goals';render()" style="cursor:pointer">
        <div><div class="set-l">Savings goals</div><div class="set-s">${S.goals.length} active goal${S.goals.length!==1?'s':''}</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="S.subview='recurring';render()" style="cursor:pointer">
        <div><div class="set-l">Recurring transactions</div><div class="set-s">${S.recurring.length} auto-posting</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
    </div>
    <div class="card">
      <div class="ct" style="margin-bottom:6px">Data</div>
      <div class="set-row" onclick="exportCSV()" style="cursor:pointer">
        <div><div class="set-l">Export transactions (CSV)</div><div class="set-s">Open in Excel or Google Sheets</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="exportJSON()" style="cursor:pointer">
        <div><div class="set-l">Backup everything (JSON)</div><div class="set-s">Last backup: ${S.set.lastBackup ? sd(S.set.lastBackup) : 'never'} &middot; settings, transactions, goals, recurring</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row">
        <div><div class="set-l">Storage protection</div><div class="set-s">${PERSISTED===true?'Granted — the browser will not auto-clear this app\'s data':PERSISTED===false?'Best effort — the browser may clear data under storage pressure; back up regularly':'Checking…'}</div></div>
        <span style="font-size:15px">${PERSISTED===true?'🔒':PERSISTED===false?'⚠️':'…'}</span></div>
      <div class="set-row" style="cursor:pointer">
        <div onclick="document.getElementById('imp').click()"><div class="set-l">Restore from backup</div><div class="set-s">Import a previously exported JSON file</div></div>
        <input type="file" id="imp" accept=".json" style="display:none" onchange="importJSON(this)">
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="resetAll()" style="cursor:pointer">
        <div><div class="set-l" style="color:var(--red)">Reset all data</div><div class="set-s">Start completely fresh</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
    </div>
    <div style="text-align:center;font-size:10.5px;color:var(--tx3);padding:6px 0 20px">FinTrack &middot; pay-period model &middot; all data on this device</div>
  </div>`;
}

function vIncomeExp(C) {
  const cy = S.editYear;
  return `
  <div class="pg">
    <button class="bk" onclick="S.subview=null;render()">&lsaquo; Settings</button>
    <div class="card">
      <div class="row" style="margin-bottom:4px">
        <div class="ct">Income &amp; expenses — ${cy}</div>
        <div style="display:flex;gap:6px">
          <button class="tbn" style="flex:none;padding:4px 12px" onclick="S.editYear--;render()">&lsaquo;</button>
          <button class="tbn" style="flex:none;padding:4px 12px" onclick="S.editYear++;render()">&rsaquo;</button>
        </div>
      </div>
      <div class="cs" style="margin-bottom:10px">Per period: actual income (blank = ${$0(S.set.income)}) and expected spend (blank = avg ${$0(Math.round(C.fcExp))}). Expected spend drives the Year projections and the forecast.</div>
      <div class="row" style="padding:0 2px 6px;border-bottom:1px solid var(--bd)">
        <span class="fmlt" style="margin:0">Period</span>
        <span style="display:flex;gap:8px"><span class="fmlt" style="margin:0;width:88px;text-align:right">Income</span><span class="fmlt" style="margin:0;width:88px;text-align:right">Expenses</span></span>
      </div>
      ${ML.map((name, m) => {
        const k = `${cy}-${m}`;
        const vi = S.set.incomeByMonth[k], ve = S.set.expByMonth[k];
        const cur = periodOf(TODAY);
        const isCur = (m === cur.m && cy === cur.y);
        const start = adjustedPayday(cy, m), end = nextPaydayAfter(cy, m);
        return `<div class="set-row">
          <div><div class="set-l">${name}${isCur?' <span class="pill pr" style="vertical-align:2px">NOW</span>':''}</div>
          <div class="set-s">${sdD(start)} → ${sdD(end)}</div></div>
          <span style="display:flex;gap:8px">
          <input class="set-inp" style="width:88px" type="number" inputmode="decimal" placeholder="${S.set.income}" value="${vi??''}" onchange="setMonthVal('incomeByMonth','${k}', this.value)">
          <input class="set-inp" style="width:88px" type="number" inputmode="decimal" placeholder="${Math.round(C.fcExp)}" value="${ve??''}" onchange="setMonthVal('expByMonth','${k}', this.value)">
          </span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function vMonthEditor(title, mapKey, defaultVal, subtitle) {
  const cy = S.editYear;
  return `
  <div class="pg">
    <button class="bk" onclick="S.subview=null;render()">&lsaquo; Settings</button>
    <div class="card">
      <div class="row" style="margin-bottom:4px">
        <div class="ct">${title} — ${cy}</div>
        <div style="display:flex;gap:6px">
          <button class="tbn" style="flex:none;padding:4px 12px" onclick="S.editYear--;render()">&lsaquo;</button>
          <button class="tbn" style="flex:none;padding:4px 12px" onclick="S.editYear++;render()">&rsaquo;</button>
        </div>
      </div>
      <div class="cs" style="margin-bottom:14px">${subtitle} (${$0(defaultVal)}).</div>
      ${ML.map((name, m) => {
        const k = `${cy}-${m}`;
        const v = S.set[mapKey][k];
        const cur = periodOf(TODAY);
        const isCur = (m === cur.m && cy === cur.y);
        const start = adjustedPayday(cy, m), end = nextPaydayAfter(cy, m);
        return `<div class="set-row">
          <div><div class="set-l">${name}${isCur?' <span class="pill pr" style="vertical-align:2px">NOW</span>':''}</div>
          <div class="set-s">${sdD(start)} → ${sdD(end)}</div></div>
          <input class="set-inp" type="number" inputmode="decimal" placeholder="${defaultVal}" value="${v??''}"
            onchange="setMonthVal('${mapKey}','${k}', this.value)">
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function vBudgets(C) {
  return `
  <div class="pg">
    <button class="bk" onclick="S.subview=null;render()">&lsaquo; Settings</button>
    <div class="card">
      <div class="ct" style="margin-bottom:4px">Category budgets</div>
      <div class="cs" style="margin-bottom:14px">Set a limit per category. Bars show this period's spend. Leave 0 for no limit.</div>
      ${CATS.filter(c=>c!=='Other').map(c => {
        const lim = S.set.budgets[c] || 0;
        const spent = C.catSpend[c] || 0;
        const pct = lim > 0 ? Math.min(100, (spent/lim)*100) : 0;
        const col = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amb)' : CC[c];
        return `<div class="cb">
          <div class="cbl">
            <span style="font-weight:600;display:flex;align-items:center;gap:7px"><span style="width:8px;height:8px;border-radius:50%;background:${CC[c]};display:inline-block"></span>${c}</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--tx3)">${$0(spent)}${lim>0?' / ':''}</span>
              <input class="set-inp" style="width:84px;padding:6px 8px;font-size:13px" type="number" inputmode="decimal" min="0" value="${lim||''}" placeholder="0"
                onchange="S.set.budgets['${c}']=+this.value||0;save();render()">
            </span>
          </div>
          ${lim>0?`<div class="gauge"><div class="gfill" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>`:''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function vGoals(C) {
  return `
  <div class="pg">
    <button class="bk" onclick="S.subview=null;render()">&lsaquo; Settings</button>
    <div class="card">
      <div class="ct" style="margin-bottom:4px">Savings goals</div>
      <div class="cs" style="margin-bottom:14px">Progress is measured as overall balance above your safety buffer (${$0(C.sb)}).</div>
      ${S.goals.length===0?`<div class="emp">No goals yet. Add one below.</div>`:''}
      ${S.goals.map((g,i)=>{
        const avail = Math.max(0, C.bal - C.sb);
        const pct = g.target>0 ? Math.min(100,(avail/g.target)*100) : 0;
        return `<div class="goal">
          <div class="cbl"><span style="font-weight:700">${esc(g.name)}</span>
            <span style="color:var(--tx2)">${$0(Math.min(avail,g.target))} / ${$0(g.target)}
            <button class="tbn danger" style="flex:none;padding:3px 9px;margin-left:8px;font-size:11px" onclick="S.goals.splice(${i},1);save();render()">×</button></span></div>
          <div class="gauge"><div class="gfill" style="width:${pct.toFixed(1)}%;background:${pct>=100?'var(--grn)':'var(--ind)'}"></div></div>
          <div style="font-size:10.5px;color:${pct>=100?'var(--grn)':'var(--tx3)'};margin-top:4px">${pct>=100?'Goal reached':Math.round(pct)+'% funded'}</div>
        </div>`;
      }).join('')}
      <div class="divline"></div>
      <div class="fg2">
        <div class="fg"><label class="flab">Goal name</label><input class="finp" id="g-name" placeholder="e.g. New car"></div>
        <div class="fg"><label class="flab">Target (€)</label><input class="finp" id="g-amt" type="number" inputmode="decimal" placeholder="5000"></div>
      </div>
      <button class="bp" onclick="addGoal()">Add goal</button>
    </div>
  </div>`;
}

function vRecurring() {
  return `
  <div class="pg">
    <button class="bk" onclick="S.subview=null;render()">&lsaquo; Settings</button>
    <div class="card">
      <div class="ct" style="margin-bottom:4px">Recurring transactions</div>
      <div class="cs" style="margin-bottom:14px">These post automatically every month on their day. Create one by ticking "Repeats monthly" when adding a transaction.</div>
      ${S.recurring.length===0?`<div class="emp">Nothing recurring yet.</div>`:''}
      ${S.recurring.map((r,i)=>`<div class="txi">
        <div class="row">
          <div class="row" style="gap:0;min-width:0">
            <div class="txd" style="background:${CC[r.cat]||'#64748b'};color:${CC[r.cat]||'#64748b'}"></div>
            <div><div class="txn">${esc(r.desc)}</div>
            <div class="txs">Next: ${sd(r.next)} &middot; ${r.cat} ${r.type==='expense'?`<span class="pill ${r.pm==='credit'?'pk':'pc'}">${r.pm.toUpperCase()}</span>`:''}</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="txa" style="color:${r.type==='income'?'var(--grn)':'var(--red)'}">${r.type==='income'?'+':'-'}${$$(r.amt)}</div>
            <button class="tbn danger" style="flex:none;padding:4px 10px" onclick="S.recurring.splice(${i},1);save();render();toast('Recurring removed')">×</button>
          </div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- actions ---------- */
function setMonthVal(mapKey, key, val) {
  if (val === '' || val === null) delete S.set[mapKey][key];
  else S.set[mapKey][key] = +val || 0;
  save(); render(); toast('Updated');
}
function startEdit(id){ const t = S.txs.find(x=>x.id===id); if(!t) return; S.editId=id; S.editForm={...t}; render(); }
function saveEdit(id){
  const ef = S.editForm;
  const desc = document.getElementById('ef-desc')?.value.trim() || ef.desc;
  const amt = parseFloat(document.getElementById('ef-amt')?.value) || ef.amt;
  const date = document.getElementById('ef-date')?.value || ef.date;
  const type = document.getElementById('ef-type')?.value || ef.type;
  const pm = type==='income' ? 'cash' : (document.getElementById('ef-pm')?.value || ef.pm);
  const cat = document.getElementById('ef-cat')?.value || ef.cat;
  S.txs = S.txs.map(t => t.id===id ? {...t, desc, amt, date, type, pm, cat} : t);
  S.editId = null; save(); render(); toast('Transaction updated');
}
function delTx(id){ S.txs = S.txs.filter(t=>t.id!==id); save(); render(); toast('Transaction removed'); }
function toggleM(m){ S.expMonth = S.expMonth===m ? null : m; render(); }
function addTx(){
  const desc = document.getElementById('f-desc')?.value.trim();
  const amt = parseFloat(document.getElementById('f-amt')?.value);
  const date = document.getElementById('f-date')?.value;
  if (!desc) { toast('Add a description'); return; }
  if (!amt || amt<=0) { toast('Enter a valid amount'); return; }
  if (!date) { toast('Pick a date'); return; }
  const { type, cat } = S.form;
  const pm = type==='income' ? 'cash' : S.form.pm;
  S.txs.push({ id: Date.now(), desc, amt, date, type, pm, cat });
  if (S.form.recurring) {
    const n = new Date(date+'T12:00:00'); n.setMonth(n.getMonth()+1);
    S.recurring.push({ desc, amt, type, pm, cat, next: isoOf(n) });
  }
  save();
  S.form = blankForm();
  S.tab = 'home';
  render();
  toast('Added');
}
function addGoal(){
  const name = document.getElementById('g-name')?.value.trim();
  const target = parseFloat(document.getElementById('g-amt')?.value);
  if (!name || !target || target<=0) { toast('Name and target required'); return; }
  S.goals.push({ name, target }); save(); render(); toast('Goal added');
}
function addWish(){
  const name = document.getElementById('wl-name')?.value.trim();
  const cost = parseFloat(S.forecastAmt);
  if (!name) { toast('Name the purchase first'); return; }
  if (!(cost > 0)) { toast('Simulate an amount first'); return; }
  S.wishlist.push({ id: Date.now(), name, cost, mode: S.fcMode });
  save(); render(); toast('Saved to wishlist');
}
function delWish(id){ S.wishlist = S.wishlist.filter(w=>w.id!==id); save(); render(); toast('Removed'); }
function loadWish(id){ const w = S.wishlist.find(x=>x.id===id); if(!w) return; S.forecastAmt = String(w.cost); S.fcMode = w.mode; render(); toast('Loaded into simulator'); }
function download(name, content, mime){
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
function exportCSV(){
  const rows = [['Description','Amount','Date','Type','Payment','Category','Credit clears on']];
  for (const t of S.txs) rows.push([t.desc, t.amt, t.date, t.type, t.pm, t.cat, (t.type==='expense'&&t.pm==='credit')?isoOf(clrDate(t.date)):'']);
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  download('fintrack-transactions.csv', csv, 'text/csv');
  toast('CSV exported');
}
function exportJSON(){
  S.set.lastBackup = isoOf(TODAY); save();
  download('fintrack-backup.json', JSON.stringify({ set:S.set, txs:S.txs, recurring:S.recurring, goals:S.goals, wishlist:S.wishlist }, null, 2), 'application/json');
  render(); toast('Backup saved');
}
function importJSON(inp){
  const file = inp.files?.[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = JSON.parse(r.result);
      if (!p.set || !Array.isArray(p.txs)) throw 0;
      S.set = { ...DEFAULTS.set, ...p.set };
      S.txs = p.txs; S.recurring = p.recurring||[]; S.goals = p.goals||[]; S.wishlist = p.wishlist||[];
      save(); render(); toast('Backup restored');
    } catch(e){ toast('Invalid backup file'); }
  };
  r.readAsText(file);
  inp.value = '';
}
function resetAll(){
  if (!confirm('Delete all data and start fresh?')) return;
  localStorage.removeItem(KEY);
  S = load(); S.tab='home'; S.form=blankForm(); S.forecastAmt=''; S.subview=null;
  render(); toast('All data cleared');
}

/* ---------- shell ---------- */
const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  year: '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M6 20V12"/><path d="M11 20V7"/><path d="M16 20v-9"/><path d="M21 20V4"/></svg>',
  add: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  forecast: '<svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 3 6-8"/><path d="M14 6h4v4"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>',
};
function render() {
  const C = compute();
  const views = { home: vHome, year: vYear, add: ()=>vAdd(), forecast: vForecast, settings: vSettings };
  document.getElementById('app').innerHTML = `
    <div class="hdr">
      <div class="li">FT</div>
      <div><div class="ln">FinTrack</div><div class="ls">Budget &amp; affordability</div></div>
      <div class="hd-date">${TODAY.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}<br><b style="color:${S.set.hideBal?'var(--tx3)':(C.bal>=0?'var(--grn)':'var(--red)')}">${maskSm($0(C.bal))}</b></div>
    </div>
    ${(views[S.tab]||vHome)(C)}
    <nav class="nav">
      ${['home','year','add','forecast','settings'].map(t => `
        <button class="nb ${S.tab===t?'a':''}" onclick="S.tab='${t}';S.subview=null;render()">${ICONS[t]}${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}
    </nav>`;
}

postRecurring();
render();
// ask the browser to shield this origin's storage from automatic cleanup
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then(p => p ? true : navigator.storage.persist())
    .then(granted => { PERSISTED = !!granted; if (S.tab === 'settings') render(); })
    .catch(() => { PERSISTED = false; });
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
