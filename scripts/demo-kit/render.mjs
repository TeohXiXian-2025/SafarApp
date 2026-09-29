// Renders the demo kit (these HTML pages) into public/demo-kit/ — PDFs for
// the e-ticket and hotels, phone-sized PNG "screenshots" for the rest.
// Usage: node scripts/demo-kit/render.mjs   (needs the playwright-cli tool)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'public', 'demo-kit');
mkdirSync(out, { recursive: true });

// [source page, output file, how]
const FILES = [
  ['01-flight-e-ticket.html', '01-flight-e-ticket-MH-6KQ2PX.pdf', 'pdf'],
  ['02-hotel-tokyo.html', '02-hotel-Richmond-Asakusa.pdf', 'pdf'],
  ['03-shinkansen-ticket.html', '03-shinkansen-Nozomi-21.png', { width: 390, height: 844 }],
  ['04-hotel-kyoto.html', '04-hotel-Granvia-Kyoto.pdf', 'pdf'],
  ['05-instagram-post.html', '05-instagram-Kyoto-post.png', { width: 390, height: 844 }],
  ['06-passport-specimen.html', '06-passport-SPECIMEN-Aisyah.png', { width: 900, height: 620 }],
  ['07-dinner-receipt.html', '07-receipt-Panga-dinner.png', { width: 560, height: 760 }],
  ['08-train-delay-notice.html', '08-train-delay-notice.png', { width: 390, height: 844 }],
];

const jobs = FILES.map(([src, dest, how]) => ({ url: pathToFileURL(join(here, src)).href, dest: join(out, dest), how }));
const code = `async (page) => {
  const jobs = ${JSON.stringify(jobs)};
  for (const j of jobs) {
    if (j.how === 'pdf') {
      await page.setViewportSize({ width: 900, height: 1200 });
      await page.goto(j.url);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: j.dest, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } });
      await page.emulateMedia({ media: 'screen' });
    } else {
      // Twice the size, so the text stays sharp when read back.
      await page.setViewportSize({ width: j.how.width * 2, height: j.how.height * 2 });
      await page.goto(j.url);
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await page.screenshot({ path: j.dest, scale: 'device' });
    }
  }
  return jobs.length + ' files';
}`;
const file = join(tmpdir(), 'safar-demo-kit-render.js');
writeFileSync(file, code);
const cli = (args) => execFileSync('playwright-cli', args, { encoding: 'utf8', shell: process.platform === 'win32' });
cli(['-s=demokit', 'open']);
try {
  console.log(cli(['-s=demokit', '--raw', 'run-code', `--filename=${file}`]).trim());
} finally {
  cli(['-s=demokit', 'close']);
}
console.log(`→ ${out}`);
