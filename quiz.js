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

export function grade(qs, answers) {
  const correct = qs.filter((q, i) => isCorrect(q, answers[i])).length;
  return { correct, total: qs.length, pct: qs.length ? Math.round((100 * correct) / qs.length) : 0 };
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
  db.seedRemoved ??= [];
  // honour deletions of seed items
  for (const key of ['sources', 'notes', 'questions']) db[key] = db[key].filter(x => !db.seedRemoved.includes(x.id));
  return db;
}
