// Pure logic shared by the browser app and the node self-check (test.mjs).

// AI vendors, matched by company and product names in a question's text (questions have no vendor field).
export const VENDORS = {
  Google: /\bgoogle|gemini|gemma|\btpus?\b|deepmind|vertex ai|tensorflow|\bjax\b|notebooklm|\bveo\b|imagen/i,
  OpenAI: /openai|chatgpt|\bgpt|\bsora\b|codex|whisper|dall·?-?e|\bo[134](-mini)?\b/i,
  Anthropic: /anthropic|claude/i,
  NVIDIA: /nvidia|\bcuda\b|\bh100|\bh200|blackwell|\bdgx\b|nvlink|tensorrt|\bnemo\b|\bnim\b|nemotron|tensor core/i,
  Microsoft: /microsoft|azure|copilot|\bphi\b|\bmai\b|autogen|semantic kernel/i,
  Meta: /\bmeta\b|llama|pytorch|\bfaiss\b/i,
  AWS: /amazon|\baws\b|bedrock|sagemaker|trainium|inferentia|\bnova\b/i,
  'Red Hat': /red hat|openshift|ansible|\brhel\b/i,
  xAI: /\bxai\b|\bgrok\b|colossus/i,
  AMD: /\bamd\b|\bmi300|\bmi325|\bmi355|\brocm\b|instinct/i,
  'Hugging Face': /hugging ?face|smolagents|\bhf hub\b|transformers library/i,
  TSMC: /\btsmc\b|taiwan semiconductor|cowos/i,
  ASML: /\basml\b|\beuv\b|extreme ultraviolet/i,
  Apple: /\bapple\b|\bmlx\b|core ml/i,
  IBM: /\bibm\b|granite|watsonx/i,
  Intel: /\bintel\b|gaudi|\bxeon\b|openvino/i,
  ByteDance: /bytedance|seedance|doubao|tiktok/i,
  'Mistral AI': /mistral|le chat|codestral/i,
  DeepSeek: /deepseek/i,
  Alibaba: /alibaba|\bqwen/i,
  Cohere: /\bcohere\b/i,
  LangChain: /langchain|langgraph|langsmith|\blcel\b/i,
  'Liquid AI': /liquid ai|liquid foundation|liquid neural|liquid time-constant|\blfm/i,
};
const qText = q => [q.prompt, q.answer, ...(q.options ?? []), q.explanation ?? ''].join(' ');
export const vendorsOf = q => Object.keys(VENDORS).filter(v => VENDORS[v].test(qText(q)));

export function filterQuestions(questions, { types = [], topics = [], difficulties = [], vendors = [], exclude = null }) {
  return questions.filter(q =>
    !exclude?.has(q.id) &&
    (!vendors.length || vendors.some(v => VENDORS[v]?.test(qText(q)))) &&
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
// for typed answers: also ignore punctuation and quotes ("Context." = "context")
const loose = s => norm(String(s ?? '').replace(/[^\p{L}\p{N}+#]+/gu, ' '));

// shortcut: short answers are exact match against "|"-separated accepted answers; upgrade to fuzzy/LLM grading if too strict.
// match: q.pairs = [[left, right], ...]; given = JSON array of the right item chosen for each left item (all must be right).
// fill: the prompt has a ___ blank; graded like short answer, and the filled-in phrase around the blank is also accepted.
export function isCorrect(q, given) {
  if (q.type === 'match') {
    let g; try { g = JSON.parse(given || '[]'); } catch { return false; }
    return Array.isArray(g) && q.pairs.every((p, k) => norm(g[k]) === norm(p[1]));
  }
  const alts = String(q.answer).split('|').map(loose), g = loose(given);
  if (!g) return false;
  if (alts.includes(g)) return true;
  // fill: also accept the blank filled inside more of the sentence, e.g. "Model Context Protocol" for "Model ___ Protocol"
  if (q.type === 'fill') return alts.some(a => g.includes(a) && q.prompt.split('___').length === 2 && loose(q.prompt.replace('___', a)).includes(g));
  if (q.type === 'short') return false;
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
  if (q.type === 'match' && Array.isArray(q.pairs)) {
    q.pairs = q.pairs.filter(p => Array.isArray(p) && p.length === 2).map(p => p.map(s => String(s).trim()));
    q.answer ||= q.pairs.map(p => `${p[0]} → ${p[1]}`).join('; ');
  }
  const ok = ['mcq', 'tf', 'short', 'fill', 'match'].includes(q.type) && ['easy', 'medium', 'hard'].includes(q.difficulty) && q.prompt && q.answer &&
    (q.type !== 'tf' || ['True', 'False'].includes(q.answer)) &&
    (q.type !== 'fill' || q.prompt.includes('___')) &&
    (q.type !== 'match' || (q.pairs?.length >= 2 && q.pairs.every(p => p[0] && p[1]))) &&
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
    // notes and sources can't be edited by users, so corrected seed text replaces the saved copy
    if (key === 'notes' || key === 'sources') { const byId = new Map((seed[key] ?? []).map(x => [x.id, x])); db[key] = db[key].map(x => byId.get(x.id) ?? x); }
    // built-in multiple-choice options can't be edited either, so improved wrong answers reach saved copies (topic/difficulty edits are kept)
    if (key === 'questions') { const byId = new Map((seed.questions ?? []).map(x => [x.id, x])); for (const q of db.questions) { const sq = byId.get(q.id); if (sq?.options && q.type === 'mcq' && sq.answer === q.answer) q.options = sq.options; } }
  }
  db.results ??= [];
  db.courses ??= [];
  db.objectives ??= { selected: [], custom: [] };
  db.seedRemoved ??= [];
  // honour deletions of seed items
  for (const key of ['sources', 'notes', 'questions']) db[key] = db[key].filter(x => !db.seedRemoved.includes(x.id));
  return db;
}
