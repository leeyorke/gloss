import chalk from "@/content/on-a-piece-of-chalk.json";
import thinking from "@/content/on-thinking-for-oneself.json";
import walden from "@/content/walden-reading.json";
import type { Article } from "./article";

/** Bundled texts. Public domain, so they ship in full. */
export const SAMPLES: Article[] = [chalk, thinking, walden].map((a) => ({ ...(a as Article), origin: "sample" as const }));

export const sampleById = (id: string) => SAMPLES.find((a) => a.id === id) ?? null;

/** Starter questions per sample, where the age of the text is the interesting part. */
export const SAMPLE_QUESTIONS: Record<string, string[]> = {
  "on-a-piece-of-chalk": ["What is the core argument, in three sentences?", "What has science learned since 1868?", "Why lecture this to working men?"],
  "on-thinking-for-oneself": ["What is the core argument, in three sentences?", "Is he against reading?", "How would he see the internet?"],
  "walden-reading": ["What is the core argument, in three sentences?", "What does he mean by heroic books?", "Is he being elitist?"],
};

/** The same questions, as the keys they are written under, so each language can have its own. */
export const SAMPLE_QUESTION_KEYS: Record<string, string[]> = {
  "on-a-piece-of-chalk": ["reader.sampleQuestions.on-a-piece-of-chalk.one", "reader.sampleQuestions.on-a-piece-of-chalk.two", "reader.sampleQuestions.on-a-piece-of-chalk.three"],
  "on-thinking-for-oneself": ["reader.sampleQuestions.on-thinking-for-oneself.one", "reader.sampleQuestions.on-thinking-for-oneself.two", "reader.sampleQuestions.on-thinking-for-oneself.three"],
  "walden-reading": ["reader.sampleQuestions.walden-reading.one", "reader.sampleQuestions.walden-reading.two", "reader.sampleQuestions.walden-reading.three"],
};
