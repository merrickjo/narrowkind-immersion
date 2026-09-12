/** Reference parsing + coverage arithmetic shared by the build tools. */
export const ABBR = {
  GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',JOS:'Joshua',
  JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings',
  '1CH':'1 Chronicles','2CH':'2 Chronicles',EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',
  PSA:'Psalms',PRO:'Proverbs',ECC:'Ecclesiastes',SNG:'Song of Solomon',ISA:'Isaiah',JER:'Jeremiah',
  LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',AMO:'Amos',OBA:'Obadiah',
  JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',
  MAL:'Malachi',MAT:'Matthew',MRK:'Mark',LUK:'Luke',JHN:'John',ACT:'Acts',ROM:'Romans',
  '1CO':'1 Corinthians','2CO':'2 Corinthians',GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',
  COL:'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy',
  TIT:'Titus',PHM:'Philemon',HEB:'Hebrews',JAS:'James','1PE':'1 Peter','2PE':'2 Peter',
  '1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation',
};
export const CODE = Object.fromEntries(Object.entries(ABBR).map(([k, v]) => [v, k]));

/** Books of one chapter — a bare number there means a verse, not a chapter. */
export const ONE_CHAPTER = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);

/** "Genesis 1:26-2:3" | "Psalm 119" | "Jude 1-25" → {code, sc, sv, ec, ev} */
export function parseRef(ref, chapters) {
  const m = ref.trim().match(/^((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+(\d+)(?::(\d+))?(?:\s*-\s*(?:(\d+):)?(\d+))?$/);
  if (!m) return null;
  let name = m[1].trim();
  if (name === 'Psalm') name = 'Psalms';
  const code = CODE[name];
  if (!code) return null;
  const last = (c) => chapters?.[code]?.find((x) => x.chapter === c)?.verses ?? 999;

  if (ONE_CHAPTER.has(code)) {           // "Jude 1-25" = verses
    const sv = +m[2], ev = m[5] ? +m[5] : (m[3] ? +m[3] : sv);
    return { code, sc: 1, sv, ec: 1, ev };
  }
  const sc = +m[2];
  if (!m[3]) {                            // whole chapter(s): "Psalm 119", "Isaiah 1-6"
    const ec = m[5] ? +m[5] : sc;
    return { code, sc, sv: 1, ec, ev: last(ec) };
  }
  const sv = +m[3];
  if (!m[5]) return { code, sc, sv, ec: sc, ev: sv };
  const ec = m[4] ? +m[4] : sc;
  return { code, sc, sv, ec, ev: +m[5] };
}

export const toRef = (code, sc, sv, ec, ev, chapters) => {
  const name = ABBR[code];
  if (ONE_CHAPTER.has(code)) return `${name} ${sv}-${ev}`;
  const full = sv === 1 && ev === (chapters?.[code]?.find((x) => x.chapter === ec)?.verses ?? -1);
  if (full) return sc === ec ? `${name} ${sc}` : `${name} ${sc}-${ec}`;
  return sc === ec ? `${name} ${sc}:${sv}-${ev}` : `${name} ${sc}:${sv}-${ec}:${ev}`;
};

/** Flatten a book to a 1-D verse index so ranges can be compared. */
export function indexer(chapterList) {
  const offset = new Map();
  let n = 0;
  for (const { chapter, verses } of chapterList) { offset.set(chapter, n); n += verses; }
  return { total: n, at: (c, v) => (offset.get(c) ?? 0) + v - 1 };
}
