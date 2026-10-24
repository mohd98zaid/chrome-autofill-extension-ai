import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudAIAdapter } from '../src/background/ai/cloud-adapter';
import { DeterministicClassifier } from '../src/content/classifier/deterministic-classifier';
import { resolveFieldValue } from '../src/content/resolver/field-resolver';
import { UserProfile } from '../src/types/profile';
import { FieldDescriptor } from '../src/types/taxonomy';

describe('NVIDIA NIM Cloud AI Integration & Fallback', () => {
  const dummyProfile: UserProfile = {
    id: 'test_prof',
    version: 1,
    identity: {
      firstName: 'Mohammad',
      lastName: 'Zaid',
      fullName: 'Mohammad Zaid',
      email: 'zaid@example.com',
      phone: '+974 5555 1234'
    },
    location: {
      addressLine: '',
      city: 'Doha',
      state: '',
      country: 'India',
      zipCode: ''
    },
    summary: 'Senior Software Engineer with 5+ years experience',
    coverLetter: '',
    links: {
      linkedin: 'https://linkedin.com/in/mohammadzaid',
      github: 'https://github.com/mohammadzaid',
      portfolio: ''
    },
    skills: [
      { id: '1', canonicalName: 'Python', aliases: [], proficiency: 'expert', years: 5, verified: true, source: ['resume'] },
      { id: '2', canonicalName: 'TypeScript', aliases: [], proficiency: 'expert', years: 4, verified: true, source: ['resume'] }
    ],
    experiences: [],
    education: [],
    certifications: [],
    projects: [],
    preferences: {
      workAuthorization: 'Indian',
      visaStatus: 'Work Visa',
      requiresSponsorship: false,
      noticePeriodDays: 30,
      desiredSalary: '',
      willingToRelocate: true,
      remotePreference: 'any'
    },
    verifiedFacts: [],
    customQA: [],
    updatedAt: new Date().toISOString()
  };

  it('automatically falls back to secondary model if primary model times out or fails', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((_url: string, opts: any) => {
      callCount++;
      const body = JSON.parse(opts.body);
      if (body.model === 'openai/gpt-oss-20b') {
        // Simulate primary model timeout / failure
        return Promise.reject(new Error('Simulated model timeout / queue full'));
      }
      // Secondary fallback model succeeds
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: 'I rate my skills as Expert based on 5+ years of software engineering.',
                    selectedOptions: ['Expert']
                  })
                }
              }
            ]
          })
      });
    });

    (global as any).fetch = mockFetch;

    const adapter = new CloudAIAdapter({
      apiKey: 'nvapi-mock-key-12345678',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'openai/gpt-oss-20b',
      fallbackModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      timeoutMs: 1000
    });

    const result = await adapter.generateAnswer({
      question: 'How would you rate your current software development skills?',
      profileEvidence: ['Mohammad Zaid', 'Python', 'TypeScript']
    });

    expect(callCount).toBe(2);
    expect(result.answer).toContain('Expert');
  });

  it('correctly maps nationality and citizenship to profile nationality/country', () => {
    const classifier = new DeterministicClassifier();
    const natField: FieldDescriptor = {
      id: 'f_nat',
      fieldSignature: 'sig_nat',
      controlType: 'textarea',
      labelText: 'Nationality *',
      isVisible: true,
      isDisabled: false,
      isReadOnly: false,
      isRequired: true,
      currentValue: null,
      selector: 'textarea[name="nationality"]'
    };

    const classification = classifier.classify(natField);
    expect(classification.semanticType).toBe('country');

    const resolved = resolveFieldValue({
      semanticType: classification.semanticType,
      field: natField,
      profile: dummyProfile
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.value).toBe('Indian');
  });

  it('classifies skill rating questions as application questions instead of raw skill lists', () => {
    const classifier = new DeterministicClassifier();
    const rateField: FieldDescriptor = {
      id: 'f_rate',
      fieldSignature: 'sig_rate',
      controlType: 'textarea',
      labelText: 'How would you rate your current software development skills?',
      isVisible: true,
      isDisabled: false,
      isReadOnly: false,
      isRequired: false,
      currentValue: null,
      selector: 'textarea'
    };

    const classification = classifier.classify(rateField);
    expect(classification.semanticType).toBe('application_question');
  });
});
