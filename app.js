import { filterQuestions, pickQuestions, isCorrect, grade, mergeSeed, normalizeQuestion } from './quiz.js';
import { ADMIN_HASH } from './admin-hash.js';

const KEY = 'ycda-db-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// randomUUID only exists on HTTPS/localhost; fall back so plain-http visits still work
const uid = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const TYPE = { mcq: 'Multiple choice', tf: 'True / False', short: 'Short answer' };

let db;
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { alert('Could not save in this browser (storage blocked or full). Export a backup now.'); }
  render();
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== name);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---------- rendering ----------
const opt = (v, label = v) => `<option value="${esc(v)}">${esc(label)}</option>`;
const sourceTitle = id => db.sources.find(s => s.id === id)?.title;

function fillSelect(sel, html) {
  const keep = sel.value;
  sel.innerHTML = html;
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}

function render() {
  const topicOpts = db.topics.map(t => opt(t)).join('');
  document.querySelectorAll('.topic-select').forEach(s => fillSelect(s, topicOpts));
  document.querySelectorAll('.source-select').forEach(s => fillSelect(s, opt('', '— none —') + db.sources.map(x => opt(x.id, x.title)).join('')));
  fillSelect($('#q-filter-topic'), opt('', 'All topics') + topicOpts);
  fillSelect($('#lib-filter-topic'), opt('', 'All topics') + topicOpts);

  const checked = new Set([...document.querySelectorAll('#cfg-topics input:checked')].map(i => i.value));
  $('#cfg-topics').innerHTML = db.topics.map(t =>
    `<label><input type="checkbox" name="topic" value="${esc(t)}" ${checked.has(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('');
  updateMatchCount();

  // topics
  $('#topic-list').innerHTML = db.topics.map(t => {
    const n = db.questions.filter(q => q.topic === t).length;
    return `<li><div>${esc(t)} <span class="tag">${n} questions</span></div><button type="button" class="del" data-del-topic="${esc(t)}">Delete</button></li>`;
  }).join('');

  // library
  const lt = $('#lib-filter-topic').value;
  const byTopic = x => !lt || x.topic === lt;
  $('#note-list').innerHTML = db.notes.filter(byTopic).map(n => `<li dir="auto"><div><strong>${esc(n.title)}</strong> <span class="tag">${esc(n.topic)}${sourceTitle(n.sourceId) ? ' · ' + esc(sourceTitle(n.sourceId)) : ''}</span><div>${esc(n.body)}</div></div><button class="del" data-del="notes" data-id="${esc(n.id)}">Delete</button></li>`).join('') || '<li class="muted">Nothing yet.</li>';
  const st = $('#lib-filter-type').value, sl = $('#lib-filter-lang').value;
  const srcs = db.sources.filter(s => byTopic(s) && (!st || s.type === st) && (!sl || (s.lang || 'en') === sl));
  $('#source-list').innerHTML = srcs.map(s => `<li dir="auto"><div>${/^https?:\/\//i.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)} <span class="tag">${esc(s.type)} · ${esc(s.topic)}${s.lang === 'ar' ? ' · العربية' : ''}</span>${s.notes ? `<div class="muted">${esc(s.notes)}</div>` : ''}</div><button class="del" data-del="sources" data-id="${esc(s.id)}">Delete</button></li>`).join('') || '<li class="muted">Nothing yet.</li>';

  // questions
  const qt = $('#q-filter-topic').value, term = $('#q-search').value.toLowerCase();
  const qs = db.questions.filter(q => (!qt || q.topic === qt) && (!term || q.prompt.toLowerCase().includes(term)));
  $('#q-total').textContent = `(${db.questions.length} total)`;
  $('#q-list').innerHTML = qs.map(q => `<li><div>${esc(q.prompt)}<div class="tag">${esc(q.topic)} · ${TYPE[q.type]} · ${esc(q.difficulty)} · Answer: ${esc(q.answer)}</div></div><button class="del" data-del="questions" data-id="${esc(q.id)}">Delete</button></li>`).join('') || '<li class="muted">No questions match.</li>';

  // courses
  $('#topic-datalist').innerHTML = topicOpts;
  $('#gen-list').innerHTML = db.courses.slice().reverse().map(c => {
    const n = db.questions.filter(q => q.courseId === c.id).length;
    return `<details class="course" dir="auto"><summary>${esc(c.title)} <span class="tag">${esc(c.topic)} · ${esc(c.level)} · ${c.modules.length} lessons · ${n} questions</span></summary>
      <p>${esc(c.description)}</p>
      ${c.modules.map((m, i) => `<h4>Lesson ${i + 1}: ${esc(m.title)}</h4><div class="prewrap">${esc(m.content)}</div>`).join('')}
      <div class="actions"><button type="button" class="primary" data-course-test="${esc(c.id)}" ${n ? '' : 'disabled'}>Take the course test</button>
      <button type="button" class="del" data-del="courses" data-id="${esc(c.id)}">Delete course</button></div></details>`;
  }).join('') || '<p class="muted">No courses created yet.</p>';
  $('#course-list').innerHTML = db.sources.filter(s => s.type === 'Course').map(s => `<li dir="auto"><div>${/^https?:\/\//i.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)} <span class="tag">${esc(s.topic)}${s.lang === 'ar' ? ' · العربية' : ''}</span>${s.notes ? `<div class="muted">${esc(s.notes)}</div>` : ''}</div><button class="del" data-del="sources" data-id="${esc(s.id)}">Delete</button></li>`).join('') || '<li class="muted">No courses yet.</li>';

  // history
  $('#history-list').innerHTML = db.results.slice().reverse().map(r => `<li><div><strong>${r.pct}%</strong> (${r.correct}/${r.total}) <span class="tag">${new Date(r.date).toLocaleString()} · ${esc(r.topics.join(', ') || 'All topics')}</span></div></li>`).join('') || '<li class="muted">No tests taken yet.</li>';

  $('#data-stats').textContent = `${db.topics.length} topics · ${db.sources.length} sources · ${db.notes.length} knowledge entries · ${db.questions.length} questions · ${db.results.length} test results`;
}

$('#lib-filter-topic').onchange = $('#lib-filter-type').onchange = $('#lib-filter-lang').onchange = render;
$('#q-filter-topic').onchange = render;
$('#q-search').oninput = render;

// ---------- deletes ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-del], [data-del-topic]');
  if (!b) return;
  if (b.dataset.delTopic) {
    const t = b.dataset.delTopic;
    const used = ['questions', 'sources', 'notes'].some(k => db[k].some(x => x.topic === t));
    if (used) return alert(`"${t}" still has questions, sources or knowledge. Delete those first.`);
    db.topics = db.topics.filter(x => x !== t);
  } else {
    if (!confirm('Delete this item?')) return;
    const { del, id } = b.dataset;
    db[del] = db[del].filter(x => x.id !== id);
    if (del === 'courses') db.questions = db.questions.filter(q => q.courseId !== id);
    db.seedRemoved.push(id); // so the seed doesn't bring it back
  }
  save();
});

// ---------- add forms ----------
const formData = f => Object.fromEntries(new FormData(f));
const trimAll = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

$('#topic-form').onsubmit = e => {
  e.preventDefault();
  const { name } = trimAll(formData(e.target));
  if (!name) return;
  if (db.topics.some(t => t.toLowerCase() === name.toLowerCase())) return alert('That topic already exists.');
  db.topics.push(name); e.target.reset(); save();
};

$('#source-form').onsubmit = e => {
  e.preventDefault();
  db.sources.push({ id: uid(), ...trimAll(formData(e.target)) }); e.target.reset(); save();
};

$('#note-form').onsubmit = e => {
  e.preventDefault();
  db.notes.push({ id: uid(), ...trimAll(formData(e.target)) }); e.target.reset(); save();
};

const qForm = $('#q-form');
const syncQType = () => { qForm.querySelector('.for-mcq').hidden = qForm.type.value !== 'mcq'; };
qForm.type.onchange = syncQType; syncQType();

qForm.onsubmit = e => {
  e.preventDefault();
  const d = trimAll(formData(qForm));
  const q = { id: uid(), topic: d.topic, type: d.type, difficulty: d.difficulty, prompt: d.prompt, answer: d.answer, explanation: d.explanation, sourceId: d.sourceId };
  if (q.type === 'mcq') {
    q.options = d.options.split('\n').map(s => s.trim()).filter(Boolean);
    if (q.options.length < 2) return alert('Give at least two options, one per line.');
    const match = q.options.find(o => o.toLowerCase() === q.answer.toLowerCase());
    if (!match) return alert('The correct answer must be one of the options, written exactly.');
    q.answer = match;
  }
  if (q.type === 'tf') {
    const a = q.answer.toLowerCase();
    if (a !== 'true' && a !== 'false') return alert('For True / False, the answer must be True or False.');
    q.answer = a === 'true' ? 'True' : 'False';
  }
  db.questions.push(q);
  qForm.prompt.value = qForm.options.value = qForm.answer.value = qForm.explanation.value = '';
  save();
};

// ---------- test ----------
const cfgForm = $('#test-config');
function readConfig() {
  const all = name => [...cfgForm.querySelectorAll(`input[name=${name}]:checked`)].map(i => i.value);
  return { count: +cfgForm.count.value, topics: all('topic'), types: all('type'), difficulties: all('difficulty') };
}
function updateMatchCount() {
  const n = filterQuestions(db.questions, readConfig()).length;
  $('#match-count').textContent = `${n} question${n === 1 ? '' : 's'} match these settings.`;
}
cfgForm.addEventListener('change', updateMatchCount);

let current = null;
cfgForm.onsubmit = e => {
  e.preventDefault();
  const cfg = readConfig();
  const qs = pickQuestions(db.questions, cfg);
  if (!qs.length) return alert('No questions match these settings. Widen the filters or add questions.');
  if (qs.length < cfg.count && !confirm(`Only ${qs.length} questions match. Start with ${qs.length}?`)) return;
  startTest(qs, cfg);
};

function startTest(qs, cfg) {
  showTab('test');
  current = { cfg, qs };
  const run = $('#test-run');
  run.innerHTML = `<div class="card"><h2>Test: ${qs.length} questions</h2>` + qs.map((q, i) => {
    const choices = q.type === 'mcq' ? q.options : q.type === 'tf' ? ['True', 'False'] : null;
    const input = choices
      ? choices.map(c => `<label><input type="radio" name="a${i}" value="${esc(c)}"> ${esc(c)}</label>`).join('')
      : `<input name="a${i}" autocomplete="off" aria-label="Your answer">`;
    return `<div class="question"><p>${i + 1}. ${esc(q.prompt)}</p><div class="tag">${esc(q.topic)} · ${esc(q.difficulty)}</div>${input}</div>`;
  }).join('') + `<button class="primary">Submit answers</button> <button type="button" id="cancel-test">Cancel</button></div>`;
  cfgForm.hidden = true; $('#test-result').hidden = true; run.hidden = false;
  $('#cancel-test').onclick = resetTest;
  run.scrollIntoView();
}

function resetTest() {
  current = null;
  $('#test-run').hidden = true; $('#test-result').hidden = true; cfgForm.hidden = false;
}

$('#test-run').onsubmit = e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { qs, cfg } = current;
  const answers = qs.map((_, i) => f.get(`a${i}`) ?? '');
  const g = grade(qs, answers);
  db.results.push({ id: uid(), date: new Date().toISOString(), topics: cfg.topics, ...g });
  const out = $('#test-result');
  out.innerHTML = `<div class="card"><h2>Your result</h2><p class="score">${g.pct}%</p><p>${g.correct} of ${g.total} correct.</p>` +
    qs.map((q, i) => {
      const ok = isCorrect(q, answers[i]);
      const src = sourceTitle(q.sourceId);
      return `<div class="question"><p>${i + 1}. ${esc(q.prompt)}</p>
        <div class="${ok ? 'good' : 'bad'}">${ok ? '✓ Correct' : '✗ Incorrect'} — your answer: ${esc(answers[i] || '(blank)')}</div>
        ${ok ? '' : `<div>Correct answer: <strong>${esc(q.answer.split('|')[0])}</strong></div>`}
        ${q.explanation ? `<div class="muted">${esc(q.explanation)}</div>` : ''}
        ${src ? `<div class="tag">Source: ${esc(src)}</div>` : ''}</div>`;
    }).join('') + `<button type="button" class="primary" id="new-test">New test</button></div>`;
  e.target.hidden = true; out.hidden = false;
  $('#new-test').onclick = resetTest;
  save();
  out.scrollIntoView();
};

// ---------- Gemini (shared by chat, courses and YouTube) ----------
const AI_KEY = 'ycda-gemini'; // kept outside db so it never ends up in exports
const aiKey = $('#ai-key'), aiModel = $('#ai-model');
try { const s = JSON.parse(localStorage.getItem(AI_KEY)) || {}; if (s.key) aiKey.value = s.key; if (s.model) aiModel.value = s.model; } catch {}
// config.local.js is gitignored, so this only fills the key on your own machine, never on the public site.
if (!aiKey.value && ['localhost', '127.0.0.1'].includes(location.hostname))
  import('./config.local.js').then(m => { if (m.GEMINI_API_KEY && !aiKey.value) aiKey.value = m.GEMINI_API_KEY; }).catch(() => {});
const saveAi = () => { try { localStorage.setItem(AI_KEY, JSON.stringify({ key: aiKey.value.trim(), model: aiModel.value.trim() })); } catch {} };
aiKey.onchange = aiModel.onchange = saveAi;

async function gemini(body) {
  const key = aiKey.value.trim(), model = aiModel.value.trim() || 'gemini-4-hydrogen';
  if (!key) { $('#ai-settings').open = true; aiKey.focus(); throw new Error('Add your Gemini API key in "AI settings" at the top of the page.'); }
  saveAi();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`);
  const text = (j.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned no answer. Try again or rephrase.');
  return text;
}

// ---------- Ask AI ----------
const TUTOR = 'You are a patient tutor on AI: AI hardware, GPU/TPU sizing, generative AI, LLMs, AI engineering, AI development, agent harnesses, AI CLIs and context engineering. Answer accurately and clearly, with numbers and worked examples where useful. Say when you are unsure. Reply in the language of the question. Plain text, no markdown symbols.';
const chat = [];
const chatInput = $('#chat-input');
function renderChat() {
  $('#chat-log').innerHTML = chat.map((m, i) => m.role === 'user'
    ? `<div class="msg user" dir="auto">${esc(m.parts[0].text)}</div>`
    : `<div class="msg bot" dir="auto">${esc(m.parts[0].text)}<br><button type="button" data-chat-save="${i}">Save to knowledge library</button></div>`).join('');
}
$('#chat-form').onsubmit = async e => {
  e.preventDefault();
  const q = chatInput.value.trim(), status = $('#chat-status'), btn = e.target.querySelector('button.primary');
  if (!q) return;
  chat.push({ role: 'user', parts: [{ text: q }] }); chatInput.value = ''; renderChat();
  status.textContent = 'Thinking…'; btn.disabled = true;
  try {
    chat.push({ role: 'model', parts: [{ text: await gemini({ system_instruction: { parts: [{ text: TUTOR }] }, contents: chat }) }] });
    status.textContent = '';
  } catch (err) {
    chat.pop(); chatInput.value = q; status.textContent = 'Failed: ' + err.message;
  } finally { btn.disabled = false; renderChat(); }
};
chatInput.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } };
$('#chat-clear').onclick = () => { chat.length = 0; renderChat(); $('#chat-status').textContent = ''; };
// The AI picks the best existing topic; falls back to Generative AI (or the first topic) if its reply isn't a known topic.
async function pickTopic(question, answer) {
  const fallback = db.topics.includes('Generative AI') ? 'Generative AI' : db.topics[0];
  try {
    const reply = await gemini({ contents: [{ parts: [{ text: `Topics:\n${db.topics.join('\n')}\n\nWhich ONE topic above best fits this question and answer? Reply with the topic name exactly, nothing else.\n\nQuestion: ${question}\n\nAnswer: ${answer.slice(0, 1500)}` }] }] });
    const r = reply.trim().replace(/^["'*\s]+|["'*.\s]+$/g, '').toLowerCase();
    return db.topics.find(t => t.toLowerCase() === r) ?? fallback;
  } catch { return fallback; }
}
$('#chat-log').onclick = async e => {
  const i = e.target.dataset?.chatSave;
  if (i === undefined) return;
  const btn = e.target, question = chat[i - 1]?.parts[0].text ?? 'AI tutor answer', answer = chat[i].parts[0].text;
  btn.disabled = true; btn.textContent = 'Saving…';
  const topic = await pickTopic(question, answer);
  db.notes.push({ id: uid(), topic, title: question.slice(0, 120), body: answer, sourceId: '' });
  save();
  btn.textContent = `Saved to ${topic} ✓`;
};

// ---------- Courses ----------
$('#course-add-form').onsubmit = e => {
  e.preventDefault();
  const d = trimAll(formData(e.target));
  if (!d.title && !d.url) return alert('Enter a course name, a link, or both.');
  let title = d.title;
  if (!title) { try { const u = new URL(d.url); title = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''); } catch { title = d.url; } }
  if (d.url && db.sources.some(s => s.url === d.url)) return alert('That link is already in the library.');
  db.sources.push({ id: uid(), type: 'Course', title, url: d.url, topic: d.topic, notes: d.notes, lang: /[؀-ۿ]/.test(title) ? 'ar' : 'en' });
  e.target.reset(); save();
};

const genForm = $('#gen-form');
genForm.onsubmit = async e => {
  e.preventDefault();
  const d = trimAll(formData(genForm));
  const nMod = Math.min(12, Math.max(2, +d.modules || 5)), nQ = Math.min(30, Math.max(3, +d.questions || 10));
  const status = $('#gen-status'), btn = genForm.querySelector('button');
  status.textContent = 'Writing your course… this can take a minute.'; btn.disabled = true;
  const prompt = `Create a ${d.level} course about: ${d.subject}.
Write all text in ${d.lang}. Be factually accurate; prefer well-established facts.
Return only JSON with this shape:
{"title": string, "description": string (2-3 sentences),
 "modules": [{"title": string, "content": string}] — exactly ${nMod} lessons; each content is 200-400 words of plain-text teaching with concrete examples and numbers,
 "questions": [{"type": "mcq"|"tf"|"short", "difficulty": "easy"|"medium"|"hard", "prompt": string, "options": [4 strings, only for mcq], "answer": string, "explanation": string}] — exactly ${nQ} questions that test the lessons, mixing types and difficulties.
Rules: for "tf" the answer is exactly "True" or "False"; for "mcq" the answer must equal one option exactly; for "short" the answer lists accepted answers separated by "|" (e.g. "bfloat16|bf16").`;
  try {
    const text = await gemini({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } });
    let c;
    try { c = JSON.parse(text); } catch { throw new Error('The AI reply was not valid course data. Please try again.'); }
    const modules = (Array.isArray(c.modules) ? c.modules : []).filter(m => m?.title && m?.content).map(m => ({ title: String(m.title), content: String(m.content) }));
    if (!modules.length) throw new Error('The AI returned no lessons. Please try again.');
    const topic = d.topic;
    if (!db.topics.includes(topic)) db.topics.push(topic);
    const course = { id: uid(), title: String(c.title || d.subject), description: String(c.description || ''), topic, level: d.level, lang: d.lang === 'Arabic' ? 'ar' : 'en', modules, created: new Date().toISOString() };
    const qs = (Array.isArray(c.questions) ? c.questions : []).map(normalizeQuestion).filter(Boolean)
      .map(q => ({ id: uid(), topic, type: q.type, difficulty: q.difficulty, prompt: q.prompt, ...(q.type === 'mcq' && { options: q.options }), answer: q.answer, explanation: String(q.explanation || ''), courseId: course.id }));
    db.courses.push(course);
    db.questions.push(...qs);
    save();
    genForm.subject.value = '';
    status.textContent = `Created "${course.title}": ${modules.length} lessons, ${qs.length} test questions.`;
    $('#gen-list details')?.setAttribute('open', '');
  } catch (err) {
    status.textContent = 'Failed: ' + err.message;
  } finally { btn.disabled = false; }
};

$('#gen-list').onclick = e => {
  const id = e.target.dataset?.courseTest;
  if (!id) return;
  const c = db.courses.find(x => x.id === id);
  const qs = pickQuestions(db.questions.filter(q => q.courseId === id), { count: 1000 });
  if (qs.length) startTest(qs, { topics: [c.topic] });
};

// ---------- YouTube summary (Gemini reads the video from its URL; YouTube blocks direct transcript fetches from browsers) ----------
const ytForm = $('#yt-form');
let ytLast = null;

ytForm.onsubmit = async e => {
  e.preventDefault();
  const d = trimAll(formData(ytForm));
  if (!/^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/i.test(d.url)) return alert('Please paste a youtube.com or youtu.be link.');
  const ask = d.mode === 'transcript'
    ? `Transcribe this video's speech, then write a summary and 5-10 key points. Use these headings: Title, Transcript, Summary, Key points.`
    : `Write a clear summary of this video for a learner, then 5-10 key points and any important numbers or definitions. Use these headings: Title, Summary, Key points.`;
  const status = $('#yt-status'), btn = ytForm.querySelector('button');
  status.textContent = 'Working… long videos can take a minute.'; btn.disabled = true; $('#yt-result').hidden = true;
  try {
    const text = await gemini({ contents: [{ parts: [{ file_data: { file_uri: d.url } }, { text: `${ask} Write the answer in ${d.lang}. Plain text, no markdown symbols.` }] }] });
    ytLast = { url: d.url, topic: d.topic, lang: d.lang === 'Arabic' ? 'ar' : 'en', text };
    $('#yt-text').textContent = text;
    $('#yt-result').hidden = false; status.textContent = '';
  } catch (err) {
    status.textContent = 'Failed: ' + err.message;
  } finally { btn.disabled = false; }
};

$('#yt-save').onclick = () => {
  if (!ytLast) return;
  const { url, topic, lang, text } = ytLast;
  const title = (text.match(/^\s*(?:Title|العنوان)\s*[:：]?\s*\n?\s*(.+)$/im)?.[1] || 'YouTube video').trim().slice(0, 150);
  let src = db.sources.find(s => s.url === url);
  if (!src) db.sources.push(src = { id: uid(), title, url, type: 'Video', topic, lang, notes: 'Summarized from YouTube.' });
  db.notes.push({ id: uid(), topic, title: `Video summary: ${title}`, body: text, sourceId: src.id });
  ytLast = null; $('#yt-result').hidden = true;
  save();
  alert('Saved to the knowledge library.');
};

// ---------- admin lock ----------
// shortcut: client-side gate only (a static site has no server); it keeps visitors out of the UI, not a determined developer. Upgrade to real auth if admin ever touches shared data.
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
function syncAdmin() {
  let open = false;
  try { open = sessionStorage.getItem('ycda-admin') === ADMIN_HASH; } catch {}
  $('#admin-lock').hidden = open; $('#admin-body').hidden = !open;
}
$('#admin-lock').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#admin-msg');
  if (!crypto.subtle) return msg.textContent = 'Admin works only on the secure https:// address of this site.';
  if (await sha256(e.target.pw.value) !== ADMIN_HASH) { msg.textContent = 'Wrong password.'; e.target.pw.select(); return; }
  try { sessionStorage.setItem('ycda-admin', ADMIN_HASH); } catch {}
  e.target.reset(); msg.textContent = ''; syncAdmin();
};
$('#admin-logout').onclick = () => { try { sessionStorage.removeItem('ycda-admin'); } catch {} syncAdmin(); };
syncAdmin();

// ---------- export / import ----------
$('#export-btn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `you-can-du-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return alert('That file is not valid JSON.'); }
  if (!data || typeof data !== 'object' || !['questions', 'sources', 'notes', 'topics'].some(k => Array.isArray(data[k])))
    return alert('That file does not look like a You Can Du AI backup.');
  for (const t of data.topics ?? []) if (typeof t === 'string' && !db.topics.includes(t)) db.topics.push(t);
  for (const k of ['questions', 'sources', 'notes', 'results', 'courses']) {
    const incoming = (data[k] ?? []).filter(x => x && typeof x === 'object' && x.id &&
      (k !== 'questions' || normalizeQuestion(x)) && (k !== 'courses' || Array.isArray(x.modules)));
    const ids = new Set(incoming.map(x => x.id));
    db[k] = db[k].filter(x => !ids.has(x.id)).concat(incoming);
  }
  // imported topics referenced by items must exist
  for (const k of ['questions', 'sources', 'notes']) for (const x of db[k]) if (x.topic && !db.topics.includes(x.topic)) db.topics.push(x.topic);
  save();
  alert('Import complete.');
};

// ---------- start ----------
db = load();
let seed = {};
try { seed = await (await fetch('seed.json')).json(); } catch { /* offline: run with what's saved */ }
mergeSeed(db, seed);
save();
