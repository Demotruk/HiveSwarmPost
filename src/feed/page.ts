/**
 * Inline HTML page for the newbie introduction post feed.
 */
export function feedPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Swarm Post – Newbie Intro Feed</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 1rem; }
  h1 { text-align: center; margin-bottom: .5rem; font-size: 1.5rem; }
  .subtitle { text-align: center; color: #666; margin-bottom: 1.5rem; font-size: .9rem; }
  .loading { text-align: center; padding: 3rem; color: #888; }
  .error { text-align: center; padding: 2rem; color: #c00; }
  .feed { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
  .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; display: flex; transition: opacity .2s; }
  .card.awaiting { opacity: .45; }
  .card .thumb { width: 120px; min-height: 120px; background-size: cover; background-position: center; flex-shrink: 0; }
  .card .body { padding: .75rem 1rem; flex: 1; min-width: 0; }
  .card .title { font-size: 1rem; font-weight: 600; margin-bottom: .25rem; }
  .card .title a { color: inherit; text-decoration: none; }
  .card .title a:hover { text-decoration: underline; }
  .card .meta { font-size: .8rem; color: #888; margin-bottom: .5rem; }
  .card .meta a { color: #888; }
  .badge { display: inline-block; padding: .15rem .45rem; border-radius: 4px; font-size: .7rem; font-weight: 600; }
  .badge.eligible { background: #d4edda; color: #155724; }
  .badge.awaiting { background: #fff3cd; color: #856404; }
  .card .details { font-size: .75rem; color: #999; margin-top: .4rem; }
  .legend { max-width: 720px; margin: 0 auto 1rem; display: flex; gap: 1rem; justify-content: center; font-size: .8rem; }
  .legend span { display: flex; align-items: center; gap: .3rem; }
  .legend .dot { width: 10px; height: 10px; border-radius: 50%; }
  .legend .dot.eligible { background: #28a745; }
  .legend .dot.awaiting { background: #ffc107; }
</style>
</head>
<body>
<h1>Newbie Intro Feed</h1>
<p class="subtitle">Introduction posts from newbies onboarded by trusted accounts</p>
<div class="legend">
  <span><span class="dot eligible"></span> Eligible (trusted vote received)</span>
  <span><span class="dot awaiting"></span> Awaiting trust vote</span>
</div>
<div id="feed" class="feed"><div class="loading">Loading feed…</div></div>
<script>
(async () => {
  const el = document.getElementById('feed');
  try {
    const res = await fetch('/api/feed');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.length === 0) {
      el.innerHTML = '<div class="loading">No introduction posts found in the current eligibility window.</div>';
      return;
    }
    el.innerHTML = data.map(n => {
      const img = n.introPost.images[0] || '';
      const eligible = n.introPost.hasTrustedVote && n.introPost.isOldEnough;
      const date = new Date(n.introPost.created + 'Z').toLocaleDateString();
      const voters = n.introPost.trustedVoters.length > 0
        ? 'Trusted votes: ' + n.introPost.trustedVoters.map(v => '@' + v).join(', ')
        : 'No trusted votes yet';
      return '<div class="card' + (eligible ? '' : ' awaiting') + '">'
        + (img ? '<div class="thumb" style="background-image:url(' + img + ')"></div>' : '')
        + '<div class="body">'
        + '<div class="title"><a href="' + n.introPost.url + '" target="_blank">' + esc(n.introPost.title || '(untitled)') + '</a></div>'
        + '<div class="meta">@' + esc(n.account) + ' &middot; ' + date
        + ' &middot; onboarded by @' + esc(n.onboarders.creator)
        + (n.onboarders.referrer ? ' (ref: @' + esc(n.onboarders.referrer) + ')' : '')
        + '</div>'
        + '<span class="badge ' + (eligible ? 'eligible' : 'awaiting') + '">'
        + (eligible ? 'Eligible' : !n.introPost.isOldEnough ? 'Too new (&lt;24h)' : 'Awaiting trust vote')
        + '</span>'
        + '<div class="details">'
        + 'Trust score: ' + n.onboarderTrust.toFixed(0)
        + ' &middot; Activity: ' + (n.activityWeight * 100).toFixed(0) + '%'
        + ' &middot; ' + voters
        + '</div>'
        + '</div></div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="error">Failed to load feed: ' + e.message + '</div>';
  }
})();
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
</script>
</body>
</html>`;
}
