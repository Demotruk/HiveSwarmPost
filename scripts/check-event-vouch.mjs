const NODE = 'https://api.hive.blog';
const BOT = 'swarmpost';
const TARGETS = new Set(['sweetgemstone', 'gr33nm4ster', 'konchix']);
const VOUCH_PATTERN = /!vouch\s+@?([a-z][a-z0-9.-]{2,15})/i;

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

// 1. Scan introduceyourself feed in window, collect vouches naming our targets.
// vouched: newbie -> { creator, voucher, introPermlink }
const vouched = new Map();
let startAuthor = '', startPermlink = '';
const batchSize = 20;
let scanned = 0;
outer: while (true) {
  const query = { tag: 'introduceyourself', limit: batchSize };
  if (startAuthor) { query.start_author = startAuthor; query.start_permlink = startPermlink; }
  const posts = await call('condenser_api.get_discussions_by_created', [query]);
  if (!posts || posts.length === 0) break;
  const startIdx = startAuthor ? 1 : 0;
  for (let i = startIdx; i < posts.length; i++) {
    const post = posts[i];
    if (new Date(post.created + 'Z') < windowStart) break outer;
    scanned++;
    if (post.parent_author !== '') continue;
    const replies = await call('condenser_api.get_content_replies', [post.author, post.permlink]);
    if (!replies) continue;
    for (const reply of replies) {
      const m = reply.body.match(VOUCH_PATTERN);
      if (!m) continue;
      const creator = m[1].toLowerCase();
      if (!TARGETS.has(creator)) continue;
      if (!vouched.has(post.author)) {
        vouched.set(post.author, { creator, voucher: reply.author, introPermlink: post.permlink });
      }
    }
  }
  const last = posts[posts.length - 1];
  if (posts.length < batchSize) break;
  startAuthor = last.author; startPermlink = last.permlink;
}
console.error(`Scanned ${scanned} intro posts; found ${vouched.size} newbies vouched to targets.`);

// 2. Beneficiaries selected in window
const bens = new Set();
for (let off = 0; off < 30; off++) {
  const d = new Date(now); d.setUTCDate(d.getUTCDate() - off);
  const ds = d.toISOString().slice(0, 10);
  for (const permlink of [`swarm-post-${ds}`, ...Array.from({length:9},(_,i)=>`swarm-post-${ds}-round-${i+2}`)]) {
    let c; try { c = await call('condenser_api.get_content', [BOT, permlink]); } catch { continue; }
    if (!c || !c.author) continue;
    for (const b of (c.beneficiaries || [])) bens.add(b.account);
  }
}

// 3. Group + report
const byCreator = {};
for (const [newbie, info] of vouched) {
  (byCreator[info.creator] ??= []).push({ newbie, ...info });
}
for (const creator of TARGETS) {
  const list = (byCreator[creator] || []).sort((a,b)=>a.newbie.localeCompare(b.newbie));
  let won = 0;
  console.log(`\n=== @${creator}: ${list.length} newbies vouched ===`);
  for (const x of list) {
    const sel = bens.has(x.newbie);
    if (sel) won++;
    console.log(`  ${sel ? '[WON] ' : '[----]'} @${x.newbie}  (vouched by @${x.voucher})`);
  }
  console.log(`  -> ${won}/${list.length} selected`);
}
