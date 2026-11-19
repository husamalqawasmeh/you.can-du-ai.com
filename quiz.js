// Pure logic shared by the browser app and the node self-check (test.mjs).

export function filterQuestions(questions, { types = [], topics = [], difficulties = [], exclude = null }) {
  return questions.filter(q =>
    !exclude?.has(q.id) &&
    (!types.length || types.includes(q.type)) &&
    (!topics.length || topics.includes(q.topic)) &&
    (!difficulties.length || difficulties.includes(q.difficulty)));
}

export function pickQuestions(questions, opts, rand = Math.random) {
  const a = filterQuestions(questions, opts);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, opts.count | 0));
}

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// shortcut: short answers are exact match against "|"-separated accepted answers; upgrade to fuzzy/LLM grading if too strict.
export function isCorrect(q, given) {
  if (q.type === 'short') return String(q.answer).split('|').map(norm).includes(norm(given));
  return norm(given) === norm(q.answer);
}

// Fixes harmless casing differences, then checks the question is usable in a test (used for AI-made and imported questions).
export function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  q = { ...q, answer: String(q.answer ?? '').trim(), prompt: String(q.prompt ?? '').trim() };
  if (q.type === 'tf') q.answer = /^true$/i.test(q.answer) ? 'True' : /^false$/i.test(q.answer) ? 'False' : q.answer;
  if (q.type === 'mcq' && Array.isArray(q.options)) {
    q.options = q.options.map(String);
    q.answer = q.options.find(o => o.toLowerCase() === q.answer.toLowerCase()) ?? q.answer;
  }
  const ok = ['mcq', 'tf', 'short'].includes(q.type) && ['easy', 'medium', 'hard'].includes(q.difficulty) && q.prompt && q.answer &&
    (q.type !== 'tf' || ['True', 'False'].includes(q.answer)) &&
    (q.type !== 'mcq' || (q.options?.length >= 2 && q.options.includes(q.answer)));
  return ok ? q : null;
}

export function grade(qs, answers) {
  const correct = qs.filter((q, i) => isCorrect(q, answers[i])).length;
  return { correct, total: qs.length, pct: qs.length ? Math.round((100 * correct) / qs.length) : 0 };
}

// Student ID sign-in (no passkey): 4-10 letters or digits, case-insensitive.
export const normId = s => String(s ?? '').trim().toLowerCase();
export const validStudentId = s => /^[a-z0-9]{4,10}$/.test(normId(s));

// Per-topic [correct, total] for one test.
export function scoreByTopic(qs, answers) {
  const out = {};
  qs.forEach((q, i) => { const s = (out[q.topic] ??= [0, 0]); s[0] += isCorrect(q, answers[i]) ? 1 : 0; s[1]++; });
  return out;
}

// Proficiency estimate. items = [topic, difficulty, correct 0/1] per answered question.
// Score is weighted by difficulty (easy 1, medium 2, hard 3); "Expert" also needs proven skill on hard questions.
const DIFF_W = { easy: 1, medium: 2, hard: 3 };
export const resultItems = (qs, answers) => qs.map((q, i) => [q.topic, q.difficulty, isCorrect(q, answers[i]) ? 1 : 0, q.id]);
// IDs of questions this student has answered correctly at least once (so tests can skip them).
export const masteredIds = results => new Set(results.flatMap(r => r.items ?? []).filter(it => it[2] && it[3]).map(it => it[3]));
export function proficiency(items) {
  if (!items?.length) return null;
  let got = 0, max = 0, hardN = 0, hardOk = 0;
  for (const [, d, c] of items) {
    const w = DIFF_W[d] || 2; max += w; if (c) got += w;
    if (d === 'hard') { hardN++; if (c) hardOk++; }
  }
  const pct = Math.round((100 * got) / max);
  let level = pct < 40 ? 'Beginner' : pct < 65 ? 'Intermediate' : pct < 85 ? 'Advanced' : 'Expert';
  if (level === 'Expert' && (hardN < 5 || hardOk / hardN < 0.7)) level = 'Advanced';
  const confidence = items.length < 10 ? 'low' : items.length < 30 ? 'medium' : 'high';
  return { pct, level, answered: items.length, confidence };
}
// Proficiency per topic, weakest first.
export function topicProficiency(items) {
  const by = {};
  for (const it of items) (by[it[0]] ??= []).push(it);
  return Object.entries(by).map(([topic, its]) => ({ topic, ...proficiency(its) })).sort((a, b) => a.pct - b.pct);
}

// Accuracy per topic across all saved results, weakest first.
export function topicStats(results) {
  const agg = {};
  for (const r of results) for (const [t, [c, n]] of Object.entries(r.byTopic ?? {})) { const a = (agg[t] ??= [0, 0]); a[0] += c; a[1] += n; }
  return Object.entries(agg).map(([topic, [correct, total]]) => ({ topic, correct, total, pct: Math.round((100 * correct) / total) }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
}

// Adds seed items the user doesn't have yet (by id), so seed updates reach existing users without overwriting their data.
export function mergeSeed(db, seed) {
  for (const key of ['topics', 'sources', 'notes', 'questions']) {
    db[key] ??= [];
    if (key === 'topics') {
      for (const t of seed.topics ?? []) if (!db.topics.includes(t)) db.topics.push(t);
      continue;
    }
    const have = new Set(db[key].map(x => x.id));
    for (const x of seed[key] ?? []) if (!have.has(x.id)) db[key].push(x);
  }
  db.results ??= [];
  db.courses ??= [];
  db.objectives ??= { selected: [], custom: [] };
  db.seedRemoved ??= [];
  // honour deletions of seed items
  for (const key of ['sources', 'notes', 'questions']) db[key] = db[key].filter(x => !db.seedRemoved.includes(x.id));
  return db;
}
