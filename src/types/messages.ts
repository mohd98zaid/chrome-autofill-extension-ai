import { FieldDescriptor } from './taxonomy';

export type ExtensionMessageType =
  | 'CONTENT_PAGE_SCANNED'
  | 'CONTENT_FIELD_FILLED'
  | 'CONTENT_SECURITY_DETECTED'
  | 'CONTENT_DOM_MUTATION'
  | 'CONTENT_NAVIGATED'
  | 'CONTENT_GENERATE_AND_SAVE_ANSWER'
  | 'BG_TRIGGER_SCAN'
  | 'BG_TRIGGER_FILL'
  | 'BG_HIGHLIGHT_FIELD'
  | 'BG_INSERT_COVER_LETTER'
  | 'BG_EXTRACT_PAGE_VALUES'
  | 'BG_DISMISS_SECURITY'
  | 'BG_PAUSE'
  | 'BG_RESUME'
  | 'UI_GET_SESSION'
  | 'UI_START_AUTOFILL'
  | 'UI_PAUSE_AUTOFILL'
  | 'UI_GET_PROFILE'
  | 'UI_GET_PROFILES'
  | 'UI_SET_ACTIVE_PROFILE'
  | 'UI_UPDATE_PROFILE'
  | 'UI_DELETE_PROFILE'
  | 'UI_SAVE_QA'
  | 'UI_DELETE_QA'
  | 'UI_SAVE_PAGE_INPUTS_TO_PROFILE'
  | 'UI_GET_SETTINGS'
  | 'BG_EXTRACT_JOB_DETAILS'
  | 'UI_UPDATE_SETTINGS'
  | 'UI_SAVE_MAPPING'
  | 'UI_DELETE_MAPPING'
  | 'UI_GET_MAPPINGS'
  | 'UI_GENERATE_COVER_LETTER'
  | 'UI_GENERATE_ANSWER'
  | 'UI_EXTRACT_JD'
  | 'UI_PARSE_RESUME'
  | 'UI_DISMISS_SECURITY'
  | 'AI_CLASSIFY_FIELD_REQUEST';

export interface ExtensionMessage<T = unknown> {
  type: ExtensionMessageType;
  payload?: T;
  source: 'content' | 'background' | 'popup' | 'options' | 'review';
  tabId?: number;
  correlationId?: string;
  timestamp: string;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PageScannedPayload {
  url: string;
  domain: string;
  title: string;
  fields: FieldDescriptor[];
  isJobDescriptionPresent: boolean;
  jobDetails?: {
    title: string;
    company: string;
    location?: string;
    description?: string;
  };
}

export interface TriggerFillPayload {
  fieldIds?: string[];
  forceAll?: boolean;
}
