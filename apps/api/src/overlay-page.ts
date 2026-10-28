/**
 * A TV-style score strip for live video. Streaming apps (OBS "Browser source",
 * PRISM Live "Web widget") lay it over the camera, so the background is
 * transparent and everything sizes with the video's width. Like the live page,
 * data goes in through textContent only.
 */
export const OVERLAY_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Score overlay · CrickScorer</title>
<style>
  html, body { margin:0; background:transparent; overflow:hidden; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#fff;
         height:100vh; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
         padding-bottom:2.2vw; box-sizing:border-box; }
  .flash { font-size:5vw; font-weight:900; letter-spacing:.3vw; padding:.6vw 3vw; border-radius:1vw; margin-bottom:1vw;
           opacity:0; transform:scale(.6); transition:opacity .25s, transform .25s; text-shadow:0 .2vw .6vw rgba(0,0,0,.4); }
  .flash.show { opacity:1; transform:scale(1); }
  .f4 { background:#1E78D6; } .f6 { background:#7C3AED; } .fW { background:#D93445; }
  .fbat { background:linear-gradient(90deg,#B8860B,#F2C14E); color:#2B1D00; text-shadow:none; }
  .fbowl { background:linear-gradient(90deg,#9B1C2C,#D93445); }
  .fteam { background:linear-gradient(90deg,#085041,#1D9E75); }
  .flash.long { font-size:3.2vw; letter-spacing:.1vw; }
  .bar { display:flex; align-items:stretch; width:92vw; border-radius:1vw; overflow:hidden;
         box-shadow:0 .4vw 1.6vw rgba(0,0,0,.45); font-size:1.35vw; }
  .bar > div { display:flex; align-items:center; gap:1vw; padding:.9vw 1.2vw; }
  .team { background:#085041; font-weight:900; }
  .abbr { background:#F2FBF6; color:#085041; border-radius:.5vw; padding:.2vw .6vw; font-size:1.3vw; }
  .score { font-size:2.3vw; font-weight:900; font-variant-numeric:tabular-nums; }
  .overs { color:#9FE1CB; font-weight:600; }
  .bat { background:#0E1A14; flex:1; justify-content:space-between; }
  .bat { min-width:0; }
  /* Only names shorten with "…"; runs and balls always show in full. */
  .bat > span { display:flex; align-items:baseline; gap:.5vw; min-width:0; }
  .bat .name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .num { flex:none; white-space:nowrap; }
  .team, .bowl, .balls { flex:none; white-space:nowrap; }
  .bat span.on { font-weight:800; }
  .bat span.on::before { content:'▸ '; color:#3DCB7F; }
  .num { font-weight:800; font-variant-numeric:tabular-nums; }
  .num small { color:#98A79F; font-weight:600; font-size:1.2vw; }
  .bowl { background:#16241D; }
  .balls { background:#0E1A14; gap:.5vw !important; }
  .ball { min-width:2vw; height:2vw; padding:0 .4vw; border-radius:1vw; display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,.16); font-weight:800; font-size:1.1vw; }
  .b4 { background:#1E78D6; } .b6 { background:#7C3AED; } .bW { background:#D93445; } .bX { background:#B86E00; }
  .strip { width:92vw; background:rgba(8,80,65,.92); border-radius:0 0 1vw 1vw; margin-top:-.6vw; padding:1vw 1.4vw .5vw;
           font-size:1.3vw; font-weight:700; color:#E1F5EE; box-sizing:border-box; }
  .hidden { display:none !important; }
</style>
</head>
<body>
<div id="flash" class="flash"></div>
<div class="bar hidden" id="bar">
  <div class="team"><span class="abbr" id="abbr"></span><span class="score" id="score"></span><span class="overs" id="overs"></span></div>
  <div class="bat" id="bat"></div>
  <div class="bowl" id="bowl"></div>
  <div class="balls" id="balls"></div>
</div>
<div class="strip hidden" id="strip"></div>
<script>
  const code = location.pathname.split('/').filter(Boolean)[1];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  const abbr = (team) => team.split(/\\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || team.slice(0, 3).toUpperCase();
  const ballsOf = (overs) => { const [o, b] = overs.split('.').map(Number); return o * 6 + (b || 0); };
  const ballClass = (b) => b === 'W' ? 'bW' : /Wd|Nb|Lb|B/.test(b) ? 'bX' : b === '4' ? 'b4' : b === '6' ? 'b6' : '';
  const num = (main, sub) => { const s = el('span', 'num', main + ' '); s.append(el('small', '', sub)); return s; };

  let lastBall = null;
  let lastHighlight;
  let flashTimer;
  function flash(text, cls, ms) {
    const f = $('flash');
    f.textContent = text;
    f.className = 'flash show ' + cls;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { f.className = 'flash ' + cls; }, ms);
  }

  function render(s) {
    const inn = s.innings[s.innings.length - 1];
    if (!inn) return;
    $('bar').classList.remove('hidden');
    $('abbr').textContent = abbr(inn.team);
    $('score').textContent = inn.runs + '-' + inn.wickets;
    $('overs').textContent = inn.overs + ' ov';

    const bat = $('bat');
    bat.replaceChildren();
    for (const b of inn.batters.filter((x) => x.out === null).slice(0, 2)) {
      const wrap = el('span', b.striker ? 'on' : '');
      wrap.append(el('span', 'name', b.name), num(b.runs, '(' + b.balls + ')'));
      bat.append(wrap);
    }

    const bowler = inn.bowlers.find((b) => b.current);
    const bowl = $('bowl');
    bowl.replaceChildren();
    if (bowler) { bowl.append(el('span', '', bowler.name + '  '), num(bowler.wickets + '-' + bowler.runs, '(' + bowler.overs + ')')); }
    bowl.classList.toggle('hidden', !bowler);

    const balls = $('balls');
    // An over with extras can run long; the strip has room for 8.
    balls.replaceChildren(...inn.thisOver.slice(-8).map((b) => el('span', 'ball ' + ballClass(b), b)));
    balls.classList.toggle('hidden', inn.thisOver.length === 0);

    const played = ballsOf(inn.overs);
    const crr = played === 0 ? '0.00' : (inn.runs * 6 / played).toFixed(2);
    let line;
    if (s.result !== null) line = s.result;
    else if (inn.target !== null) {
      const need = Math.max(0, inn.target - inn.runs);
      const left = s.totalOvers * 6 - played;
      line = inn.team + ' need ' + need + ' off ' + left + ' balls  ·  RRR ' + (left > 0 ? (need * 6 / left).toFixed(2) : '-') + '  ·  CRR ' + crr;
    } else line = s.title + '  ·  CRR ' + crr;
    $('strip').textContent = line;
    $('strip').classList.remove('hidden');

    // Celebrate only what happens while the overlay is on screen, never the state it opens on.
    const h = s.highlight || null;
    const newest = (s.commentary || [])[0];
    const key = newest ? newest.over + '|' + newest.text : null;
    if (lastHighlight !== undefined && h !== null && h.id !== lastHighlight) {
      flash(h.text, 'long f' + h.kind, 6000);
    } else if (lastBall !== null && key !== lastBall && newest && ['4', '6', 'W'].includes(newest.ball)) {
      flash(newest.ball === 'W' ? 'WICKET!' : newest.ball === '6' ? 'SIX!' : 'FOUR!', 'f' + newest.ball, 4000);
    }
    lastHighlight = h === null ? null : h.id;
    lastBall = key;
  }

  async function poll() {
    try {
      const res = await fetch('/l/' + encodeURIComponent(code) + '/data', { cache: 'no-store' });
      if (res.ok) render((await res.json()).snapshot);
    } catch {
      // Keep showing the last score; the stream must never show an error.
    }
    setTimeout(poll, 2000);
  }
  poll();
</script>
</body>
</html>`;
