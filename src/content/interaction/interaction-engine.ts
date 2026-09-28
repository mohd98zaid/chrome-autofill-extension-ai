import { FieldDescriptor } from '../../types/taxonomy';
import { logger } from '../../utils/logger';

export interface InteractionResult {
  success: boolean;
  strategyUsed: string;
  attemptedValue: string | string[] | boolean;
  error?: string;
}

export class InteractionEngine {
  /**
   * Dispatches value into an element with framework compatibility (React, Vue, Angular)
   */
  public async fill(element: HTMLElement, field: FieldDescriptor, value: string | string[] | boolean): Promise<InteractionResult> {
    try {
      // 1. Ensure element is focusable and in view
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
      element.focus();

      let result: InteractionResult;

      switch (field.controlType) {
        case 'text':
        case 'email':
        case 'phone':
        case 'url':
        case 'number':
        case 'date':
        case 'textarea':
          result = await this.fillTextInput(element as HTMLInputElement | HTMLTextAreaElement, String(value));
          break;

        case 'select':
          result = await this.fillSelect(element as HTMLSelectElement, value);
          break;

        case 'checkbox':
          result = await this.fillCheckbox(element as HTMLInputElement, Boolean(value));
          break;

        case 'radio':
          result = await this.fillRadio(element as HTMLInputElement, Boolean(value));
          break;

        case 'tag_input':
          result = await this.fillTagInput(element, value);
          break;

        case 'combobox':
        case 'searchable_select':
          result = await this.fillSearchableSelect(element, String(value));
          break;

        default:
          if ('value' in element) {
            result = await this.fillTextInput(element as HTMLInputElement, String(value));
          } else {
            result = {
              success: false,
              strategyUsed: 'unsupported_control',
              attemptedValue: value,
              error: `Unsupported control type: ${field.controlType}`
            };
          }
      }

      // Final blur event to complete validation cycle
      element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      return result;
    } catch (err) {
      logger.error('InteractionEngine', `Failed to fill field ${field.id}`, { error: String(err) });
      return {
        success: false,
        strategyUsed: 'exception_fallback',
        attemptedValue: value,
        error: String(err)
      };
    }
  }

  public async fillTextInput(element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<InteractionResult> {
    let cleanValue = value;

    // Smart phone cleaning: if this is a phone number input and value contains country code prefix (e.g. +91)
    if (/phone|mobile|tel/i.test(`${element.name || ''} ${element.id || ''} ${element.getAttribute('aria-label') || ''}`)) {
      if (!/ext|device|code/i.test(`${element.name || ''} ${element.id || ''} ${element.getAttribute('aria-label') || ''}`)) {
        const digits = value.replace(/\D/g, '');
        // If 12 digits starting with 91 (India) or 11 digits starting with 1 (US)
        if (digits.length > 10 && digits.startsWith('91')) {
          cleanValue = digits.slice(2);
        } else if (digits.length > 10 && digits.startsWith('1')) {
          cleanValue = digits.slice(1);
        }
      }
    }

    try {
      element.focus();
      element.dispatchEvent(new FocusEvent('focus', { bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: true, composed: true }));
    } catch {
      // ignore
    }

    // 1. Try native execCommand insertion (triggers trusted browser beforeinput & input events for React, Angular, SAP UI5, Vue)
    let execSuccess = false;
    try {
      if (typeof element.select === 'function') {
        element.select();
      }
      execSuccess = document.execCommand('insertText', false, cleanValue);
    } catch {
      execSuccess = false;
    }

    // 2. Fallback / ensure value is explicitly set via prototype descriptor (React 16+, SAP UI5, Angular)
    if (!execSuccess || element.value !== cleanValue) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

      if (descriptor && descriptor.set) {
        descriptor.set.call(element, cleanValue);
      } else {
        element.value = cleanValue;
      }
    }

    // Always ensure HTML attribute matches
    element.setAttribute('value', cleanValue);

    // 3. Dispatch full event stream (Keyboard, Input, Change)
    try {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: cleanValue.slice(-1) || 'a', bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: cleanValue.slice(-1) || 'a', bubbles: true, cancelable: true, composed: true }));
    } catch {}

    try {
      element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, data: cleanValue, inputType: 'insertText' }));
      element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, data: cleanValue, inputType: 'insertText' }));
    } catch {
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
    }

    try {
      element.dispatchEvent(new KeyboardEvent('keyup', { key: cleanValue.slice(-1) || 'a', bubbles: true, cancelable: true, composed: true }));
    } catch {}

    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));

    // 4. Focusout & Blur (essential for jQuery Validation, SAP UI5, and Angular model committing)
    try {
      element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new FocusEvent('blur', { bubbles: true, cancelable: true, composed: true }));
      element.blur();
    } catch {
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // 5. Clean up any existing error message or invalid state in the DOM
    try {
      element.removeAttribute('aria-invalid');
      const container = element.closest('div, td, tr, li, p, section') || element.parentElement;
      if (container) {
        const errorNodes = container.querySelectorAll('.error, [class*="error"], [class*="Error"], .invalid-feedback, .text-danger');
        for (const err of Array.from(errorNodes)) {
          if ((err.textContent || '').toLowerCase().includes('required') || (err.textContent || '').toLowerCase().includes('must have a value')) {
            (err as HTMLElement).style.display = 'none';
          }
        }
      }
    } catch {}

    return {
      success: true,
      strategyUsed: execSuccess ? 'execCommand_insertText' : 'native_setter_with_synthetic_events',
      attemptedValue: cleanValue
    };
  }

  private async fillSelect(targetElement: HTMLElement, value: string | string[] | boolean): Promise<InteractionResult> {
    const valStr = String(value).toLowerCase().trim();

    // 1. Resolve actual select element
    const element = targetElement instanceof HTMLSelectElement
      ? targetElement
      : (targetElement.querySelector('select') as HTMLSelectElement | null);

    if (element && element.options) {
      const isPlaceholder = (t: string) => /select\s*one|^select$|choose\b|none\b|^--|please\s*select/i.test(t);

      // Alias dictionaries for robust matching
      const STATE_ALIASES: Record<string, string[]> = {
        'uttar pradesh': ['up', 'in-up', 'u.p.', 'uttar pradesh'],
        'maharashtra': ['mh', 'in-mh', 'maharashtra'],
        'delhi': ['dl', 'in-dl', 'new delhi', 'nct of delhi', 'delhi'],
        'karnataka': ['ka', 'in-ka', 'karnataka'],
        'tamil nadu': ['tn', 'in-tn', 'tamil nadu'],
        'telangana': ['ts', 'tg', 'in-tg', 'telangana'],
        'gujarat': ['gj', 'in-gj', 'gujarat'],
        'west bengal': ['wb', 'in-wb', 'west bengal'],
        'rajasthan': ['rj', 'in-rj', 'rajasthan'],
        'andhra pradesh': ['ap', 'in-ap', 'andhra pradesh'],
        'kerala': ['kl', 'in-kl', 'kerala'],
        'punjab': ['pb', 'in-pb', 'punjab'],
        'haryana': ['hr', 'in-hr', 'haryana'],
        'bihar': ['br', 'in-br', 'bihar'],
        'madhya pradesh': ['mp', 'in-mp', 'madhya pradesh'],
        'california': ['ca', 'california'],
        'new york': ['ny', 'new york'],
        'texas': ['tx', 'texas'],
        'florida': ['fl', 'florida'],
        'washington': ['wa', 'washington']
      };

      const DEGREE_ALIASES: Record<string, string[]> = {
        'b. tech': ['bachelor of technology', "bachelor's", 'bachelor', 'undergraduate', 'b.tech', 'btech', 'b.e.', 'be', 'b.sc', 'bsc'],
        'bachelor': ['bachelor of technology', "bachelor's", 'bachelor', 'undergraduate', 'b.tech', 'btech', 'b.e.', 'be'],
        'master': ['master of technology', "master's", 'master', 'graduate', 'postgraduate', 'm.tech', 'mtech', 'ms', 'm.s.'],
        'm. tech': ['master of technology', "master's", 'master', 'graduate', 'postgraduate', 'm.tech', 'mtech', 'ms'],
        'phd': ['doctorate', 'phd', 'ph.d', 'doctoral']
      };

      const PHONE_DEVICE_ALIASES: Record<string, string[]> = {
        'mobile': [
          'mobile',
          'cellular',
          'cell',
          'smart phone',
          'wireless',
          'personal mobile',
          'personal',
          'mobile phone',
          'cell phone',
          'mobile/cell',
          'm'
        ],
        'landline': ['landline', 'home', 'fixed', 'home phone', 'h', 'land line'],
        'work': ['work', 'office', 'business', 'w', 'b']
      };

      const PROFICIENCY_ALIASES: Record<string, string[]> = {
        'fluent': ['fluent', 'proficient', 'advanced', 'native', 'bilingual', 'full professional', 'professional working'],
        'intermediate': ['intermediate', 'working', 'moderate', 'conversational'],
        'basic': ['basic', 'elementary', 'beginner']
      };

      const COUNTRY_ALIASES: Record<string, string[]> = {
        'india': ['in', 'ind', 'india', 'republic of india', 'bharat'],
        'united states': ['us', 'usa', 'united states', 'united states of america', 'u.s.a.', 'u.s.'],
        'united kingdom': ['uk', 'gb', 'gbr', 'united kingdom', 'great britain', 'england'],
        'united arab emirates': ['uae', 'are', 'united arab emirates'],
        'canada': ['ca', 'can', 'canada'],
        'germany': ['de', 'deu', 'germany', 'deutschland'],
        'poland': ['pl', 'pol', 'poland', 'polska'],
        'australia': ['au', 'aus', 'australia'],
        'singapore': ['sg', 'sgp', 'singapore'],
        'netherlands': ['nl', 'nld', 'netherlands', 'holland']
      };

      let matchedOption: HTMLOptionElement | null = null;
      const opts = Array.from(element.options);

      // Pass 1: Exact match
      for (const opt of opts) {
        const optVal = opt.value.toLowerCase().trim();
        const optText = opt.text.toLowerCase().trim();
        if (isPlaceholder(optText)) continue;
        if (optVal === valStr || optText === valStr) {
          matchedOption = opt;
          break;
        }
      }

      // Pass 2: Alias dictionary match (for State, Country, Degree, Phone Device Type, Proficiency)
      if (!matchedOption) {
        const findInDict = (dict: Record<string, string[]>) => {
          for (const [key, aliases] of Object.entries(dict)) {
            if (valStr === key || aliases.includes(valStr) || valStr.includes(key)) {
              for (const opt of opts) {
                const optVal = opt.value.toLowerCase().trim();
                const optText = opt.text.toLowerCase().trim();
                if (isPlaceholder(optText)) continue;
                if (
                  aliases.some((a) => optVal === a || optText === a || optText.includes(a) || optVal.includes(a))
                ) {
                  return opt;
                }
              }
            }
          }
          return null;
        };

        matchedOption =
          findInDict(PHONE_DEVICE_ALIASES) ||
          findInDict(STATE_ALIASES) ||
          findInDict(COUNTRY_ALIASES) ||
          findInDict(DEGREE_ALIASES) ||
          findInDict(PROFICIENCY_ALIASES);
      }

      // Pass 3: Substring / partial match
      if (!matchedOption) {
        for (const opt of opts) {
          const optVal = opt.value.toLowerCase().trim();
          const optText = opt.text.toLowerCase().trim();
          if (isPlaceholder(optText)) continue;
          if (
            (valStr.length >= 3 && optText.includes(valStr)) ||
            (optText.length >= 3 && valStr.includes(optText)) ||
            (valStr.length >= 3 && optVal.includes(valStr))
          ) {
            matchedOption = opt;
            break;
          }
        }
      }

      // Pass 4: Fallback for Phone Device Type (never leave on "Select One")
      if (!matchedOption && (valStr === 'mobile' || /device|phone/i.test(`${element.name || ''} ${element.id || ''}`))) {
        matchedOption =
          opts.find((o) => !isPlaceholder(o.text) && /mob|cell|phone|personal/i.test(o.text)) ||
          opts.find((o) => !isPlaceholder(o.text) && o.value !== '') ||
          null;
      }

      if (matchedOption) {
        try {
          element.focus();
        } catch {}

        element.selectedIndex = matchedOption.index;
        for (let i = 0; i < element.options.length; i++) {
          element.options[i].selected = i === matchedOption.index;
          if (i === matchedOption.index) {
            element.options[i].setAttribute('selected', 'selected');
          } else {
            element.options[i].removeAttribute('selected');
          }
        }
        element.value = matchedOption.value;
        element.setAttribute('value', matchedOption.value);

        const selectProto = HTMLSelectElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(selectProto, 'value');
        if (desc && desc.set) {
          desc.set.call(element, matchedOption.value);
        }

        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
        try {
          element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: true, composed: true }));
          element.dispatchEvent(new FocusEvent('blur', { bubbles: true, cancelable: true, composed: true }));
          element.blur();
        } catch {
          element.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        // Clean up error state if present
        try {
          element.removeAttribute('aria-invalid');
          const container = element.closest('div, td, tr, li, p, section') || element.parentElement;
          if (container) {
            const errNodes = container.querySelectorAll('.error, [class*="error"], [class*="Error"], .invalid-feedback, .text-danger');
            for (const err of Array.from(errNodes)) {
              if ((err.textContent || '').toLowerCase().includes('required') || (err.textContent || '').toLowerCase().includes('must have a value')) {
                (err as HTMLElement).style.display = 'none';
              }
            }
          }
        } catch {}

        return {
          success: true,
          strategyUsed: 'select_option_match',
          attemptedValue: matchedOption.value
        };
      }
    }

    // 2. Custom button/combobox popup (e.g. Workday button dropdown, Angular Material mat-select, ng-select, SAP UI5)
    const isCustomSelect =
      targetElement.tagName === 'MAT-SELECT' ||
      targetElement.tagName === 'NG-SELECT' ||
      targetElement.classList.contains('mat-select') ||
      targetElement.classList.contains('sapMSlt') ||
      targetElement.classList.contains('selectBox') ||
      targetElement.getAttribute('aria-haspopup') === 'listbox' ||
      targetElement.getAttribute('role') === 'button' ||
      targetElement.getAttribute('role') === 'combobox' ||
      targetElement.tagName === 'BUTTON' ||
      Boolean(targetElement.querySelector('mat-select, ng-select, [role="combobox"], [aria-haspopup="listbox"]'));

    if (isCustomSelect) {
      const clickEl = (targetElement.matches?.('mat-select, ng-select, [role="combobox"], [aria-haspopup="listbox"], button')
        ? targetElement
        : targetElement.querySelector<HTMLElement>('mat-select, ng-select, [role="combobox"], [aria-haspopup="listbox"], button')) || targetElement;

      clickEl.click();
      await new Promise((r) => setTimeout(r, 200));

      const popups = Array.from(
        document.querySelectorAll<HTMLElement>(
          'mat-option, .mat-option, [role="option"], .ng-option, [data-automation-id*="promptOption"], .sapMSelectListItem, .sapUiSelectListItem, li'
        )
      );
      const targetLower = valStr;

      // Pass 1: exact match
      let found = popups.find((p) => {
        const txt = (p.textContent || '').toLowerCase().trim();
        return txt === targetLower;
      });

      // Pass 2: partial or substring match
      if (!found) {
        found = popups.find((p) => {
          const txt = (p.textContent || '').toLowerCase().trim();
          return (targetLower.length >= 3 && txt.includes(targetLower)) || (txt.length >= 3 && targetLower.includes(txt));
        });
      }

      // Pass 3: Phone device fallback for custom listboxes
      if (!found && targetLower === 'mobile') {
        found = popups.find((p) => {
          const txt = (p.textContent || '').toLowerCase().trim();
          return /mob|cell|phone|personal/i.test(txt);
        });
      }

      if (found) {
        found.click();
        return {
          success: true,
          strategyUsed: 'custom_button_listbox_click',
          attemptedValue: value
        };
      }
    }

    return {
      success: false,
      strategyUsed: 'select_option_no_match',
      attemptedValue: value,
      error: `Option "${value}" not found in select dropdown`
    };
  }

  private async fillCheckbox(element: HTMLInputElement, checked: boolean): Promise<InteractionResult> {
    if (element.checked !== checked) {
      element.click();
      if (element.checked !== checked) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, checked);
        } else {
          element.checked = checked;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    return {
      success: true,
      strategyUsed: 'checkbox_setter',
      attemptedValue: checked
    };
  }

  private async fillRadio(element: HTMLInputElement, checked: boolean): Promise<InteractionResult> {
    if (checked && !element.checked) {
      element.click();
      if (!element.checked) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, true);
        } else {
          element.checked = true;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    return {
      success: true,
      strategyUsed: 'radio_setter',
      attemptedValue: checked
    };
  }

  private async fillTagInput(container: HTMLElement, value: string | string[] | boolean): Promise<InteractionResult> {
    const input = container.querySelector('input') || (container.tagName === 'INPUT' ? (container as HTMLInputElement) : null);
    if (!input) {
      return {
        success: false,
        strategyUsed: 'tag_input_no_inner_input',
        attemptedValue: value,
        error: 'No text input found inside tag control container'
      };
    }

    const rawItems = Array.isArray(value) ? value : String(value).split(/[,;]\s*/);
    const items = rawItems.slice(0, 15);

    let filledCount = 0;

    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;

      input.focus();
      await this.fillTextInput(input, trimmed);

      // Dispatch Enter key events
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

      // Wait a tick for Workday / dynamic ATS dropdown options to load
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Check for prompt options rendered in document
      const promptSelectors = [
        '[data-automation-id="promptOption"]',
        '[data-automation-id*="promptOption"]',
        '[data-uxi-element-id*="promptOption"]',
        '[role="listbox"] [role="option"]',
        '[role="option"]',
        '.select__option',
        'ul[role="listbox"] li',
        '.gwt-MenuItem'
      ].join(',');

      const renderedOptions = Array.from(document.querySelectorAll<HTMLElement>(promptSelectors)).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });

      let optionClicked = false;
      if (renderedOptions.length > 0) {
        const itemLower = trimmed.toLowerCase();
        const exact = renderedOptions.find((opt) => (opt.textContent || '').trim().toLowerCase() === itemLower);
        const partial = renderedOptions.find((opt) => {
          const optText = (opt.textContent || '').trim().toLowerCase();
          return optText.includes(itemLower) || itemLower.includes(optText);
        });
        const targetOpt = exact || partial || renderedOptions[0];
        if (targetOpt) {
          targetOpt.click();
          optionClicked = true;
          filledCount++;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      if (!optionClicked) {
        // Fallback for standard tag inputs: comma key event
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', keyCode: 188, which: 188, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: ',', code: 'Comma', keyCode: 188, which: 188, bubbles: true }));
        filledCount++;
      }

      // If text remains in the input, clear it so next skill can be typed cleanly
      if (input.value) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(input, '');
        } else {
          input.value = '';
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      success: filledCount > 0,
      strategyUsed: 'tag_input_workday_prompt_and_enter',
      attemptedValue: items
    };
  }

  private async fillSearchableSelect(container: HTMLElement, value: string): Promise<InteractionResult> {
    const input = container.querySelector('input') || (container.tagName === 'INPUT' ? (container as HTMLInputElement) : null);

    if (input) {
      // Focus and type value into input
      await this.fillTextInput(input, value);

      // Wait a tick for dropdown items to render
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try finding rendered option
      const listId = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
      const listContainer = listId ? document.getElementById(listId) : container.parentElement;

      if (listContainer) {
        const options = Array.from(listContainer.querySelectorAll('[role="option"], .select__option, li'));
        const targetLower = value.toLowerCase().trim();
        const matched = options.find((opt) => opt.textContent?.toLowerCase().trim().includes(targetLower));

        if (matched) {
          (matched as HTMLElement).click();
          return {
            success: true,
            strategyUsed: 'searchable_select_click_option',
            attemptedValue: value
          };
        }
      }

      // Fallback: press Enter to select first filtered option
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      return {
        success: true,
        strategyUsed: 'searchable_select_enter_key',
        attemptedValue: value
      };
    }

    return {
      success: false,
      strategyUsed: 'searchable_select_no_input',
      attemptedValue: value,
      error: 'Could not interact with combobox/searchable select'
    };
  }
}
