import { logger } from '../../utils/logger';

export interface MutationWatcherOptions {
  onMutation: () => void;
  debounceMs?: number;
}

export class MutationWatcher {
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private options: MutationWatcherOptions;

  constructor(options: MutationWatcherOptions) {
    this.options = options;
  }

  public start(targetNode: Node = document.body) {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      let shouldTrigger = false;

      for (const mut of mutations) {
        if (mut.type === 'childList' && mut.addedNodes.length > 0) {
          for (const node of Array.from(mut.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              // Check if newly added node contains inputs, forms, or security challenges
              if (
                el.matches &&
                (el.matches('input, select, textarea, [role="combobox"], mat-select, ng-select, .g-recaptcha, iframe[src*="captcha"]') ||
                  el.querySelector('input, select, textarea, [role="combobox"], mat-select, ng-select, .g-recaptcha, iframe[src*="captcha"]'))
              ) {
                shouldTrigger = true;
                break;
              }
            }
          }
        } else if (mut.type === 'attributes') {
          const target = mut.target as HTMLElement;
          if (
            target &&
            (target.matches?.('input, select, textarea, mat-select, ng-select, form, [role="form"], [role="tabpanel"], .step, [data-step]') ||
              target.querySelector?.('input, select, textarea, mat-select, ng-select'))
          ) {
            shouldTrigger = true;
            break;
          }
        }
        if (shouldTrigger) break;
      }

      if (shouldTrigger) {
        this.triggerDebounced();
      }
    });

    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });

    logger.debug('MutationWatcher', 'Started watching DOM mutations');
  }

  public stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    logger.debug('MutationWatcher', 'Stopped watching DOM mutations');
  }

  private triggerDebounced() {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.options.onMutation();
    }, this.options.debounceMs || 250);
  }
}
