import { describe, it, expect, beforeEach } from 'vitest';
import { DOMScanner } from '../src/content/scanner/dom-scanner';

describe('Security Pause & Threat Detection (Rules 9, 10, 11)', () => {
  let scanner: DOMScanner;

  beforeEach(() => {
    document.body.innerHTML = '';
    scanner = new DOMScanner('example.com');
  });

  it('detects Cloudflare Turnstile security challenge', () => {
    document.body.innerHTML = `
      <form id="app">
        <input id="name" type="text" />
        <div class="cf-turnstile" data-sitekey="dummy"></div>
      </form>
    `;

    const result = scanner.scan();
    expect(result.securityTrigger).toBeDefined();
    expect(result.securityTrigger?.type).toBe('captcha');
    expect(result.securityTrigger?.message).toContain('CAPTCHA');
  });

  it('detects password fields and pauses automation without scanning passwords', () => {
    document.body.innerHTML = `
      <form id="login">
        <input id="email" type="email" />
        <input id="password" type="password" />
      </form>
    `;

    const result = scanner.scan();
    expect(result.securityTrigger).toBeDefined();
    expect(result.securityTrigger?.type).toBe('password');
    // Ensure password fields are never in the scanned fields list
    const passwordField = result.fields.find((f) => f.domId === 'password' || f.name === 'password');
    expect(passwordField).toBeUndefined();
  });

  it('detects payment iframes and triggers payment challenge', () => {
    document.body.innerHTML = `
      <form id="pay">
        <iframe src="https://js.stripe.com/v3/elements"></iframe>
      </form>
    `;

    const result = scanner.scan();
    expect(result.securityTrigger).toBeDefined();
    expect(result.securityTrigger?.type).toBe('payment');
  });

  it('clears security trigger when challenge elements are absent', () => {
    document.body.innerHTML = `
      <form id="safe-form">
        <input id="name" type="text" />
      </form>
    `;

    const result = scanner.scan();
    expect(result.securityTrigger).toBeUndefined();
  });
});
