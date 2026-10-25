import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dictPath = path.join(__dirname, '../data/cmudict/cmudict.dict');
const outPath = path.join(__dirname, '../data/cmudict/syllable-map.json');

async function processDict() {
  console.log('Reading cmudict.dict...');
  const fileStream = fs.createReadStream(dictPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  // word -> Set<number>
  const countsMap = new Map();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';;;')) continue;

    // Split word from phonemes
    const parts = trimmed.split(/\s+/);
    const rawWord = parts[0];
    const phonemes = parts.slice(1);

    // Strip alternate notation, e.g. "WORD(2)" -> "word"
    const word = rawWord.replace(/\(\d+\)$/, '').toLowerCase();

    // Count vowel phonemes (ending in 0, 1, or 2)
    let syllables = 0;
    for (const p of phonemes) {
      if (/[012]$/.test(p)) {
        syllables++;
      }
    }

    if (!countsMap.has(word)) {
      countsMap.set(word, new Set());
    }
    countsMap.get(word).add(syllables);
  }

  console.log(`Aggregated ${countsMap.size} unique words.`);

  // Build the compact map: word -> number (one count in every pronunciation) or an ascending
  // array of the counts the pronunciations disagree on, e.g. "deliberately" -> [4, 5].
  const output = {};
  let definiteCount = 0;
  let ambiguousCount = 0;

  for (const [word, counts] of countsMap.entries()) {
    if (counts.size === 1) {
      output[word] = Array.from(counts)[0];
      definiteCount++;
    } else {
      output[word] = Array.from(counts).sort((a, b) => a - b);
      ambiguousCount++;
    }
  }

  console.log(`Definite: ${definiteCount}, Ambiguous: ${ambiguousCount}`);
  fs.writeFileSync(outPath, JSON.stringify(output), 'utf8');

  const stats = fs.statSync(outPath);
  console.log(`Generated syllable-map.json: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
}

processDict().catch(err => {
  console.error(err);
  process.exit(1);
});
