# AI Job Application Assistant — Error Handling and Recovery

## 1. Goals

Errors must be:

- detectable
- classified
- recoverable when safe
- visible to the user when unresolved
- non-destructive
- privacy-safe

Never silently mark a failed field as successful.

## 2. Error Categories

```text
E_DOM
E_CLASSIFICATION
E_INTERACTION
E_VERIFICATION
E_AI
E_PROVIDER
E_SCHEMA
E_NETWORK
E_STORAGE
E_SESSION
E_SECURITY
E_PERMISSION
E_USER_REQUIRED
E_UNSUPPORTED
```

## 3. Standard Error Object

```ts
interface AppError {
  code: string;
  category: string;
  message: string;
  recoverable: boolean;
  retryable: boolean;
  fieldId?: string;
  semanticType?: string;
  correlationId: string;
  userAction?: string;
}
```

Never include secrets or unnecessary personal data in error messages.

## 4. DOM Detection Failures

### Example
Field exists but no label can be identified.

### Recovery

1. Inspect surrounding context.
2. Check known website mapping.
3. Use AI fallback if allowed.
4. If still uncertain, mark unresolved.

Do not guess.

---

## 5. AI Classification Failure

Causes:

- timeout
- provider unavailable
- invalid JSON
- low confidence
- context too large

Recovery:

1. Retry once if transient.
2. Reduce context.
3. Try configured fallback provider if allowed.
4. Fall back to deterministic/manual mapping.
5. Mark field unresolved.

---

## 6. AI Schema Failure

If output is not valid:

```text
raw output
 -> schema validation
 -> fail
 -> bounded repair/retry
 -> fail
 -> reject output
```

Never execute or insert unvalidated AI output.

---

## 7. Interaction Failure

### Example

A custom dropdown does not open.

Recovery order:

```text
click strategy
 -> keyboard strategy
 -> DOM-supported interaction
 -> retry once
 -> manual user action
```

Do not endlessly retry.

---

## 8. Verification Failure

If a value appears filled but verification fails:

1. Read actual UI state.
2. Determine whether value was transformed.
3. Try an alternative interaction strategy.
4. Re-verify.
5. If unsuccessful, mark `NEEDS_USER`.

---

## 9. React/Vue/Angular Failure

If direct value assignment does not update framework state:

1. Use native setter/event strategy.
2. Trigger appropriate `input`/`change`/`blur` events.
3. Verify application state through visible UI.
4. Avoid framework-private APIs unless a stable, tested adapter exists.

---

## 10. Dynamic Field Race

If a field disappears or is replaced:

```text
stale field reference
 -> rescan
 -> rebuild descriptor
 -> retry once
```

Never operate on stale DOM references indefinitely.

---

## 11. Multi-Page Failure

If navigation occurs during filling:

1. Persist session state.
2. Mark current operation interrupted.
3. Detect new page.
4. Rescan.
5. Resume only from verified state.

Never assume that a previous page's DOM still exists.

---

## 12. Conditional Field Failure

If a dependent field is hidden:

- Do not fill it.
- Re-evaluate after the controlling selection changes.
- Only process it when visible and interactive.

---

## 13. Skill Selection Failure

If a skill cannot be found:

```text
Requested: LangGraph
Options: LangChain, LlamaIndex, LLM
```

Do not silently choose a different skill.

Possible user actions:

- choose closest option
- type manually
- skip

If the site permits free text, use the verified profile skill only.

---

## 14. AI Generation Failure

For cover letters and application answers:

- retry with reduced context if safe
- enforce maximum output length
- run grounding validation
- reject unsupported claims
- offer regeneration
- preserve the last approved version

Never overwrite an approved answer with a failed generation.

---

## 15. Grounding Failure

Example:

AI says:

> "I led a team of 20 engineers."

Evidence only says:

> "Led teams of 4–6 engineers."

Action:

```text
Reject generation
 -> report unsupported claim
 -> regenerate with stricter grounding
```

Do not automatically weaken or alter factual data.

---

## 16. Network Failure

Use:

- short timeout
- bounded retry
- exponential backoff
- jitter
- provider fallback only when configured

Example:

```text
Attempt 1: immediate
Attempt 2: short backoff
Attempt 3: longer backoff
Then manual/local fallback
```

Do not retry indefinitely.

---

## 17. Storage Failure

If storage write fails:

1. Do not discard current in-memory state.
2. Retry once.
3. Show save failure.
4. Preserve user-entered data in the current UI when possible.
5. Do not continue destructive operations.

---

## 18. Permission Failure

If the extension cannot access the current page:

```text
Page access required.

Open extension permissions
or
use manual input.
```

Do not repeatedly request permission.

---

## 19. CAPTCHA / OTP / Security Challenge

Transition:

```text
ACTIVE
  -> PAUSED_SECURITY
```

Display:

```text
Automation paused.
Please complete the verification manually.

[Continue]
```

After user action:

```text
PAUSED_SECURITY
  -> RESCAN
  -> ACTIVE
```

Never attempt to defeat the challenge.

---

## 20. Unsupported Form

If a control cannot safely be automated:

```text
UNSUPPORTED
```

Show:

- field description
- reason
- manual action

Do not label it successful.

---

## 21. User Override

Every unresolved field should provide:

```text
[Enter manually]
[Choose mapping]
[Skip]
```

A user correction may optionally be saved as a website-specific mapping.

---

## 22. Retry Rules

Retry only when the error is likely transient.

Do not retry:

- invalid user data
- unsupported control
- low-confidence semantic mapping
- security challenge
- grounding failure
- missing required profile information

---

## 23. Idempotency

Every field operation should have an operation ID.

Before retrying, check whether the desired state is already present.

This prevents:

- duplicate skills
- duplicate experience entries
- repeated text
- duplicate tags

---

## 24. User-Facing Error Design

Prefer:

```text
Could not select "LangGraph".

The site did not expose that option.

[Try Again] [Enter Manually] [Skip]
```

Avoid:

```text
ERROR 0x9F2A
```

Technical details can be available under "Diagnostics."

---

## 25. Recovery State Machine

```text
DISCOVER
   |
   v
CLASSIFY
   |
   +----> LOW CONFIDENCE ----> AI
   |                            |
   |                            +--> FAIL --> NEEDS_USER
   v
RESOLVE
   |
   v
INTERACT
   |
   +----> RETRY
   |
   v
VERIFY
   |
   +----> FAIL --> RECOVER
   |                |
   |                +--> RESCAN
   |                +--> ALTERNATE STRATEGY
   |                +--> NEEDS_USER
   |
   v
SUCCESS
```

## 26. Diagnostics

A diagnostic report should contain:

- correlation ID
- extension version
- browser version
- anonymized domain
- field type
- operation stage
- error category
- retry count

Do not include raw personal data by default.

## 27. Acceptance Criteria

The system passes error-handling acceptance when:

- no failed operation is silently reported as successful;
- transient failures retry with bounds;
- stale DOM references are recovered;
- AI schema failures are rejected;
- grounding failures block insertion;
- security challenges pause automation;
- user can manually recover;
- sessions survive navigation;
- duplicate actions are prevented by idempotency;
- diagnostics are privacy-safe.
