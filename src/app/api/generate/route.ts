import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type Difficulty = "Easy" | "Moderate" | "Application";

type Question = {
  id: string;
  difficulty: Difficulty;
  stem: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

type GenerateRequest = {
  chapterName?: string;
  textbookName?: string;
};

type GeminiQuestion = {
  question?: unknown;
  question_text?: unknown;
  stem?: unknown;
  options?: unknown;
  answer?: unknown;
  correctAnswer?: unknown;
  correct_answer?: unknown;
  correct_option?: unknown;
  difficulty?: unknown;
  difficulty_level?: unknown;
  explanation?: unknown;
  level?: unknown;
};

const DIFFICULTY_ORDER = ["Easy", "Moderate", "Application"] as const;
const LOCAL_GEMINI_API_KEY = "REPLACE_WITH_LOCAL_GEMINI_API_KEY";
const GEMINI_MODEL = "gemini-3.1-flash-lite";

function normalizeInput(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function buildPrompt(chapterName: string, textbookName: string) {
  return [
    "You are an expert UPSC exam setter.",
    `Generate 18 multiple-choice questions from the textbook "${textbookName}" and chapter "${chapterName}".`,
    "Create exactly 6 Easy, 6 Moderate, and 6 Application-level questions.",
    "Keep the questions truly chapter-specific and grounded in the subject matter.",
    "Use UPSC-style phrasing, including close options and elimination-friendly distractors.",
    "For each question, set the correct answer to the full option text exactly as it appears in the options array.",
    "Return only JSON that matches the required schema.",
  ].join(" ");
}

function extractJsonText(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return withoutFence;
  }

  return trimmed;
}

function cleanOptionLabel(value: string) {
  return value
    .replace(/^[A-D][).:-]\s*/i, "")
    .replace(/^[A-D]\s+/, "")
    .trim();
}

function canonicalizeText(value: string) {
  return cleanOptionLabel(value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .toLowerCase();
}

function optionIndexFromLetter(value: unknown) {
  if (typeof value !== "string") {
    return -1;
  }

  const letter = value.trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(letter)) {
    return -1;
  }

  return letter.charCodeAt(0) - 65;
}

function findMatchingOption(options: string[], candidate: string) {
  const canonicalCandidate = canonicalizeText(candidate);
  if (!canonicalCandidate) {
    return null;
  }

  const letterMatch = optionIndexFromLetter(candidate);
  if (letterMatch >= 0 && options[letterMatch]) {
    return options[letterMatch];
  }

  const candidateTokens = canonicalCandidate.split(" ").filter(Boolean);

  return (
    options.find((option) => {
      const canonicalOption = canonicalizeText(option);
      return (
        canonicalOption === canonicalCandidate ||
        canonicalOption.includes(canonicalCandidate) ||
        canonicalCandidate.includes(canonicalOption)
      );
    }) ??
    options.find((option) => {
      const canonicalOption = canonicalizeText(option);
      const optionTokens = canonicalOption.split(" ").filter(Boolean);
      const overlap = candidateTokens.filter((token) => optionTokens.includes(token)).length;

      return overlap >= 2 && overlap / Math.max(candidateTokens.length, optionTokens.length) >= 0.4;
    }) ??
    null
  );
}

function resolveCorrectAnswer(item: GeminiQuestion, options: string[]) {
  const answerIndex = optionIndexFromLetter(item.correct_option);
  if (answerIndex >= 0 && options[answerIndex]) {
    return options[answerIndex];
  }

  const fallbackAnswer = normalizeInput(item.correctAnswer ?? item.correct_answer ?? item.answer);
  return findMatchingOption(options, fallbackAnswer) ?? cleanOptionLabel(fallbackAnswer);
}

function validateQuestions(value: Question[]): Question[] {
  if (!Array.isArray(value) || value.length !== 18) {
    throw new Error("The model did not return exactly 18 questions.");
  }

  const difficultyCount = new Map<string, number>([
    ["Easy", 0],
    ["Moderate", 0],
    ["Application", 0],
  ]);

  const questions = value.map((question, index) => {
    if (!question || typeof question !== "object") {
      throw new Error(`Question ${index + 1} is invalid.`);
    }

    const difficulty = question.difficulty as Difficulty;
    const stem = normalizeInput(question.stem);
    const explanation = normalizeInput(question.explanation);
    const options = Array.isArray(question.options)
      ? question.options.map((option) => normalizeInput(option)).filter(Boolean)
      : [];
    const correctAnswer = normalizeInput(question.correctAnswer);

    if (!DIFFICULTY_ORDER.includes(difficulty)) {
      throw new Error(`Question ${index + 1} has an unsupported difficulty.`);
    }

    difficultyCount.set(difficulty, (difficultyCount.get(difficulty) ?? 0) + 1);

    if (!stem || options.length !== 4) {
      throw new Error(`Question ${index + 1} is missing required fields.`);
    }

    const uniqueOptions = new Set(options);
    if (uniqueOptions.size !== 4) {
      throw new Error(`Question ${index + 1} must contain 4 unique options.`);
    }

    const matchingOption = findMatchingOption(options, correctAnswer);
    if (!matchingOption) {
      throw new Error(`Question ${index + 1} correct answer must match one of the options.`);
    }

    return {
      id: `${index + 1}-${difficulty.toLowerCase()}`,
      difficulty,
      stem,
      options,
      correctAnswer,
      explanation,
    };
  });

  const isBalanced = ["Easy", "Moderate", "Application"].every((level) => difficultyCount.get(level) === 6);

  if (!isBalanced) {
    throw new Error("The model did not return 6 questions for each difficulty level.");
  }

  return questions;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const chapterName = normalizeInput(body.chapterName);
    const textbookName = normalizeInput(body.textbookName);

    if (!chapterName || !textbookName) {
      return NextResponse.json({ error: "Both chapterName and textbookName are required." }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || LOCAL_GEMINI_API_KEY;

    if (!geminiApiKey || geminiApiKey.includes("REPLACE_WITH_LOCAL_GEMINI_API_KEY")) {
      return NextResponse.json(
        {
          error:
            "Missing Gemini API key. Replace LOCAL_GEMINI_API_KEY in src/app/api/generate/route.ts or set GEMINI_API_KEY / GOOGLE_API_KEY.",
        },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const prompt = buildPrompt(chapterName, textbookName);

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 12000,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          additionalProperties: false,
          required: ["questions"],
          properties: {
            questions: {
              type: "array",
              minItems: 18,
              maxItems: 18,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["difficulty", "stem", "options", "correctAnswer", "explanation"],
                properties: {
                  difficulty: {
                    type: "string",
                    enum: ["Easy", "Moderate", "Application"],
                  },
                  stem: { type: "string" },
                  options: {
                    type: "array",
                    minItems: 4,
                    maxItems: 4,
                    items: { type: "string" },
                  },
                  correctAnswer: { type: "string" },
                  explanation: { type: "string" },
                },
              },
            },
          },
        },
      } as any,
    } as any);

    const rawText = (response as any).text?.trim() ?? "";
    if (!rawText) {
      return NextResponse.json({ error: "Gemini returned empty content." }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(extractJsonText(rawText)) as { questions?: Question[] };
    } catch (parseError) {
      return NextResponse.json({ error: "Failed to parse Gemini JSON response.", rawText }, { status: 502 });
    }

    const sourceQuestions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.questions)
      ? parsed.questions
      : null;

    if (!sourceQuestions) {
      return NextResponse.json({ error: "The model returned no questions array.", rawText }, { status: 502 });
    }

    const normalizedQuestions = sourceQuestions.map((question, index) => {
      const item = question as GeminiQuestion;
      const rawDifficulty = normalizeInput(item.difficulty ?? item.difficulty_level ?? item.level);
      const difficulty = (rawDifficulty || "Easy") as Difficulty;
      const stem = normalizeInput(item.stem ?? item.question ?? item.question_text);
      const explanation = normalizeInput(item.explanation) || "This question is based on the chapter content.";
      const rawOptions = Array.isArray(item.options) ? item.options : [];
      const options = rawOptions.map((option) => normalizeInput(option)).map(cleanOptionLabel).filter(Boolean);
      const correctAnswer = resolveCorrectAnswer(item, options);

      return {
        id: `${index + 1}-${(DIFFICULTY_ORDER.includes(difficulty) ? difficulty : "Easy").toLowerCase()}`,
        difficulty: DIFFICULTY_ORDER.includes(difficulty) ? difficulty : "Easy",
        stem,
        options,
        correctAnswer,
        explanation,
      };
    });

    let questions: Question[];
    try {
      questions = validateQuestions(normalizedQuestions);
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "Invalid question payload.";
      return NextResponse.json({ error: message, rawText }, { status: 502 });
    }

    return NextResponse.json({ questions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
