# AI Job Application Assistant — Database and Storage

## 1. Storage Strategy

Prefer local-first storage.

Use:

- `chrome.storage.local` for configuration and small structured data.
- IndexedDB for larger structured records, resume text, sessions, mappings, and history.
- Avoid storing secrets in ordinary extension storage.
- Cloud persistence is optional and must be explicitly enabled.

The storage layer must expose a provider-neutral repository interface.

## 2. Core Entities

### Profile

```json
{
  "id": "profile_default",
  "version": 1,
  "identity": {
    "firstName": "",
    "lastName": "",
    "fullName": "",
    "email": "",
    "phone": ""
  },
  "location": {},
  "summary": "",
  "links": {},
  "skills": [],
  "experiences": [],
  "education": [],
  "certifications": [],
  "projects": [],
  "preferences": {},
  "verifiedFacts": [],
  "updatedAt": ""
}
```

### Skill

```json
{
  "id": "skill_123",
  "canonicalName": "Python",
  "aliases": ["Python 3", "Python Programming"],
  "proficiency": "advanced",
  "years": null,
  "source": ["profile"],
  "verified": true
}
```

Do not infer `years` or proficiency unless explicitly provided.

### Experience

```json
{
  "id": "exp_123",
  "company": "",
  "title": "",
  "startDate": "",
  "endDate": "",
  "current": false,
  "location": "",
  "description": "",
  "skills": [],
  "achievements": []
}
```

### Education

```json
{
  "id": "edu_123",
  "institution": "",
  "degree": "",
  "field": "",
  "startDate": "",
  "endDate": "",
  "verified": true
}
```

### Resume

```json
{
  "id": "resume_123",
  "fileName": "",
  "mimeType": "",
  "contentHash": "",
  "extractedText": "",
  "version": 1,
  "source": "user_upload",
  "createdAt": ""
}
```

Never treat extracted resume text as more authoritative than explicit verified profile facts when they conflict; surface the conflict.

### Job

```json
{
  "id": "job_123",
  "url": "",
  "domain": "",
  "company": "",
  "title": "",
  "location": "",
  "description": "",
  "requirements": [],
  "skills": [],
  "source": "page",
  "capturedAt": ""
}
```

### Application Session

```json
{
  "id": "app_123",
  "jobId": "job_123",
  "tabId": 0,
  "status": "FILLING",
  "pageState": {},
  "filledFields": [],
  "pendingFields": [],
  "aiOutputs": [],
  "userCorrections": [],
  "createdAt": "",
  "updatedAt": ""
}
```

### Field Mapping

```json
{
  "id": "map_123",
  "domain": "example.com",
  "pathPattern": "",
  "fieldSignature": "",
  "semanticType": "skills",
  "controlType": "tag_input",
  "confidence": 0.96,
  "source": "user_confirmed",
  "version": 1,
  "createdAt": "",
  "updatedAt": ""
}
```

### AI Output

```json
{
  "id": "ai_123",
  "task": "cover_letter",
  "provider": "adapter_name",
  "model": "adapter_defined",
  "inputReferences": ["job_123", "resume_123"],
  "output": "",
  "structuredOutput": {},
  "groundingStatus": "passed",
  "confidence": 0.91,
  "createdAt": ""
}
```

Do not store raw sensitive prompts/responses indefinitely unless the user explicitly enables history.

## 3. Field Observation

```json
{
  "fieldSignature": "hash",
  "domain": "example.com",
  "pagePattern": "",
  "semanticType": "email",
  "controlType": "input",
  "evidence": [],
  "confidence": 0.99,
  "timestamp": ""
}
```

Use hashes or normalized signatures instead of storing unnecessary page content.

## 4. Application Answer

```json
{
  "id": "answer_123",
  "question": "",
  "answer": "",
  "sourceRefs": ["profile", "resume_123", "job_123"],
  "groundingStatus": "passed",
  "approved": false,
  "inserted": false
}
```

## 5. Cover Letter

```json
{
  "id": "letter_123",
  "jobId": "job_123",
  "content": "",
  "tone": "professional",
  "length": "medium",
  "sourceRefs": ["profile", "resume_123", "job_123"],
  "groundingStatus": "passed",
  "approved": false
}
```

## 6. Settings

```json
{
  "aiEnabled": true,
  "aiProvider": "local",
  "autoFillThreshold": 0.90,
  "reviewThreshold": 0.70,
  "storeHistory": false,
  "allowCloudAI": false,
  "preferredTone": "professional"
}
```

## 7. Data Lifecycle

- User can edit profile.
- User can delete resume.
- Application sessions can expire.
- Temporary page content should be discarded after session completion unless history is explicitly enabled.
- Learned mappings should be independently removable.
- AI history should be optional.

## 8. Conflict Resolution

If profile and resume disagree:

1. Prefer explicitly verified profile data.
2. Mark the conflict.
3. Do not silently choose an uncertain value.
4. Ask the user when the field is important.

## 9. Schema Versioning

Every persisted collection should have a schema version.

Migration pattern:

```text
storedVersion < currentVersion
    -> migration
    -> validate
    -> persist
```

Failed migration must preserve the original data and produce a recoverable error.

## 10. No Secret Database

Do not store:

- website passwords
- OTPs
- payment-card numbers
- private API keys in page content
- session cookies

Provider credentials should use the safest available extension/app credential mechanism and never be exposed to content scripts.
