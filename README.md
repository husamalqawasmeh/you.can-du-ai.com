# you.can-du-ai.com

A knowledge-training site for AI topics: AI hardware, sizing, generative AI, LLMs, AI engineering and AI development.

- **Knowledge library**: add topics, sites and sources, and the things you learn.
- **Question bank**: a growing set of multiple-choice, true/false and short-answer questions. It starts with 40 seed questions.
- **Tests**: choose how many questions, the types, the topics and the difficulty. Results are saved to History.
- **Sources**: 74 curated sources, including frontier labs, NVIDIA, slide decks and PDFs, and 12 Arabic sources. You can filter by topic, type and language.
- **YouTube summary**: paste a public YouTube link and get a summary, or a transcript plus summary, in English or Arabic, then save it to the library. It uses your own Gemini API key, which is stored only in your browser.
- **Data**: export your knowledge base as JSON, or import a backup.

It is a static site: plain HTML and JavaScript, no build step. Your data is saved in the browser's localStorage, and `seed.json` is merged in on every load.

## Run locally

```
npm start      # serves on http://localhost:3000
npm test       # logic self-check and seed validation
```

## Add questions for everyone

Questions you add in the browser stay in your browser. To share questions with every visitor, add them to `seed.json` (give each one a unique `id`), then commit and push.

## Students and passkeys

Students sign in on the Home page with a student ID and passkey. Home, Interview prep and Site improvement stay public.

```
node manage-students.mjs add S12345 "Student Name"   # prints a new passkey once: send it to the student
node manage-students.mjs reset S12345                # new passkey; the old one stops working
node manage-students.mjs remove S12345               # revoke access
node manage-students.mjs list                        # your private roster (students.local.json)
```

Then commit and push `students.json`. It holds only hashes, so student IDs and passkeys never appear in the public code. Students email the admin address (`ADMIN_EMAIL` in `app.js`) to request a passkey or a reset.

## Admin password

`node set-admin-password.mjs "new password"`, then push.

## Deploy

The site deploys to GitHub Pages through `.github/workflows/pages.yml` on every push to `main`.
