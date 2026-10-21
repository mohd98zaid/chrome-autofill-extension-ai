/**
 * Text Cleaner & Normalizer for Job Application Q&A and Autofill
 * Enforces first-person voice, respects character limits, and removes long dashes.
 */

export function cleanAnswerText(
  text: string,
  maxLength?: number,
  candidateName?: string
): string {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Avoid long dashes (em-dash —, en-dash –, horizontal bar ―, double-dash --, or spaced hyphen " - ")
  // Replace with standard comma, keeping hyphenated words like "hands-on" intact
  cleaned = cleaned.replace(/[\u2012\u2013\u2014\u2015]|--+|(\s+-\s+)/g, ', ');
  cleaned = cleaned.replace(/\s*,\s*/g, ', ');
  cleaned = cleaned.replace(/(?:,\s*)+,/g, ',');
  cleaned = cleaned.replace(/,\s*\./g, '.');
  cleaned = cleaned.replace(/^[,\s]+/, '');

  // 2. Build list of names/subjects to convert to first-person ("I", "my")
  const names: string[] = ['the candidate', 'the applicant', 'candidate', 'applicant'];
  if (candidateName && candidateName.trim().length > 1) {
    const trimmed = candidateName.trim();
    names.unshift(trimmed);
    const parts = trimmed.split(/\s+/).filter((p) => p.length > 2 && !/^(mr|ms|mrs|dr|prof|eng)$/i.test(p));
    for (const part of parts) {
      if (!names.includes(part)) {
        names.push(part);
      }
    }
  }

  // 2a. Possessives: e.g. "Mohammad Zaid's experience" -> "My experience", "his experience" -> "my experience"
  for (const name of names) {
    const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const possessiveRegex = new RegExp(`\\b${escaped}['’]s\\b`, 'gi');
    cleaned = cleaned.replace(possessiveRegex, 'my');
  }
  cleaned = cleaned.replace(
    /\b(?:his|her)\s+(experience|background|expertise|skills|career|work|roles|projects|qualifications|education|journey|capabilities|strengths|focus|contributions|leadership|portfolio|achievements)\b/gi,
    'my $1'
  );
  cleaned = cleaned.replace(
    /\b(?:throughout|during|in|across)\s+(?:his|her)\s+(career|work|roles|experience|journey)\b/gi,
    'throughout my $1'
  );

  // 2b. Subject + Verb transformations: e.g. "Mohammad Zaid has" -> "I have"
  const verbs = [
    { match: /\b(?:has|have|possesses|brings|holds)\b/i, replace: 'I have' },
    { match: /\b(?:is|was)\b/i, replace: 'I am' },
    { match: /\b(?:specializes\s+in|specialized\s+in)\b/i, replace: 'I specialize in' },
    { match: /\b(?:worked\s+as)\b/i, replace: 'I worked as' },
    { match: /\b(?:completed)\b/i, replace: 'I completed' },
    { match: /\b(?:delivered)\b/i, replace: 'I delivered' },
    { match: /\b(?:built)\b/i, replace: 'I built' },
    { match: /\b(?:led)\b/i, replace: 'I led' },
    { match: /\b(?:developed)\b/i, replace: 'I developed' },
    { match: /\b(?:focuses\s+on|focused\s+on)\b/i, replace: 'I focus on' }
  ];

  for (const name of names) {
    const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    for (const v of verbs) {
      const pattern = new RegExp(`\\b${escaped}\\s+${v.match.source}`, 'gi');
      cleaned = cleaned.replace(pattern, v.replace);
    }
  }

  // Also handle "he / she" subject pronouns
  for (const v of verbs) {
    const pattern = new RegExp(`\\b(?:he|she)\\s+${v.match.source}`, 'gi');
    cleaned = cleaned.replace(pattern, v.replace);
  }

  // 2c. Internal third-person phrasing cleanup
  cleaned = cleaned.replace(/\b(?:where|during which)\s+(?:he|she)\s+(?:specialized|specializes|focused|focuses)\b/gi, 'where I specialize');
  cleaned = cleaned.replace(/\b(?:where|during which)\s+(?:he|she)\s+(?:worked|served)\b/gi, 'where I worked');
  cleaned = cleaned.replace(/\b(?:where|during which)\s+(?:he|she)\s+has\b/gi, 'where I have');
  cleaned = cleaned.replace(/\ballows?\s+(?:him|her)\b/gi, 'allows me');
  cleaned = cleaned.replace(/\benables?\s+(?:him|her)\b/gi, 'enables me');
  cleaned = cleaned.replace(/\bgives?\s+(?:him|her)\b/gi, 'gives me');
  cleaned = cleaned.replace(/\bfor\s+(?:him|her)\b/gi, 'for me');

  // 3. Fix double spaces and clean edge punctuation
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // 4. Strict character limit trimming if maxLength is set
  if (maxLength && maxLength > 0 && cleaned.length > maxLength) {
    // If it's a "years of experience" response and space is short (e.g. <= 30 chars), extract concise years
    const yearsMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:\+|-)?\s*(?:years?|yrs?)/i);
    if (yearsMatch) {
      const num = yearsMatch[1];
      const withUnitPlus = `${num}+ years`;
      const withUnit = `${num} years`;
      if (maxLength <= 6) {
        cleaned = num;
      } else if (withUnitPlus.length <= maxLength) {
        cleaned = withUnitPlus;
      } else if (withUnit.length <= maxLength) {
        cleaned = withUnit;
      } else {
        cleaned = num;
      }
    } else {
      let truncated = cleaned.slice(0, maxLength);
      const lastPunct = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('; '),
        truncated.lastIndexOf(', ')
      );
      const lastSpace = truncated.lastIndexOf(' ');

      if (lastPunct > maxLength * 0.65) {
        truncated = truncated.slice(0, lastPunct + 1);
      } else if (lastSpace > maxLength * 0.65) {
        truncated = truncated.slice(0, lastSpace).trim();
        if (!/[.!?]$/.test(truncated) && truncated.length < maxLength) {
          truncated += '.';
        }
      }
      cleaned = truncated.slice(0, maxLength).trim();
    }
  }

  // Capitalize first character if needed
  if (cleaned.length > 0 && /^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}
