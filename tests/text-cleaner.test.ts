import { describe, it, expect } from 'vitest';
import { cleanAnswerText } from '../src/utils/text-cleaner';

describe('Text Cleaner & Normalizer', () => {
  it('converts candidate third-person name to first-person ("I", "my")', () => {
    const raw =
      'Mohammad Zaid has hands-on experience across multiple engineering initiatives, focusing on scalable architecture, robust performance, and production-grade delivery.';
    const cleaned = cleanAnswerText(raw, undefined, 'Mohammad Zaid');
    expect(cleaned).toBe(
      'I have hands-on experience across multiple engineering initiatives, focusing on scalable architecture, robust performance, and production-grade delivery.'
    );
  });

  it('converts generic candidate and pronouns to first-person', () => {
    expect(cleanAnswerText('The candidate has 5 years of experience.')).toBe('I have 5 years of experience.');
    expect(cleanAnswerText('He specializes in full stack engineering.')).toBe('I specialize in full stack engineering.');
    expect(cleanAnswerText("Mohammad Zaid's experience covers backend systems.", undefined, 'Mohammad Zaid')).toBe(
      'My experience covers backend systems.'
    );
    expect(cleanAnswerText('Throughout his career, he has focused on quality.')).toBe(
      'Throughout my career, I have focused on quality.'
    );
  });

  it('removes long dashes (em-dashes, en-dashes, double-dashes, spaced hyphens) without breaking hyphenated words', () => {
    const raw =
      'I build full-stack systems — utilizing modern tools – for cloud-native -- scalable applications - with zero downtime.';
    const cleaned = cleanAnswerText(raw);
    expect(cleaned).toBe(
      'I build full-stack systems, utilizing modern tools, for cloud-native, scalable applications, with zero downtime.'
    );
    expect(cleaned).not.toContain('—');
    expect(cleaned).not.toContain('–');
    expect(cleaned).not.toContain('--');
    expect(cleaned).toContain('full-stack');
    expect(cleaned).toContain('cloud-native');
  });

  it('enforces maxLength truncation at word/clause boundaries', () => {
    const raw =
      'Mohammad Zaid has hands-on experience across multiple engineering initiatives, focusing on scalable architecture, robust performance, and production-grade delivery. Key projects include building end-to-end full-stack applications with high reliability.';
    const cleaned = cleanAnswerText(raw, 127, 'Mohammad Zaid');
    expect(cleaned.length).toBeLessThanOrEqual(127);
    expect(cleaned.startsWith('I have')).toBe(true);
    expect(cleaned).not.toContain('Mohammad Zaid');
  });

  it('extracts concise years for short fields (<= 30 chars) asking about years of experience', () => {
    const raw =
      'Mohammad Zaid has 5.8 years of hands-on experience across multiple roles, specializing in full stack engineering, backend APIs, modern frontend frameworks, and cloud-native scalable system deployments.';
    // Case 1: Max length 20 (like in the screenshot: 197/20)
    const cleaned20 = cleanAnswerText(raw, 20, 'Mohammad Zaid');
    expect(cleaned20.length).toBeLessThanOrEqual(20);
    expect(cleaned20).toMatch(/^5\.8(?:\+)?\s*years$/);

    // Case 2: Max length 5 (digits only)
    const cleaned5 = cleanAnswerText(raw, 5, 'Mohammad Zaid');
    expect(cleaned5).toBe('5.8');
    expect(cleaned5.length).toBeLessThanOrEqual(5);
  });
});
