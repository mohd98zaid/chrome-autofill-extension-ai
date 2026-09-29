import { FieldDescriptor } from '../../types/taxonomy';

export interface VerificationResult {
  verified: boolean;
  actualValue: string | string[] | boolean | null;
  expectedValue: string | string[] | boolean;
  message?: string;
  hasValidationError: boolean;
  validationMessage?: string;
}

export class VerificationEngine {
  public verify(element: HTMLElement, field: FieldDescriptor, expectedValue: string | string[] | boolean): VerificationResult {
    let actualValue: string | string[] | boolean | null = null;
    let hasValidationError = false;
    let validationMessage: string | undefined = undefined;

    // 1. Check HTML5 validity
    if ('checkValidity' in element && typeof (element as HTMLInputElement).checkValidity === 'function') {
      const input = element as HTMLInputElement;
      if (!input.checkValidity()) {
        hasValidationError = true;
        validationMessage = input.validationMessage;
      }
    }

    // 2. Check ARIA invalid state
    if (element.getAttribute('aria-invalid') === 'true') {
      hasValidationError = true;
      validationMessage = validationMessage || 'Field flagged with aria-invalid';
    }

    // 3. Check for visible website validation errors near field (Rule 18: website is the authority)
    try {
      const container = element.closest('div, td, tr, li, p, section, fieldset') || element.parentElement;
      if (container) {
        const errorNodes = container.querySelectorAll(
          '.error, [class*="error" i], [class*="Error"], .invalid-feedback, .text-danger, [role="alert"]'
        );
        for (const err of Array.from(errorNodes)) {
          if (err !== element && !err.contains(element)) {
            const style = window.getComputedStyle(err as HTMLElement);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              const text = (err.textContent || '').trim();
              if (text.length > 0 && /error|invalid|required|must have|incorrect|format/i.test(text)) {
                hasValidationError = true;
                validationMessage = validationMessage || text;
                break;
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // 4. Read actual value based on control type
    switch (field.controlType) {
      case 'checkbox':
      case 'radio': {
        const input = element as HTMLInputElement;
        actualValue = input.checked;
        const matches = input.checked === Boolean(expectedValue);
        const verified = !hasValidationError && matches;
        const message = verified
          ? 'Verification passed'
          : hasValidationError
          ? `Validation error: ${validationMessage || 'Checkbox failed validation'}`
          : `Expected checked=${expectedValue}, but found ${input.checked}`;
        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message
        };
      }

      case 'select': {
        const select = element as HTMLSelectElement;
        actualValue = select.value;
        const normActual = String(actualValue).toLowerCase().trim();
        const normExpected = String(expectedValue).toLowerCase().trim();
        const selectedText = select.options[select.selectedIndex]?.text.toLowerCase().trim() || '';

        // Must not be the unselected placeholder option
        const isPlaceholder = normActual === '' && selectedText.includes('select');
        const matches =
          !isPlaceholder &&
          (normActual === normExpected ||
            selectedText === normExpected ||
            (normExpected.length >= 3 && selectedText.includes(normExpected)) ||
            (selectedText.length >= 3 && normExpected.includes(selectedText)));

        if (field.isRequired && (!actualValue || actualValue === '')) {
          hasValidationError = true;
          validationMessage = validationMessage || 'Required select field is unselected';
        }

        const verified = !hasValidationError && matches;
        const message = verified
          ? 'Verification passed'
          : hasValidationError
          ? `Validation error: ${validationMessage || 'Select validation failed'}`
          : `Expected select value "${expectedValue}", but found "${actualValue}" (${selectedText})`;

        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message
        };
      }

      case 'tag_input': {
        // Look for chip text in container or parent container
        const parent =
          element.closest('[data-automation-id*="skills" i], [data-automation-id*="panel" i], fieldset, form, div') ||
          element.parentElement;
        const chips = Array.from(
          (parent || element).querySelectorAll(
            '.tag, .chip, [data-tag], [data-automation-id="selectedItem"], [data-automation-id*="chip" i], [data-automation-id*="selected" i], [role="listitem"], .tag-chip, [class*="chip" i], [class*="tag" i]'
          )
        )
          .map((c) => c.textContent?.trim() || '')
          .filter(Boolean);

        actualValue = chips;
        const expectedArray = Array.isArray(expectedValue) ? expectedValue.map(String) : [String(expectedValue)];

        // Rule 15: Every expected item must be present in the actual chips! Never pass just because unrelated chips exist.
        const allExpectedFound =
          expectedArray.length > 0 &&
          expectedArray.every((expectedItem) => {
            const normExp = normalizeString(expectedItem);
            return chips.some((actualChip) => {
              const normActual = normalizeString(actualChip);
              return normActual === normExp || (normExp.length >= 3 && normActual.includes(normExp));
            });
          });

        if (field.isRequired && chips.length === 0) {
          hasValidationError = true;
          validationMessage = validationMessage || 'Required tag input has no tags';
        }

        const verified = !hasValidationError && allExpectedFound;
        const message = verified
          ? 'Verification passed'
          : hasValidationError
          ? `Validation error: ${validationMessage || 'Tag input validation failed'}`
          : `Tag input verification incomplete: expected tags ${JSON.stringify(expectedArray)}, found ${JSON.stringify(chips)}`;

        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message
        };
      }

      case 'combobox':
      case 'searchable_select': {
        // Read either input value or selected chip inside combobox container
        const input = element.querySelector('input') || (element.tagName === 'INPUT' ? (element as HTMLInputElement) : null);
        const selectedChip = element.querySelector('[data-automation-id="selectedItem"], [role="option"][aria-selected="true"], .selected-item');

        const rawVal = selectedChip?.textContent?.trim() || input?.value || (element as any).value || element.textContent?.trim() || '';
        actualValue = rawVal;

        const normActual = normalizeString(rawVal);
        const normExpected = normalizeString(String(expectedValue));

        const matches = normActual.length > 0 && (normActual === normExpected || normActual.includes(normExpected) || normExpected.includes(normActual));

        if (field.isRequired && (!actualValue || actualValue === '')) {
          hasValidationError = true;
          validationMessage = validationMessage || 'Required combobox is empty';
        }

        const verified = !hasValidationError && matches;
        const message = verified
          ? 'Verification passed'
          : hasValidationError
          ? `Validation error: ${validationMessage || 'Combobox validation failed'}`
          : `Combobox mismatch: expected "${expectedValue}", found "${actualValue}"`;

        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message
        };
      }

      default: {
        if ('value' in element) {
          actualValue = (element as HTMLInputElement).value;
          const normActual = normalizeString(String(actualValue));
          const normExpected = normalizeString(String(expectedValue));

          const matches = normActual.length > 0 && (normActual === normExpected || normActual.includes(normExpected) || normExpected.includes(normActual));

          if (field.isRequired && (!actualValue || String(actualValue).trim() === '')) {
            hasValidationError = true;
            validationMessage = validationMessage || 'Required field is empty';
          }

          const verified = !hasValidationError && matches;
          const message = verified
            ? 'Verification passed'
            : hasValidationError
            ? `Validation error: ${validationMessage || 'Field failed validation'}`
            : `Value mismatch: expected "${expectedValue}", found "${actualValue}"`;

          return {
            verified,
            actualValue,
            expectedValue,
            hasValidationError,
            validationMessage,
            message
          };
        }

        actualValue = element.textContent?.trim() || null;
        const verified = !hasValidationError && Boolean(actualValue);
        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message: verified ? 'Readonly element verified' : 'Readonly element value empty'
        };
      }
    }
  }
}

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[\s\-_(),.]+/g, ' ').trim();
}
