import { describe, it, expect, beforeEach } from 'vitest';
import { InteractionEngine } from '../src/content/interaction/interaction-engine';
import { VerificationEngine } from '../src/content/verification/verification-engine';
import { FieldDescriptor } from '../src/types/taxonomy';

describe('InteractionEngine & VerificationEngine', () => {
  let interaction: InteractionEngine;
  let verification: VerificationEngine;

  beforeEach(() => {
    document.body.innerHTML = '';
    interaction = new InteractionEngine();
    verification = new VerificationEngine();
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

  it('interacts with text inputs and verifies value state', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    let eventTriggered = false;
    input.addEventListener('input', () => {
      eventTriggered = true;
    });

    const descriptor = makeDescriptor(input, 'text');
    const result = await interaction.fill(input, descriptor, 'John Doe');

    expect(result.success).toBe(true);
    expect(input.value).toBe('John Doe');
    expect(eventTriggered).toBe(true);

    const verifyRes = verification.verify(input, descriptor, 'John Doe');
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.actualValue).toBe('John Doe');
  });

  it('interacts with native select elements', async () => {
    const select = document.createElement('select');
    select.innerHTML = `
      <option value="us">United States</option>
      <option value="ca">Canada</option>
    `;
    document.body.appendChild(select);

    const descriptor = makeDescriptor(select, 'select');
    const result = await interaction.fill(select, descriptor, 'Canada');

    expect(result.success).toBe(true);
    expect(select.value).toBe('ca');

    const verifyRes = verification.verify(select, descriptor, 'Canada');
    expect(verifyRes.verified).toBe(true);
  });

  it('matches country options by alias (e.g. India -> IN, United States -> USA)', async () => {
    const select = document.createElement('select');
    select.innerHTML = `
      <option value="">Select your country</option>
      <option value="IN">India</option>
      <option value="US">United States of America</option>
      <option value="AE">United Arab Emirates</option>
    `;
    document.body.appendChild(select);

    const descriptor = makeDescriptor(select, 'select');
    const result = await interaction.fill(select, descriptor, 'India');

    expect(result.success).toBe(true);
    expect(select.value).toBe('IN');
  });

  it('interacts with checkboxes and verifies checked state', async () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.appendChild(checkbox);

    const descriptor = makeDescriptor(checkbox, 'checkbox');
    const result = await interaction.fill(checkbox, descriptor, true);

    expect(result.success).toBe(true);
    expect(checkbox.checked).toBe(true);

    const verifyRes = verification.verify(checkbox, descriptor, true);
    expect(verifyRes.verified).toBe(true);
  });

  it('detects HTML5 constraint validation failures', () => {
    const input = document.createElement('input');
    input.type = 'email';
    input.value = 'invalid-email-not-an-address';
    document.body.appendChild(input);

    const descriptor = makeDescriptor(input, 'email');
    const verifyRes = verification.verify(input, descriptor, 'valid@example.com');

    expect(verifyRes.verified).toBe(false);
  });
});
