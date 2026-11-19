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

## Students

Students enter a student ID on the Home page: any 4 to 10 letters or digits, with no passkey. Each ID keeps its own tests, history, notes and courses, saved in that browser. Home, Interview prep and Site improvement stay public. Questions go to the admin address (`ADMIN_EMAIL` in `app.js`).

## Admin password

`node set-admin-password.mjs "new password"`, then push.

## Deploy

The site deploys to GitHub Pages through `.github/workflows/pages.yml` on every push to `main`.
