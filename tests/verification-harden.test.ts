import { describe, it, expect, beforeEach } from 'vitest';
import { VerificationEngine } from '../src/content/verification/verification-engine';
import { FieldDescriptor } from '../src/types/taxonomy';

describe('VerificationEngine Hardening', () => {
  let verification: VerificationEngine;

  beforeEach(() => {
    document.body.innerHTML = '';
    verification = new VerificationEngine();
  });

  const makeDescriptor = (controlType: any, isRequired = true): FieldDescriptor => ({
    id: 'f_test',
    fieldSignature: 'sig_test',
    controlType,
    isVisible: true,
    isDisabled: false,
    isReadOnly: false,
    isRequired,
    currentValue: null,
    selector: 'input'
  });

  it('fails verification when aria-invalid is true despite matching value (Rule 14 & 18)', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'John Doe';
    input.setAttribute('aria-invalid', 'true');
    document.body.appendChild(input);

    const desc = makeDescriptor('text');
    const result = verification.verify(input, desc, 'John Doe');

    expect(result.verified).toBe(false);
    expect(result.hasValidationError).toBe(true);
    expect(result.message).toContain('Validation error');
  });

  it('fails verification when visible error element is present near field (Rule 15 & 18)', () => {
    const container = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'invalid';
    const errorSpan = document.createElement('span');
    errorSpan.className = 'error-message';
    errorSpan.textContent = 'Please enter a valid format';

    container.appendChild(input);
    container.appendChild(errorSpan);
    document.body.appendChild(container);

    const desc = makeDescriptor('text');
    const result = verification.verify(input, desc, 'invalid');

    expect(result.verified).toBe(false);
    expect(result.hasValidationError).toBe(true);
  });

  it('requires all expected skill tags to match in tag_input (Rule 16)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="tag-chip"><span>Python</span></div>
    `;
    const input = document.createElement('input');
    container.appendChild(input);
    document.body.appendChild(container);

    const desc = makeDescriptor('tag_input');

    // Expected tags: ['Python', 'TypeScript']. Only Python is present.
    const resultIncomplete = verification.verify(input, desc, ['Python', 'TypeScript']);
    expect(resultIncomplete.verified).toBe(false);
    expect(resultIncomplete.message).toContain('Tag input verification incomplete');

    // Add TypeScript chip
    const tsChip = document.createElement('div');
    tsChip.className = 'tag-chip';
    tsChip.innerHTML = '<span>TypeScript</span>';
    container.appendChild(tsChip);

    const resultComplete = verification.verify(input, desc, ['Python', 'TypeScript']);
    expect(resultComplete.verified).toBe(true);
  });

  it('verifies combobox/searchable select value (Rule 17)', () => {
    const combobox = document.createElement('input');
    combobox.setAttribute('role', 'combobox');
    combobox.value = 'Engineering';
    document.body.appendChild(combobox);

    const desc = makeDescriptor('searchable_select');
    const resultMatch = verification.verify(combobox, desc, 'Engineering');
    expect(resultMatch.verified).toBe(true);

    const resultMismatch = verification.verify(combobox, desc, 'Marketing');
    expect(resultMismatch.verified).toBe(false);
  });

  it('fails verification if input value is blank for required field', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '';
    document.body.appendChild(input);

    const desc = makeDescriptor('text', true);
    const result = verification.verify(input, desc, 'Target Value');

    expect(result.verified).toBe(false);
    expect(result.hasValidationError).toBe(true);
  });
});
