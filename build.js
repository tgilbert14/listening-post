#!/usr/bin/env node
// THE LISTENING POST — single-file concatenation build (MITHRIL playbook §2.13).
// node build.js  →  index.html (GitHub Pages) + fragment.html (headless)
// Fails loudly if any __PLACEHOLDER__ survives.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
/* THE manifest: the one load-bearing fragment list. */
const parts = [
  '01-tokens.css',
  '02-shell.css',
  '03-body.html',
  '10-boot.js',
  '20-band.js',
  '30-audio.js',
  '40-waterfall.js',
  '50-sstv.js',
  '60-interact.js',
  '70-log.js',
  '80-arrival.js',
];

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const css = parts.filter(f => f.endsWith('.css')).map(read).join('\n\n');
const body = parts.filter(f => f.endsWith('.html')).map(read).join('\n\n');
const js = parts.filter(f => f.endsWith('.js')).map(read).join('\n\n');

const fragment = `<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Listening Post · a Desert Data Labs experience</title>
<meta name="description" content="A shortwave receiver at 3 AM. Three bands, a waterfall, and voices in the static — beacons, a numbers station, a picture riding the noise, and something that listens back.">
<meta property="og:title" content="The Listening Post · Desert Data Labs">
<meta property="og:description" content="The band is open. Tune the dial: morse in the dark, a picture riding the noise, and something that listens back.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://tgilbert14.github.io/listening-post/">
<meta property="og:image" content="https://tgilbert14.github.io/listening-post/og-card.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A phosphor-green spectrum waterfall at zero-beat on AURORA, lightning crashes across the band.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://tgilbert14.github.io/listening-post/og-card.jpg">
<meta name="twitter:image:alt" content="A phosphor-green spectrum waterfall at zero-beat on AURORA, lightning crashes across the band.">
<meta name="theme-color" content="#050807">
<link rel="canonical" href="https://tgilbert14.github.io/listening-post/">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='6' y='22' width='52' height='30' rx='4' fill='none' stroke='%236fdd8b' stroke-width='4'/%3E%3Cpath d='M14 36 h6 M26 36 h10 M42 36 h8' stroke='%236fdd8b' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='M32 22 L48 8' stroke='%23d9a441' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>`;

// Placeholder failsafe (§2.13)
const leftover = page.match(/__[A-Z][A-Z0-9_]+__/g);
if (leftover) {
  console.error('BUILD FAILED — surviving placeholders:', [...new Set(leftover)].join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'index.html'), page);
fs.writeFileSync(path.join(__dirname, 'fragment.html'), fragment);
const kb = (n) => (Buffer.byteLength(n, 'utf8') / 1024).toFixed(1) + ' KB';
console.log(`built: index.html ${kb(page)} · fragment.html ${kb(fragment)} · css ${kb(css)} · js ${kb(js)}`);
