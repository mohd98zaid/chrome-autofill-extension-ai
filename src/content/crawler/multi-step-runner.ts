import { logger } from '../../utils/logger';

export class MultiStepWizardRunner {
  /**
   * Helper to determine visibility of element
   */
  public static isVisible(el: HTMLElement): boolean {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Simulates full realistic user click chain (mousedown, mouseup, click)
   * Essential for React 18/19 and Ember components (e.g. LinkedIn Artdeco buttons)
   */
  public static triggerRealClick(element: HTMLElement): void {
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
    try {
      element.focus();
    } catch {}

    const pointerEvents = ['pointerdown', 'pointerup'];
    for (const eventType of pointerEvents) {
      try {
        const event = new PointerEvent(eventType, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
      } catch {}
    }

    const mouseEvents = ['mousedown', 'mouseup', 'click'];
    for (const eventType of mouseEvents) {
      try {
        const event = new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(event);
      } catch {
        try {
          element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
        } catch {}
      }
    }

    try {
      if (typeof element.click === 'function') {
        element.click();
      }
    } catch {}
  }

  /**
   * Polls until application modal / dialog and its form fields render
   */
  public static async waitForModalToMount(maxWaitMs: number = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const modal = document.querySelector('[role="dialog"], .jobs-easy-apply-modal, [data-test-modal], [class*="modal" i], form');
      if (modal) {
        const fields = modal.querySelectorAll('input:not([type="hidden"]), textarea, select, button[type="submit"]');
        if (fields.length > 0) return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  /**
   * Clicks initial "Easy Apply" or "Apply" button on job listing pages if form is not yet visible.
   */
  public static async clickInitialApplyButton(): Promise<boolean> {
    const applySelectors = [
      '#jobs-apply-button-id',
      'button.jobs-apply-button',
      '.jobs-apply-button--top-card button',
      '.jobs-s-apply button',
      'button.jobs-apply-button--top-card',
      '[data-control-name="jobdetails_topcard_easy_apply"]',
      'button[aria-label*="Easy Apply" i]',
      'button[aria-label*="Apply now" i]',
      'button[data-testid="indeedApplyButton"]',
      'a.jobs-apply-button',
      '.jobs-apply-button button',
      'button.easy-apply-button',
      'button[class*="apply-button" i]',
      'button[class*="easyApply" i]'
    ];

    let clicked = false;
    for (const sel of applySelectors) {
      const btn = document.querySelector<HTMLElement>(sel);
      if (btn && this.isVisible(btn) && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text.includes('applied')) {
          logger.info('MultiStepWizardRunner', 'Already applied to this job.');
          return false;
        }
        logger.info('MultiStepWizardRunner', `Clicking initial apply button: ${sel}`);
        this.triggerRealClick(btn);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // Generic button matching "Easy Apply" or "Apply Now"
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"]'));
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if ((text === 'easy apply' || text === 'apply now' || text === 'easily apply' || text.includes('easy apply')) && this.isVisible(btn) && !text.includes('applied')) {
          logger.info('MultiStepWizardRunner', `Clicking generic apply button: "${text}"`);
          this.triggerRealClick(btn);
          clicked = true;
          break;
        }
      }
    }

    if (clicked) {
      // Wait for modal or dialog to appear and for interactive fields to mount
      const mounted = await this.waitForModalToMount(4500);
      logger.info('MultiStepWizardRunner', `Modal mounted after initial apply click: ${mounted}`);
      return true;
    }

    return false;
  }

  /**
   * Scans current visible step for navigation buttons.
   * Differentiates between INTERMEDIATE ("Next", "Continue") and FINAL ("Submit").
   */
  public static findStepButton(): { type: 'intermediate' | 'final' | 'none'; button?: HTMLElement; label?: string } {
    const FINAL_SUBMIT_REGEX = /\b(submit|submit application|submit your application|send application|confirm and submit|finish application|complete application|complete submission|submit candidate)\b/i;
    const INTERMEDIATE_REGEX = /\b(next|continue|proceed|review|review application|review your application|save\s*&\s*continue|save\s*and\s*continue)\b/i;

    // Search in dialog, modal, form, or document body
    const container =
      document.querySelector('.jobs-easy-apply-modal, [role="dialog"], [data-test-modal], form, .application-modal') ||
      document.body ||
      document.documentElement;

    if (!container) {
      return { type: 'none' };
    }

    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button, [role="button"], input[type="submit"], input[type="button"]'
      )
    ).filter(
      (b) =>
        this.isVisible(b) &&
        !b.hasAttribute('disabled') &&
        b.getAttribute('aria-disabled') !== 'true' &&
        !b.id.startsWith('__btn_crawler') // Exclude crawler overlay controls
    );

    // 1. Check if FINAL SUBMIT is present (Last Stage)
    for (const btn of candidates) {
      const txt = (btn.textContent || btn.getAttribute('aria-label') || (btn as HTMLInputElement).value || '').trim();
      if (/\b(cancel|dismiss|close|back|discard|previous)\b/i.test(txt)) continue;
      if (FINAL_SUBMIT_REGEX.test(txt)) {
        return { type: 'final', button: btn, label: txt };
      }
    }

    // 2. Check if INTERMEDIATE STEP button is present
    for (const btn of candidates) {
      const txt = (btn.textContent || btn.getAttribute('aria-label') || (btn as HTMLInputElement).value || '').trim();
      if (/\b(cancel|dismiss|close|back|discard|previous)\b/i.test(txt)) continue;
      if (INTERMEDIATE_REGEX.test(txt)) {
        return { type: 'intermediate', button: btn, label: txt };
      }
    }

    return { type: 'none' };
  }

  /**
   * Sets up an observer to detect when the user submits or a confirmation screen appears
   */
  public static listenForSubmissionSuccess(onSuccess: () => void): () => void {
    const SUCCESS_REGEX = /\b(application submitted|application sent|thank you for applying|your application was sent|applied)\b/i;

    const checkSuccess = () => {
      const text = document.body?.innerText || document.documentElement?.innerText || '';
      if (SUCCESS_REGEX.test(text)) {
        logger.info('MultiStepWizardRunner', 'Application submission confirmation detected!');
        onSuccess();
        return true;
      }
      return false;
    };

    // Check periodically or via DOM mutation
    const interval = setInterval(() => {
      if (checkSuccess()) {
        clearInterval(interval);
      }
    }, 1000);

    // Cleanup function
    return () => clearInterval(interval);
  }
}
