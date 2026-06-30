"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Difficulty = "Easy" | "Moderate" | "Application";

type HistoryItem = {
  textbookName: string;
  chapterName: string;
  generatedAt: string;
};

type Question = {
  id: string;
  difficulty: Difficulty;
  stem: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export default function Home() {
  const [chapterName, setChapterName] = useState("");
  const [textbookName, setTextbookName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter(Boolean).length,
    [answers],
  );

  const correctCount = useMemo(() => {
    if (!submitted) {
      return 0;
    }

    return questions.reduce((total, question) => {
      return answers[question.id] === question.correctAnswer ? total + 1 : total;
    }, 0);
  }, [answers, questions, submitted]);

  useEffect(() => {
    const stored = window.localStorage.getItem("mcqHistory");
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as HistoryItem[];
      setHistory(parsed);
    } catch {
      window.localStorage.removeItem("mcqHistory");
    }
  }, []);

  function saveHistoryItem(textbookName: string, chapterName: string) {
    const timestamp = new Date().toISOString();
    setHistory((current) => {
      const next = [
        { textbookName, chapterName, generatedAt: timestamp },
        ...current.filter(
          (item) =>
            item.textbookName !== textbookName || item.chapterName !== chapterName,
        ),
      ];
      window.localStorage.setItem("mcqHistory", JSON.stringify(next));
      return next;
    });
  }

  const wrongCount = useMemo(() => {
    if (!submitted) {
      return 0;
    }

    return questions.reduce((total, question) => {
      const selected = answers[question.id];
      return selected && selected !== question.correctAnswer ? total + 1 : total;
    }, 0);
  }, [answers, questions, submitted]);

  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chapterName, textbookName }),
      });

      const payload = (await response.json()) as
        | { questions: Question[] }
        | { error: string };

      if (!response.ok) {
        const message = "error" in payload ? payload.error : "Failed to generate questions.";
        const friendlyMessage = message.includes("503") || message.includes("UNAVAILABLE")
          ? "Gemini is temporarily overloaded. Please wait a moment and try again."
          : message;
        throw new Error(friendlyMessage);
      }

      const generated = "questions" in payload ? payload.questions : [];
      setQuestions(generated);
      setAnswers(
        generated.reduce<Record<string, string>>((collection, question) => {
          collection[question.id] = "";
          return collection;
        }, {}),
      );
      setSubmitted(false);
      saveHistoryItem(textbookName, chapterName);
    } catch (error) {
      setQuestions([]);
      setAnswers({});
      setSubmitted(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to generate questions.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSubmit() {
    if (!allAnswered) {
      return;
    }

    setSubmitted(true);
  }

  const statusCopy = submitted
    ? `You scored ${correctCount}/${questions.length}. Correct answers are shown below each question.`
    : isGenerating
      ? "Generating chapter-specific questions from the AI model..."
      : "Generate questions, answer every item, then submit to reveal the correct answers.";

  function scrollPage(direction: "up" | "down") {
    window.scrollBy({ top: direction === "up" ? -320 : 320, behavior: "smooth" });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,199,95,0.35),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(82,121,255,0.22),_transparent_30%),linear-gradient(180deg,_#fffaf1_0%,_#f6efe4_48%,_#f0f4ff_100%)] text-slate-900">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid flex-1 gap-6 lg:grid-cols-[1.05fr_1.25fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur xl:p-8">
            <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-800">
              UPSC MCQ Builder
            </div>

            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Create easy, moderate, and application-level questions from any chapter.
            </h1>

            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Enter the textbook and chapter name, generate a UPSC-style practice set,
              answer every question, then reveal the correct answers with instant review.
            </p>

            <form onSubmit={handleGenerate} className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Textbook name</span>
                <input
                  value={textbookName}
                  onChange={(event) => setTextbookName(event.target.value)}
                  placeholder="For example: Indian Polity by M. Laxmikanth"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-amber-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Chapter name</span>
                <input
                  value={chapterName}
                  onChange={(event) => setChapterName(event.target.value)}
                  placeholder="For example: Fundamental Rights"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-amber-100"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {isGenerating ? "Generating..." : "Generate MCQs"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestions([]);
                    setAnswers({});
                    setSubmitted(false);
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </form>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Easy", value: "Fact recall" },
                { label: "Moderate", value: "Concept linkage" },
                { label: "Application", value: "Scenario use" },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl bg-slate-950 p-4 text-white">
                  <div className="text-xs uppercase tracking-[0.28em] text-white/55">
                    {item.label}
                  </div>
                  <div className="mt-2 text-lg font-semibold">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              {statusCopy}
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white/80 p-5 text-sm leading-6 text-slate-700 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">History</div>
                <button
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    window.localStorage.removeItem("mcqHistory");
                  }}
                  className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Clear
                </button>
              </div>

              {history.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-slate-500">
                  No generated topics yet. Generate MCQs to store history here.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item, index) => (
                    <button
                      key={`${item.textbookName}-${item.chapterName}-${item.generatedAt}`}
                      type="button"
                      onClick={() => {
                        setTextbookName(item.textbookName);
                        setChapterName(item.chapterName);
                      }}
                      className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm text-slate-800 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      <div className="font-semibold text-slate-900">{item.textbookName}</div>
                      <div className="text-slate-600">{item.chapterName}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Generated on {new Date(item.generatedAt).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Correct: {submitted ? correctCount : 0}
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                Wrong: {submitted ? wrongCount : 0}
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-700">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <div className="rounded-[32px] border border-white/70 bg-slate-950 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-white/85">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/45">Review panel</p>
                <p className="mt-1 text-lg font-semibold text-white">Answer every question to unlock the key</p>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!allAnswered || questions.length === 0}
                className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition enabled:hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark Answers
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {questions.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/15 bg-white/5 p-8 text-center text-white/60">
                  No questions generated yet. Add a chapter and textbook, then create the quiz.
                </div>
              ) : (
                questions.map((question, index) => {
                  const selectedAnswer = answers[question.id];
                  const isCorrect = selectedAnswer === question.correctAnswer;

                  return (
                    <article
                      key={question.id}
                      className="rounded-[24px] border border-white/10 bg-white/7 p-5 text-white shadow-[0_18px_40px_rgba(2,6,23,0.16)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                            {question.difficulty}
                          </span>
                          <span className="text-xs uppercase tracking-[0.24em] text-white/40">
                            Question {index + 1}
                          </span>
                        </div>
                        {submitted ? (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              isCorrect ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200"
                            }`}
                          >
                            {isCorrect ? "Correct" : "Check answer"}
                          </span>
                        ) : null}
                      </div>

                      <h2 className="mt-4 text-lg font-semibold leading-7 text-white">{question.stem}</h2>

                      <div className="mt-4 grid gap-3">
                        {question.options.map((option) => {
                          const optionId = `${question.id}-${option}`;
                          const answeredCorrectly = submitted && option === question.correctAnswer;
                          const answeredWrong = submitted && selectedAnswer === option && option !== question.correctAnswer;

                          return (
                            <label
                              key={optionId}
                              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                                answeredCorrectly
                                  ? "border-emerald-300/60 bg-emerald-400/15"
                                  : answeredWrong
                                    ? "border-rose-300/60 bg-rose-400/15"
                                    : "border-white/10 bg-white/5 hover:bg-white/10"
                              }`}
                            >
                              <input
                                type="radio"
                                name={question.id}
                                value={option}
                                checked={selectedAnswer === option}
                                onChange={() =>
                                  setAnswers((current) => ({
                                    ...current,
                                    [question.id]: option,
                                  }))
                                }
                                className="mt-1 h-4 w-4 accent-amber-400"
                              />
                              <span className="text-sm leading-6 text-white/90">{option}</span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm text-white/75">
                        {submitted ? (
                          <>
                            <span className="font-semibold text-white">Correct answer: </span>
                            {question.correctAnswer}
                            <span className="block pt-2 text-white/60">{question.explanation}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-white">Hint: </span>
                            {question.explanation}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => scrollPage("up")}
          aria-label="Scroll up"
          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xl text-slate-700 transition hover:bg-slate-100"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => scrollPage("down")}
          aria-label="Scroll down"
          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xl text-slate-700 transition hover:bg-slate-100"
        >
          ↓
        </button>
      </div>
    </main>
  );
}
