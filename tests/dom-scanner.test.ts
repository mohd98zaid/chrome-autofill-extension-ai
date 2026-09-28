import { describe, it, expect, beforeEach } from 'vitest';
import { DOMScanner } from '../src/content/scanner/dom-scanner';

describe('DOMScanner', () => {
  let scanner: DOMScanner;

  beforeEach(() => {
    document.body.innerHTML = '';
    scanner = new DOMScanner('example.com');
  });

  it('scans visible standard form controls and extracts labels', () => {
    document.body.innerHTML = `
      <form id="job-form">
        <label for="first-name">First Name</label>
        <input id="first-name" type="text" name="firstName" required />

        <label for="email-addr">Email</label>
        <input id="email-addr" type="email" name="email" />

        <label for="role-select">Current Level</label>
        <select id="role-select">
          <option value="entry">Entry Level</option>
          <option value="senior">Senior</option>
        </select>
      </form>
    `;

    // Mock bounding client rect in JSDOM
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach((el) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({ width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 })
      });
    });

    const result = scanner.scan();
    expect(result.fields.length).toBe(3);
    expect(result.fields[0].labelText).toBe('First Name');
    expect(result.fields[0].isRequired).toBe(true);
    expect(result.fields[1].labelText).toBe('Email');
    expect(result.fields[2].controlType).toBe('select');
    expect(result.fields[2].options?.length).toBe(2);
    expect(result.securityTrigger).toBeUndefined();
  });

  it('detects CAPTCHA security challenges and pauses automation', () => {
    document.body.innerHTML = `
      <form id="app">
        <input id="name" type="text" />
        <div class="g-recaptcha" data-sitekey="dummy-key"></div>
      </form>
    `;

    const result = scanner.scan();
    expect(result.securityTrigger).toBeDefined();
    expect(result.securityTrigger?.type).toBe('captcha');
    expect(result.securityTrigger?.message).toContain('CAPTCHA');
  });

  it('ignores invisible reCAPTCHA v3 badges and telemetry iframes', () => {
    document.body.innerHTML = `
      <form id="luxoft-form">
        <label for="first-name">First name</label>
        <input id="first-name" type="text" name="firstName" />
      </form>
      <div class="grecaptcha-badge" style="width: 256px; height: 60px;">
        <iframe src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=dummy"></iframe>
      </div>
      <div data-size="invisible">
        <iframe src="https://www.google.com/recaptcha/enterprise/anchor?k=dummy2"></iframe>
      </div>
    `;

    const result = scanner.scan();
    expect(result.fields.length).toBe(1);
    expect(result.securityTrigger).toBeUndefined();
  });

  it('detects OTP security verification fields', () => {
    document.body.innerHTML = `
      <form id="verification">
        <label for="otp">Enter Verification Code</label>
        <input id="otp" name="otp_code" autocomplete="one-time-code" type="text" />
      </form>
    `;

    const input = document.getElementById('otp')!;
    Object.defineProperty(input, 'getBoundingClientRect', {
      value: () => ({ width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 })
    });

    const result = scanner.scan();
    expect(result.securityTrigger).toBeDefined();
    expect(result.securityTrigger?.type).toBe('otp');
  });

  it('correctly discovers nested Microsoft Forms questions with unique signatures and data-autofill-id', () => {
    document.body.innerHTML = `
      <div class="office-form">
        <div data-automation-id="questionItem" class="office-form-question">
          <div data-automation-id="questionTitle" class="office-form-question-title">
            <span>3.</span> <span>First & Last Name</span> <span>*</span>
          </div>
          <div class="office-form-question-element">
            <div class="office-form-textfield">
              <input type="text" placeholder="Enter your answer" class="office-form-question-textbox" />
            </div>
          </div>
        </div>

        <div data-automation-id="questionItem" class="office-form-question">
          <div data-automation-id="questionTitle" class="office-form-question-title">
            <span>4.</span> <span>Email Address</span> <span>*</span>
          </div>
          <div class="office-form-question-element">
            <div class="office-form-textfield">
              <input type="text" placeholder="Enter your answer" class="office-form-question-textbox" />
            </div>
          </div>
        </div>
      </div>
    `;

    const inputs = document.querySelectorAll('input');
    inputs.forEach((el) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({ width: 200, height: 35, top: 0, left: 0, bottom: 35, right: 200 })
      });
    });

    const result = scanner.scan();
    expect(result.fields.length).toBe(2);

    // Label extracted from parent question container title
    expect(result.fields[0].labelText).toContain('First & Last Name');
    expect(result.fields[1].labelText).toContain('Email Address');

    // Distinct field signatures
    expect(result.fields[0].fieldSignature).not.toBe(result.fields[1].fieldSignature);

    // Distinct IDs
    expect(result.fields[0].id).not.toBe(result.fields[1].id);

    // Stamped data-autofill-id
    expect(inputs[0].getAttribute('data-autofill-id')).toBe(result.fields[0].id);
    expect(inputs[1].getAttribute('data-autofill-id')).toBe(result.fields[1].id);

    // Element map
    expect(result.elementMap?.get(result.fields[0].id)).toBe(inputs[0]);
    expect(result.elementMap?.get(result.fields[1].id)).toBe(inputs[1]);
  });
});
