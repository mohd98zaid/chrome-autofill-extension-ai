import { z } from 'zod';

/**
 * Safe helper preprocessors for LLM and JSON resilience
 */
const safeString = (defaultVal = '') =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return defaultVal;
    return typeof val === 'string' ? val : String(val);
  }, z.string().default(defaultVal));

const safeOptionalString = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return undefined;
  return typeof val === 'string' ? val : String(val);
}, z.string().optional());

const safeEmail = z.preprocess((val) => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  return s.toLowerCase() === 'null' || s.toLowerCase() === 'none' || s.toLowerCase() === 'n/a' ? '' : s;
}, z.string().email().or(z.literal('')).catch('').default(''));

/**
 * Skill Schema & Type
 */
export const SkillSchema = z.object({
  id: safeString(),
  canonicalName: z.preprocess((val) => (val === null || val === undefined ? '' : String(val).trim()), z.string().min(1)),
  aliases: z.preprocess((val) => (Array.isArray(val) ? val.filter((x) => typeof x === 'string') : []), z.array(z.string()).default([])),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'unknown']).catch('unknown').default('unknown'),
  years: z.preprocess((val) => (val === null || val === undefined || isNaN(Number(val)) ? null : Number(val)), z.number().nullable().default(null)),
  source: z.preprocess((val) => (Array.isArray(val) ? val.filter((x) => typeof x === 'string') : ['profile']), z.array(z.string()).default(['profile'])),
  verified: z.preprocess((val) => (val === null || val === undefined ? true : Boolean(val)), z.boolean().default(true))
});

export type Skill = z.infer<typeof SkillSchema>;

/**
 * Experience Schema & Type
 */
export const ExperienceSchema = z.object({
  id: safeString(),
  company: safeString(),
  title: safeString(),
  startDate: safeString(),
  endDate: safeString(),
  current: z.preprocess((val) => Boolean(val), z.boolean().default(false)),
  location: safeString(),
  description: safeString(),
  skills: z.preprocess((val) => (Array.isArray(val) ? val.filter((x) => typeof x === 'string') : []), z.array(z.string()).default([])),
  achievements: z.preprocess((val) => (Array.isArray(val) ? val.filter((x) => typeof x === 'string') : []), z.array(z.string()).default([])),
  verified: z.preprocess((val) => (val === null || val === undefined ? true : Boolean(val)), z.boolean().default(true))
});

export type Experience = z.infer<typeof ExperienceSchema>;

/**
 * Education Schema & Type
 */
export const EducationSchema = z.object({
  id: safeString(),
  institution: safeString(),
  degree: safeString(),
  field: safeString(),
  startDate: safeString(),
  endDate: safeString(),
  grade: safeOptionalString,
  verified: z.preprocess((val) => (val === null || val === undefined ? true : Boolean(val)), z.boolean().default(true))
});

export type Education = z.infer<typeof EducationSchema>;

/**
 * Certification Schema & Type
 */
export const CertificationSchema = z.object({
  id: safeString(),
  name: safeString(),
  issuer: safeString(),
  issueDate: safeString(),
  expiryDate: safeOptionalString,
  credentialId: safeOptionalString,
  credentialUrl: safeOptionalString,
  verified: z.preprocess((val) => (val === null || val === undefined ? true : Boolean(val)), z.boolean().default(true))
});

export type Certification = z.infer<typeof CertificationSchema>;

/**
 * Project Schema & Type
 */
export const ProjectSchema = z.object({
  id: safeString(),
  title: safeString(),
  description: safeString(),
  skills: z.preprocess((val) => (Array.isArray(val) ? val.filter((x) => typeof x === 'string') : []), z.array(z.string()).default([])),
  url: safeOptionalString,
  verified: z.preprocess((val) => (val === null || val === undefined ? true : Boolean(val)), z.boolean().default(true))
});

export type Project = z.infer<typeof ProjectSchema>;

/**
 * Identity Schema
 */
export const IdentitySchema = z.object({
  firstName: safeString(),
  lastName: safeString(),
  fullName: safeString(),
  email: safeEmail,
  phone: safeString()
});

export type Identity = z.infer<typeof IdentitySchema>;

/**
 * Location Schema
 */
export const LocationSchema = z.object({
  addressLine: safeString(),
  city: safeString(),
  state: safeString(),
  country: safeString(),
  zipCode: safeString()
});

export type ProfileLocation = z.infer<typeof LocationSchema>;

/**
 * Links Schema
 */
export const LinksSchema = z.object({
  linkedin: safeString(),
  github: safeString(),
  portfolio: safeString(),
  twitter: safeOptionalString,
  website: safeOptionalString
});

export type ProfileLinks = z.infer<typeof LinksSchema>;

/**
 * Preferences Schema
 */
export const PreferencesSchema = z.object({
  workAuthorization: safeString(''),
  visaStatus: safeString(''),
  requiresSponsorship: z.preprocess((val) => Boolean(val), z.boolean().default(false)),
  noticePeriodDays: z.preprocess((val) => (val === null || val === undefined || isNaN(Number(val)) ? 0 : Number(val)), z.number().default(0)),
  desiredSalary: safeString(),
  willingToRelocate: z.preprocess((val) => Boolean(val), z.boolean().default(false)),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']).catch('any').default('any')
});

export type ProfilePreferences = z.infer<typeof PreferencesSchema>;

/**
 * Custom Q&A Knowledge Bank Schema
 * Stores question-and-answer pairs learned in real-time by AI or provided by candidate
 */
export const CustomQASchema = z.object({
  id: safeString(),
  question: safeString(),
  answer: safeString(),
  tags: z.preprocess((val) => (Array.isArray(val) ? val.filter((x) => typeof x === 'string') : []), z.array(z.string()).default([])),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString())
});

export type CustomQA = z.infer<typeof CustomQASchema>;

/**
 * Complete User Profile Schema
 */
export const ProfileSchema = z.object({
  id: safeString('profile_default'),
  version: z.number().default(1),
  identity: IdentitySchema.default({
    firstName: '',
    lastName: '',
    fullName: '',
    email: '',
    phone: ''
  }),
  location: LocationSchema.default({
    addressLine: '',
    city: '',
    state: '',
    country: '',
    zipCode: ''
  }),
  summary: safeString(),
  links: LinksSchema.default({
    linkedin: '',
    github: '',
    portfolio: ''
  }),
  skills: z.array(SkillSchema).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  preferences: PreferencesSchema.default({
    workAuthorization: '',
    visaStatus: '',
    requiresSponsorship: false,
    noticePeriodDays: 0,
    desiredSalary: '',
    willingToRelocate: false,
    remotePreference: 'any'
  }),
  verifiedFacts: z.array(z.string()).default([]),
  customQA: z.preprocess((val) => (Array.isArray(val) ? val : []), z.array(CustomQASchema).default([])),
  updatedAt: z.string().default(() => new Date().toISOString())
});

export type UserProfile = z.infer<typeof ProfileSchema>;

/**
 * Resume Schema
 */
export const ResumeSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  contentHash: z.string(),
  extractedText: z.string(),
  version: z.number().default(1),
  source: z.literal('user_upload'),
  createdAt: z.string().default(() => new Date().toISOString())
});

export type ResumeRecord = z.infer<typeof ResumeSchema>;

/**
 * Global Settings Schema
 */
export const SettingsSchema = z.object({
  aiEnabled: z.boolean().default(true),
  aiProvider: z.enum(['local', 'mock', 'openai', 'gemini', 'anthropic', 'custom']).default('local'),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().optional(),
  aiModelName: z.string().optional(),
  autoFillThreshold: z.number().min(0).max(1).default(0.90),
  reviewThreshold: z.number().min(0).max(1).default(0.70),
  storeHistory: z.boolean().default(false),
  allowCloudAI: z.boolean().default(false),
  preferredTone: z.enum(['professional', 'enthusiastic', 'concise', 'technical']).default('professional'),
  schemaVersion: z.number().default(1)
});

export type Settings = z.infer<typeof SettingsSchema>;
