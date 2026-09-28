/**
 * Field Semantic Taxonomy & Control Types
 * Derived from Architecture.md & Database.md
 */

export type ControlType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'number'
  | 'select'
  | 'combobox'
  | 'searchable_select'
  | 'checkbox'
  | 'radio'
  | 'tag_input'
  | 'file'
  | 'custom_widget'
  | 'unknown';

export type SemanticFieldType =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zip_code'
  | 'country'
  | 'work_authorization'
  | 'visa_status'
  | 'current_company'
  | 'current_title'
  | 'years_experience'
  | 'education'
  | 'school'
  | 'degree'
  | 'job_description'
  | 'phone_device_type'
  | 'phone_extension'
  | 'language_proficiency'
  | 'language_fluency'
  | 'skills'
  | 'salary'
  | 'notice_period'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'cover_letter'
  | 'resume'
  | 'application_question'
  | 'start_date'
  | 'end_date'
  | 'currently_work_here'
  | 'salutation'
  | 'custom'
  | 'unknown';

export type ClassificationSource = 'deterministic' | 'ai' | 'user_confirmed' | 'known_mapping';

export type EvidenceType =
  | 'autocomplete'
  | 'label'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'name'
  | 'id'
  | 'placeholder'
  | 'nearby_text'
  | 'section_heading'
  | 'option_values'
  | 'known_mapping'
  | 'semantic_heuristic'
  | 'ai_classification';

export interface FieldOption {
  label: string;
  value: string;
  selected?: boolean;
}

export interface FieldDescriptor {
  id: string; // Unique transient session ID
  fieldSignature: string; // Stable hash computed from stable attributes
  controlType: ControlType;
  htmlType?: string;
  name?: string;
  domId?: string;
  placeholder?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  labelText?: string;
  nearbyText?: string;
  sectionHeading?: string;
  options?: FieldOption[];
  isVisible: boolean;
  isDisabled: boolean;
  isReadOnly: boolean;
  isRequired: boolean;
  currentValue: string | string[] | boolean | null;
  selector: string;
}

export interface FieldClassification {
  fieldId: string;
  semanticType: SemanticFieldType;
  confidence: number;
  evidence: string[];
  source: ClassificationSource;
  reason?: string;
}
