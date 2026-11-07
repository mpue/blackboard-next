// Converts the classic BlackBoard library (parts/, symbols/, models/, samples/
// in the repository root) into compact JSON bundles under public/library.
// Runs with plain Node (>= 23.6, native TypeScript type stripping).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml } from '../src/io/xml.ts';
import { normalizeCategory, parseModelFile, parsePartDef, parseSymbolBean } from '../src/io/legacy.ts';
import type { PartDef, SpiceModel, SymbolDef } from '../src/model/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, '..', 'public');
const lib = join(out, 'library');

function xmlFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xml')).sort((a, b) => a.localeCompare(b)) : [];
}

function warn(msg: string) {
  console.warn(`  ! ${msg}`);
}

// files are overwritten in place (not deleted first) so a running dev server keeps serving them
mkdirSync(join(lib, 'parts', 'images'), { recursive: true });

// ---- parts ----------------------------------------------------------------------
const partImages = new Map(readdirSync(join(repo, 'parts', 'images')).map((f) => [f.toLowerCase(), f]));
const parts: PartDef[] = [];
for (const file of xmlFiles(join(repo, 'parts'))) {
  try {
    const def = parsePartDef(parseXml(readFileSync(join(repo, 'parts', file), 'utf8')), file, (img) => `library/parts/images/${img}`);
    // the library was maintained on Windows, image names are case insensitive there
    const actual = partImages.get(def.imageName.toLowerCase());
    if (!def.imageName || !actual) {
      warn(`part ${file}: image ${def.imageName} missing`);
      continue;
    }
    copyFileSync(join(repo, 'parts', 'images', actual), join(lib, 'parts', 'images', def.imageName));
    parts.push(def);
  } catch (e) {
    warn(`part ${file}: ${(e as Error).message}`);
  }
}
writeFileSync(join(lib, 'parts.json'), JSON.stringify(parts));

// ---- symbols ----------------------------------------------------------------------
const symbols: SymbolDef[] = [];
for (const file of xmlFiles(join(repo, 'symbols'))) {
  if (file === 'symbol.xsd') continue;
  try {
    const { def } = parseSymbolBean(parseXml(readFileSync(join(repo, 'symbols', file), 'utf8')));
    def.filename = file;
    def.category = normalizeCategory(def.category);
    if (!def.name) def.name = file.replace(/\.xml$/i, '');
    symbols.push(def);
  } catch (e) {
    warn(`symbol ${file}: ${(e as Error).message}`);
  }
}
writeFileSync(join(lib, 'symbols.json'), JSON.stringify(symbols));

// ---- SPICE models -----------------------------------------------------------------
const models: SpiceModel[] = [];
for (const file of xmlFiles(join(repo, 'models'))) {
  try {
    const m = parseModelFile(parseXml(readFileSync(join(repo, 'models', file), 'utf8')), file);
    m.filename = file;
    models.push(m);
  } catch (e) {
    warn(`model ${file}: ${(e as Error).message}`);
  }
}
writeFileSync(join(lib, 'models.json'), JSON.stringify(models));

// ---- samples ------------------------------------------------------------------------
const samplesOut = join(out, 'samples');
const samples: { group: string; file: string; size: number }[] = [];
for (const group of ['boards', 'schematics']) {
  const dir = join(repo, 'samples', group);
  if (!existsSync(dir)) continue;
  mkdirSync(join(samplesOut, group), { recursive: true });
  for (const file of readdirSync(dir).filter((f) => /\.bb$/i.test(f)).sort()) {
    copyFileSync(join(dir, file), join(samplesOut, group, file));
    samples.push({ group, file, size: statSync(join(dir, file)).size });
  }
}
writeFileSync(join(samplesOut, 'index.json'), JSON.stringify(samples));

console.log(`library: ${parts.length} parts, ${symbols.length} symbols, ${models.length} models, ${samples.length} samples`);
