This is a Next.js app for generating UPSC-style MCQs from a chapter and textbook name.

## AI Setup

Set these environment variables before running the app:

```bash
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_MODEL` is optional. If it is not set, the app uses `gemini-2.5-flash` by default.

If you prefer OpenAI, you can still set `OPENAI_API_KEY` and `OPENAI_MODEL` instead.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The quiz generator calls `/api/generate`, which uses Gemini by default when a Gemini key is present, or OpenAI if you configure that instead, and returns 9 structured questions across Easy, Moderate, and Application levels.
