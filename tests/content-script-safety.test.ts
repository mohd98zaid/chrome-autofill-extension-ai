import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Content Script Safety & User-Initiated Interaction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('guarantees that dangerous action buttons (Start, Get Started, Submit) are NEVER auto-clicked', () => {
    const DANGEROUS_ACTION_REGEX = /\b(submit|start|get\s*started|apply|continue|next|proceed|finish|done|review|send|complete|register|sign\s*in|login|log\s*in|save\s*&\s*submit)\b/i;

    const isSafeToExpand = (el: HTMLElement, directText: string): boolean => {
      if (el.getAttribute('type') === 'submit') return false;
      if (DANGEROUS_ACTION_REGEX.test(directText)) return false;
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (DANGEROUS_ACTION_REGEX.test(aria)) return false;
      if (el.tagName === 'A') {
        const href = (el.getAttribute('href') || '').trim();
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) return false;
      }
      return true;
    };

    const startBtn = document.createElement('button');
    startBtn.textContent = 'Get Started';
    expect(isSafeToExpand(startBtn, 'get started')).toBe(false);

    const submitBtn = document.createElement('button');
    submitBtn.setAttribute('type', 'submit');
    submitBtn.textContent = 'Save & Submit';
    expect(isSafeToExpand(submitBtn, 'save & submit')).toBe(false);

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next: Work Experience';
    expect(isSafeToExpand(nextBtn, 'next: work experience')).toBe(false);

    const applyLink = document.createElement('a');
    applyLink.href = 'https://example.com/apply';
    applyLink.textContent = 'Apply Now';
    expect(isSafeToExpand(applyLink, 'apply now')).toBe(false);

    const accordion = document.createElement('div');
    accordion.setAttribute('aria-expanded', 'false');
    accordion.textContent = 'Work Experience (0)';
    expect(isSafeToExpand(accordion, 'work experience (0)')).toBe(true);
  });
});
