/**
 * Generates a stable, reproducible signature for a DOM field.
 * Avoids transient dynamic attributes (like auto-generated IDs with random numbers).
 */
export function computeFieldSignature(element: HTMLElement, domain: string, labelText?: string): string {
  const tagName = element.tagName.toLowerCase();
  const type = element.getAttribute('type') || '';
  const name = element.getAttribute('name') || '';
  const autocomplete = element.getAttribute('autocomplete') || '';
  const ariaLabel = element.getAttribute('aria-label') || '';
  const role = element.getAttribute('role') || '';
  const placeholder = element.getAttribute('placeholder') || '';

  // Clean ID if it looks dynamic (e.g., :r1:, input_12345, ember123)
  const rawId = element.getAttribute('id') || '';
  const isDynamicId = /[:_]\d+|ember\d+|react-|ng-|\b\d{5,}\b/.test(rawId);
  const stableId = isDynamicId ? '' : rawId;

  // Clean label text of dynamic numbers (e.g. "3. First & Last Name *" -> "first & last name")
  const cleanLabel = (labelText || '')
    .toLowerCase()
    .replace(/^\s*\d+[\.\)]\s*/, '')
    .replace(/[*:]/g, '')
    .trim();

  // Compute a simple hash
  const rawSignature = `${domain}|${tagName}|${type}|${name}|${stableId}|${autocomplete}|${ariaLabel}|${role}|${placeholder}|${cleanLabel}`;
  return simpleHash(rawSignature);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `sig_${Math.abs(hash).toString(16)}`;
}
