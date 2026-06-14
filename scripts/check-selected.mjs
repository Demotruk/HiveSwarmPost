const NODE = 'https://api.hive.blog';
const BOT = 'swarmpost';
const targets = new Set(process.argv.slice(2));

async function call(method, params) {
  const r = await fetch(NODE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  return (await r.json()).result;
}

const now = new Date('2026-05-28T00:00:00Z');
const allBens = new Set();
const found = {};
for (let off = 0; off < 30; off++) {
  const d = new Date(now); d.setUTCDate(d.getUTCDate() - off);
  const ds = d.toISOString().slice(0, 10);
  for (const permlink of [`swarm-post-${ds}`, ...Array.from({length:9},(_,i)=>`swarm-post-${ds}-round-${i+2}`)]) {
    const c = await call('condenser_api.get_content', [BOT, permlink]);
    if (!c || !c.author) continue;
    for (const b of (c.beneficiaries || [])) {
      allBens.add(b.account);
      if (targets.has(b.account)) found[b.account] = permlink;
    }
  }
}
console.log('Total distinct beneficiaries in 30d window:', allBens.size);
for (const t of targets) {
  console.log(`  @${t}: ${found[t] ? 'ALREADY SELECTED in ' + found[t] : 'NOT selected'}`);
}
