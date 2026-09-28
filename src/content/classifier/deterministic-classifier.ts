import { FieldDescriptor, FieldClassification, SemanticFieldType } from '../../types/taxonomy';
import { FieldMapping } from '../../types/session';

interface RuleMatch {
  semanticType: SemanticFieldType;
  confidence: number;
  evidence: string;
}

export class DeterministicClassifier {
  private knownMappings: Map<string, FieldMapping> = new Map();

  constructor(mappings: FieldMapping[] = []) {
    this.setKnownMappings(mappings);
  }

  public setKnownMappings(mappings: FieldMapping[]) {
    this.knownMappings.clear();
    for (const m of mappings) {
      this.knownMappings.set(m.fieldSignature, m);
    }
  }

  public classify(field: FieldDescriptor): FieldClassification {
    // 1. Check known confirmed mapping first (highest confidence: 0.99)
    const existingMapping = this.knownMappings.get(field.fieldSignature);
    if (existingMapping) {
      return {
        fieldId: field.id,
        semanticType: existingMapping.semanticType,
        confidence: Math.max(existingMapping.confidence, 0.98),
        evidence: ['known_mapping'],
        source: 'known_mapping',
        reason: 'User-confirmed or verified site mapping'
      };
    }

    const matches: RuleMatch[] = [];

    // 2. Autocomplete attribute (very strong signal)
    const autocomplete = (field.selector.match(/autocomplete="([^"]+)"/) || [])[1] || '';
    if (autocomplete) {
      const autoMatch = this.matchAutocomplete(autocomplete);
      if (autoMatch) matches.push(autoMatch);
    }

    // 3. Explicit label text
    if (field.labelText) {
      const labelMatch = this.matchText(field.labelText, 'label');
      if (labelMatch) matches.push(labelMatch);
    }

    // 4. ARIA label / description
    if (field.ariaLabel) {
      const ariaMatch = this.matchText(field.ariaLabel, 'aria-label');
      if (ariaMatch) matches.push(ariaMatch);
    }

    // 5. Name attribute
    if (field.name) {
      const nameMatch = this.matchAttribute(field.name, 'name');
      if (nameMatch) matches.push(nameMatch);
    }

    // 6. ID attribute
    if (field.domId) {
      const idMatch = this.matchAttribute(field.domId, 'id');
      if (idMatch) matches.push(idMatch);
    }

    // 7. Placeholder
    if (field.placeholder) {
      const placeholderMatch = this.matchText(field.placeholder, 'placeholder');
      if (placeholderMatch) matches.push(placeholderMatch);
    }

    // 8. Nearby text
    if (field.nearbyText) {
      const nearbyMatch = this.matchText(field.nearbyText, 'nearby_text', 0.1);
      if (nearbyMatch) matches.push(nearbyMatch);
    }

    // 9. Section heading
    if (field.sectionHeading) {
      const headingMatch = this.matchSectionHeading(field.sectionHeading, field.controlType);
      if (headingMatch) matches.push(headingMatch);
    }

    // 10. HTML Type heuristics
    if (field.htmlType === 'email') {
      matches.push({ semanticType: 'email', confidence: 0.95, evidence: 'html_type_email' });
    } else if (field.htmlType === 'tel') {
      matches.push({ semanticType: 'phone', confidence: 0.95, evidence: 'html_type_tel' });
    } else if (field.controlType === 'file') {
      const resumeMatch = this.matchResumeFile(field);
      if (resumeMatch) matches.push(resumeMatch);
    }

    // 11. Tag Input / Skills Multi-select heuristic
    if (field.controlType === 'tag_input') {
      const allText = `${field.labelText || ''} ${field.name || ''} ${field.domId || ''} ${field.placeholder || ''} ${field.nearbyText || ''} ${field.sectionHeading || ''}`.toLowerCase();
      if (allText.includes('skill') || allText.includes('type to add') || allText.includes('press enter') || allText.trim() === '') {
        matches.push({ semanticType: 'skills', confidence: 0.98, evidence: 'tag_input_skills' });
      }
    }

    // Combine and aggregate matches
    if (matches.length === 0) {
      return {
        fieldId: field.id,
        semanticType: 'unknown',
        confidence: 0,
        evidence: [],
        source: 'deterministic',
        reason: 'No matching deterministic rules found'
      };
    }

    return this.aggregateMatches(field.id, matches);
  }

  private matchAutocomplete(val: string): RuleMatch | null {
    const v = val.toLowerCase().trim();
    if (v === 'given-name' || v.includes('given-name')) return { semanticType: 'first_name', confidence: 0.98, evidence: 'autocomplete' };
    if (v === 'family-name' || v.includes('family-name')) return { semanticType: 'last_name', confidence: 0.98, evidence: 'autocomplete' };
    if (v === 'name') return { semanticType: 'full_name', confidence: 0.96, evidence: 'autocomplete' };
    if (v === 'email') return { semanticType: 'email', confidence: 0.99, evidence: 'autocomplete' };
    if (v === 'tel' || v.includes('tel')) return { semanticType: 'phone', confidence: 0.98, evidence: 'autocomplete' };
    if (v === 'street-address' || v.includes('address-line1')) return { semanticType: 'address', confidence: 0.97, evidence: 'autocomplete' };
    if (v === 'address-level2') return { semanticType: 'city', confidence: 0.97, evidence: 'autocomplete' };
    if (v === 'address-level1') return { semanticType: 'state', confidence: 0.97, evidence: 'autocomplete' };
    if (v === 'postal-code') return { semanticType: 'zip_code', confidence: 0.98, evidence: 'autocomplete' };
    if (v === 'country' || v === 'country-name') return { semanticType: 'country', confidence: 0.98, evidence: 'autocomplete' };
    return null;
  }

  private matchAttribute(val: string, evidenceType: string): RuleMatch | null {
    const v = val.toLowerCase().replace(/[-_.]/g, ' ');
    return this.matchText(v, evidenceType, 0.05);
  }

  private matchText(raw: string, evidenceType: string, confidencePenalty = 0): RuleMatch | null {
    const text = raw.toLowerCase().trim();

    // LinkedIn
    if (/\blinkedin\b/.test(text)) {
      return { semanticType: 'linkedin', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }
    // GitHub
    if (/\bgithub\b/.test(text)) {
      return { semanticType: 'github', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }
    // Portfolio
    if (/\bportfolio\b|\bwebsite\b|\bpersonal\s*site\b|\bpersonal\s*link\b/.test(text)) {
      return { semanticType: 'portfolio', confidence: 0.92 - confidencePenalty, evidence: evidenceType };
    }

    // Full Name / Combined First & Last Name (must precede individual First/Last Name)
    if (
      /\bfull\s*name\b|\blegal\s*name\b|\bcandidate\s*name\b|\byour\s*name\b/.test(text) ||
      /\bfirst\s*(?:and|&|\/|\+)?\s*last\s*name\b/.test(text) ||
      (/\bfirst\b/.test(text) && /\blast\b/.test(text) && /\bname\b/.test(text)) ||
      (text === 'name' && !/\bcompany\b|\buser\b/.test(text))
    ) {
      return { semanticType: 'full_name', confidence: 0.96 - confidencePenalty, evidence: evidenceType };
    }

    // First Name
    if (/\bfirst\s*name\b|\bgiven\s*name\b|\bfname\b/.test(text) && !/\blast\b/.test(text)) {
      return { semanticType: 'first_name', confidence: 0.96 - confidencePenalty, evidence: evidenceType };
    }
    // Last Name
    if (/\blast\s*name\b|\bsurname\b|\bfamily\s*name\b|\blname\b/.test(text) && !/\bfirst\b/.test(text)) {
      return { semanticType: 'last_name', confidence: 0.96 - confidencePenalty, evidence: evidenceType };
    }

    // Email
    if (/\be-?mail\b|\be-?mail\s*address\b/.test(text)) {
      return { semanticType: 'email', confidence: 0.97 - confidencePenalty, evidence: evidenceType };
    }

    // Phone Device Type (must precede generic phone)
    if (/\bphone\s*device\s*type\b|\bdevice\s*type\b|\bphone\s*type\b/.test(text)) {
      return { semanticType: 'phone_device_type', confidence: 0.97 - confidencePenalty, evidence: evidenceType };
    }
    // Phone Extension (must precede generic phone)
    if (/\bphone\s*extension\b|\bextension\b|\bext\b/.test(text)) {
      return { semanticType: 'phone_extension', confidence: 0.97 - confidencePenalty, evidence: evidenceType };
    }
    // Phone
    if (/\bphone\b|\bmobile\b|\btelephone\b|\bcell\b|\bcontact\s*number\b/.test(text)) {
      return { semanticType: 'phone', confidence: 0.96 - confidencePenalty, evidence: evidenceType };
    }

    // City & Location
    if (/\bcity\b|\btown\b|\bmunicipality\b|\blocation\b|\bjob\s*location\b/.test(text)) {
      return { semanticType: 'city', confidence: 0.93 - confidencePenalty, evidence: evidenceType };
    }
    // State
    if (/\bstate\b|\bprovince\b|\bregion\b/.test(text)) {
      return { semanticType: 'state', confidence: 0.93 - confidencePenalty, evidence: evidenceType };
    }
    // Zip
    if (/\bzip\b|\bzip\s*code\b|\bpostal\s*code\b|\bpostcode\b/.test(text)) {
      return { semanticType: 'zip_code', confidence: 0.96 - confidencePenalty, evidence: evidenceType };
    }
    // Country
    if (/\bcountry\b|\bnation\b/.test(text)) {
      return { semanticType: 'country', confidence: 0.93 - confidencePenalty, evidence: evidenceType };
    }
    // Address
    if (/\bstreet\s*address\b|\baddress\s*line\b|\bhome\s*address\b|\bresidential\s*address\b/.test(text) || text === 'address') {
      return { semanticType: 'address', confidence: 0.94 - confidencePenalty, evidence: evidenceType };
    }

    // Work Authorization
    if (
      /\bauthorized\s*to\s*work\b|\blegally\s*authorized\b|\bwork\s*authorization\b|\bright\s*to\s*work\b|\beligible\s*to\s*work\b/.test(text)
    ) {
      return { semanticType: 'work_authorization', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }
    // Visa / Sponsorship
    if (
      /\bvisa\b|\bsponsorship\b|\brequire\s*sponsorship\b|\bimmigration\b/.test(text)
    ) {
      return { semanticType: 'visa_status', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }

    // Salutation
    if (/\bsalutation\b/.test(text) || (text === 'title' && !/\bjob\b|\bcurrent\b|\bposition\b|\bdesig/.test(text))) {
      return { semanticType: 'salutation', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }

    // Current Title / Position / Designation
    if (/\bcurrent\s*title\b|\bjob\s*title\b|\bcurrent\s*role\b|\bcurrent\s*position\b|\bdesignation\b|\bcurrent\s*designation\b/.test(text)) {
      return { semanticType: 'current_title', confidence: 0.94 - confidencePenalty, evidence: evidenceType };
    }
    // Current Company / Employer
    if (/\bcurrent\s*company\b|\bcurrent\s*employer\b|\bmost\s*recent\s*company\b|\bcompany\s*name\b|\bcompany\b|\bemployer\b|\borganization\b/.test(text)) {
      return { semanticType: 'current_company', confidence: 0.92 - confidencePenalty, evidence: evidenceType };
    }
    // Currently Work Here
    if (/\bcurrently\s*work\s*here\b|\bi\s*currently\s*work\s*here\b|\bcurrent\s*job\b|\bcurrent\s*role\b|\bcurrent\s*position\b/.test(text)) {
      return { semanticType: 'currently_work_here', confidence: 0.96 - confidencePenalty, evidence: evidenceType };
    }
    // Start Date / From
    if (
      (/\bstart\s*date\b|\bfrom\s*date\b|\bdate\s*from\b|\bcommenced\b/.test(text) || /^from(\s*[*:]+)?$/.test(text)) &&
      !/\bnotice\b/.test(text)
    ) {
      return { semanticType: 'start_date', confidence: 0.93 - confidencePenalty, evidence: evidenceType };
    }
    // End Date / To
    if (
      /\bend\s*date\b|\bto\s*date\b|\bdate\s*to\b|\bcompletion\s*date\b|\bgraduation\s*date\b/.test(text) ||
      /^to(\s*[*:]+)?$/.test(text)
    ) {
      return { semanticType: 'end_date', confidence: 0.93 - confidencePenalty, evidence: evidenceType };
    }
    // Role Description / Work Description
    if (/\brole\s*description\b|\bjob\s*description\b|\bwork\s*description\b|\bresponsibilities\b|\bduties\b|\bexperience\s*description\b/.test(text)) {
      return { semanticType: 'job_description', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }
    // Years of Experience
    if (/\byears\s*of\s*experience\b|\btotal\s*experience\b|\byears\s*experience\b/.test(text)) {
      return { semanticType: 'years_experience', confidence: 0.94 - confidencePenalty, evidence: evidenceType };
    }

    // Language Fluency & Proficiency
    if (/\bfluent\s*in\s*this\s*language\b|\bam\s*fluent\b/.test(text)) {
      return { semanticType: 'language_fluency', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }
    if (/\bcomprehension\b|\boverall\b|\breading\b|\bspeaking\b|\bwriting\b|\blanguage\s*proficiency\b/.test(text)) {
      return { semanticType: 'language_proficiency', confidence: 0.94 - confidencePenalty, evidence: evidenceType };
    }

    // Skills
    if (/\bskills\b|\btechnologies\b|\btech\s*stack\b|\bkey\s*skills\b|\btools\b|\blanguages\b/.test(text)) {
      return { semanticType: 'skills', confidence: 0.93 - confidencePenalty, evidence: evidenceType };
    }

    // Salary / Compensation
    if (/\bsalary\b|\bcompensation\b|\bexpected\s*pay\b|\bhourly\s*rate\b|\bdesired\s*salary\b/.test(text)) {
      return { semanticType: 'salary', confidence: 0.94 - confidencePenalty, evidence: evidenceType };
    }

    // Notice Period / Availability
    if (/\bnotice\s*period\b|\bavailability\b|\bstart\s*date\b|\bhow\s*soon\b/.test(text)) {
      return { semanticType: 'notice_period', confidence: 0.92 - confidencePenalty, evidence: evidenceType };
    }

    // Cover Letter
    if (/\bcover\s*letter\b|\bletter\s*of\s*motivation\b|\badditional\s*note\b/.test(text)) {
      return { semanticType: 'cover_letter', confidence: 0.94 - confidencePenalty, evidence: evidenceType };
    }

    // Resume / CV
    if (/\bresume\b|\bcurriculum\s*vitae\b|\bcv\b/.test(text)) {
      return { semanticType: 'resume', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }

    // School / University
    if (/\bschool\b|\buniversity\b|\bcollege\b|\binstitution\b|\bacademy\b/.test(text) && !/\bdegree\b/.test(text)) {
      return { semanticType: 'school', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }

    // Degree / Education Level
    if (/\bdegree\b|\bdegree\s*level\b|\beducation\s*level\b|\bhighest\s*education\b|\bhighest\s*degree\b/.test(text)) {
      return { semanticType: 'degree', confidence: 0.95 - confidencePenalty, evidence: evidenceType };
    }

    if (/\bfield\s*of\s*study\b|\bmajor\b/.test(text)) {
      return { semanticType: 'education', confidence: 0.91 - confidencePenalty, evidence: evidenceType };
    }

    // Application question
    if (/\bwhy\s*do\s*you\s*want\b|\btell\s*us\s*about\b|\bdescribe\s*a\s*time\b|\badditional\s*information\b/.test(text)) {
      return { semanticType: 'application_question', confidence: 0.88 - confidencePenalty, evidence: evidenceType };
    }

    return null;
  }

  private matchSectionHeading(heading: string, _controlType: string): RuleMatch | null {
    const text = heading.toLowerCase();
    if (/\bskills\b|\btechnical\s*skills\b/.test(text)) {
      return { semanticType: 'skills', confidence: 0.88, evidence: 'section_heading' };
    }
    if (/\beducation\b|\bacademic\b/.test(text)) {
      return { semanticType: 'education', confidence: 0.85, evidence: 'section_heading' };
    }
    if (/\bwork\s*experience\b|\bemployment\b/.test(text)) {
      return { semanticType: 'current_company', confidence: 0.80, evidence: 'section_heading' };
    }
    return null;
  }

  private matchResumeFile(field: FieldDescriptor): RuleMatch | null {
    const all = `${field.labelText || ''} ${field.name || ''} ${field.domId || ''} ${field.nearbyText || ''}`.toLowerCase();
    if (/\bresume\b|\bcv\b|\bcurriculum\s*vitae\b/.test(all)) {
      return { semanticType: 'resume', confidence: 0.98, evidence: 'file_input_resume' };
    }
    if (/\bcover\s*letter\b/.test(all)) {
      return { semanticType: 'cover_letter', confidence: 0.95, evidence: 'file_input_cover_letter' };
    }
    return null;
  }

  private aggregateMatches(fieldId: string, matches: RuleMatch[]): FieldClassification {
    // Group matches by semantic type
    const byType = new Map<SemanticFieldType, { totalConfidence: number; count: number; evidence: string[] }>();

    for (const m of matches) {
      const existing = byType.get(m.semanticType) || { totalConfidence: 0, count: 0, evidence: [] };
      // Probability combination formula: P(A or B) = 1 - (1 - P(A))*(1 - P(B))
      const combined = existing.count === 0 ? m.confidence : 1 - (1 - existing.totalConfidence) * (1 - m.confidence);
      byType.set(m.semanticType, {
        totalConfidence: Math.min(0.99, combined),
        count: existing.count + 1,
        evidence: [...existing.evidence, m.evidence]
      });
    }

    // Pick candidate with highest combined confidence
    let bestType: SemanticFieldType = 'unknown';
    let bestConf = 0;
    let bestEvidence: string[] = [];

    for (const [type, data] of byType.entries()) {
      if (data.totalConfidence > bestConf) {
        bestConf = data.totalConfidence;
        bestType = type;
        bestEvidence = data.evidence;
      }
    }

    return {
      fieldId,
      semanticType: bestType,
      confidence: Math.round(bestConf * 100) / 100,
      evidence: bestEvidence,
      source: 'deterministic',
      reason: `Matched rules: ${bestEvidence.join(', ')}`
    };
  }
}
