const accts = process.argv.slice(2);
const NODE = 'https://api.hive.blog';

async function call(method, params) {
  const r = await fetch(NODE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  return (await r.json()).result;
}

for (const acct of accts) {
  console.log(`=== @${acct} ===`);
  const [a] = await call('condenser_api.get_accounts', [[acct]]);
  if (!a) { console.log('  NO ACCOUNT'); continue; }
  console.log('  created:', a.created);
  const posts = await call('condenser_api.get_discussions_by_blog', [{ tag: acct, limit: 10 }]);
  const intros = (posts || []).filter(p => p.author === acct && p.parent_author === '');
  for (const p of intros) {
    let tags = [], images = [];
    try { const m = JSON.parse(p.json_metadata); tags = m.tags || []; images = m.image || m.images || []; } catch {}
    const isIntro = tags.includes('introduceyourself');
    if (!isIntro) continue;
    const ageH = ((Date.now() - new Date(p.created + 'Z').getTime()) / 3.6e6).toFixed(1);
    const votes = await call('condenser_api.get_active_votes', [p.author, p.permlink]);
    console.log(`  intro post: ${p.permlink}`);
    console.log(`    created ${p.created} (age ${ageH}h, >=24h: ${ageH >= 24})`);
    console.log(`    hasImage: ${Array.isArray(images) && images.length > 0}`);
    console.log(`    total voters: ${votes.length}`);
    const positive = votes.filter(v => Number(v.rshares) > 0).map(v => `${v.voter}(${v.rshares})`);
    console.log(`    positive voters: ${positive.join(', ') || '(none)'}`);
  }
}
