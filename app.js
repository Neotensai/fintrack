'use strict';
/* FinTrack — offline personal budget & affordability tracker */

const TODAY = new Date();
const YEAR = TODAY.getFullYear();
const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ML = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CATS = ['Housing','Food','Utilities','Transport','Health','Entertainment','Shopping','Electronics','Travel','Tech','Subscriptions','Other'];
const CC = {Housing:'#6366f1',Food:'#10b981',Utilities:'#f59e0b',Transport:'#3b82f6',Health:'#ec4899',Entertainment:'#a855f7',Shopping:'#f97316',Electronics:'#06b6d4',Travel:'#84cc16',Tech:'#14b8a6',Subscriptions:'#e879f9',Other:'#64748b'};
const KEY = 'fintrack-v1';

const DEFAULTS = {
  set: { startBal: 30000, income: 4500, budgets: {} },
  txs: [],
  recurring: [],
  goals: [],
};

let S = load();
S.tab = 'home';
S.editId = null;
S.forecastAmt = '';
S.subview = null; // settings sub-pages: 'budgets' | 'goals' | 'recurring'
S.form = blankForm();

function blankForm() {
  return { desc:'', amt:'', date: iso(TODAY), type:'expense', pm:'cash', cat:'Food', recurring:false };
}
function iso(d){ return d.toISOString().split('T')[0]; }
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
    localStorage.setItem(KEY, JSON.stringify({ set:S.set, txs:S.txs, recurring:S.recurring, goals:S.goals }));
  } catch(e){}
}

/* ---------- recurring engine: post any due occurrences ---------- */
function postRecurring() {
  let posted = 0;
  for (const r of S.recurring) {
    let next = new Date(r.next + 'T12:00:00');
    while (next <= TODAY) {
      S.txs.push({ id: Date.now() + Math.random(), desc: r.desc, amt: r.amt, date: iso(next), type: r.type, pm: r.pm, cat: r.cat, fromRec: true });
      next.setMonth(next.getMonth() + 1);
      posted++;
    }
    r.next = iso(next);
  }
  if (posted) save();
  return posted;
}

/* ---------- helpers ---------- */
function clrDate(ds){ const d = new Date(ds + 'T12:00:00'); d.setMonth(d.getMonth()+3); d.setDate(27); return d; }
function $$(n){ const s = n<0?'-':''; return s+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function $0(n){ const s = n<0?'-':''; return s+'$'+Math.round(Math.abs(n)).toLocaleString('en-US'); }
function sd(s){ return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function ld(d){ return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------- core computation ---------- */
function compute() {
  const { set:{ startBal, income }, txs } = S;
  const now = TODAY, cm = now.getMonth(), cy = now.getFullYear();

  let bal = startBal;
  for (const t of txs) {
    const d = new Date(t.date + 'T12:00:00');
    if (d > now) continue;
    if (t.type === 'income') bal += t.amt;
    else if (t.pm === 'cash') bal -= t.amt;
    else { if (clrDate(t.date) <= now) bal -= t.amt; }
  }

  const pend = [];
  for (const t of txs) {
    if (t.type === 'expense' && t.pm === 'credit') {
      const cd = clrDate(t.date);
      if (cd > now) pend.push({ ...t, cd });
    }
  }
  const d90 = new Date(now); d90.setDate(d90.getDate() + 90);
  const p90 = pend.filter(t => t.cd <= d90).reduce((s,t)=>s+t.amt, 0);
  const ptot = pend.reduce((s,t)=>s+t.amt, 0);
  const gm = {};
  for (const t of pend) {
    const k = t.cd.toDateString();
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
  const avgExp = ev.length ? ev.reduce((a,b)=>a+b,0)/ev.length : income * 0.65;
  const sb = avgExp * 3;

  const day = now.getDate();
  let n27, dd27;
  if (day < 27) { n27 = new Date(cy, cm, 27); dd27 = 27 - day; }
  else if (day === 27) { n27 = new Date(cy, cm, 27); dd27 = 0; }
  else { n27 = new Date(cy, cm + 1, 27); dd27 = (new Date(cy, cm + 1, 0).getDate() - day) + 27; }
  let prog;
  if (day <= 27) { const l27 = new Date(cm?cy:cy-1, cm?cm-1:11, 27); prog = Math.min(100, ((now-l27)/(n27-l27))*100); }
  else { const l27 = new Date(cy, cm, 27); prog = Math.min(100, ((now-l27)/(n27-l27))*100); }
  const a27 = gm[n27.toDateString()]?.total || 0;

  const mTxs = txs.filter(t => { const d = new Date(t.date+'T12:00:00'); return d.getMonth()===cm && d.getFullYear()===cy; })
                  .sort((a,b)=> new Date(b.date) - new Date(a.date));
  const mInc = income + mTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amt,0);
  const mExp = mTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amt,0);

  // Pace: % of budget spent vs % of month elapsed
  const dim = new Date(cy, cm + 1, 0).getDate();
  const monthPct = (day / dim) * 100;
  const spendBudget = income;
  const spendPct = spendBudget > 0 ? (mExp / spendBudget) * 100 : 0;
  const pace = spendPct - monthPct; // positive = spending too fast

  // Category spend this month
  const catSpend = {};
  for (const t of mTxs) if (t.type === 'expense') catSpend[t.cat] = (catSpend[t.cat]||0) + t.amt;

  // Year data
  let clearedSoFar = 0, extraIncSoFar = 0;
  for (const t of txs) {
    const d = new Date(t.date + 'T12:00:00');
    if (d > now) continue;
    if (t.type === 'income') extraIncSoFar += t.amt;
    else if (t.pm === 'cash') clearedSoFar += t.amt;
    else { if (clrDate(t.date) <= now) clearedSoFar += t.amt; }
  }
  const jan1 = startBal - (cm + 1) * income + clearedSoFar - extraIncSoFar;

  const ydata = [];
  let runBal = jan1;
  for (let m = 0; m < 12; m++) {
    let ce = 0, cc = 0, ei = 0;
    const mt = [];
    for (const t of txs) {
      const d = new Date(t.date + 'T12:00:00');
      if (d.getMonth() === m && d.getFullYear() === YEAR) {
        mt.push(t);
        if (t.type === 'income') ei += t.amt;
        else if (t.pm === 'cash') ce += t.amt;
      }
      if (t.type === 'expense' && t.pm === 'credit') {
        const cd = clrDate(t.date);
        if (cd.getMonth() === m && cd.getFullYear() === YEAR) cc += t.amt;
      }
    }
    const ti = income + ei, net = ti - ce - cc;
    runBal += net;
    ydata.push({ m, mt, ti, ce, cc, net, endBal: runBal, isCur: m === cm, isFut: m > cm });
  }

  return { bal, pend, p90, ptot, pGroups, avgExp, sb, n27, dd27, prog, a27, mTxs, mInc, mExp, pace, monthPct, spendPct, catSpend, ydata };
}

/* ---------- SVG mini charts (no external libs) ---------- */
function svgYearChart(C) {
  const W = 340, H = 150, padL = 6, padB = 16;
  const maxV = Math.max(1, ...C.ydata.map(d => Math.max(d.ti, d.ce + d.cc)));
  const bals = C.ydata.map(d => d.endBal);
  const minB = Math.min(...bals, 0), maxB = Math.max(...bals, 1);
  const bw = (W - padL*2) / 12;
  let bars = '', line = '';
  C.ydata.forEach((d, i) => {
    const x = padL + i * bw;
    const hI = Math.max(2, (d.ti / maxV) * (H - padB - 8));
    const hE = Math.max(2, ((d.ce + d.cc) / maxV) * (H - padB - 8));
    bars += `<rect x="${(x+2).toFixed(1)}" y="${(H-padB-hI).toFixed(1)}" width="${(bw/2-3).toFixed(1)}" height="${hI.toFixed(1)}" rx="2" fill="rgba(16,185,129,.75)"/>`;
    bars += `<rect x="${(x+bw/2+1).toFixed(1)}" y="${(H-padB-hE).toFixed(1)}" width="${(bw/2-3).toFixed(1)}" height="${hE.toFixed(1)}" rx="2" fill="rgba(244,63,94,.7)"/>`;
    bars += `<text x="${(x+bw/2).toFixed(1)}" y="${H-3}" font-size="8" fill="#64748b" text-anchor="middle" font-weight="700">${MS[i]}</text>`;
    const ly = 8 + (1 - (d.endBal - minB) / (maxB - minB || 1)) * (H - padB - 16);
    line += (i ? 'L' : 'M') + (x + bw/2).toFixed(1) + ',' + ly.toFixed(1) + ' ';
  });
  return `<svg class="svgline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income and expenses for ${YEAR} with balance trend line">
    ${bars}<path d="${line}" stroke="#6366f1" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

function svgProjection(C, forecast) {
  const W = 340, H = 150, padB = 16;
  const surplus = S.set.income - C.avgExp;
  const pendByMonth = {};
  for (const t of S.txs) {
    if (t.type === 'expense' && t.pm === 'credit') {
      const cd = clrDate(t.date);
      if (cd > TODAY) {
        const k = `${cd.getFullYear()}-${cd.getMonth()}`;
        pendByMonth[k] = (pendByMonth[k]||0) + t.amt;
      }
    }
  }
  const base = [C.bal], post = [C.bal - forecast.cost];
  const labels = ['Now'];
  for (let m = 1; m <= 11; m++) {
    const fd = new Date(TODAY.getFullYear(), TODAY.getMonth() + m, 1);
    const hit = pendByMonth[`${fd.getFullYear()}-${fd.getMonth()}`] || 0;
    base.push(base[base.length-1] + surplus - hit);
    post.push(post[post.length-1] + surplus - hit);
    labels.push(MS[fd.getMonth()]);
  }
  const all = [...base, ...post, C.sb, 0];
  const mn = Math.min(...all), mx = Math.max(...all);
  const X = i => 8 + (i / 11) * (W - 16);
  const Y = v => 8 + (1 - (v - mn) / (mx - mn || 1)) * (H - padB - 14);
  const path = arr => arr.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' ');
  const sc = forecast.status==='red'?'#f43f5e':forecast.status==='yellow'?'#f59e0b':'#10b981';
  let lbls = '';
  [0,3,6,9,11].forEach(i => { lbls += `<text x="${X(i).toFixed(1)}" y="${H-3}" font-size="8" fill="#64748b" text-anchor="middle" font-weight="700">${labels[i]}</text>`; });
  return `<svg class="svgline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected balance over 12 months with and without the purchase">
    <line x1="8" y1="${Y(C.sb).toFixed(1)}" x2="${W-8}" y2="${Y(C.sb).toFixed(1)}" stroke="#475569" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${W-10}" y="${(Y(C.sb)-4).toFixed(1)}" font-size="8" fill="#64748b" text-anchor="end" font-weight="700">buffer ${$0(C.sb)}</text>
    <line x1="8" y1="${Y(0).toFixed(1)}" x2="${W-8}" y2="${Y(0).toFixed(1)}" stroke="#33415566" stroke-width="1"/>
    <path d="${path(base)}" stroke="#6366f1" stroke-width="2" fill="none" stroke-linecap="round"/>
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
        <div class="txd" style="background:${CC[t.cat]||'#64748b'}"></div>
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
  const paceMsg = C.pace > 10 ? 'Spending much faster than the month is passing'
    : C.pace > 0 ? 'Slightly ahead of pace — ease off a little'
    : 'On pace — spending is under control';
  return `
  <div class="pg">
    <div class="kpi">
      <div class="row"><div class="kl">Overall balance</div><div class="kl">${$0(C.ptot)} deferred</div></div>
      <div class="kv" style="color:${C.bal>=0?'var(--grn)':'var(--red)'}">${$$(C.bal)}</div>
      <div class="pt"><div class="pb" style="width:${Math.min(100,Math.max(3,C.bal/(C.bal+C.ptot+1)*100)).toFixed(1)}%"></div></div>
    </div>
    <div class="k2">
      <div class="kpi sm" style="margin:0">
        <div class="kl">${ML[TODAY.getMonth()]} net</div>
        <div class="kv" style="color:${(C.mInc-C.mExp)>=0?'var(--grn)':'var(--red)'}">${$0(C.mInc-C.mExp)}</div>
        <div class="ks">+${$0(C.mInc)} / -${$0(C.mExp)}</div>
      </div>
      <div class="kpi sm" style="margin:0">
        <div class="kl">Credit clearance</div>
        <div class="kv">${C.dd27===0?'Today':C.dd27+'d'}</div>
        <div class="ks">${C.a27>0?`<span style="color:var(--amb);font-weight:700">${$0(C.a27)}</span> on the 27th`:'Nothing due on the 27th'}</div>
        <div class="pt"><div class="pb" style="width:${C.prog.toFixed(1)}%"></div></div>
      </div>
    </div>
    <div class="kpi sm">
      <div class="row"><div class="kl">Spending pace</div>
        <div style="font-size:11px;font-weight:800;color:${paceColor}">${Math.round(C.spendPct)}% spent &middot; ${Math.round(C.monthPct)}% of month</div></div>
      <div class="gauge" style="margin-top:9px;height:9px">
        <div class="gfill" style="width:${Math.min(100,C.spendPct).toFixed(1)}%;background:${paceColor}"></div>
        <div style="position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--tx2);left:${Math.min(100,C.monthPct).toFixed(1)}%"></div>
      </div>
      <div class="ks" style="margin-top:7px;color:${paceColor}">${paceMsg}</div>
    </div>

    <div class="sec-h"><div class="sec-t">${ML[TODAY.getMonth()]} ledger</div>
      <button class="chip" onclick="S.tab='add';render()">+ Add</button></div>
    ${C.mTxs.length === 0
      ? `<div class="card"><div class="emp">No transactions yet this month.<br>Tap + Add to record your first one.</div></div>`
      : C.mTxs.map(txItem).join('')}

    <div class="sec-h" style="margin-top:16px"><div class="sec-t">Pending credit pipeline</div>
      <div class="sec-t" style="color:var(--amb)">${$0(C.ptot)}</div></div>
    ${C.pGroups.length === 0
      ? `<div class="card"><div class="emp">No pending credit deductions.<br>Credit purchases appear here with their future clearance date.</div></div>`
      : C.pGroups.map((g,i)=>{
        const dAway = Math.ceil((g.date - TODAY)/86400000);
        return `<div class="plg ${i===0?'nx':''}">
          <div class="row" style="margin-bottom:6px">
            <div><div class="pld" style="${i===0?'color:var(--amb)':''}">${ld(g.date)}</div>
            <div class="plds">${dAway===0?'Today':dAway===1?'Tomorrow':'In '+dAway+' days'}</div></div>
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
      <div class="ct" style="margin-bottom:10px">${YEAR} overview</div>
      ${svgYearChart(C)}
      <div class="lgnd">
        <span class="lgi"><span class="lgbox" style="background:rgba(16,185,129,.75)"></span>Income</span>
        <span class="lgi"><span class="lgbox" style="background:rgba(244,63,94,.7)"></span>Expenses</span>
        <span class="lgi"><span class="lgline" style="background:#6366f1"></span>Balance</span>
      </div>
    </div>
    ${C.ydata.map(md => `
    <div class="mc ${md.isCur?'cur':''}" ${md.isFut?'style="opacity:.7"':''} onclick="toggleM(${md.m})">
      <div class="row">
        <div class="mn">${ML[md.m]}
          ${md.isCur?`<span class="mtag" style="background:var(--ind);color:#fff">NOW</span>`:''}
          ${md.isFut?`<span class="mtag" style="color:var(--tx3);border:1px solid var(--bd)">projected</span>`:''}</div>
        <div style="font-size:15px;font-weight:800;color:${md.net>=0?'var(--grn)':'var(--red)'}">${md.net>=0?'+':''}${$0(md.net)}</div>
      </div>
      <div class="row" style="margin-top:7px;font-size:11px;color:var(--tx3)">
        <span>In <b style="color:var(--grn)">${$0(md.ti)}</b> &middot; Cash <b style="color:${md.ce>0?'var(--red)':'var(--tx3)'}">${$0(md.ce)}</b>${md.cc>0?` &middot; Credit clr <b style="color:var(--amb)">${$0(md.cc)}</b>`:''}</span>
        <span>End: <b style="color:${md.endBal>=0?'var(--tx)':'var(--red)'}">${$0(md.endBal)}</b></span>
      </div>
      ${S.expMonth===md.m ? `<div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--bd)">
        ${md.mt.length===0 ? `<div style="font-size:11px;color:var(--tx3);text-align:center;padding:4px 0">No transactions</div>`
        : md.mt.map(t=>`<div class="row" style="font-size:12px;padding:3px 0">
            <span style="color:var(--tx2);display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:${CC[t.cat]||'#64748b'};display:inline-block"></span>${esc(t.desc)}</span>
            <span style="font-weight:700;color:${t.type==='income'?'var(--grn)':'var(--red)'}">${t.type==='income'?'+':'-'}${$0(t.amt)}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>`).join('')}
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
        <div class="fg"><label class="flab">Amount ($)</label>
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
        </div></div>` : ''}
      <div class="fg"><label class="flab">Category</label>
        <select class="finp" id="f-cat" onchange="S.form.cat=this.value">
          ${CATS.map(c=>`<option ${f.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <label class="chk fg"><input type="checkbox" ${f.recurring?'checked':''} onchange="S.form.recurring=this.checked">
        <span>Repeats monthly (subscription / bill)</span></label>
      ${showCredit ? `<div class="cn">Credit lag active: this charge deducts from your balance on <b style="color:var(--amb)">${ld(clrDate(f.date))}</b> — 3 months after purchase.</div>` : ''}
      <button class="bp" onclick="addTx()">Add transaction</button>
    </div>
  </div>`;
}

function vForecast(C) {
  const fc = parseFloat(S.forecastAmt);
  let f = null;
  if (fc > 0) {
    const ab = C.bal - fc, ac = ab - C.p90, gap = ac - C.sb;
    f = { cost: fc, ab, ac, gap, status: ac < 0 ? 'red' : gap < 0 ? 'yellow' : 'green' };
  }
  const VS = {
    green:{c:'var(--grn)',bg:'rgba(16,185,129,.08)',bd:'rgba(16,185,129,.35)',label:'SAFE TO PURCHASE'},
    yellow:{c:'var(--amb)',bg:'rgba(245,158,11,.08)',bd:'rgba(245,158,11,.35)',label:'PROCEED WITH CAUTION'},
    red:{c:'var(--red)',bg:'rgba(244,63,94,.08)',bd:'rgba(244,63,94,.35)',label:'NOT RECOMMENDED'},
  };
  const surplus = S.set.income - C.avgExp;
  const recovMo = f && surplus > 0 ? Math.ceil(f.cost / surplus) : null;
  const recovDate = recovMo ? new Date(TODAY.getFullYear(), TODAY.getMonth()+recovMo, 1) : null;
  return `
  <div class="pg">
    <div class="card">
      <div class="ct" style="font-size:15px">Can I afford this?</div>
      <div class="cs" style="margin-bottom:13px">Checks the purchase against your balance, pending credit, 3-month safety buffer, and cash flow recovery rate.</div>
      <div class="fbig"><label class="flab" style="text-align:center">Purchase amount ($)</label>
        <input class="fbiginp" id="fc-inp" type="number" inputmode="decimal" min="0" placeholder="0" value="${S.forecastAmt}" oninput="S.forecastAmt=this.value;render();document.getElementById('fc-inp').focus()"></div>
      <div class="cg3">
        <div class="ccrd"><div class="ccl">Balance</div><div class="ccv" style="color:var(--ind)">${$0(C.bal)}</div></div>
        <div class="ccrd"><div class="ccl">Pending 90d</div><div class="ccv" style="color:var(--amb)">${$0(C.p90)}</div></div>
        <div class="ccrd"><div class="ccl">Buffer SB</div><div class="ccv" style="color:var(--tx3)">${$0(C.sb)}</div></div>
      </div>
      ${f ? `
      <div class="verd" style="background:${VS[f.status].bg};border:2px solid ${VS[f.status].bd}">
        <div class="vt" style="color:${VS[f.status].c}">${VS[f.status].label}</div>
        <div class="vd">${
          f.status==='green' ? `After buying (${$$(f.cost)}) and settling all pending credit in the next 90 days, you keep ${$$(f.ac)} — ${$$(f.gap)} above your ${$0(C.sb)} safety buffer.`
          : f.status==='yellow' ? `Technically affordable, but it breaches the safety cushion: balance falls to ${$$(f.ac)}, ${$$( Math.abs(f.gap))} short of the required ${$0(C.sb)} buffer.`
          : `This would drive your balance to ${$$(f.ac)} after pending credit settles. Avoid or delay this purchase.`
        }</div>
      </div>
      <div class="fmlt">Cash flow recovery model</div>
      <div class="cg3" style="margin-bottom:13px">
        <div class="ccrd"><div class="ccl">Mo. surplus</div><div class="ccv" style="color:${surplus>=0?'var(--grn)':'var(--red)'}">${$0(surplus)}</div></div>
        <div class="ccrd"><div class="ccl">Recovery</div><div class="ccv" style="color:${recovMo?VS[f.status].c:'var(--red)'}">${recovMo?recovMo+' mo':'never'}</div></div>
        <div class="ccrd"><div class="ccl">Recovered by</div><div class="ccv" style="font-size:11.5px;color:var(--tx2)">${recovDate?recovDate.toLocaleDateString('en-US',{month:'short',year:'numeric'}):'—'}</div></div>
      </div>
      <div class="fmlt">12-month projection</div>
      ${svgProjection(C, f)}
      <div class="lgnd" style="margin-bottom:13px">
        <span class="lgi"><span class="lgline" style="background:#6366f1"></span>Without purchase</span>
        <span class="lgi"><span class="lgline" style="background:${f.status==='red'?'#f43f5e':f.status==='yellow'?'#f59e0b':'#10b981'}"></span>After purchase</span>
      </div>
      <div class="fmla">
        <div class="fmlt">Formula breakdown</div>
        ${$0(C.bal)} − ${$0(f.cost)} − ${$0(C.p90)} = <b style="color:${f.ac<0?'var(--red)':f.ac<C.sb?'var(--amb)':'var(--grn)'}">${$0(f.ac)}</b><br>
        SB = μ_exp × 3 = ${$0(C.avgExp)} × 3 = <b>${$0(C.sb)}</b><br>
        Recovery = cost ÷ surplus = ${$0(f.cost)} ÷ ${$0(surplus)}${recovMo?` ≈ <b>${recovMo} mo</b>`:''}
      </div>` : `<div class="emp">Enter an amount above to get a verdict.</div>`}
    </div>
  </div>`;
}

function vSettings(C) {
  if (S.subview === 'budgets') return vBudgets(C);
  if (S.subview === 'goals') return vGoals(C);
  if (S.subview === 'recurring') return vRecurring();
  return `
  <div class="pg">
    <div class="card">
      <div class="ct" style="margin-bottom:6px">Income & balance</div>
      <div class="set-row">
        <div><div class="set-l">Monthly income</div><div class="set-s">Salary added automatically each month</div></div>
        <input class="set-inp" type="number" inputmode="decimal" value="${S.set.income}" onchange="S.set.income=+this.value||0;save();render()">
      </div>
      <div class="set-row">
        <div><div class="set-l">Starting balance</div><div class="set-s">Liquidity at the start of tracking</div></div>
        <input class="set-inp" type="number" inputmode="decimal" value="${S.set.startBal}" onchange="S.set.startBal=+this.value||0;save();render()">
      </div>
    </div>
    <div class="card">
      <div class="ct" style="margin-bottom:6px">Tools</div>
      <div class="set-row" onclick="S.subview='budgets';render()" style="cursor:pointer">
        <div><div class="set-l">Category budgets</div><div class="set-s">Monthly limits per category with spend bars</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="S.subview='goals';render()" style="cursor:pointer">
        <div><div class="set-l">Savings goals</div><div class="set-s">${S.goals.length} active goal${S.goals.length!==1?'s':''}</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="S.subview='recurring';render()" style="cursor:pointer">
        <div><div class="set-l">Recurring transactions</div><div class="set-s">${S.recurring.length} subscription${S.recurring.length!==1?'s':''} / bill${S.recurring.length!==1?'s':''} auto-posting</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
    </div>
    <div class="card">
      <div class="ct" style="margin-bottom:6px">Data</div>
      <div class="set-row" onclick="exportCSV()" style="cursor:pointer">
        <div><div class="set-l">Export transactions (CSV)</div><div class="set-s">Open in Excel or Google Sheets</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="exportJSON()" style="cursor:pointer">
        <div><div class="set-l">Backup everything (JSON)</div><div class="set-s">Settings, transactions, goals, recurring</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" style="cursor:pointer">
        <div onclick="document.getElementById('imp').click()"><div class="set-l">Restore from backup</div><div class="set-s">Import a previously exported JSON file</div></div>
        <input type="file" id="imp" accept=".json" style="display:none" onchange="importJSON(this)">
        <span style="color:var(--tx3)">&rsaquo;</span></div>
      <div class="set-row" onclick="resetAll()" style="cursor:pointer">
        <div><div class="set-l" style="color:var(--red)">Reset all data</div><div class="set-s">Start completely fresh</div></div>
        <span style="color:var(--tx3)">&rsaquo;</span></div>
    </div>
    <div style="text-align:center;font-size:10.5px;color:var(--tx3);padding:6px 0 20px">FinTrack &middot; all data stays on this device</div>
  </div>`;
}

function vBudgets(C) {
  return `
  <div class="pg">
    <button class="bk" onclick="S.subview=null;render()">&lsaquo; Settings</button>
    <div class="card">
      <div class="ct" style="margin-bottom:4px">Category budgets</div>
      <div class="cs" style="margin-bottom:14px">Set a monthly limit per category. Bars show this month's spend. Leave 0 for no limit.</div>
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
        <div class="fg"><label class="flab">Target ($)</label><input class="finp" id="g-amt" type="number" inputmode="decimal" placeholder="5000"></div>
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
            <div class="txd" style="background:${CC[r.cat]||'#64748b'}"></div>
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
    S.recurring.push({ desc, amt, type, pm, cat, next: iso(n) });
  }
  save();
  S.form = blankForm();
  S.tab = 'home';
  render();
  toast(S.recurring.length && S.form ? 'Added' : 'Added');
}
function addGoal(){
  const name = document.getElementById('g-name')?.value.trim();
  const target = parseFloat(document.getElementById('g-amt')?.value);
  if (!name || !target || target<=0) { toast('Name and target required'); return; }
  S.goals.push({ name, target }); save(); render(); toast('Goal added');
}
function download(name, content, mime){
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
function exportCSV(){
  const rows = [['Description','Amount','Date','Type','Payment','Category','Credit clears on']];
  for (const t of S.txs) rows.push([t.desc, t.amt, t.date, t.type, t.pm, t.cat, (t.type==='expense'&&t.pm==='credit')?iso(clrDate(t.date)):'']);
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  download('fintrack-transactions.csv', csv, 'text/csv');
  toast('CSV exported');
}
function exportJSON(){
  download('fintrack-backup.json', JSON.stringify({ set:S.set, txs:S.txs, recurring:S.recurring, goals:S.goals }, null, 2), 'application/json');
  toast('Backup saved');
}
function importJSON(inp){
  const file = inp.files?.[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = JSON.parse(r.result);
      if (!p.set || !Array.isArray(p.txs)) throw 0;
      S.set = { ...DEFAULTS.set, ...p.set };
      S.txs = p.txs; S.recurring = p.recurring||[]; S.goals = p.goals||[];
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
      <div class="hd-date">${TODAY.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}<br><b style="color:${C.bal>=0?'var(--grn)':'var(--red)'}">${$0(C.bal)}</b></div>
    </div>
    ${(views[S.tab]||vHome)(C)}
    <nav class="nav">
      ${['home','year','add','forecast','settings'].map(t => `
        <button class="nb ${S.tab===t?'a':''}" onclick="S.tab='${t}';S.subview=null;render()">${ICONS[t]}${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}
    </nav>`;
}

postRecurring();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
