// Self-check: node test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterQuestions, pickQuestions, isCorrect, grade, mergeSeed } from './quiz.js';

const qs = [
  { id: 'a', topic: 'LLMs', type: 'mcq', difficulty: 'easy', answer: 'Transformer' },
  { id: 'b', topic: 'LLMs', type: 'tf', difficulty: 'hard', answer: 'True' },
  { id: 'c', topic: 'AI Hardware', type: 'short', difficulty: 'easy', answer: 'bfloat16|bf16' },
];

assert.equal(filterQuestions(qs, { topics: ['LLMs'] }).length, 2);
assert.equal(filterQuestions(qs, { topics: ['LLMs'], difficulties: ['easy'] }).length, 1);
assert.equal(filterQuestions(qs, {}).length, 3);
assert.equal(pickQuestions(qs, { count: 2 }).length, 2);
assert.equal(pickQuestions(qs, { count: 10 }).length, 3);
assert.equal(new Set(pickQuestions(qs, { count: 3 }).map(q => q.id)).size, 3);

assert.ok(isCorrect(qs[0], ' transformer '));
assert.ok(isCorrect(qs[2], 'BF16'));
assert.ok(!isCorrect(qs[2], 'fp16'));
assert.ok(!isCorrect(qs[1], undefined));
assert.deepEqual(grade(qs, ['Transformer', 'False', 'bf16']), { correct: 2, total: 3, pct: 67 });
assert.deepEqual(grade([], []), { correct: 0, total: 0, pct: 0 });

const db = mergeSeed({ questions: [{ id: 'a', mine: true }], seedRemoved: ['b'] }, { topics: ['X'], questions: qs });
assert.deepEqual(db.questions.map(q => q.id), ['a', 'c']);
assert.ok(db.questions[0].mine, 'user copy kept');
assert.deepEqual(db.topics, ['X']);

// validate seed file
const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url)));
const ids = new Set();
for (const q of seed.questions) {
  assert.ok(!ids.has(q.id), `dup id ${q.id}`); ids.add(q.id);
  assert.ok(seed.topics.includes(q.topic), `${q.id} unknown topic`);
  assert.ok(['mcq', 'tf', 'short'].includes(q.type), `${q.id} type`);
  assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty), `${q.id} difficulty`);
  if (q.type === 'mcq') assert.ok(q.options.includes(q.answer), `${q.id} answer not in options`);
  if (q.type === 'tf') assert.ok(['True', 'False'].includes(q.answer), `${q.id} tf answer`);
}
console.log(`ok — ${seed.questions.length} seed questions valid`);
