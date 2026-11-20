#!/usr/bin/env node
// CreatorOS production bundle inventory. Read-only: never deploys or alters production.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const origin = process.env.CREATOROS_ORIGIN || 'https://creatoros-one-blond.vercel.app';
const output = process.env.OUTPUT_DIR || 'recovery/public-bundles';
const routes = ['/studio/record', '/studio/clipforge'];
await mkdir(output, { recursive: true });
const inventory = [];
for (const route of routes) {
  const response = await fetch(new URL(route, origin));
  if (!response.ok) throw new Error(`GET ${route}: HTTP ${response.status}`);
  const html = await response.text();
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s<>]+?\.js/g)].map(m => m[0]))];
  const entries = [];
  for (const chunk of chunks) {
    const res = await fetch(new URL(chunk, origin));
    if (!res.ok) throw new Error(`GET ${chunk}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const file = path.join(output, path.basename(chunk));
    await writeFile(file, bytes);
    entries.push({ url: chunk, file, bytes: bytes.length, sha256 });
  }
  inventory.push({ route, htmlBytes: Buffer.byteLength(html), chunks: entries });
}
const manifest = path.join(output, 'manifest.json');
await writeFile(manifest, JSON.stringify({ origin, inventory }, null, 2) + '\n');
console.log(manifest);
for (const item of inventory) console.log(`${item.route}: ${item.chunks.length} chunks; ${item.chunks.reduce((n, c) => n + c.bytes, 0)} bytes`);
