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
   * Clicks initial "Easy Apply" or "Apply" button on job listing pages if form is not yet visible.
   */
  public static async clickInitialApplyButton(): Promise<boolean> {
    const applySelectors = [
      'button.jobs-apply-button',
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

    for (const sel of applySelectors) {
      const btn = document.querySelector<HTMLElement>(sel);
      if (btn && this.isVisible(btn) && !btn.hasAttribute('disabled')) {
        logger.info('MultiStepWizardRunner', `Clicking initial apply button: ${sel}`);
        btn.click();
        await new Promise((r) => setTimeout(r, 1500));
        return true;
      }
    }

    // Generic button matching "Easy Apply" or "Apply Now"
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"]'));
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if ((text === 'easy apply' || text === 'apply now' || text === 'easily apply') && this.isVisible(btn)) {
        logger.info('MultiStepWizardRunner', `Clicking generic apply button: "${text}"`);
        btn.click();
        await new Promise((r) => setTimeout(r, 1500));
        return true;
      }
    }

    return false;
  }

  /**
   * Scans current visible step for navigation buttons.
   * Differentiates between INTERMEDIATE ("Next", "Continue") and FINAL ("Submit").
   */
  public static findStepButton(): { type: 'intermediate' | 'final' | 'none'; button?: HTMLElement; label?: string } {
    const FINAL_SUBMIT_REGEX = /\b(submit|submit application|submit your application|send application|confirm and submit|finish application|complete application|complete submission|submit candidate)\b/i;
    const INTERMEDIATE_REGEX = /^(next|continue|proceed|next step|review|review application|review your application|save & continue|save and continue)$/i;

    // Search in dialog, modal, form, or document body
    const container =
      document.querySelector('.jobs-easy-apply-modal, [role="dialog"], form, .application-modal') || document.body;

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
      if (FINAL_SUBMIT_REGEX.test(txt)) {
        return { type: 'final', button: btn, label: txt };
      }
    }

    // 2. Check if INTERMEDIATE STEP button is present
    for (const btn of candidates) {
      const txt = (btn.textContent || btn.getAttribute('aria-label') || (btn as HTMLInputElement).value || '').trim();
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
      const text = document.body.innerText || '';
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
