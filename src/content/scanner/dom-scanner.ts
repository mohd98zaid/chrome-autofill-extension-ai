import { ControlType, FieldDescriptor, FieldOption } from '../../types/taxonomy';
import { computeFieldSignature } from './field-signature';

export interface ScanResult {
  fields: FieldDescriptor[];
  elementMap?: Map<string, HTMLElement>;
  securityTrigger?: {
    type: 'captcha' | 'otp' | 'payment' | 'password';
    message: string;
  };
}

export class DOMScanner {
  private domain: string;

  constructor(domain: string = window.location.hostname) {
    this.domain = domain;
  }

  public scan(root: ParentNode = document): ScanResult {
    // 1. Check for security challenges first
    const securityTrigger = this.detectSecurityChallenges(root);

    // 2. Discover interactive controls
    const elements = this.discoverElements(root);
    const fields: FieldDescriptor[] = [];
    const elementMap = new Map<string, HTMLElement>();

    let index = 0;
    for (const el of elements) {
      if (!this.isVisible(el)) continue;

      const descriptor = this.createDescriptor(el, index++);
      if (descriptor) {
        fields.push(descriptor);
        elementMap.set(descriptor.id, el);
      }
    }

    return {
      fields,
      elementMap,
      securityTrigger
    };
  }

  private detectSecurityChallenges(root: ParentNode): ScanResult['securityTrigger'] | undefined {
    // Check for active CAPTCHA elements that require user interaction
    const captchaSelector = [
      '.g-recaptcha:not([data-size="invisible"]):not(.grecaptcha-badge)',
      'iframe[src*="recaptcha/api2/bframe"]',
      'iframe[src*="recaptcha/enterprise/bframe"]',
      'iframe[src*="recaptcha"]:not([src*="invisible"]):not([style*="display: none"]):not([style*="visibility: hidden"])',
      'iframe[src*="hcaptcha"]:not([data-size="invisible"])',
      'iframe[src*="turnstile"]:not([data-size="invisible"])',
      '.cf-turnstile:not([data-size="invisible"])',
      '#turnstile-wrapper:not([data-size="invisible"])'
    ].join(',');

    const candidates = root.querySelectorAll<HTMLElement>(captchaSelector);
    for (const el of Array.from(candidates)) {
      // 1. Ignore background badge containers and explicitly hidden elements
      if (el.classList.contains('grecaptcha-badge') || el.closest('.grecaptcha-badge')) continue;
      if (el.classList.contains('grecaptcha-logo') || el.closest('.grecaptcha-logo')) continue;
      if (el.classList.contains('grecaptcha-invisible') || el.closest('.grecaptcha-invisible')) continue;
      if (el.getAttribute('data-size') === 'invisible' || el.closest('[data-size="invisible"]')) continue;
      if (el.hasAttribute('data-badge') || el.closest('[data-badge]')) continue;

      // 2. Specific checks for iframes (Google reCAPTCHA v3 invisible telemetry vs v2 checkbox / challenge modal)
      if (el.tagName === 'IFRAME') {
        const src = (el.getAttribute('src') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();

        // reCAPTCHA anchor: v3 invisible telemetry places an anchor iframe in the corner or offscreen
        if (src.includes('recaptcha') && src.includes('anchor')) {
          if (title.includes('badge') || src.includes('badge')) continue;

          // Check if placed offscreen or in fixed collapsed corner
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const rect = el.getBoundingClientRect();
            const parentRect = el.parentElement?.getBoundingClientRect();

            const isOffscreen =
              rect.right <= 0 ||
              rect.bottom <= 0 ||
              rect.left >= (window.innerWidth || 1000) ||
              rect.top >= (window.innerHeight || 1000) ||
              (parentRect && (parentRect.right <= 0 || parentRect.bottom <= 0));

            if (isOffscreen) continue;

            const computed = window.getComputedStyle(el);
            const parentComputed = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
            if (
              (computed.position === 'fixed' || parentComputed?.position === 'fixed') &&
              (rect.top > 350 || (parentRect && parentRect.top > 350)) &&
              (rect.right > (window.innerWidth || 1000) - 120 || rect.left < 50)
            ) {
              // Classic Google reCAPTCHA v3 floating badge
              continue;
            }
          }
        }

        // If it's a reCAPTCHA challenge modal (bframe), it must be genuinely visible and active
        if (src.includes('bframe')) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 100 || rect.height < 100) continue;
        }
      }

      if (this.isVisible(el)) {
        return {
          type: 'captcha',
          message: 'Active CAPTCHA challenge detected on page. Automation must pause for user manual completion.'
        };
      }
    }

    // Check for OTP inputs
    const otpInput = root.querySelector('input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="2fa" i], input[id*="otp" i]');
    if (otpInput && this.isVisible(otpInput as HTMLElement)) {
      return {
        type: 'otp',
        message: 'One-Time Password (OTP) verification field detected. Automation paused.'
      };
    }

    return undefined;
  }

  private discoverElements(root: ParentNode): HTMLElement[] {
    const selector = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
      'textarea',
      'select',
      'mat-select',
      'ng-select',
      '[role="combobox"]',
      '[role="listbox"]',
      '[aria-haspopup="listbox"]',
      '[contenteditable="true"]',
      '.react-select__input',
      '.tags-input',
      '.chip-input'
    ].join(',');

    const results: HTMLElement[] = [];
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
    results.push(...elements);

    // Recursively traverse open shadow roots
    const allNodes = root.querySelectorAll('*');
    for (const node of Array.from(allNodes)) {
      if (node.shadowRoot) {
        results.push(...this.discoverElements(node.shadowRoot));
      }
    }

    // Recursively traverse accessible same-origin iframes
    const iframes = Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe'));
    for (const frame of iframes) {
      try {
        if (frame.contentDocument && frame.contentDocument.body) {
          results.push(...this.discoverElements(frame.contentDocument.body));
        }
      } catch {
        // Cross-origin iframe; handled by its own content script via all_frames: true
      }
    }

    return results;
  }

  public isVisible(element: HTMLElement): boolean {
    if (element.getAttribute('type') === 'hidden') return false;

    // Check computed styles
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Check dimensions or offsetParent (in JSDOM, offsetParent is always null)
    const isJSDOM = typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom');
    if (!isJSDOM) {
      const rect = element.getBoundingClientRect();
      if (
        rect.width === 0 &&
        rect.height === 0 &&
        element.tagName !== 'SELECT' &&
        element.offsetParent === null
      ) {
        return false;
      }
    }

    return true;
  }

  private createDescriptor(element: HTMLElement, index: number): FieldDescriptor | null {
    const controlType = this.determineControlType(element);
    const htmlType = element.getAttribute('type') || undefined;
    const name = element.getAttribute('name') || undefined;
    const domId = element.getAttribute('id') || undefined;
    const placeholder = element.getAttribute('placeholder') || undefined;
    const ariaLabel = element.getAttribute('aria-label') || undefined;
    const ariaDescribedBy = element.getAttribute('aria-describedby') || undefined;

    const labelText = this.findLabelText(element);
    const nearbyText = this.findNearbyText(element);
    const sectionHeading = this.findSectionHeading(element);
    const options = this.extractOptions(element, controlType);

    const isRequired =
      element.hasAttribute('required') ||
      element.getAttribute('aria-required') === 'true' ||
      (labelText && labelText.includes('*')) ||
      false;

    const isDisabled = (element as HTMLInputElement).disabled || element.getAttribute('aria-disabled') === 'true';
    const isReadOnly = (element as HTMLInputElement).readOnly || false;

    const currentValue = this.extractCurrentValue(element, controlType);
    const fieldSignature = computeFieldSignature(element, this.domain, labelText);
    const selector = this.generateSelector(element);
    const id = `f_${index}_${fieldSignature}`;

    // Stamp DOM element with data-autofill-id for 100% pinpoint accuracy during interaction
    element.setAttribute('data-autofill-id', id);

    return {
      id,
      fieldSignature,
      controlType,
      htmlType,
      name,
      domId,
      placeholder,
      ariaLabel,
      ariaDescribedBy,
      labelText,
      nearbyText,
      sectionHeading,
      options,
      isVisible: true,
      isDisabled,
      isReadOnly,
      isRequired,
      currentValue,
      selector
    };
  }

  private determineControlType(element: HTMLElement): ControlType {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();

    if (
      element.classList.contains('react-select__input') ||
      element.closest('.react-select-container')
    ) {
      return 'searchable_select';
    }

    const placeholder = (element.getAttribute('placeholder') || '').toLowerCase();
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    const autoId = (element.getAttribute('data-automation-id') || '').toLowerCase();
    const parentText = (element.parentElement?.parentElement?.textContent || '').toLowerCase();

    const isTagOrSkillsInput =
      element.classList.contains('tags-input') ||
      element.classList.contains('chip-input') ||
      element.closest('[data-type="tag-input"]') !== null ||
      element.closest('[data-automation-id*="skills" i]') !== null ||
      placeholder.includes('add skill') ||
      placeholder.includes('type to add') ||
      ariaLabel.includes('add skill') ||
      ariaLabel.includes('type to add') ||
      parentText.includes('enter a skill below and press enter') ||
      parentText.includes('options load only after you press enter') ||
      (autoId.includes('searchbox') && parentText.includes('skill'));

    if (isTagOrSkillsInput) {
      return 'tag_input';
    }

    if (tag === 'textarea') return 'textarea';
    if (tag === 'select' || tag === 'mat-select' || tag === 'ng-select' || element.classList.contains('mat-select')) return 'select';

    if (role === 'combobox') return 'combobox';
    if (role === 'listbox') return 'select';

    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'email') return 'email';
      if (type === 'tel') return 'phone';
      if (type === 'number') return 'number';
      if (type === 'url') return 'url';
      if (type === 'date') return 'date';
      if (type === 'file') return 'file';
      return 'text';
    }

    return 'unknown';
  }

  private findLabelText(element: HTMLElement): string | undefined {
    const id = element.getAttribute('id');

    // 1. Explicit <label for="id">
    if (id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicitLabel && explicitLabel.textContent) {
        return cleanText(explicitLabel.textContent);
      }
    }

    // 2. Enclosing <label>
    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return cleanText(parentLabel.textContent);
    }

    // 3. aria-labelledby
    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((labelId) => {
          const el = document.getElementById(labelId);
          return el?.textContent || '';
        })
        .join(' ');
      if (text.trim()) return cleanText(text);
    }

    // 4. aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return cleanText(ariaLabel);

    // 5. Preceding sibling label or span
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (
        (sibling.tagName === 'LABEL' || sibling.tagName === 'SPAN' || sibling.tagName === 'DIV') &&
        sibling.textContent &&
        sibling.textContent.trim().length > 0 &&
        sibling.textContent.trim().length < 100
      ) {
        return cleanText(sibling.textContent);
      }
      sibling = sibling.previousElementSibling;
    }

    // 6. Parent container label / sibling (for nested input wrappers)
    const parentContainer = element.parentElement;
    if (parentContainer) {
      const containerLabel = parentContainer.querySelector('label, [class*="label"], [class*="Label"], [class*="title"], [class*="Title"]');
      if (containerLabel && containerLabel !== element && containerLabel.textContent) {
        const text = cleanText(containerLabel.textContent);
        if (text.length > 0 && text.length < 80) return text;
      }
      const prev = parentContainer.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim().length < 80) {
        return cleanText(prev.textContent);
      }
      // Also check grandparent (e.g. form-row)
      const grandParent = parentContainer.parentElement;
      if (grandParent) {
        const rowLabel = grandParent.querySelector('label, [class*="label"], [class*="Label"], [class*="title"], [class*="Title"]');
        if (rowLabel && rowLabel !== element && rowLabel.textContent) {
          const text = cleanText(rowLabel.textContent);
          if (text.length > 0 && text.length < 100) return text;
        }
        const grandPrev = grandParent.previousElementSibling;
        if (grandPrev && grandPrev.textContent && grandPrev.textContent.trim().length < 100) {
          return cleanText(grandPrev.textContent);
        }
      }
    }

    // 7. Angular Material mat-form-field container
    const matFormField = element.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field');
    if (matFormField) {
      const matLabel = matFormField.querySelector('mat-label, label, .mat-form-field-label, .mat-mdc-floating-label');
      if (matLabel && matLabel !== element && matLabel.textContent) {
        const text = cleanText(matLabel.textContent);
        if (text.length > 0 && text.length < 100) return text;
      }
    }

    // 8. Enclosing Question or Field Row container (Microsoft Forms, Google Forms, Workday, ATSs)
    const questionContainer = element.closest(
      '[data-automation-id="questionItem"], [role="listitem"], .office-form-question, [class*="question"], [class*="Question"], [class*="form-item"], [class*="form-group"], [class*="form-row"], [class*="form-field"], fieldset, [data-qa="block"]'
    );
    if (questionContainer) {
      const qTitle = questionContainer.querySelector(
        '[data-automation-id="questionTitle"], [class*="question-title"], [class*="questionTitle"], [class*="QuestionTitle"], [role="heading"], legend, label, [class*="title"], [class*="Title"], [class*="label"], [class*="Label"]'
      );
      if (qTitle && qTitle !== element && qTitle.textContent) {
        const text = cleanText(qTitle.textContent);
        if (text.length > 0 && text.length < 150) return text;
      }
    }

    // 8. Title or data attributes
    const titleAttr = element.getAttribute('title') || element.getAttribute('data-label') || element.getAttribute('data-field-name');
    if (titleAttr) return cleanText(titleAttr);

    return undefined;
  }

  private findNearbyText(element: HTMLElement): string | undefined {
    const parent = element.parentElement;
    if (!parent) return undefined;

    // Check parent's text without element's own value
    const clone = parent.cloneNode(true) as HTMLElement;
    const inputs = clone.querySelectorAll('input, select, textarea, button');
    inputs.forEach((inp) => inp.remove());

    const text = cleanText(clone.textContent || '');
    return text.length > 0 && text.length < 250 ? text : undefined;
  }

  private findSectionHeading(element: HTMLElement): string | undefined {
    // Check fieldset legend
    const fieldset = element.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend?.textContent) return cleanText(legend.textContent);
    }

    // Check nearest ancestor section heading
    let ancestor: HTMLElement | null = element.parentElement;
    while (ancestor && ancestor !== document.body) {
      const heading = ancestor.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
      if (heading && heading.textContent) {
        return cleanText(heading.textContent);
      }
      ancestor = ancestor.parentElement;
    }

    return undefined;
  }

  private extractOptions(element: HTMLElement, controlType: ControlType): FieldOption[] | undefined {
    if (controlType === 'select' && element.tagName === 'SELECT') {
      const select = element as HTMLSelectElement;
      return Array.from(select.options).map((opt) => ({
        label: opt.text.trim(),
        value: opt.value,
        selected: opt.selected
      }));
    }

    // For custom dropdowns/comboboxes, see if aria-controls or child list exists
    if (controlType === 'combobox') {
      const listId = element.getAttribute('aria-controls') || element.getAttribute('aria-owns');
      if (listId) {
        const list = document.getElementById(listId);
        if (list) {
          const opts = list.querySelectorAll('[role="option"]');
          if (opts.length > 0) {
            return Array.from(opts).map((opt) => ({
              label: cleanText(opt.textContent || ''),
              value: opt.getAttribute('data-value') || opt.getAttribute('id') || cleanText(opt.textContent || '')
            }));
          }
        }
      }
    }

    return undefined;
  }

  private extractCurrentValue(element: HTMLElement, controlType: ControlType): string | string[] | boolean | null {
    if (controlType === 'checkbox') {
      return (element as HTMLInputElement).checked;
    }
    if (controlType === 'radio') {
      return (element as HTMLInputElement).checked;
    }
    if (controlType === 'select' && element.tagName === 'SELECT') {
      const select = element as HTMLSelectElement;
      if (select.multiple) {
        return Array.from(select.selectedOptions).map((o) => o.value);
      }
      return select.value;
    }
    if ('value' in element) {
      return (element as HTMLInputElement).value || null;
    }
    return element.textContent?.trim() || null;
  }

  private generateSelector(element: HTMLElement): string {
    const rawId = element.getAttribute('id');
    const isDynamicId = rawId ? /[:_]\d+|ember\d+|react-|ng-|\b\d{5,}\b/.test(rawId) : false;
    if (rawId && !isDynamicId) {
      return `#${CSS.escape(rawId)}`;
    }
    const name = element.getAttribute('name');
    if (name) {
      return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    }
    // Path selector with :nth-child so every branch is unique across repeated question cards
    const parts: string[] = [];
    let curr: HTMLElement | null = element;
    while (curr && curr !== document.body && parts.length < 5) {
      let part = curr.tagName.toLowerCase();
      if (curr.parentElement) {
        const siblings = Array.from(curr.parentElement.children);
        const index = siblings.indexOf(curr) + 1;
        part += `:nth-child(${index})`;
      } else if (curr.className && typeof curr.className === 'string') {
        const firstClass = curr.className.trim().split(/\s+/)[0];
        if (firstClass && !firstClass.includes(':')) {
          part += `.${CSS.escape(firstClass)}`;
        }
      }
      parts.unshift(part);
      curr = curr.parentElement;
    }
    return parts.join(' > ');
  }
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
