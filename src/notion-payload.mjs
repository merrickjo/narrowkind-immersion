/** Emit Notion create-pages payloads for the generated OT entries. */
import { readFileSync } from 'node:fs';

const ABBREV = { Genesis:'Gen',Exodus:'Exod',Leviticus:'Lev',Numbers:'Num',Deuteronomy:'Deut',
 Joshua:'Josh',Judges:'Judg',Ruth:'Ruth','1 Samuel':'1 Sam','2 Samuel':'2 Sam','1 Kings':'1 Kgs',
 '2 Kings':'2 Kgs','1 Chronicles':'1 Chr','2 Chronicles':'2 Chr',Ezra:'Ezra',Nehemiah:'Neh',
 Esther:'Esth',Job:'Job',Psalms:'Ps',Proverbs:'Prov',Ecclesiastes:'Eccl','Song of Solomon':'Song',
 Isaiah:'Isa',Jeremiah:'Jer',Lamentations:'Lam',Ezekiel:'Ezek',Daniel:'Dan',Hosea:'Hos',Joel:'Joel',
 Amos:'Amos',Obadiah:'Obad',Jonah:'Jonah',Micah:'Mic',Nahum:'Nah',Habakkuk:'Hab',Zephaniah:'Zeph',
 Haggai:'Hag',Zechariah:'Zech',Malachi:'Mal' };

const TRIAD = { 1:'Triad 1: Covenant', 2:'Triad 2: Kingdom', 3:'Triad 3: Exile',
                4:'Triad 4: Prophets', 5:'Triad 5: Promised One', 6:'Triad 6: Wisdom' };

const short = (p) => {
  const m = p.match(/^((?:[1-3] )?[A-Za-z][A-Za-z ]*?)( .*)$/);
  if (!m) return p;
  const a = ABBREV[m[1].trim()];
  return a ? a + m[2] : p;
};

const plan = JSON.parse(readFileSync(new URL('../app/plan.json', import.meta.url)));
const ot = plan.plans.find((p) => p.id === 'ot');
const rows = ot.entries.filter((e) => e.generated);

const pages = rows.map((e) => {
  const props = {
    Entry: e.type === 'review' ? (e.scope === 'movement' ? e.passage : `${ABBREV[e.book] || e.book} Review`) : short(e.passage),
    Passage: e.passage,
    Day: e.day,
    Week: e.week,
    Type: e.type === 'review' ? 'Review' : 'Reading',
    Triad: TRIAD[e.movement],
  };
  if (e.book) props.Book = [e.book];
  return { properties: props };
});

const size = 100;
const n = +(process.argv[2] ?? 0);
const batch = pages.slice(n * size, (n + 1) * size);
if (process.argv[2] === 'count') {
  console.log(`rows ${pages.length}  batches ${Math.ceil(pages.length / size)}`);
  const bad = pages.filter((p) => !p.properties.Entry || !p.properties.Triad || p.properties.Day == null);
  console.log('malformed:', bad.length, bad.slice(0, 3));
} else {
  console.log(JSON.stringify(batch));
}
