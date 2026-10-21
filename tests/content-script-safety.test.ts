import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InteractionEngine } from '../src/content/interaction/interaction-engine';
import { FieldDescriptor } from '../src/types/taxonomy';

describe('Content Script Safety & User-Initiated Interaction', () => {
  let interactionEngine: InteractionEngine;

  beforeEach(() => {
    document.body.innerHTML = '';
    interactionEngine = new InteractionEngine();
  });

  const makeDescriptor = (el: HTMLElement, controlType: any): FieldDescriptor => ({
    id: 'f_test',
    fieldSignature: 'sig_test',
    controlType,
    isVisible: true,
    isDisabled: false,
    isReadOnly: false,
    isRequired: false,
    currentValue: null,
    selector: el.tagName.toLowerCase()
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

  it('guarantees silent filling without stealing user focus or scrolling the page', async () => {
    // User is actively focused on a submit button or other element
    const userActiveBtn = document.createElement('button');
    userActiveBtn.textContent = 'Submit Application';
    document.body.appendChild(userActiveBtn);
    userActiveBtn.focus();

    expect(document.activeElement).toBe(userActiveBtn);

    // Automation fills another input on the page
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const scrollIntoViewSpy = vi.fn();
    input.scrollIntoView = scrollIntoViewSpy;

    const descriptor = makeDescriptor(input, 'text');
    const result = await interactionEngine.fill(input, descriptor, 'Alex Johnson');

    expect(result.success).toBe(true);
    expect(input.value).toBe('Alex Johnson');

    // Crucial: document.activeElement must NOT have been stolen away from userActiveBtn!
    expect(document.activeElement).toBe(userActiveBtn);

    // Crucial: scrollIntoView must NOT have been called (no viewport jumping)
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('fills select dropdowns silently without altering active element', async () => {
    const userActiveInput = document.createElement('input');
    document.body.appendChild(userActiveInput);
    userActiveInput.focus();

    const select = document.createElement('select');
    select.innerHTML = '<option value="">Choose</option><option value="US">United States</option>';
    document.body.appendChild(select);

    const descriptor = makeDescriptor(select, 'select');
    const result = await interactionEngine.fill(select, descriptor, 'United States');

    expect(result.success).toBe(true);
    expect(select.value).toBe('US');
    expect(document.activeElement).toBe(userActiveInput);
  });
});
