# AI Practice Problems

[简体中文](./README.md) | [English](./README.en.md)

An AI-assisted quiz generation project built with Uni-app, Vue 3, and Node.js. Users can paste learning materials, choose generation settings, let AI create quiz questions, and continue the learning loop through practice, review, tagging, and profile-based configuration.

## Highlights

- Generate single-choice and multiple-choice questions from study materials
- Two generation modes: `Grounded Extraction` and `Knowledge Expansion`
- Two feedback modes: `Instant Feedback` and `Review After Completion`
- Manage question banks by wrong answers, mastered items, and custom tags
- Configure API keys for multiple model providers in the profile page
- Generate personalized tag sets with AI and re-tag historical questions
- Backend support for auth, question generation, config verification, and persistence

## Tech Stack

- Frontend: Uni-app, Vue 3, TypeScript, Vite
- Backend: Node.js, CommonJS, MongoDB, OpenAI SDK
- Supported providers: Qwen, DeepSeek, OpenAI, Gemini

## Repository Layout

```text
.
|- frontend/                     # Runnable frontend app
|- backend/                      # Runnable backend service
|- docs/
|  `- readme/
|- README.md
|- README.en.md
`- LICENSE
```

The runnable directories are now:

- `frontend`
- `backend`

## Quick Start

### 1. Start the backend

```powershell
cd backend
npm install
$env:STORAGE_DRIVER="file"
npm start
```

Default backend address: `http://localhost:3000/api/v1`

Notes:

- `STORAGE_DRIVER="file"` is the easiest local setup
- You can switch to `mongodb` if you want database-backed persistence
- You do not need to configure model keys just to boot the backend

### 2. Point the frontend to your local backend

Create `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

If you do not set it, the frontend falls back to the default API URL defined in code.

### 3. Start the frontend

```powershell
cd frontend
npm install
npm run dev:h5
```

If you want the WeChat Mini Program build:

```powershell
cd frontend
npm run dev:mp-weixin
```

### 4. Configure your model key

After opening the app, go to the profile page and configure the API key for the provider you want to use. The project currently supports:

- `qwen`
- `deepseek`
- `openai`
- `gemini`

## Common Scripts

### Frontend

- `npm run dev:h5`: start H5 development
- `npm run dev:mp-weixin`: start WeChat Mini Program development
- `npm run build:h5`: build H5 output
- `npm run build:mp-weixin`: build WeChat Mini Program output
- `npm run type-check`: run TypeScript type checking
- `npm run validate:generation`: validate generation fixtures
- `npm run validate:generation:payload`: validate generated payloads

### Backend

- `npm start`: start the service
- `npm run smoke`: basic smoke test
- `npm run auth:smoke`: auth smoke test
- `npm run mongo:smoke`: MongoDB smoke test
- `npm run qwen:test`: live Qwen test
- `npm run deepseek:test`: live DeepSeek test
- `npm run llm:rules:test`: LLM rule-path test

## What This Repo Contains

- `frontend` contains the full client experience for generation, practice, collection, review, and profile settings
- `backend` contains the `/api/v1` service, authentication, generation, tag sync, and persistence

## Before Pushing to GitHub

- Do not commit `node_modules`
- Do not commit `dist`
- Do not commit `.vscode`
- Do not commit `*.tsbuildinfo`
- Do not commit `project.private.config.json`

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
