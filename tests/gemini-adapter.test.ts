import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAIAdapter } from '../src/background/ai/gemini-adapter';

describe('GeminiAIAdapter', () => {
  let adapter: GeminiAIAdapter;

  beforeEach(() => {
    adapter = new GeminiAIAdapter({
      apiKey: 'test-gemini-api-key',
      model: 'gemini-3.8-flash',
      maxOutputTokens: 4096,
      temperature: 0.1
    });
  });

  it('reports available when API key is provided', async () => {
    const isAvail = await adapter.isAvailable();
    expect(isAvail).toBe(true);
  });

  it('correctly parses structured JSON response from Gemini API', async () => {
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  semanticType: 'skills',
                  confidence: 0.94,
                  evidence: ['gemini_reasoning'],
                  reason: 'Identified list of programming languages and libraries'
                })
              }
            ]
          }
        }
      ]
    };

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse
    } as any);

    const classification = await adapter.classifyField({
      field: {
        controlType: 'text',
        name: 'tech_skills'
      },
      nearbyText: 'Enter technologies and tools'
    });

    expect(classification.semanticType).toBe('skills');
    expect(classification.confidence).toBe(0.94);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-3.8-flash'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
  });
});
