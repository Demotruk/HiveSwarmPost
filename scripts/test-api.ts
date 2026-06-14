const NODES = [
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://api.openhive.network',
  'https://anyx.io',
];

async function main() {
  for (const node of NODES) {
    try {
      const res = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'condenser_api.get_discussions_by_created',
          params: [{ tag: 'introduceyourself', limit: 3 }],
          id: 1,
        }),
      });
      const json = await res.json() as any;
      if (json.result) {
        console.log(`${node}: OK (${json.result.length} posts)`);
      } else {
        const errMsg = json.error?.message || JSON.stringify(json.error?.data)?.slice(0, 80);
        console.log(`${node}: ERROR — ${errMsg}`);
      }
    } catch (err: any) {
      console.log(`${node}: FETCH FAILED — ${err.message}`);
    }
  }
}

main();
