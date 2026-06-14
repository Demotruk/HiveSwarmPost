const NODE = 'https://api.hive.blog';
const BOT = 'swarmpost';
const onboarders = ['sweetgemstone', 'gr33nm4ster', 'konchix'];
const ACCOUNT_CREATE_BITMASK = (1 << 9) | (1 << 23);

async function call(method, params) {
  const r = await fetch(NODE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

const now = new Date('2026-05-28T00:00:00Z');
const windowStart = new Date(now); windowStart.setUTCDate(windowStart.getUTCDate() - 30);

// 1. Who did each onboarder create (within window)?
const created = {}; // creator -> [newbie]
for (const creator of onboarders) {
  created[creator] = [];
  let start = -1; const batch = 1000;
  while (true) {
    const limit = start === -1 ? batch : Math.min(batch, start + 1);
    const history = await call('condenser_api.get_account_history', [creator, start, limit, ACCOUNT_CREATE_BITMASK]);
    if (!history || history.length === 0) break;
    let oldest = null;
    for (const [, e] of history) {
      const ts = new Date(e.timestamp + 'Z');
      if (!oldest || ts < oldest) oldest = ts;
      const [op, data] = e.op;
      if ((op === 'account_create' || op === 'create_claimed_account') && data.creator === creator) {
        created[creator].push({ name: data.new_account_name, ts: e.timestamp });
      }
    }
    if (oldest && oldest < windowStart) break;
    if (history.length < limit) break;
    start = history[0][0] - 1;
    if (start < 0) break;
  }
}

// 2. Build set of all beneficiaries selected in window
const bens = new Set();
for (let off = 0; off < 30; off++) {
  const d = new Date(now); d.setUTCDate(d.getUTCDate() - off);
  const ds = d.toISOString().slice(0, 10);
  for (const permlink of [`swarm-post-${ds}`, ...Array.from({length:9},(_,i)=>`swarm-post-${ds}-round-${i+2}`)]) {
    let c;
    try { c = await call('condenser_api.get_content', [BOT, permlink]); } catch { continue; }
    if (!c || !c.author) continue;
    for (const b of (c.beneficiaries || [])) bens.add(b.account);
  }
}

// 3. Report
for (const creator of onboarders) {
  const list = created[creator].filter(n => new Date(n.ts + 'Z') >= windowStart);
  console.log(`\n=== @${creator}: created ${list.length} accounts in window ===`);
  let won = 0;
  for (const n of list.sort((a,b)=>a.ts.localeCompare(b.ts))) {
    const sel = bens.has(n.name);
    if (sel) won++;
    console.log(`  ${sel ? '[WON] ' : '[----]'} @${n.name}  (created ${n.ts})`);
  }
  console.log(`  -> ${won}/${list.length} selected`);
}
