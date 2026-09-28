import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../src/storage';
import { CustomQA } from '../src/types/profile';

describe('Real-Time AI Agent & Q&A Memory Bank', () => {
  let localStorageMock: Record<string, any>;
  let storage: StorageService;

  beforeEach(() => {
    localStorageMock = {};
    (global as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            if (typeof keys === 'string') return { [keys]: localStorageMock[keys] };
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = localStorageMock[k];
            return res;
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(localStorageMock, items);
          })
        }
      }
    };
    storage = new StorageService();
  });

  it('stores learned question and answer pairs in profile customQA', async () => {
    const profile = await storage.getProfile();
    expect(profile.customQA).toBeDefined();

    const sampleQA: CustomQA = {
      id: 'qa_123',
      question: 'Why do you want to work at our company?',
      answer: 'With 5.8+ years developing enterprise GenAI pipelines and agentic LLM architectures at TCS, I am excited to apply my LangChain and cloud AI experience to scale your high-impact systems.',
      tags: ['behavioral', 'motivation'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedProfile = {
      ...profile,
      customQA: [sampleQA, ...(profile.customQA || [])]
    };

    await storage.saveProfile(updatedProfile);

    // Verify stored
    const reloaded = await storage.getProfile();
    expect(reloaded.customQA.length).toBeGreaterThanOrEqual(1);
    expect(reloaded.customQA[0].question).toBe('Why do you want to work at our company?');
    expect(reloaded.customQA[0].answer).toContain('5.8+ years developing enterprise GenAI');
  });

  it('fuzzy matches questions with high keyword overlap for 0ms reuse', () => {
    const customQA: CustomQA[] = [
      {
        id: 'qa_langchain',
        question: 'What is your hands-on experience with LangChain and LangGraph?',
        answer: 'I have designed production-grade RAG and agentic orchestration pipelines with LangChain and LangGraph for BFSI enterprise applications.',
        tags: ['technical'],
        createdAt: '',
        updatedAt: ''
      }
    ];

    // Helper simulation matching content-script algorithm
    const findMatchingQA = (questionText: string, qaList: CustomQA[]): string | null => {
      const cleanQ = questionText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
      const qWords = new Set(cleanQ.split(/\s+/).filter((w) => w.length > 3));

      for (const item of qaList) {
        const cleanStored = item.question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        if (cleanQ === cleanStored || cleanQ.includes(cleanStored) || cleanStored.includes(cleanQ)) {
          return item.answer;
        }
      }

      if (qWords.size >= 2) {
        let bestMatch: CustomQA | null = null;
        let highestRatio = 0;
        for (const item of qaList) {
          const storedWords = item.question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
          if (storedWords.length === 0) continue;
          const common = storedWords.filter((w) => qWords.has(w));
          const ratio = common.length / Math.max(qWords.size, storedWords.length);
          if (ratio > 0.6 && ratio > highestRatio) {
            highestRatio = ratio;
            bestMatch = item;
          }
        }
        if (bestMatch) return bestMatch.answer;
      }
      return null;
    };

    // Slight variation in phrasing on another job site
    const askedQuestion = 'Describe your experience with LangChain and LangGraph in production';
    const answer = findMatchingQA(askedQuestion, customQA);

    expect(answer).toBeDefined();
    expect(answer).toContain('production-grade RAG and agentic orchestration');
  });
});
