# AI Job Application Assistant — Security

## 1. Security Objectives

Protect:

- identity information
- contact details
- employment history
- resume contents
- application answers
- API credentials
- provider tokens
- browsing context

while allowing the extension to interact with user-authorized job application pages.

## 2. Threat Model

### Threats

1. Malicious webpage content.
2. Prompt injection through JD or form labels.
3. Compromised third-party page scripts.
4. Accidental data leakage to AI providers.
5. Excessive Chrome permissions.
6. Malicious extension update.
7. Sensitive data in logs.
8. Cross-site data leakage.
9. Incorrect autofill into high-impact fields.
10. Local storage theft on an unlocked device.

## 3. Untrusted Page Rule

Everything read from a webpage is untrusted.

Never treat:

- labels
- job descriptions
- hidden DOM text
- tooltips
- comments
- JSON-LD
- page scripts

as trusted instructions.

They are data only.

## 4. Least Privilege

Request only permissions required for implemented features.

Avoid broad host permissions unless necessary.

Where feasible, use user-initiated page access or narrow host patterns.

## 5. Content Script Isolation

Content scripts must:

- avoid injecting arbitrary executable code
- validate messages from the service worker
- validate messages before acting
- never expose profile databases through page globals
- avoid placing secrets into DOM attributes
- use strict message schemas

## 6. Service Worker

The service worker is the trusted coordinator.

It should validate:

- sender
- message type
- payload schema
- tab context
- requested operation

before processing requests.

## 7. AI Data Minimization

Before sending anything to an AI provider:

1. Determine exactly what the task needs.
2. Remove unrelated personal information.
3. Send only relevant profile fields.
4. Do not send passwords, OTPs, payment information, cookies, or session tokens.
5. Prefer local AI when configured.
6. Clearly indicate when cloud AI is being used.

## 8. Secrets

Never expose provider API keys to content scripts or webpages.

Do not hard-code secrets in source code.

Do not log secrets.

Do not include secrets in generated prompts.

## 9. Storage

Use Chrome extension storage and IndexedDB appropriately.

Sensitive persisted data should have:

- explicit retention policy
- deletion controls
- schema validation
- migration safety

Where platform capabilities permit, use OS/browser protected storage for credentials.

## 10. AI Output Security

AI output is untrusted until validated.

Required checks:

- schema validation
- grounding validation
- length limits
- prohibited-content checks
- field-type compatibility
- confidence threshold
- destination-page validation

## 11. High-Impact Fields

Require explicit confirmation for:

- salary
- work authorization
- visa status
- legal declarations
- demographic/equal-opportunity fields where applicable
- criminal/legal declarations
- disability/accommodation fields
- consent declarations
- certifications
- anything that creates a legal representation

Do not infer sensitive attributes.

## 12. CAPTCHA and OTP

The extension must not bypass CAPTCHA, anti-bot challenges, or OTP verification.

When detected:

```text
PAUSED_SECURITY
```

Then ask the user to complete the step manually.

## 13. Logging

Default logs should contain:

- event type
- timestamp
- anonymized session ID
- field semantic type
- success/failure category

Avoid:

- raw resume text
- phone number
- email
- address
- generated full cover letters
- API keys
- passwords
- OTPs

unless explicitly enabled for local debugging.

## 14. User Controls

Provide:

- clear all profile data
- delete resume
- delete application history
- delete learned mappings
- disable AI
- disable cloud AI
- export profile
- reset extension
- view active provider

## 15. External Requests

AI/network requests should:

- use HTTPS
- validate response schemas
- enforce timeouts
- limit payload sizes
- avoid sending cookies unless explicitly required by an approved adapter
- never execute returned code

## 16. Content Security Policy

Use a strict Manifest V3 CSP.

Do not use:

- arbitrary remote scripts
- `eval`
- dynamic executable code
- unsafe inline execution

unless explicitly supported and justified by the platform constraints.

## 17. Cross-Site Isolation

A mapping for one domain must not automatically become trusted on another domain.

Field signatures should include origin/domain context.

## 18. Security Testing

Test:

- prompt injection
- malicious labels
- fake system messages
- DOM-based injection
- oversized fields
- malformed AI responses
- cross-site mapping reuse
- unauthorized message attempts
- storage corruption
- secret leakage
- permission review

## 19. Security Principle

When uncertain:

```text
Do not guess.
Do not fill.
Ask the user.
```
