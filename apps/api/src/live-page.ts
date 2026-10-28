/**
 * The public scoreboard behind a share link. One static page for every code:
 * it reads the code from its own URL and polls the snapshot. All data goes in
 * through textContent, never as HTML, because names are typed by scorers.
 */
export const LIVE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live score · CrickScorer</title>
<style>
  :root { --bg:#F2F5F3; --card:#fff; --text:#0E1A14; --muted:#52625A; --line:#D9E2DC;
          --hero:#085041; --on-hero:#F2FBF6; --hero-muted:#9FE1CB; --four:#1E78D6; --six:#7C3AED; --out:#D93445; --extra:#B86E00; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#101513; --card:#181F1C; --text:#EDF3EF; --muted:#98A79F; --line:#2C3732;
            --hero:#0F4D36; --on-hero:#F2FBF6; --hero-muted:#A8E3C7; --four:#4EA8F5; --six:#A77BF3; --out:#F0596A; --extra:#F2AE3D; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width:560px; margin:0 auto; padding:0 16px 32px; }
  header { background:var(--hero); color:var(--on-hero); padding:16px; }
  header .wrap { max-width:560px; margin:0 auto; }
  .live { color:#FF8A94; font-weight:800; font-size:12px; letter-spacing:1px; }
  .muted { color:var(--muted); font-size:14px; }
  header .muted { color:var(--hero-muted); }
  h1 { margin:4px 0 0; font-size:20px; }
  .score { font-size:44px; font-weight:900; margin:8px 0 0; font-variant-numeric:tabular-nums; }
  .score small { font-size:18px; font-weight:600; color:var(--hero-muted); }
  .over { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
  .ball { min-width:30px; height:30px; padding:0 6px; border-radius:15px; display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,.14); font-weight:800; font-size:13px; }
  .b4 { background:var(--four); } .b6 { background:var(--six); } .bW { background:var(--out); } .bX { background:var(--extra); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; margin-top:14px; }
  .card h2 { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.8px; color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:right; color:var(--muted); font-weight:600; padding:4px; }
  th:first-child, td:first-child { text-align:left; }
  td { text-align:right; padding:6px 4px; border-top:1px solid var(--line); font-variant-numeric:tabular-nums; }
  td .how { display:block; color:var(--muted); font-size:12px; }
  .result { font-weight:800; font-size:18px; color:var(--on-hero); margin-top:8px; }
  .error { text-align:center; padding:48px 0; }
</style>
</head>
<body>
<header><div class="wrap" id="top"><span class="muted">Loading…</span></div></header>
<main id="body"></main>
<script>
  const code = location.pathname.split('/').filter(Boolean).pop();
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  const row = (cells, head) => {
    const tr = el('tr');
    for (const c of cells) tr.append(c instanceof Node ? c : el(head ? 'th' : 'td', '', c));
    return tr;
  };
  // Labels come from the app's ballLabel: "4", "6", "W", "Wd", "2Nb", "B", "1Lb".
  const ballClass = (b) => b === 'W' ? 'bW' : /Wd|Nb|Lb|B/.test(b) ? 'bX' : b === '4' ? 'b4' : b === '6' ? 'b6' : '';

  function render(s, updatedAt) {
    const top = document.getElementById('top');
    const body = document.getElementById('body');
    top.replaceChildren();
    body.replaceChildren();
    document.title = s.title + ' · live score';
    const cur = s.innings[s.innings.length - 1];
    const status = el('div');
    if (s.result === null) status.append(el('span', 'live', '● LIVE  '));
    status.append(el('span', 'muted', s.totalOvers + ' overs · updated ' + new Date(updatedAt).toLocaleTimeString()));
    top.append(status, el('h1', '', s.title));
    if (cur) {
      const score = el('div', 'score', cur.team + ' ' + cur.runs + '/' + cur.wickets + ' ');
      score.append(el('small', '', '(' + cur.overs + ')'));
      top.append(score);
      if (s.result === null && cur.target !== null) {
        top.append(el('div', 'muted', 'Need ' + Math.max(0, cur.target - cur.runs) + ' to win'));
      }
      if (cur.thisOver.length > 0) {
        const over = el('div', 'over');
        for (const b of cur.thisOver) over.append(el('span', 'ball ' + ballClass(b), b));
        top.append(over);
      }
    } else {
      top.append(el('div', 'muted', 'Toss done · play starts soon'));
    }
    if (s.result !== null) top.append(el('div', 'result', s.result));

    for (const inn of [...s.innings].reverse()) {
      const card = el('section', 'card');
      card.append(el('h2', '', inn.team + ' · ' + inn.runs + '/' + inn.wickets + ' (' + inn.overs + ')'));
      const bat = el('table');
      bat.append(row(['Batter', 'R', 'B', '4s', '6s'], true));
      for (const b of inn.batters) {
        const who = el('td', '', b.name + (b.striker ? ' *' : ''));
        who.append(el('span', 'how', b.out ?? 'not out'));
        bat.append(row([who, b.runs, b.balls, b.fours, b.sixes]));
      }
      card.append(bat);
      if (inn.bowlers.length > 0) {
        const bowl = el('table');
        bowl.style.marginTop = '12px';
        bowl.append(row(['Bowler', 'O', 'R', 'W'], true));
        for (const b of inn.bowlers) bowl.append(row([b.name, b.overs, b.runs, b.wickets]));
        card.append(bowl);
      }
      body.append(card);
    }
    body.append(el('p', 'muted', 'Scored live with CrickScorer'));
  }

  let timer;
  async function poll() {
    try {
      const res = await fetch('/l/' + encodeURIComponent(code) + '/data', { cache: 'no-store' });
      if (res.status === 404) {
        document.getElementById('top').replaceChildren(el('h1', '', 'This match link does not exist'));
        return;
      }
      const data = await res.json();
      render(data.snapshot, data.updatedAt);
      if (data.snapshot.result !== null) return; // finished: stop polling
    } catch {
      // Offline or server waking up: keep the last score and try again.
    }
    timer = setTimeout(poll, 5000);
  }
  poll();
</script>
</body>
</html>`;
