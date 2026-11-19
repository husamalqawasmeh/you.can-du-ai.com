// Pure logic shared by the browser app and the node self-check (test.mjs).

export function filterQuestions(questions, { types = [], topics = [], difficulties = [] }) {
  return questions.filter(q =>
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
  db.seedRemoved ??= [];
  // honour deletions of seed items
  for (const key of ['sources', 'notes', 'questions']) db[key] = db[key].filter(x => !db.seedRemoved.includes(x.id));
  return db;
}
