import { describe, it, expect } from 'vitest';
import { resolveFieldValue } from '../src/content/resolver/field-resolver';
import { UserProfile } from '../src/types/profile';
import { FieldDescriptor } from '../src/types/taxonomy';

describe('Centralized Field Resolver', () => {
  const mockField: FieldDescriptor = {
    id: 'f1',
    fieldSignature: 'sig1',
    controlType: 'text',
    isVisible: true,
    isDisabled: false,
    isReadOnly: false,
    isRequired: true,
    currentValue: null,
    selector: 'input'
  };

  const emptyProfile: UserProfile = {
    id: 'profile_empty',
    version: 1,
    identity: { firstName: '', lastName: '', fullName: '', email: '', phone: '' },
    location: { addressLine: '', city: '', state: '', country: '', zipCode: '' },
    summary: '',
    links: { linkedin: '', github: '', portfolio: '' },
    skills: [],
    experiences: [],
    education: [],
    certifications: [],
    projects: [],
    preferences: {
      workAuthorization: '',
      visaStatus: '',
      requiresSponsorship: false,
      noticePeriodDays: 0,
      desiredSalary: '',
      willingToRelocate: false,
      remotePreference: 'any'
    },
    verifiedFacts: [],
    customQA: [],
    updatedAt: new Date().toISOString()
  };

  const filledProfile: UserProfile = {
    ...emptyProfile,
    identity: {
      firstName: 'Alice',
      lastName: 'Smith',
      fullName: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+1 555-0100'
    },
    location: {
      addressLine: '123 Market St',
      city: 'San Francisco',
      state: 'CA',
      country: 'United States',
      zipCode: '94105'
    },
    experiences: [
      {
        id: 'exp1',
        company: 'First Corp',
        title: 'Senior Engineer',
        startDate: '2020-01',
        endDate: '2022-01',
        current: false,
        location: 'San Francisco',
        description: '',
        skills: [],
        achievements: [],
        verified: true
      },
      {
        id: 'exp2',
        company: 'Second Inc',
        title: 'Lead Architect',
        startDate: '2022-01',
        endDate: '2024-01',
        current: false,
        location: 'New York',
        description: '',
        skills: [],
        achievements: [],
        verified: true
      }
    ],
    preferences: {
      workAuthorization: 'Authorized for all US employers',
      visaStatus: 'US Citizen',
      requiresSponsorship: false,
      noticePeriodDays: 14,
      desiredSalary: '160000',
      willingToRelocate: true,
      remotePreference: 'remote'
    }
  };

  it('returns NEEDS_USER for empty identity fields instead of fabricating data', () => {
    const resFirst = resolveFieldValue({ semanticType: 'first_name', field: mockField, profile: emptyProfile });
    expect(resFirst.status).toBe('NEEDS_USER');

    const resEmail = resolveFieldValue({ semanticType: 'email', field: mockField, profile: emptyProfile });
    expect(resEmail.status).toBe('NEEDS_USER');
  });

  it('resolves configured identity fields correctly', () => {
    const resFirst = resolveFieldValue({ semanticType: 'first_name', field: mockField, profile: filledProfile });
    expect(resFirst.status).toBe('RESOLVED');
    expect(resFirst.value).toBe('Alice');

    const resFull = resolveFieldValue({ semanticType: 'full_name', field: mockField, profile: filledProfile });
    expect(resFull.status).toBe('RESOLVED');
    expect(resFull.value).toBe('Alice Smith');
  });

  it('never defaults salutation to Mr. or Ms.', () => {
    const res = resolveFieldValue({ semanticType: 'salutation', field: mockField, profile: filledProfile });
    expect(res.status).toBe('UNKNOWN');
  });

  it('handles high-impact fields strictly (Rule 19)', () => {
    // Empty profile must NEVER default to 'Yes' or 'Authorized'
    const resVisa = resolveFieldValue({ semanticType: 'visa_status', field: mockField, profile: emptyProfile });
    expect(resVisa.status).toBe('NEEDS_USER');
    expect(resVisa.value).toBeUndefined();

    const resAuth = resolveFieldValue({ semanticType: 'work_authorization', field: mockField, profile: emptyProfile });
    expect(resAuth.status).toBe('NEEDS_USER');
    expect(resAuth.value).toBeUndefined();

    const resSalary = resolveFieldValue({ semanticType: 'salary', field: mockField, profile: emptyProfile });
    expect(resSalary.status).toBe('NEEDS_USER');
    expect(resSalary.value).toBeUndefined();

    // Configured profile returns explicit user choices
    const resFilledAuth = resolveFieldValue({ semanticType: 'work_authorization', field: mockField, profile: filledProfile });
    expect(resFilledAuth.status).toBe('RESOLVED');
    expect(resFilledAuth.value).toBe('Authorized for all US employers');

    const resFilledSalary = resolveFieldValue({ semanticType: 'salary', field: mockField, profile: filledProfile });
    expect(resFilledSalary.status).toBe('RESOLVED');
    expect(resFilledSalary.value).toBe('160000');
  });

  it('supports sectionIndex for repeated experience sections (Rule 30)', () => {
    const title0 = resolveFieldValue({ semanticType: 'current_title', field: mockField, profile: filledProfile, sectionIndex: 0 });
    expect(title0.status).toBe('RESOLVED');
    expect(title0.value).toBe('Senior Engineer');

    const title1 = resolveFieldValue({ semanticType: 'current_title', field: mockField, profile: filledProfile, sectionIndex: 1 });
    expect(title1.status).toBe('RESOLVED');
    expect(title1.value).toBe('Lead Architect');

    const title2 = resolveFieldValue({ semanticType: 'current_title', field: mockField, profile: filledProfile, sectionIndex: 2 });
    expect(title2.status).toBe('UNKNOWN');
  });

  it('uses experience calculator to compute years of experience without guessing', () => {
    const res = resolveFieldValue({ semanticType: 'years_experience', field: mockField, profile: filledProfile });
    expect(res.status).toBe('RESOLVED');
    expect(res.value).toBe('4'); // 2020-2022 (2 yrs) + 2022-2024 (2 yrs) = 4 yrs

    const resEmpty = resolveFieldValue({ semanticType: 'years_experience', field: mockField, profile: emptyProfile });
    expect(resEmpty.status).toBe('NEEDS_USER');
  });
});
