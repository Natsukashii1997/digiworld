// Mechanical crops of the user-approved reference only. No synthesis or retouching.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const designDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(designDirectory, '../..');
const source = resolve(designDirectory, 'reference/approved.png');
const outputDirectory = resolve(projectDirectory, 'public/theme/digievolution');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const expectedSourceHash = '192d13e2e2e2be6c20b0c69758251ee290e7c0b6b3f2b6c3655ed4500454314f';
if (sha256(source) !== expectedSourceHash) throw new Error('Approved source identity changed; stop for review.');

// Bounds are integer pixels, origin at the top-left; source retains its contextual background.
const crops = [
  { name: 'digivice', x: 27, y: 20, width: 53, height: 49 },
  { name: 'ensemble', x: 720, y: 216, width: 663, height: 414 },
  { name: 'island', x: 18, y: 738, width: 156, height: 126 },
  { name: 'crests', x: 524, y: 112, width: 564, height: 55 },
  { name: 'partner-0', x: 234, y: 335, width: 85, height: 98 },
  { name: 'partner-1', x: 234, y: 460, width: 85, height: 102 },
  { name: 'partner-2', x: 234, y: 587, width: 85, height: 102 },
  { name: 'partner-3', x: 234, y: 713, width: 85, height: 105 },
  { name: 'partner-4', x: 234, y: 842, width: 85, height: 99 },
  { name: 'partner-5', x: 234, y: 966, width: 85, height: 101 },
];

mkdirSync(outputDirectory, { recursive: true });
const outputs = [];
for (const crop of crops) {
  const output = resolve(outputDirectory, `${crop.name}.png`);
  if (existsSync(output)) throw new Error(`Output already exists; refusing to overwrite: ${output}`);
  execFileSync('/usr/bin/sips', [
    '-c', String(crop.height), String(crop.width),
    '--cropOffset', String(crop.y), String(crop.x),
    source, '--out', output,
  ], { stdio: 'pipe' });
  const header = readFileSync(output);
  const dimensions = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  if (dimensions.width !== crop.width || dimensions.height !== crop.height) {
    throw new Error(`Unexpected output dimensions: ${output}`);
  }
  outputs.push({
    file: relative(projectDirectory, output),
    bounds: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    dimensions,
    sha256: sha256(output),
  });
}
console.log(JSON.stringify({
  source: relative(projectDirectory, source),
  sourceSha256: sha256(source),
  sourceDimensions: { width: 1402, height: 1122 },
  operation: 'sips cropToHeightWidth with top-left cropOffset; no resize, no retouch, no generation',
  transparency: 'Original contextual backgrounds preserved',
  outputs,
}, null, 2));
