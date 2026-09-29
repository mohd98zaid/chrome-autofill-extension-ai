import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../src/storage';
import { UserProfile } from '../src/types/profile';

describe('StorageService Persistence with chrome.storage.local', () => {
  let localStorageMock: Record<string, any>;
  let storage: StorageService;

  beforeEach(() => {
    localStorageMock = {};

    // Mock chrome.storage.local
    (global as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            if (typeof keys === 'string') {
              return { [keys]: localStorageMock[keys] };
            }
            const res: Record<string, any> = {};
            for (const k of keys) {
              res[k] = localStorageMock[k];
            }
            return res;
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(localStorageMock, items);
          }),
          clear: vi.fn(async () => {
            localStorageMock = {};
          })
        }
      }
    };

    storage = new StorageService();
  });

  it('saves user profile to chrome.storage.local so it survives extension reloads', async () => {
    const customProfile: UserProfile = {
      id: 'profile_default',
      version: 1,
      identity: {
        firstName: 'Jane',
        lastName: 'Developer',
        fullName: 'Jane Developer',
        email: 'jane@example.com',
        phone: '+1 555-0199'
      },
      location: {
        addressLine: '123 Tech Lane',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        zipCode: '94105'
      },
      summary: 'Senior Cloud AI Architect',
      links: {
        linkedin: 'https://linkedin.com/in/janedev',
        github: 'https://github.com/janedev',
        portfolio: 'https://janedev.com'
      },
      skills: [
        {
          id: 'sk_1',
          canonicalName: 'Kubernetes',
          aliases: ['k8s'],
          proficiency: 'expert',
          years: 5,
          source: ['profile'],
          verified: true
        }
      ],
      experiences: [],
      education: [],
      certifications: [],
      projects: [],
      preferences: {
        workAuthorization: 'Authorized',
        visaStatus: 'Citizen',
        requiresSponsorship: false,
        noticePeriodDays: 30,
        desiredSalary: '$180,000',
        willingToRelocate: false,
        remotePreference: 'remote'
      },
      verifiedFacts: [],
      customQA: [],
      updatedAt: new Date().toISOString()
    };

    await storage.saveProfile(customProfile);

    // Verify written to chrome.storage.local
    expect(localStorageMock.user_profile).toBeDefined();
    expect(localStorageMock.user_profile.identity.firstName).toBe('Jane');
    expect(localStorageMock.user_profile.identity.email).toBe('jane@example.com');

    // Simulate extension reload by instantiating a fresh StorageService
    const freshStorage = new StorageService();
    const retrieved = await freshStorage.getProfile();

    expect(retrieved.identity.firstName).toBe('Jane');
    expect(retrieved.identity.fullName).toBe('Jane Developer');
    expect(retrieved.identity.email).toBe('jane@example.com');
    expect(retrieved.location.city).toBe('San Francisco');
    expect(retrieved.skills[0].canonicalName).toBe('Kubernetes');
  });

  it('falls back to default profile if storage is empty', async () => {
    const profile = await storage.getProfile();
    expect(profile.id).toBe('profile_default');
    expect(profile.identity.fullName).toBe('');
  });

  it('successfully deletes a profile and updates active profile if needed', async () => {
    const profile1: UserProfile = {
      id: 'profile_1',
      version: 1,
      identity: { firstName: 'Alice', lastName: 'Smith', fullName: 'Alice Smith', email: 'alice@example.com', phone: '123' },
      location: { addressLine: '', city: 'London', state: '', country: 'UK', zipCode: '' },
      summary: 'Engineer',
      links: { linkedin: '', github: '', portfolio: '' },
      skills: [],
      experiences: [],
      education: [],
      certifications: [],
      projects: [],
      preferences: { workAuthorization: '', visaStatus: '', requiresSponsorship: false, noticePeriodDays: 0, desiredSalary: '', willingToRelocate: false, remotePreference: 'hybrid' },
      verifiedFacts: [],
      customQA: [],
      updatedAt: ''
    };

    const profile2: UserProfile = {
      ...profile1,
      id: 'profile_2',
      identity: { ...profile1.identity, firstName: 'Bob', fullName: 'Bob Smith', email: 'bob@example.com' }
    };

    // Save both
    await storage.saveProfile(profile1);
    await storage.saveProfile(profile2);

    let profiles = await storage.getProfiles();
    expect(profiles.some((p) => p.id === 'profile_1')).toBe(true);
    expect(profiles.some((p) => p.id === 'profile_2')).toBe(true);

    // Delete profile_2
    const delRes = await storage.deleteProfile('profile_2');
    expect(delRes.success).toBe(true);
    expect(delRes.remaining.some((p) => p.id === 'profile_2')).toBe(false);

    profiles = await storage.getProfiles();
    expect(profiles.some((p) => p.id === 'profile_2')).toBe(false);
    expect(profiles.some((p) => p.id === 'profile_1')).toBe(true);
  });

  it('refuses to delete the last remaining profile', async () => {
    const profiles = await storage.getProfiles();
    if (profiles.length > 1) {
      for (let i = 1; i < profiles.length; i++) {
        await storage.deleteProfile(profiles[i].id);
      }
    }
    const current = await storage.getProfiles();
    expect(current.length).toBe(1);

    const failRes = await storage.deleteProfile(current[0].id);
    expect(failRes.success).toBe(false);
    expect(failRes.remaining.length).toBe(1);
  });
});
