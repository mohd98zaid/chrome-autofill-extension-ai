# AI Job Application Assistant — Architecture

## 1. Purpose

The AI Job Application Assistant is a Chrome Manifest V3 extension that helps a user complete job applications with minimal repetitive work while keeping the user in control.

The system must:

- Detect and fill standard form fields locally and quickly.
- Detect semantically equivalent fields even when labels differ.
- Handle difficult/custom fields with an AI fallback.
- Handle skills as text, textarea, dropdown, searchable select, chips/tags, checkboxes, radio buttons, and proficiency controls.
- Understand job descriptions (JD) from the current page.
- Match JD requirements against the user's verified profile and resume.
- Generate grounded application answers and tailored cover letters.
- Support multi-page and dynamically generated forms.
- Verify that a website accepted each attempted value.
- Remember website-specific field mappings after user confirmation.
- Stop for CAPTCHA, OTP, payment, password, or other security-sensitive interactions.
- Never fabricate qualifications, employers, degrees, certifications, projects, skills, or achievements.
- Require user review before final submission.

## 2. Design Principles

1. **Local-first:** deterministic DOM inspection and profile lookup are preferred over AI.
2. **AI as fallback:** AI is used for ambiguity, semantic matching, JD analysis, and generation.
3. **Grounded generation:** generated content must use only approved profile/resume facts plus the current JD.
4. **Confidence-aware:** every inferred field mapping has a confidence score and evidence.
5. **Verify after action:** a fill is not considered successful until the page state confirms it.
6. **User-controlled submission:** the extension never automatically bypasses CAPTCHA/OTP and should not silently submit an application.
7. **Least privilege:** request only the Chrome permissions required by the enabled features.
8. **Provider-neutral AI:** AI access is an adapter interface; provider-specific behavior belongs in adapters.
9. **Deterministic recovery:** failures should have bounded retries and a clear manual fallback.
10. **Auditable actions:** the user can see what was filled, what AI generated, and what remains unresolved.

## 3. High-Level Architecture

```text
                         Chrome Extension
                                |
                +---------------+---------------+
                |                               |
          Popup / Options                 Content Script
                |                               |
          Profile Manager               Page Intelligence
          Resume Manager                Form Scanner
          AI Settings                   Field Classifier
          Review UI                     Interaction Engine
                |                               |
                +---------------+---------------+
                                |
                         Service Worker
                                |
        +-----------------------+-----------------------+
        |                       |                       |
   Session Manager        AI Orchestrator       Mapping Store
        |                       |                       |
        |                +------+-------+               |
        |                |              |               |
        |           Local Provider   Cloud Adapter      |
        |                |              |               |
        +----------------+--------------+---------------+
                         |
                   Chrome Storage /
                      IndexedDB
```

## 4. Core Components

### 4.1 Content Script

Responsibilities:

- Discover visible and interactive controls.
- Read labels, nearby text, ARIA metadata, HTML attributes, section headings, and control structure.
- Build a normalized `FieldDescriptor`.
- Detect dynamic DOM changes with `MutationObserver`.
- Execute field interactions.
- Verify resulting UI state.
- Never store long-lived secrets in page DOM.
- Never execute arbitrary page-provided JavaScript.

### 4.2 Page Intelligence

Converts raw DOM into semantic information:

```text
DOM
 -> visibility filter
 -> control extraction
 -> label/context extraction
 -> section detection
 -> field signature
 -> deterministic classifier
 -> AI fallback when needed
```

Field types include:

- text
- textarea
- email
- phone
- URL
- date
- number
- select
- combobox
- searchable select
- checkbox
- radio
- tag/chip input
- file input
- custom widget
- unknown

Semantic types include:

- first_name
- last_name
- full_name
- email
- phone
- address
- city
- country
- work_authorization
- visa_status
- current_company
- current_title
- years_experience
- education
- degree
- skills
- salary
- notice_period
- LinkedIn
- GitHub
- portfolio
- cover_letter
- resume
- application_question
- custom

### 4.3 Deterministic Field Detector

Order of evidence:

1. `autocomplete`
2. explicit `<label>`
3. `aria-label`
4. `aria-labelledby`
5. `aria-describedby`
6. `name`
7. `id`
8. placeholder
9. nearby visible text
10. section heading
11. option values
12. known website mapping
13. semantic heuristics

Each inference must produce:

```json
{
  "semanticType": "skills",
  "confidence": 0.96,
  "evidence": ["label", "section_heading", "name"],
  "source": "deterministic"
}
```

### 4.4 AI Field Detector

Invoke only when deterministic confidence is below the configured threshold or when the control is a custom widget.

Input should contain only the minimum required context:

- normalized field metadata
- nearby text
- section title
- option list
- relevant profile schema keys

The AI must return structured JSON conforming to a strict schema.

### 4.5 Interaction Engine

Strategies:

- native input setter + appropriate input/change events
- keyboard typing simulation where required
- select option
- click checkbox/radio
- open and search custom dropdown
- select tag/chip
- add repeated section
- scroll into view
- focus/blur where framework validation requires it

Never assume that setting `.value` is sufficient.

### 4.6 Verification Engine

After every fill:

1. Read the current control state.
2. Compare it with normalized expected value.
3. Check visible selected chips/options.
4. Detect validation errors.
5. Detect rejected/autocomplete-unaccepted values.
6. Retry using a different strategy when safe.
7. Mark unresolved if verification fails.

### 4.7 JD Extractor

Sources, in priority order:

1. Clearly visible job-description container.
2. Structured page sections.
3. JSON-LD where appropriate.
4. User-selected text.
5. User-pasted JD.

The extractor must retain source context and must not treat unrelated page content as the JD.

### 4.8 JD Analyzer

Produces:

- company
- role
- location
- employment type
- responsibilities
- required skills
- preferred skills
- experience requirements
- education requirements
- certifications
- keywords
- application questions

The analyzer must distinguish explicit requirements from inferred/optional information.

### 4.9 Skill Resolver

Skill matching must normalize:

- case
- punctuation
- common aliases
- version suffixes
- equivalent terminology when confidence is sufficient

Example:

```text
"Azure OpenAI Service" -> "Azure OpenAI"
"LLM applications" -> "LLM"
```

Do not infer a skill merely because it is adjacent to another skill.

For every selected skill, maintain:

```json
{
  "skill": "LangGraph",
  "source": "profile",
  "evidence": "resume",
  "match": "explicit"
}
```

### 4.10 Profile and Resume Store

The profile is the source of truth.

Recommended sections:

- identity
- contact
- location
- professional summary
- employment
- education
- skills
- certifications
- projects
- links
- preferences
- approved reusable answers

The user can mark facts as verified.

### 4.11 AI Orchestrator

Provides task-specific operations:

- classify unknown field
- map skill
- interpret dropdown options
- extract JD
- summarize JD
- generate application answer
- generate cover letter
- rewrite answer under length constraints

The orchestrator applies:

- grounding rules
- context minimization
- output schema validation
- confidence checks
- safety filters
- provider selection
- retry policy

### 4.12 Review UI

Display:

- filled fields
- AI-filled fields
- unresolved fields
- generated answers
- generated cover letter
- evidence/source for AI decisions
- confidence
- edit/regenerate controls

Final submission should require an explicit user action.

## 5. Data Flow

### Standard field

```text
DOM -> deterministic classifier -> profile lookup -> interaction -> verification
```

### Ambiguous field

```text
DOM -> deterministic classifier
    -> confidence low
    -> AI classifier
    -> schema validation
    -> profile resolver
    -> interaction
    -> verification
```

### Skills

```text
JD/profile -> skill normalization -> field-type detection
          -> control-specific interaction
          -> verification
```

### Cover letter

```text
JD -> JD analyzer
Profile + approved resume facts
      -> evidence selection
      -> generation
      -> grounding validation
      -> review
```

## 6. State Model

Application session states:

```text
DISCOVERING
ANALYZING
READY
FILLING
VERIFYING
NEEDS_USER
PAUSED_SECURITY
COMPLETED_REVIEW
SUBMITTED_BY_USER
FAILED_RECOVERABLE
FAILED_TERMINAL
```

Transitions must be explicit and persisted.

## 7. Chrome Extension Boundaries

Recommended modules:

```text
src/
  background/
    service-worker.ts
  content/
    scanner/
    classifier/
    interaction/
    verification/
    mutation/
  popup/
  options/
  review/
  ai/
  profile/
  storage/
  mappings/
  jd/
  skills/
  security/
  shared/
```

Use Manifest V3. Keep service-worker responsibilities short-lived and event-driven.

## 8. AI Adapter Contract

```ts
interface AIProvider {
  generate(request: AIRequest): Promise<AIResponse>;
  classify(request: ClassificationRequest): Promise<ClassificationResponse>;
  isAvailable(): Promise<boolean>;
}
```

Provider adapters must not leak provider-specific assumptions into business logic.

## 9. Confidence Policy

Default starting policy:

- `>= 0.90`: auto-fill if field is non-sensitive.
- `0.70–0.89`: fill but highlight for review.
- `< 0.70`: do not fill automatically.
- Any security-sensitive or high-impact field: explicit user confirmation regardless of confidence.

These are configurable product defaults, not guarantees of correctness.

## 10. Non-Goals

- CAPTCHA solving or bypass.
- OTP interception.
- Password management.
- Automatic payment.
- Evading anti-bot systems.
- Fabricating qualifications.
- Automatic final submission without user confirmation.
- Scraping unrelated private information.

## 11. Testing Strategy

Test layers:

1. Unit tests for classifiers and normalizers.
2. DOM fixture tests for common field structures.
3. Framework tests for React/Vue/Angular controls.
4. MutationObserver tests.
5. AI schema validation tests.
6. Prompt grounding tests.
7. Skill matching tests.
8. Multi-page session tests.
9. End-to-end browser tests using controlled fixture sites.
10. Regression tests for every confirmed website mapping.

## 12. Acceptance Criteria

A release is acceptable when:

- Standard fields fill deterministically.
- Unknown fields can be escalated to AI.
- Skills work across at least five control patterns.
- Dynamic fields are detected.
- Multi-page state persists.
- AI outputs are schema-valid and grounded.
- Cover letters contain no unsupported factual claims.
- Failed fills are detected rather than silently ignored.
- CAPTCHA/OTP pauses automation.
- Sensitive data is protected.
- User can review all AI-generated or uncertain changes before submission.
