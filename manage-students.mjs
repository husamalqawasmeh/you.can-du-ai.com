// Manage student passkeys (admin only). Run in this folder, then commit + push students.json.
//   node manage-students.mjs add <studentId> ["Name"]   create a passkey (printed once; send it to the student)
//   node manage-students.mjs reset <studentId>          new passkey, old one stops working
//   node manage-students.mjs remove <studentId>         revoke access
//   node manage-students.mjs list                       show your local roster
// students.json (public) holds only hashes. students.local.json (gitignored) is your private roster: IDs and names, never passkeys.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { normId, idHash, keyHash } from './quiz.js';

const PUB = new URL('./students.json', import.meta.url), LOCAL = new URL('./students.local.json', import.meta.url);
const read = (f, d) => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d;
const pub = read(PUB, {}), roster = read(LOCAL, {});
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos
const newKey = () => { const k = Array.from({ length: 10 }, () => ALPH[randomInt(ALPH.length)]).join(''); return `${k.slice(0, 4)}-${k.slice(4, 8)}-${k.slice(8)}`; };
const save = () => { writeFileSync(PUB, JSON.stringify(pub, null, 2) + '\n'); writeFileSync(LOCAL, JSON.stringify(roster, null, 2) + '\n'); };

const [cmd, rawId, name = ''] = process.argv.slice(2);
const id = normId(rawId);
if (cmd === 'list') {
  for (const [sid, r] of Object.entries(roster)) console.log(`${sid}\t${r.name || ''}\tadded ${r.added}${r.reset ? `\treset ${r.reset}` : ''}`);
  process.exit(0);
}
if (!['add', 'reset', 'remove'].includes(cmd) || !id) {
  console.error('Usage: node manage-students.mjs add|reset|remove <studentId> ["Name"]   or   list'); process.exit(1);
}
const ih = await idHash(id);
if (cmd === 'remove') {
  delete pub[ih]; delete roster[id]; save(); console.log(`Removed ${id}. Commit and push students.json.`); process.exit(0);
}
if (cmd === 'add' && pub[ih]) { console.error(`${id} already exists. Use "reset" to issue a new passkey.`); process.exit(1); }
if (cmd === 'reset' && !pub[ih]) { console.error(`${id} not found. Use "add".`); process.exit(1); }
const key = newKey();
pub[ih] = await keyHash(id, key);
const today = new Date().toISOString().slice(0, 10);
roster[id] = cmd === 'add' ? { name, added: today } : { ...roster[id], reset: today };
save();
console.log(`Student ID: ${id}\nPasskey:    ${key}\nSend this passkey to the student now; it is not stored anywhere. Then commit and push students.json.`);
