import { ControlType, SemanticFieldType, FieldDescriptor, ClassificationSource } from './taxonomy';

/**
 * Session Lifecycle States
 * Conforms to Architecture.md State Model
 */
export type SessionState =
  | 'DISCOVERING'
  | 'ANALYZING'
  | 'READY'
  | 'FILLING'
  | 'VERIFYING'
  | 'NEEDS_USER'
  | 'PAUSED_SECURITY'
  | 'COMPLETED_REVIEW'
  | 'SUBMITTED_BY_USER'
  | 'FAILED_RECOVERABLE'
  | 'FAILED_TERMINAL';

export interface FilledFieldRecord {
  fieldId: string;
  fieldSignature: string;
  semanticType: SemanticFieldType;
  controlType: ControlType;
  attemptedValue: string | string[] | boolean;
  verifiedValue: string | string[] | boolean;
  verified: boolean;
  verificationMessage?: string;
  strategyUsed: string;
  confidence: number;
  source: ClassificationSource;
  timestamp: string;
}

export interface UnresolvedFieldRecord {
  field: FieldDescriptor;
  semanticType?: SemanticFieldType;
  confidence?: number;
  reason: string;
  userActionRequired: string;
}

export interface UserCorrectionRecord {
  fieldSignature: string;
  domain: string;
  originalInference?: SemanticFieldType;
  correctedSemanticType: SemanticFieldType;
  appliedValue: string | string[] | boolean;
  timestamp: string;
}

export interface ApplicationSession {
  id: string;
  jobId?: string;
  tabId: number;
  url: string;
  domain: string;
  status: SessionState;
  pageState: Record<string, unknown>;
  filledFields: FilledFieldRecord[];
  pendingFields: FieldDescriptor[];
  unresolvedFields: UnresolvedFieldRecord[];
  securityTrigger?: {
    type: 'captcha' | 'otp' | 'payment' | 'password';
    message: string;
    timestamp: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface FieldMapping {
  id: string;
  domain: string;
  pathPattern: string;
  fieldSignature: string;
  semanticType: SemanticFieldType;
  controlType: ControlType;
  confidence: number;
  source: 'user_confirmed' | 'auto_learned';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  url: string;
  domain: string;
  company: string;
  title: string;
  location: string;
  description: string;
  requirements: string[];
  skills: string[];
  responsibilities?: string[];
  educationRequirements?: string[];
  experienceRequirements?: string[];
  certifications?: string[];
  applicationQuestions?: string[];
  source: 'page' | 'manual';
  capturedAt: string;
}

export interface ApplicationAnswer {
  id: string;
  question: string;
  answer: string;
  sourceRefs: string[];
  groundingStatus: 'passed' | 'failed' | 'needs_review';
  unsupportedClaims?: string[];
  approved: boolean;
  inserted: boolean;
  createdAt: string;
}

export interface CoverLetter {
  id: string;
  jobId?: string;
  content: string;
  tone: string;
  length: string;
  sourceRefs: string[];
  groundingStatus: 'passed' | 'failed' | 'needs_review';
  unsupportedClaims?: string[];
  approved: boolean;
  createdAt: string;
}
