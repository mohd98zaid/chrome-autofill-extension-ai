import { FieldDescriptor, SemanticFieldType } from '../../types/taxonomy';
import { UserProfile } from '../../types/profile';
import { calculateTotalExperience } from '../../utils/experience-calculator';

export interface ResolveFieldOptions {
  semanticType: SemanticFieldType;
  field: FieldDescriptor;
  profile: UserProfile;
  sectionIndex?: number;
  sectionHeading?: string;
  applicationContext?: Record<string, unknown>;
}

export interface ResolveFieldResult {
  status: 'RESOLVED' | 'UNKNOWN' | 'NEEDS_USER';
  value?: string | string[] | boolean;
  source?: string;
  confidence?: number;
  reason?: string;
}

/**
 * Centralized Field Value Resolver (Rule 31)
 * Maps profile data to semantic field types without inventing or fabricating data.
 * If data is unavailable or requires user judgment, returns UNKNOWN or NEEDS_USER.
 */
export function resolveFieldValue(options: ResolveFieldOptions): ResolveFieldResult {
  const { semanticType, field, profile } = options;
  const sectionIdx = options.sectionIndex ?? 0;

  switch (semanticType) {
    case 'first_name': {
      const val = profile.identity.firstName?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.identity', confidence: 1.0 };
      return { status: 'NEEDS_USER', reason: 'First name not configured in profile' };
    }

    case 'last_name': {
      const val = profile.identity.lastName?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.identity', confidence: 1.0 };
      return { status: 'NEEDS_USER', reason: 'Last name not configured in profile' };
    }

    case 'full_name': {
      const val = profile.identity.fullName?.trim() || `${profile.identity.firstName || ''} ${profile.identity.lastName || ''}`.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.identity', confidence: 1.0 };
      return { status: 'NEEDS_USER', reason: 'Full name not configured in profile' };
    }

    case 'email': {
      const val = profile.identity.email?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.identity', confidence: 1.0 };
      return { status: 'NEEDS_USER', reason: 'Email not configured in profile' };
    }

    case 'phone': {
      const val = profile.identity.phone?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.identity', confidence: 1.0 };
      return { status: 'NEEDS_USER', reason: 'Phone number not configured in profile' };
    }

    case 'phone_device_type': {
      // Only resolve if candidate has a phone number
      if (profile.identity.phone?.trim()) {
        return { status: 'RESOLVED', value: 'Mobile', source: 'profile.identity', confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: 'No phone configured' };
    }

    case 'phone_extension': {
      return { status: 'UNKNOWN', reason: 'Phone extension not provided' };
    }

    case 'salutation': {
      // Rule 32: Do not assume "Mr."
      return { status: 'UNKNOWN', reason: 'Salutation not specified in profile' };
    }

    case 'address': {
      const val = profile.location.addressLine?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.location', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'Address not configured in profile' };
    }

    case 'city': {
      const isWorkContext = isExperienceSection(field, options.sectionHeading);
      if (isWorkContext && profile.experiences[sectionIdx]?.location) {
        return { status: 'RESOLVED', value: profile.experiences[sectionIdx].location, source: 'profile.experience', confidence: 0.95 };
      }
      const val = profile.location.city?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.location', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'City not configured in profile' };
    }

    case 'state': {
      const val = profile.location.state?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.location', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'State not configured in profile' };
    }

    case 'zip_code': {
      const val = profile.location.zipCode?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.location', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'Zip code not configured in profile' };
    }

    case 'country': {
      const val = profile.location.country?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.location', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'Country not configured in profile' };
    }

    case 'linkedin': {
      const val = profile.links.linkedin?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.links', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'LinkedIn URL not configured in profile' };
    }

    case 'github': {
      const val = profile.links.github?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.links', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'GitHub URL not configured in profile' };
    }

    case 'portfolio': {
      const val = profile.links.portfolio?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.links', confidence: 1.0 };
      return { status: 'UNKNOWN', reason: 'Portfolio URL not configured in profile' };
    }

    // Work Experience (Multi-Instance Aware: Rule 30)
    case 'current_company': {
      const exp = profile.experiences[sectionIdx];
      if (exp?.company) {
        return { status: 'RESOLVED', value: exp.company, source: `profile.experiences[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: `No experience record found for section ${sectionIdx}` };
    }

    case 'current_title': {
      const exp = profile.experiences[sectionIdx];
      if (exp?.title) {
        return { status: 'RESOLVED', value: exp.title, source: `profile.experiences[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: `No title found for section ${sectionIdx}` };
    }

    case 'currently_work_here': {
      const exp = profile.experiences[sectionIdx];
      if (exp !== undefined) {
        return { status: 'RESOLVED', value: Boolean(exp.current), source: `profile.experiences[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: 'No experience record found' };
    }

    case 'start_date': {
      if (isEducationSection(field, options.sectionHeading)) {
        const edu = profile.education[sectionIdx];
        if (edu?.startDate) {
          return { status: 'RESOLVED', value: edu.startDate, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
        }
      } else {
        const exp = profile.experiences[sectionIdx];
        if (exp?.startDate) {
          return { status: 'RESOLVED', value: exp.startDate, source: `profile.experiences[${sectionIdx}]`, confidence: 0.95 };
        }
      }
      return { status: 'UNKNOWN', reason: 'Start date not found in profile' };
    }

    case 'end_date': {
      if (isEducationSection(field, options.sectionHeading)) {
        const edu = profile.education[sectionIdx];
        if (edu?.endDate) {
          return { status: 'RESOLVED', value: edu.endDate, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
        }
      } else {
        const exp = profile.experiences[sectionIdx];
        if (exp) {
          const val = exp.current ? 'Present' : exp.endDate || null;
          if (val) return { status: 'RESOLVED', value: val, source: `profile.experiences[${sectionIdx}]`, confidence: 0.95 };
        }
      }
      return { status: 'UNKNOWN', reason: 'End date not found in profile' };
    }

    case 'job_description': {
      const exp = profile.experiences[sectionIdx];
      if (exp?.description) {
        return { status: 'RESOLVED', value: exp.description, source: `profile.experiences[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: 'Job description not found in profile' };
    }

    // Experience Calculation (Rule 6: from dates, non-overlapping, no guessing)
    case 'years_experience': {
      const calc = calculateTotalExperience(profile.experiences);
      if (calc !== null) {
        return { status: 'RESOLVED', value: calc.yearsString, source: 'experience_calculator', confidence: 0.95 };
      }
      return { status: 'NEEDS_USER', reason: 'Experience dates are incomplete or unverified; cannot calculate total years safely' };
    }

    // High Impact Fields (Rule 7, 8, 19: NEVER assume Yes/No/Citizen/Salary)
    case 'work_authorization': {
      const val = profile.preferences.workAuthorization?.trim();
      if (val) {
        return { status: 'RESOLVED', value: val, source: 'profile.preferences.workAuthorization', confidence: 1.0 };
      }
      return { status: 'NEEDS_USER', reason: 'Work authorization status requires explicit user configuration' };
    }

    case 'visa_status': {
      const val = profile.preferences.visaStatus?.trim();
      if (val) {
        return { status: 'RESOLVED', value: val, source: 'profile.preferences.visaStatus', confidence: 1.0 };
      }
      return { status: 'NEEDS_USER', reason: 'Visa status requires explicit user configuration' };
    }

    case 'sponsorship': {
      if (typeof profile.preferences.requiresSponsorship === 'boolean') {
        const val = profile.preferences.requiresSponsorship ? 'Yes' : 'No';
        return { status: 'RESOLVED', value: val, source: 'profile.preferences.requiresSponsorship', confidence: 1.0 };
      }
      return { status: 'NEEDS_USER', reason: 'Sponsorship preference requires explicit user configuration' };
    }

    case 'salary': {
      const val = profile.preferences.desiredSalary?.trim();
      if (val) {
        return { status: 'RESOLVED', value: val, source: 'profile.preferences.desiredSalary', confidence: 1.0 };
      }
      return { status: 'NEEDS_USER', reason: 'Salary expectations require explicit user configuration' };
    }

    case 'notice_period': {
      if (profile.preferences.noticePeriodDays > 0) {
        return { status: 'RESOLVED', value: `${profile.preferences.noticePeriodDays} days`, source: 'profile.preferences', confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: 'Notice period not configured' };
    }

    case 'relocation': {
      if (typeof profile.preferences.willingToRelocate === 'boolean') {
        return { status: 'RESOLVED', value: profile.preferences.willingToRelocate ? 'Yes' : 'No', source: 'profile.preferences', confidence: 1.0 };
      }
      return { status: 'NEEDS_USER', reason: 'Relocation willingness requires explicit user configuration' };
    }

    case 'criminal_record':
    case 'legal_question':
    case 'security_question': {
      // Must never be filled automatically by AI or heuristics
      return { status: 'NEEDS_USER', reason: 'Legal and security questions require manual candidate review' };
    }

    // Skills
    case 'skills': {
      if (!profile.skills || profile.skills.length === 0) {
        return { status: 'UNKNOWN', reason: 'No skills found in profile' };
      }
      if (field.controlType === 'tag_input') {
        return { status: 'RESOLVED', value: profile.skills.map((s) => s.canonicalName), source: 'profile.skills', confidence: 0.95 };
      }
      return { status: 'RESOLVED', value: profile.skills.map((s) => s.canonicalName).join(', '), source: 'profile.skills', confidence: 0.95 };
    }

    // Education (Multi-Instance Aware)
    case 'school': {
      const edu = profile.education[sectionIdx];
      if (edu?.institution) {
        return { status: 'RESOLVED', value: edu.institution, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: `No institution found for education section ${sectionIdx}` };
    }

    case 'degree': {
      const edu = profile.education[sectionIdx];
      if (edu?.degree) {
        return { status: 'RESOLVED', value: edu.degree, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: `No degree found for education section ${sectionIdx}` };
    }

    case 'education': {
      const edu = profile.education[sectionIdx];
      const text = `${field.labelText || ''} ${field.name || ''} ${field.domId || ''}`.toLowerCase();
      if (/school|university|college|institution|academy/.test(text) && !/degree/.test(text)) {
        if (edu?.institution) return { status: 'RESOLVED', value: edu.institution, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
      }
      if (/field|major|study|subject/.test(text)) {
        const majorVal = edu?.field || edu?.degree;
        if (majorVal) return { status: 'RESOLVED', value: majorVal, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
      }
      if (edu?.degree) {
        return { status: 'RESOLVED', value: edu.degree, source: `profile.education[${sectionIdx}]`, confidence: 0.95 };
      }
      return { status: 'UNKNOWN', reason: 'Education data not found in profile' };
    }

    case 'language_fluency':
    case 'language_proficiency': {
      // Rule 32: Do not assume Fluent without explicit profile evidence
      return { status: 'UNKNOWN', reason: 'Language proficiency not explicitly recorded in profile' };
    }

    case 'cover_letter': {
      const val = profile.summary?.trim();
      if (val) return { status: 'RESOLVED', value: val, source: 'profile.summary', confidence: 0.90 };
      return { status: 'UNKNOWN', reason: 'Profile summary is empty' };
    }

    default:
      return { status: 'UNKNOWN', reason: `Unrecognized semantic type: ${semanticType}` };
  }
}

function isExperienceSection(field: FieldDescriptor, sectionHeading?: string): boolean {
  const text = `${field.sectionHeading || ''} ${sectionHeading || ''} ${field.nearbyText || ''} ${field.labelText || ''}`.toLowerCase();
  return /experience|work\s*history|employment|employer|job\s*details/.test(text);
}

function isEducationSection(field: FieldDescriptor, sectionHeading?: string): boolean {
  const text = `${field.sectionHeading || ''} ${sectionHeading || ''} ${field.nearbyText || ''} ${field.labelText || ''}`.toLowerCase();
  return /education|school|degree|academic|university|college/.test(text);
}
