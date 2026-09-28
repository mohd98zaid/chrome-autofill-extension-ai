import { openDB, IDBPDatabase } from 'idb';
import {
  UserProfile,
  ProfileSchema,
  Skill,
  Settings,
  SettingsSchema,
  ResumeRecord,
  ResumeSchema
} from '../types/profile';
import {
  ApplicationSession,
  FieldMapping
} from '../types/session';
import { logger } from '../utils/logger';

const DB_NAME = 'ai_job_assistant_db';
const DB_VERSION = 1;

const DEFAULT_PROFILE: UserProfile = {
  id: 'profile_default',
  version: 1,
  identity: {
    firstName: 'Mohammad',
    lastName: 'Zaid',
    fullName: 'Mohammad Zaid',
    email: 'mohd98zaid@gmail.com',
    phone: '+91 8726196645'
  },
  location: {
    addressLine: '',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    country: 'India',
    zipCode: '226001'
  },
  summary: 'GenAI Architect & AI Engineer with 5.8+ years at Tata Consultancy Services (TCS), specializing in production-grade LLM systems, agentic pipelines, and RAG architectures for enterprise clients across Healthcare and BFSI. Hands-on with LangChain, LangGraph, Claude AI, FastAPI, and cloud AI platforms (Azure OpenAI, AWS Bedrock). Open to Senior GenAI Architect / Agentic AI Engineering Lead roles across the GCC region.',
  links: {
    linkedin: 'https://linkedin.com/in/mohd98zaid',
    github: 'https://github.com/mohd98zaid',
    portfolio: 'https://mohd98zaid.netlify.app/'
  },
  skills: [
    { id: 'skill_1', canonicalName: 'Python', aliases: ['Python 3'], proficiency: 'expert', years: 6, source: ['resume'], verified: true },
    { id: 'skill_2', canonicalName: 'LangChain', aliases: [], proficiency: 'expert', years: 4, source: ['resume'], verified: true },
    { id: 'skill_3', canonicalName: 'LangGraph', aliases: [], proficiency: 'expert', years: 3, source: ['resume'], verified: true },
    { id: 'skill_4', canonicalName: 'FastAPI', aliases: [], proficiency: 'advanced', years: 4, source: ['resume'], verified: true },
    { id: 'skill_5', canonicalName: 'Azure OpenAI', aliases: [], proficiency: 'advanced', years: 3, source: ['resume'], verified: true },
    { id: 'skill_6', canonicalName: 'AWS Bedrock', aliases: [], proficiency: 'advanced', years: 3, source: ['resume'], verified: true },
    { id: 'skill_7', canonicalName: 'React', aliases: ['React.js'], proficiency: 'advanced', years: 4, source: ['resume'], verified: true },
    { id: 'skill_8', canonicalName: 'TypeScript', aliases: [], proficiency: 'advanced', years: 3, source: ['resume'], verified: true },
    { id: 'skill_9', canonicalName: 'Prompt Engineering', aliases: [], proficiency: 'expert', years: 4, source: ['resume'], verified: true },
    { id: 'skill_10', canonicalName: 'RAG', aliases: ['Retrieval Augmented Generation'], proficiency: 'expert', years: 4, source: ['resume'], verified: true },
    { id: 'skill_11', canonicalName: 'Agentic Workflows', aliases: [], proficiency: 'expert', years: 3, source: ['resume'], verified: true },
    { id: 'skill_12', canonicalName: 'Docker', aliases: [], proficiency: 'intermediate', years: 4, source: ['resume'], verified: true },
    { id: 'skill_13', canonicalName: 'PostgreSQL', aliases: ['Postgres'], proficiency: 'intermediate', years: 4, source: ['resume'], verified: true },
    { id: 'skill_14', canonicalName: 'SQL', aliases: [], proficiency: 'advanced', years: 5, source: ['resume'], verified: true }
  ],
  experiences: [
    {
      id: 'exp_1',
      company: 'Tata Consultancy Services',
      title: 'System Engineer (GenAI Architect & Team Lead)',
      startDate: '2021-04',
      endDate: '',
      current: true,
      location: 'New Delhi, India',
      description: 'Architected enterprise AI applications that auto-generate business logic from code flow diagrams using LangChain and Python, cutting manual analysis time by ~50%. Designed production RAG pipelines with vector stores (FAISS) and LLMs.',
      skills: ['Python', 'LangChain', 'LangGraph', 'Claude AI', 'RAG'],
      achievements: ['Reduced manual analysis time by ~50%', 'Reduced documentation overhead by ~60%'],
      verified: true
    }
  ],
  education: [
    {
      id: 'edu_1',
      institution: 'Dr. APJ Abdul Kalam Technical University',
      degree: 'B. Tech',
      field: 'Computer Science & Engineering',
      startDate: '2015-08',
      endDate: '2019-06',
      verified: true
    }
  ],
  certifications: [
    { id: 'cert_1', name: 'LangChain for LLM Application Development', issuer: 'DeepLearning.AI', issueDate: '2023', verified: true },
    { id: 'cert_2', name: 'Building Systems with the ChatGPT API', issuer: 'DeepLearning.AI', issueDate: '2023', verified: true },
    { id: 'cert_3', name: 'Microsoft Certified: Azure AI Fundamentals', issuer: 'Microsoft', issueDate: '2023', verified: true }
  ],
  projects: [],
  preferences: {
    workAuthorization: 'Open to Sponsorship',
    visaStatus: 'Open to Sponsorship',
    requiresSponsorship: true,
    noticePeriodDays: 15,
    desiredSalary: '',
    willingToRelocate: true,
    remotePreference: 'any'
  },
  verifiedFacts: [],
  customQA: [],
  updatedAt: new Date().toISOString()
};

const SECOND_PROFILE: UserProfile = {
  ...DEFAULT_PROFILE,
  id: 'profile_ai_engineer',
  summary: 'Senior Agentic AI & LLM Engineer with 5.8+ years developing end-to-end production LLM systems, custom agent frameworks, and high-throughput microservices using LangChain, LangGraph, Claude AI, and FastAPI.',
  experiences: [
    {
      ...DEFAULT_PROFILE.experiences[0],
      id: 'exp_ai_eng_1',
      title: 'Senior Agentic AI & LLM Engineer'
    }
  ]
};

const DEFAULT_SETTINGS: Settings = {
  aiEnabled: true,
  aiProvider: 'gemini',
  aiApiKey: '',
  aiModelName: 'gemini-flash-lite-latest',
  autoFillThreshold: 0.90,
  reviewThreshold: 0.70,
  storeHistory: false,
  allowCloudAI: true,
  preferredTone: 'professional',
  schemaVersion: 1
};

export function deduplicateSkills(skills: Skill[]): Skill[] {
  const seen = new Map<string, Skill>();
  for (const skill of skills) {
    if (!skill?.canonicalName) continue;
    const key = skill.canonicalName.trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, { ...skill, canonicalName: skill.canonicalName.trim() });
    } else {
      const existing = seen.get(key)!;
      if (skill.verified) existing.verified = true;
      if (typeof skill.years === 'number' && (!existing.years || skill.years > existing.years)) {
        existing.years = skill.years;
      }
      const profOrder: Record<string, number> = { expert: 4, advanced: 3, intermediate: 2, beginner: 1 };
      if ((profOrder[skill.proficiency] || 0) > (profOrder[existing.proficiency] || 0)) {
        existing.proficiency = skill.proficiency;
      }
      const allAliases = new Set([...(existing.aliases || []), ...(skill.aliases || [])]);
      existing.aliases = Array.from(allAliases).filter((a) => a.toLowerCase() !== key);
    }
  }
  return Array.from(seen.values());
}

export function deduplicateExperiences(exps: UserProfile['experiences']): UserProfile['experiences'] {
  const seen = new Set<string>();
  const result: UserProfile['experiences'] = [];
  for (const exp of exps || []) {
    const key = `${(exp.company || '').trim().toLowerCase()}_${(exp.title || '').trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(exp);
    }
  }
  return result;
}

export function deduplicateEducation(edus: UserProfile['education']): UserProfile['education'] {
  const seen = new Set<string>();
  const result: UserProfile['education'] = [];
  for (const edu of edus || []) {
    const key = `${(edu.institution || '').trim().toLowerCase()}_${(edu.degree || '').trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(edu);
    }
  }
  return result;
}

export class StorageService {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private memoryStore: Map<string, unknown> = new Map();

  private isChromeStorageAvailable(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.storage?.local;
  }

  private isIndexedDBAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private async getDB(): Promise<IDBPDatabase> {
    if (!this.isIndexedDBAvailable()) {
      throw new Error('IndexedDB is not supported in this environment');
    }

    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, _tx) {
          logger.info('Storage', `Upgrading IndexedDB from v${oldVersion} to v${DB_VERSION}`);
          if (!db.objectStoreNames.contains('profiles')) {
            db.createObjectStore('profiles', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('resumes')) {
            db.createObjectStore('resumes', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('mappings')) {
            const mapStore = db.createObjectStore('mappings', { keyPath: 'id' });
            mapStore.createIndex('by_domain', 'domain');
            mapStore.createIndex('by_signature', 'fieldSignature');
          }
          if (!db.objectStoreNames.contains('jobs')) {
            db.createObjectStore('jobs', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('sessions')) {
            const sessStore = db.createObjectStore('sessions', { keyPath: 'id' });
            sessStore.createIndex('by_tabId', 'tabId');
          }
          if (!db.objectStoreNames.contains('answers')) {
            db.createObjectStore('answers', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('cover_letters')) {
            db.createObjectStore('cover_letters', { keyPath: 'id' });
          }
        }
      });
    }
    return this.dbPromise;
  }

  // --- Settings (Chrome Storage or Memory) ---

  public async getSettings(): Promise<Settings> {
    try {
      if (this.isChromeStorageAvailable()) {
        const result = await chrome.storage.local.get('settings');
        if (result.settings) {
          return SettingsSchema.parse(result.settings);
        }
      } else {
        const mem = this.memoryStore.get('settings');
        if (mem) return SettingsSchema.parse(mem);
      }
    } catch (err) {
      logger.error('Storage', 'Error reading settings, returning defaults', { error: String(err) });
    }
    return DEFAULT_SETTINGS;
  }

  public async saveSettings(settings: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const updated = SettingsSchema.parse({ ...current, ...settings });

    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ settings: updated });
    } else {
      this.memoryStore.set('settings', updated);
    }
    logger.info('Storage', 'Settings updated');
    return updated;
  }

  // --- Profiles & Multiple CV Management ---

  public async getActiveProfileId(): Promise<string> {
    try {
      if (this.isChromeStorageAvailable()) {
        const res = (await chrome.storage.local.get('active_profile_id')) as { active_profile_id?: string };
        if (typeof res.active_profile_id === 'string' && res.active_profile_id) return res.active_profile_id;
      }
    } catch {
      // fallback
    }
    return 'profile_default';
  }

  public async setActiveProfileId(id: string): Promise<void> {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ active_profile_id: id });
    }
    const profile = await this.getProfile(id);
    if (profile && this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ user_profile: profile });
    }
    logger.info('Storage', `Switched active CV profile to ${id}`);
  }

  public async getProfiles(): Promise<UserProfile[]> {
    try {
      if (this.isChromeStorageAvailable()) {
        const res = await chrome.storage.local.get(['cv_profiles', 'user_profile']);
        if (Array.isArray(res.cv_profiles) && res.cv_profiles.length > 0) {
          return res.cv_profiles.map((p) => {
            const parsed = ProfileSchema.parse(p);
            parsed.skills = deduplicateSkills(parsed.skills || []);
            parsed.experiences = deduplicateExperiences(parsed.experiences || []);
            parsed.education = deduplicateEducation(parsed.education || []);
            return parsed;
          });
        }
      }
    } catch (err) {
      logger.error('Storage', 'Error reading profiles list', { error: String(err) });
    }

    let initialProfile = DEFAULT_PROFILE;
    if (this.isChromeStorageAvailable()) {
      const res = await chrome.storage.local.get('user_profile');
      if (res.user_profile) {
        try {
          initialProfile = ProfileSchema.parse(res.user_profile);
        } catch {
          initialProfile = DEFAULT_PROFILE;
        }
      }
    }
    const defaultList = [initialProfile];
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ cv_profiles: defaultList });
    }
    return defaultList;
  }

  public async deleteProfile(profileId: string): Promise<{ success: boolean; remaining: UserProfile[] }> {
    try {
      const profiles = await this.getProfiles();
      const filtered = profiles.filter((p) => p.id !== profileId);
      if (filtered.length === 0) {
        return { success: false, remaining: profiles };
      }

      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ cv_profiles: filtered });
        const activeId = await this.getActiveProfileId();
        if (activeId === profileId) {
          const nextActive = filtered[0];
          await this.setActiveProfileId(nextActive.id);
        }
      }

      if (this.isIndexedDBAvailable()) {
        try {
          const db = await this.getDB();
          await db.delete('profiles', profileId);
        } catch (e) {
          logger.warn('Storage', 'IndexedDB delete warning', { error: String(e) });
        }
      } else {
        this.memoryStore.delete(profileId);
      }

      logger.info('Storage', `Deleted profile ${profileId}. Remaining count: ${filtered.length}`);
      return { success: true, remaining: filtered };
    } catch (err) {
      logger.error('Storage', 'Failed to delete profile', { error: String(err) });
      return { success: false, remaining: [] };
    }
  }

  public async getProfile(profileId?: string): Promise<UserProfile> {
    try {
      const targetId = profileId || (await this.getActiveProfileId());

      // 1. Try Chrome Storage Local cv_profiles
      if (this.isChromeStorageAvailable()) {
        const res = await chrome.storage.local.get(['cv_profiles', 'user_profile']);
        if (Array.isArray(res.cv_profiles) && res.cv_profiles.length > 0) {
          const found = res.cv_profiles.find((p: any) => p.id === targetId);
          if (found) {
            const parsed = ProfileSchema.parse(found);
            parsed.skills = deduplicateSkills(parsed.skills || []);
            parsed.experiences = deduplicateExperiences(parsed.experiences || []);
            parsed.education = deduplicateEducation(parsed.education || []);
            return parsed;
          }
        }
        if (res.user_profile && (!profileId || (res.user_profile as any).id === targetId)) {
          const parsed = ProfileSchema.parse(res.user_profile);
          parsed.skills = deduplicateSkills(parsed.skills || []);
          parsed.experiences = deduplicateExperiences(parsed.experiences || []);
          parsed.education = deduplicateEducation(parsed.education || []);
          return parsed;
        }
      }

      // 2. Try IndexedDB
      if (this.isIndexedDBAvailable()) {
        try {
          const db = await this.getDB();
          const profile = await db.get('profiles', targetId) || (await db.get('profiles', 'profile_default'));
          if (profile) {
            const parsed = ProfileSchema.parse(profile);
            parsed.skills = deduplicateSkills(parsed.skills || []);
            parsed.experiences = deduplicateExperiences(parsed.experiences || []);
            parsed.education = deduplicateEducation(parsed.education || []);
            if (this.isChromeStorageAvailable()) {
              await chrome.storage.local.set({ user_profile: parsed });
            }
            return parsed;
          }
        } catch (dbErr) {
          logger.warn('Storage', 'IndexedDB read failed, checking memory store', { error: String(dbErr) });
        }
      } else {
        const mem = this.memoryStore.get(targetId) || this.memoryStore.get('profile_default');
        if (mem) {
          const parsed = ProfileSchema.parse(mem);
          parsed.skills = deduplicateSkills(parsed.skills || []);
          parsed.experiences = deduplicateExperiences(parsed.experiences || []);
          parsed.education = deduplicateEducation(parsed.education || []);
          return parsed;
        }
      }
    } catch (err) {
      logger.error('Storage', 'Error reading profile, returning defaults', { error: String(err) });
    }
    return DEFAULT_PROFILE;
  }

  public async saveProfile(profile: UserProfile): Promise<void> {
    const validated = ProfileSchema.parse({
      ...profile,
      skills: deduplicateSkills(profile.skills || []),
      experiences: deduplicateExperiences(profile.experiences || []),
      education: deduplicateEducation(profile.education || []),
      updatedAt: new Date().toISOString()
    });

    // 1. Save to Chrome Storage Local (both as user_profile and inside cv_profiles list)
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ user_profile: validated });
      try {
        const res = await chrome.storage.local.get('cv_profiles');
        const profilesList: UserProfile[] = Array.isArray(res.cv_profiles) ? res.cv_profiles : [DEFAULT_PROFILE, SECOND_PROFILE];
        const existingIdx = profilesList.findIndex((p) => p.id === validated.id);
        if (existingIdx >= 0) {
          profilesList[existingIdx] = validated;
        } else {
          profilesList.push(validated);
        }
        await chrome.storage.local.set({ cv_profiles: profilesList });
      } catch (e) {
        logger.warn('Storage', 'Failed to update cv_profiles list', { error: String(e) });
      }
    }

    // 2. Save to IndexedDB (as redundant local backup)
    if (this.isIndexedDBAvailable()) {
      try {
        const db = await this.getDB();
        await db.put('profiles', validated);
      } catch (err) {
        logger.warn('Storage', 'IndexedDB write warning', { error: String(err) });
      }
    } else {
      this.memoryStore.set(validated.id, validated);
    }
    logger.info('Storage', 'Profile saved successfully', { id: validated.id });
  }

  // --- Mappings ---

  public async getMappings(domain?: string): Promise<FieldMapping[]> {
    if (!this.isIndexedDBAvailable()) {
      const all = Array.from(this.memoryStore.values()).filter(
        (v): v is FieldMapping => typeof v === 'object' && v !== null && 'fieldSignature' in v
      );
      return domain ? all.filter((m) => m.domain === domain) : all;
    }

    const db = await this.getDB();
    if (domain) {
      const tx = db.transaction('mappings', 'readonly');
      const index = tx.store.index('by_domain');
      return index.getAll(domain);
    }
    return db.getAll('mappings');
  }

  public async findMapping(domain: string, signature: string): Promise<FieldMapping | null> {
    const mappings = await this.getMappings(domain);
    return mappings.find((m) => m.fieldSignature === signature) || null;
  }

  public async saveMapping(mapping: FieldMapping): Promise<void> {
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      await db.put('mappings', mapping);
    } else {
      this.memoryStore.set(`map_${mapping.id}`, mapping);
    }
    logger.info('Storage', 'Field mapping saved', { domain: mapping.domain, signature: mapping.fieldSignature });
  }

  public async deleteMapping(id: string): Promise<void> {
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      await db.delete('mappings', id);
    } else {
      this.memoryStore.delete(`map_${id}`);
    }
  }

  // --- Resumes ---

  public async saveResume(resume: ResumeRecord): Promise<void> {
    const validated = ResumeSchema.parse(resume);
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      await db.put('resumes', validated);
    } else {
      this.memoryStore.set(`resume_${resume.id}`, validated);
    }
  }

  public async getResume(id: string): Promise<ResumeRecord | null> {
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      return (await db.get('resumes', id)) || null;
    }
    return (this.memoryStore.get(`resume_${id}`) as ResumeRecord) || null;
  }

  public async deleteResume(id: string): Promise<void> {
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      await db.delete('resumes', id);
    } else {
      this.memoryStore.delete(`resume_${id}`);
    }
  }

  // --- Sessions ---

  public async getSession(tabId: number): Promise<ApplicationSession | null> {
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      const tx = db.transaction('sessions', 'readonly');
      const index = tx.store.index('by_tabId');
      const sessions = await index.getAll(tabId);
      return sessions.length > 0 ? sessions[sessions.length - 1] : null;
    }
    const mem = this.memoryStore.get(`session_tab_${tabId}`);
    return (mem as ApplicationSession) || null;
  }

  public async saveSession(session: ApplicationSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      await db.put('sessions', session);
    } else {
      this.memoryStore.set(`session_tab_${session.tabId}`, session);
    }
  }

  // --- Reset All Data ---

  public async clearAllData(): Promise<void> {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.clear();
    }
    if (this.isIndexedDBAvailable()) {
      const db = await this.getDB();
      for (const store of db.objectStoreNames) {
        await db.clear(store);
      }
    }
    this.memoryStore.clear();
    logger.warn('Storage', 'All local extension data cleared');
  }
}

export const storage = new StorageService();
