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
  it('LocalAIProvider selects the most suitable option for dropdown questions based on profile', async () => {
    const { LocalAIProvider } = await import('../src/background/ai/local-provider');
    const provider = new LocalAIProvider();

    const res = await provider.generateAnswer({
      question: 'Which AI/ML testing activities have you performed hands-on? (Select all that apply) *',
      options: [
        'Select an option',
        'Model evaluation and benchmarking',
        'Data quality and integrity testing for ML pipelines',
        'Manual bookkeeping'
      ],
      profileEvidence: [
        'Skills: Python, PyTorch, Model Evaluation, Data Quality Testing, Automation',
        'Experience: QA Engineer at AI Corp: Led data quality and model benchmarking for LLM pipelines'
      ]
    });

    expect(res.groundingStatus).toBe('passed');
    expect(res.answer).not.toBe('Select an option');
    expect(res.answer).not.toBe('Manual bookkeeping');
    expect(res.selectedOptions?.[0]).toMatch(/data quality|model evaluation/i);
  });

  it('LocalAIProvider picks positive experience choice for yes/no question when candidate has matching skills', async () => {
    const { LocalAIProvider } = await import('../src/background/ai/local-provider');
    const provider = new LocalAIProvider();

    const res = await provider.generateAnswer({
      question: 'Have you performed data quality and data integrity testing for ML/AI pipelines? *',
      options: [
        'Yes - Advanced hands-on experience',
        'Yes - Basic experience',
        'No - No experience'
      ],
      profileEvidence: [
        'Skills: Data Quality, ML Pipelines, QA Testing',
        'Experience: Software Development Engineer in Test: Built automated data integrity test suites for ML pipelines'
      ]
    });

    expect(res.answer).toBe('Yes - Advanced hands-on experience');
    expect(res.selectedOptions).toContain('Yes - Advanced hands-on experience');
  });

  it('LocalAIProvider synthesizes direct grounded experience statement for years of experience textareas', async () => {
    const { LocalAIProvider } = await import('../src/background/ai/local-provider');
    const provider = new LocalAIProvider();

    const res = await provider.generateAnswer({
      question: 'How many years of hands-on experience do you have in QA, AI/ML testing, software testing, or data quality? *',
      profileEvidence: [
        'Total Experience: 4 years',
        'Role: Senior QA Engineer (4 years)',
        'Skills: QA, AI/ML testing, software testing, data quality'
      ]
    });

    expect(res.answer).toMatch(/\b4\b/);
    expect(res.answer).toContain('hands-on experience in');
    expect(res.answer).not.toContain('Based on my background in Total Experience: 4 years');
  });
});
