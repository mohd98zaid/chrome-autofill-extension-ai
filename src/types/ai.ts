import { SemanticFieldType, ControlType, FieldOption } from './taxonomy';

export interface AIClassificationRequest {
  field: {
    controlType: ControlType;
    type?: string;
    name?: string;
    id?: string;
    placeholder?: string;
    ariaLabel?: string;
  };
  nearbyText?: string;
  sectionHeading?: string;
  options?: string[];
  candidateTypes?: SemanticFieldType[];
}

export interface AIClassificationResponse {
  semanticType: SemanticFieldType;
  confidence: number;
  evidence: string[];
  reason: string;
}

export interface AIMapOptionRequest {
  targetValue: string;
  semanticType: SemanticFieldType;
  options: FieldOption[];
  context?: string;
}

export interface AIMapOptionResponse {
  selectedOption: string;
  confidence: number;
  reason: string;
}

export interface AISkillMatchItem {
  jobSkill: string;
  profileSkill: string;
  matchType: 'exact' | 'explicit_alias' | 'inferred' | 'normalized';
  confidence: number;
}

export interface AISkillMatchRequest {
  jobSkills: string[];
  userSkills: string[];
  userExperienceSnippet?: string;
}

export interface AISkillMatchResponse {
  matches: AISkillMatchItem[];
  unmatched: string[];
  uncertain: string[];
}

export interface AIAnswerRequest {
  question: string;
  maxWords?: number;
  tone?: string;
  profileEvidence: string[];
  jdContext?: string;
}

export interface AIAnswerResponse {
  answer: string;
  groundingStatus: 'passed' | 'failed' | 'needs_review';
  unsupportedClaims: string[];
  sourceRefs: string[];
}

export interface AICoverLetterRequest {
  role: string;
  company: string;
  jdText: string;
  profileEvidence: string[];
  tone?: string;
  length?: 'short' | 'medium' | 'long';
}

export interface AICoverLetterResponse {
  coverLetter: string;
  groundingStatus: 'passed' | 'failed' | 'needs_review';
  unsupportedClaims: string[];
  sourceRefs: string[];
}

export interface AIGroundingRequest {
  textToAudit: string;
  approvedEvidence: string[];
}

export interface AIGroundingResponse {
  status: 'passed' | 'failed';
  unsupportedClaims: string[];
  potentiallyUnsupportedClaims: string[];
}

export interface AIJDExtractionRequest {
  rawPageText: string;
  pageTitle?: string;
  url?: string;
}

export interface AIJDExtractionResponse {
  company: string;
  title: string;
  location: string;
  employmentType: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  experienceRequirements: string[];
  educationRequirements: string[];
  certifications: string[];
  applicationQuestions: string[];
}

export interface AIResumeParseRequest {
  resumeText: string;
}

export interface AIResumeParseResponse {
  identity: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
  };
  location: {
    addressLine?: string;
    city: string;
    state?: string;
    country: string;
    zipCode?: string;
  };
  summary: string;
  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  skills: Array<{
    canonicalName: string;
    proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  }>;
  experiences: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    location: string;
    description: string;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }>;
}

/**
 * Common AI Provider Interface (Architecture.md Section 8)
 */
export interface AIProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  classifyField(request: AIClassificationRequest): Promise<AIClassificationResponse>;
  mapOption(request: AIMapOptionRequest): Promise<AIMapOptionResponse>;
  matchSkills(request: AISkillMatchRequest): Promise<AISkillMatchResponse>;
  generateAnswer(request: AIAnswerRequest): Promise<AIAnswerResponse>;
  generateCoverLetter(request: AICoverLetterRequest): Promise<AICoverLetterResponse>;
  validateGrounding(request: AIGroundingRequest): Promise<AIGroundingResponse>;
  extractJD(request: AIJDExtractionRequest): Promise<AIJDExtractionResponse>;
  parseResume(request: AIResumeParseRequest): Promise<AIResumeParseResponse>;
}
