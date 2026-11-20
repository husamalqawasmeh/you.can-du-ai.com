// Self-check: node test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterQuestions, pickQuestions, isCorrect, grade, mergeSeed, normalizeQuestion, scoreByTopic, topicStats, validStudentId, proficiency, resultItems, topicProficiency, masteredIds, vendorsOf } from './quiz.js';

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

// learning suggestions stats
const bt = scoreByTopic(qs, ['Transformer', 'False', 'fp16']);
assert.deepEqual(bt, { LLMs: [1, 2], 'AI Hardware': [0, 1] });
const st = topicStats([{ byTopic: bt }, { byTopic: { LLMs: [2, 2] } }, { /* old result without byTopic */ }]);
assert.deepEqual(st.map(s => [s.topic, s.pct]), [['AI Hardware', 0], ['LLMs', 75]]);
assert.deepEqual(topicStats([]), []);

// proficiency estimate
assert.equal(proficiency([]), null);
assert.deepEqual(proficiency([['A', 'easy', 1], ['A', 'hard', 0]]), { pct: 25, level: 'Beginner', answered: 2, confidence: 'low' }); // 1 of 4 weighted points
assert.equal(proficiency([['A', 'medium', 1], ['A', 'medium', 0]]).level, 'Intermediate'); // 50%
assert.equal(proficiency(Array(10).fill(['A', 'easy', 1])).level, 'Advanced'); // 100% but no hard questions: not Expert
const hardAce = [...Array(5).fill(['A', 'hard', 1]), ...Array(25).fill(['A', 'medium', 1])];
assert.deepEqual(proficiency(hardAce), { pct: 100, level: 'Expert', answered: 30, confidence: 'high' });
assert.equal(proficiency([...Array(5).fill(['A', 'hard', 0]), ...Array(40).fill(['A', 'easy', 1])]).level, 'Advanced'); // 73% weighted
const qsP = [{ topic: 'T', difficulty: 'hard', type: 'tf', answer: 'True' }, { topic: 'U', difficulty: 'easy', type: 'tf', answer: 'True' }];
assert.deepEqual(resultItems(qsP, ['True', 'False']), [['T', 'hard', 1, undefined], ['U', 'easy', 0, undefined]]);

// never repeat questions answered correctly
const mastered = masteredIds([{ items: [['LLMs', 'easy', 1, 'a'], ['LLMs', 'hard', 0, 'b']] }, { items: [['X', 'easy', 1, 'c']] }, {}, { items: [['X', 'easy', 1]] }]);
assert.deepEqual([...mastered].sort(), ['a', 'c']); // wrong answers and old items without ids are not mastered
assert.deepEqual(filterQuestions(qs, { exclude: mastered }).map(q => q.id), ['b']);
assert.deepEqual(pickQuestions(qs, { count: 5, exclude: new Set(['a', 'b', 'c']) }), []);
assert.equal(filterQuestions(qs, {}).length, 3); // no exclude = everything

// vendor filter: matched by names in the text, with word boundaries (no "intelligence" → Intel, "output" → TPU)
const vq = [{ id: 'v1', prompt: 'What is Red Hat OpenShift?', answer: 'x' }, { id: 'v2', prompt: 'Artificial intelligence output', answer: 'y' }, { id: 'v3', prompt: 'x', options: ['Gemini', 'Claude'], answer: 'Gemini' }];
assert.deepEqual(vendorsOf(vq[0]), ['Red Hat']);
assert.deepEqual(vendorsOf(vq[1]), []);
assert.deepEqual(vendorsOf(vq[2]), ['Google', 'Anthropic']);
assert.deepEqual(filterQuestions(vq, { vendors: ['Anthropic', 'Red Hat'] }).map(q => q.id), ['v1', 'v3']);
assert.deepEqual(topicProficiency(resultItems(qsP, ['True', 'False'])).map(t => [t.topic, t.level]), [['U', 'Beginner'], ['T', 'Advanced']]); // one hard answer is not enough for Expert

// student ID sign-in: 4-10 letters/digits only, case-insensitive
for (const ok of ['1234', 'AB12cd', ' s123 ', 'abcdefghij', '0000000000']) assert.ok(validStudentId(ok), `should accept "${ok}"`);
for (const bad of ['123', 'abcdefghijk', '12-34', '12 34', 'ab_cd', '', 'élève1', '<b>12</b>']) assert.ok(!validStudentId(bad), `should reject "${bad}"`);

// AI-generated question cleanup
assert.equal(normalizeQuestion({ type: 'tf', difficulty: 'easy', prompt: 'p', answer: 'true' }).answer, 'True');
assert.equal(normalizeQuestion({ type: 'mcq', difficulty: 'hard', prompt: 'p', options: ['GPU', 'CPU'], answer: 'gpu' }).answer, 'GPU');
assert.equal(normalizeQuestion({ type: 'mcq', difficulty: 'hard', prompt: 'p', options: ['GPU', 'CPU'], answer: 'TPU' }), null);
assert.equal(normalizeQuestion({ type: 'tf', difficulty: 'easy', prompt: 'p', answer: 'maybe' }), null);
assert.equal(normalizeQuestion({ type: 'essay', difficulty: 'easy', prompt: 'p', answer: 'x' }), null);
assert.equal(normalizeQuestion({ type: 'short', difficulty: 'extreme', prompt: 'p', answer: 'x' }), null);
assert.equal(normalizeQuestion(null), null);
assert.deepEqual(mergeSeed({}, {}).courses, []);

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
  assert.ok(normalizeQuestion(q), `${q.id} fails normalizeQuestion`);
}
console.log(`ok — ${seed.questions.length} seed questions valid`);
