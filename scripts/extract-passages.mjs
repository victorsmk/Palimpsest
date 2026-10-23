import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const textsDir = path.join(__dirname, '../data/texts');

// 1. Jane Eyre
const janeRaw = fs.readFileSync(path.join(textsDir, 'jane-eyre-raw.txt'), 'utf8');
const janeStart = janeRaw.indexOf('There was no possibility of taking a walk that day.');
const janeEnd = janeRaw.indexOf('contented, happy, little children.”') + 'contented, happy, little children.”'.length;
const janeText = janeRaw.slice(janeStart, janeEnd).trim();

const janePassage = {
  id: 'jane-eyre-ch1',
  bookId: 'jane-eyre',
  title: 'Jane Eyre — Chapter 1 Opening',
  description: 'Jane is excluded from family warmth on a cold winter afternoon and retreats to the window-seat.',
  sourceText: janeText,
  attribution: {
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    year: 1847,
    source: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/ebooks/1260',
    licenseNote: 'Public domain in the USA',
  },
};

fs.writeFileSync(path.join(textsDir, 'jane-eyre-ch1.json'), JSON.stringify(janePassage, null, 2), 'utf8');

// 2. Walden
const waldenRaw = fs.readFileSync(path.join(textsDir, 'walden-raw.txt'), 'utf8');
const waldenStart = waldenRaw.indexOf('I went to the woods because I wished to live deliberately');
const waldenEnd = waldenRaw.indexOf('“glorify God and enjoy him forever.”') + '“glorify God and enjoy him forever.”'.length;
// Clean Gutenberg italic underscores around words
let waldenText = waldenRaw.slice(waldenStart, waldenEnd).trim();
waldenText = waldenText.replace(/_([a-zA-Z\s]+)_/g, '$1');

const waldenPassage = {
  id: 'walden-woods',
  bookId: 'walden',
  title: 'Walden — Where I Lived, and What I Lived For',
  description: 'Thoreau explains why he retreated to Walden Pond to front only the essential facts of life.',
  sourceText: waldenText,
  attribution: {
    title: 'Walden',
    author: 'Henry David Thoreau',
    year: 1854,
    source: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/ebooks/205',
    licenseNote: 'Public domain in the USA',
  },
};

fs.writeFileSync(path.join(textsDir, 'walden-woods.json'), JSON.stringify(waldenPassage, null, 2), 'utf8');

// 3. Dorian Gray
const dorianRaw = fs.readFileSync(path.join(textsDir, 'dorian-gray-raw.txt'), 'utf8');
const dorianStart = dorianRaw.indexOf('The studio was filled with the rich odour of roses');
const dorianEnd = dorianRaw.indexOf('seemed to make the stillness more oppressive.') + 'seemed to make the stillness more oppressive.'.length;
const dorianText = dorianRaw.slice(dorianStart, dorianEnd).trim();

const dorianPassage = {
  id: 'dorian-gray-ch1',
  bookId: 'dorian-gray',
  title: 'The Picture of Dorian Gray — Chapter 1 Opening',
  description: 'Lord Henry Wotton reclines in Basil Hallward’s studio amidst the heavy scents and blossoms of summer.',
  sourceText: dorianText,
  attribution: {
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    year: 1890,
    source: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/ebooks/174',
    licenseNote: 'Public domain in the USA',
  },
};

fs.writeFileSync(path.join(textsDir, 'dorian-gray-ch1.json'), JSON.stringify(dorianPassage, null, 2), 'utf8');

console.log('Successfully generated JSON passages.');
