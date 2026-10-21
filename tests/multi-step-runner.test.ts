import { describe, it, expect, beforeEach } from 'vitest';
import { MultiStepWizardRunner } from '../src/content/crawler/multi-step-runner';

describe('MultiStepWizardRunner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects and clicks initial Easy Apply button', async () => {
    const btn = document.createElement('button');
    btn.className = 'jobs-apply-button';
    btn.textContent = 'Easy Apply';
    let clicked = false;
    btn.onclick = () => {
      clicked = true;
    };
    document.body.appendChild(btn);

    // Mock getBoundingClientRect
    btn.getBoundingClientRect = () => ({ width: 100, height: 40, top: 0, left: 0, bottom: 40, right: 100, x: 0, y: 0, toJSON: () => {} });

    const result = await MultiStepWizardRunner.clickInitialApplyButton();
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it('distinguishes between intermediate Next buttons and final Submit buttons', () => {
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.getBoundingClientRect = () => ({ width: 80, height: 35, top: 0, left: 0, bottom: 35, right: 80, x: 0, y: 0, toJSON: () => {} });
    document.body.appendChild(nextBtn);

    const step1 = MultiStepWizardRunner.findStepButton();
    expect(step1.type).toBe('intermediate');
    expect(step1.label).toBe('Next');

    // Add Submit button (Final Stage)
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit application';
    submitBtn.getBoundingClientRect = () => ({ width: 140, height: 35, top: 0, left: 100, bottom: 35, right: 240, x: 100, y: 0, toJSON: () => {} });
    document.body.appendChild(submitBtn);

    const stepFinal = MultiStepWizardRunner.findStepButton();
    // Final submit takes priority to ensure we NEVER accidentally click it
    expect(stepFinal.type).toBe('final');
    expect(stepFinal.label).toBe('Submit application');
  });

  it('ignores crawler overlay buttons', () => {
    const overlayNext = document.createElement('button');
    overlayNext.id = '__btn_crawler_next';
    overlayNext.textContent = 'Next Job';
    overlayNext.getBoundingClientRect = () => ({ width: 80, height: 30, top: 0, left: 0, bottom: 30, right: 80, x: 0, y: 0, toJSON: () => {} });
    document.body.appendChild(overlayNext);

    const step = MultiStepWizardRunner.findStepButton();
    expect(step.type).toBe('none');
  });
});
