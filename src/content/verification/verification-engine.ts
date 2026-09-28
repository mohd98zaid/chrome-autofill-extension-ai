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

    // Check HTML5 validity
    if ('checkValidity' in element && typeof (element as HTMLInputElement).checkValidity === 'function') {
      const input = element as HTMLInputElement;
      if (!input.checkValidity()) {
        hasValidationError = true;
        validationMessage = input.validationMessage;
      }
    }

    if (element.getAttribute('aria-invalid') === 'true') {
      hasValidationError = true;
      validationMessage = validationMessage || 'Field flagged with aria-invalid';
    }

    // Read actual value based on control type
    switch (field.controlType) {
      case 'checkbox':
      case 'radio': {
        const input = element as HTMLInputElement;
        actualValue = input.checked;
        const verified = input.checked === Boolean(expectedValue);
        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message: verified ? 'Verification passed' : `Expected checked=${expectedValue}, but found ${input.checked}`
        };
      }

      case 'select': {
        const select = element as HTMLSelectElement;
        actualValue = select.value;
        const normActual = String(actualValue).toLowerCase().trim();
        const normExpected = String(expectedValue).toLowerCase().trim();
        const selectedText = select.options[select.selectedIndex]?.text.toLowerCase().trim() || '';

        const verified =
          normActual === normExpected ||
          selectedText === normExpected ||
          selectedText.includes(normExpected) ||
          normExpected.includes(selectedText);

        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message: verified ? 'Verification passed' : `Expected select value "${expectedValue}", but found "${actualValue}" (${selectedText})`
        };
      }

      case 'tag_input': {
        // Look for chip text in container or parent container
        const parent = element.closest('[data-automation-id*="skills" i], [data-automation-id*="panel" i], fieldset, form') || element.parentElement;
        const chips = Array.from(
          (parent || element).querySelectorAll(
            '.tag, .chip, [data-tag], [data-automation-id="selectedItem"], [data-automation-id*="chip" i], [data-automation-id*="selected" i], [role="listitem"]'
          )
        ).map((c) => c.textContent?.trim() || '');
        actualValue = chips;
        const expectedArray = Array.isArray(expectedValue) ? expectedValue.map(String) : [String(expectedValue)];
        const verified = chips.length > 0 || expectedArray.some((exp) => chips.some((c) => c.toLowerCase().includes(exp.toLowerCase())));

        return {
          verified,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message: verified ? 'Verification passed' : `Expected tags ${JSON.stringify(expectedArray)}, found ${JSON.stringify(chips)}`
        };
      }

      default: {
        if ('value' in element) {
          actualValue = (element as HTMLInputElement).value;
          const normActual = normalizeString(String(actualValue));
          const normExpected = normalizeString(String(expectedValue));

          const verified = normActual.length > 0 && (normActual === normExpected || normActual.includes(normExpected) || normExpected.includes(normActual));

          return {
            verified,
            actualValue,
            expectedValue,
            hasValidationError,
            validationMessage,
            message: verified ? 'Verification passed' : `Value mismatch: expected "${expectedValue}", found "${actualValue}"`
          };
        }

        actualValue = element.textContent?.trim() || null;
        return {
          verified: !!actualValue,
          actualValue,
          expectedValue,
          hasValidationError,
          validationMessage,
          message: 'Readonly element verified'
        };
      }
    }
  }
}

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[\s\-_(),.]+/g, ' ').trim();
}
