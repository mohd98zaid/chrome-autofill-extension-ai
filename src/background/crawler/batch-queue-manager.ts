import { CrawlerSession, JobListingItem, StartCrawlPayload } from '../../types/crawler';
import { storage } from '../../storage';
import { logger } from '../../utils/logger';

export class BatchQueueManager {
  private session: CrawlerSession = {
    active: false,
    status: 'idle',
    currentJobIndex: 0,
    totalJobs: 0,
    jobs: [],
    mode: 'new_tab',
    maxBatchSize: 5,
    autoFillDelayMs: 2000
  };

  constructor() {
    this.restoreFromStorage();
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['crawler_session'], (res: Record<string, any>) => {
          if (res?.crawler_session) {
            this.session = res.crawler_session as CrawlerSession;
            logger.info('BatchQueueManager', 'Restored crawler session from storage', {
              active: this.session.active,
              currentIndex: this.session.currentJobIndex,
              total: this.session.totalJobs
            });
          }
        });
      }
    } catch (err) {
      logger.warn('BatchQueueManager', 'Failed to restore session from storage', { error: String(err) });
    }
  }

  private async persistSession(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ crawler_session: this.session });
      }
    } catch (err) {
      logger.warn('BatchQueueManager', 'Failed to persist crawler session', { error: String(err) });
    }
  }

  public getState(): CrawlerSession {
    return { ...this.session };
  }

  public async startCrawl(
    searchTabId: number,
    payload?: StartCrawlPayload
  ): Promise<{ success: boolean; jobCount: number; message: string }> {
    const maxJobs = payload?.maxJobs || 5;
    const mode = payload?.mode || 'new_tab';

    logger.info('BatchQueueManager', `Initiating crawl on tab ${searchTabId}`, { maxJobs, mode });

    // 1. Request job extraction from search page content script
    const extractionResponse = await new Promise<{ jobs?: JobListingItem[]; error?: string }>((resolve) => {
      chrome.tabs.sendMessage(
        searchTabId,
        {
          type: 'CONTENT_EXTRACT_JOBS',
          source: 'background',
          payload: { maxCount: maxJobs },
          timestamp: new Date().toISOString()
        },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(res?.data || res || {});
          }
        }
      );
    });

    const detectedJobs = extractionResponse.jobs || [];

    if (detectedJobs.length === 0) {
      logger.warn('BatchQueueManager', 'No job listings detected on page', { tabId: searchTabId });
      return {
        success: false,
        jobCount: 0,
        message: 'No job listings found on this page. Please navigate to a job search or listings page.'
      };
    }

    // 2. Initialize queue
    this.session = {
      active: true,
      status: 'navigating',
      searchTabId,
      workerTabId: undefined,
      currentJobIndex: 0,
      totalJobs: detectedJobs.length,
      jobs: detectedJobs,
      mode,
      maxBatchSize: maxJobs,
      autoFillDelayMs: 2000
    };

    await this.persistSession();
    this.broadcastState();

    // 3. Begin processing the first job
    this.processCurrentJob();

    return {
      success: true,
      jobCount: detectedJobs.length,
      message: `Found ${detectedJobs.length} jobs. Starting sequential autofill.`
    };
  }

  public async processCurrentJob(): Promise<void> {
    if (!this.session.active) return;

    if (this.session.currentJobIndex >= this.session.jobs.length) {
      logger.info('BatchQueueManager', 'All jobs in queue completed!');
      this.session.active = false;
      this.session.status = 'completed';
      await this.persistSession();
      this.broadcastState();
      return;
    }

    const currentJob = this.session.jobs[this.session.currentJobIndex];
    currentJob.status = 'active';
    this.session.status = 'navigating';
    await this.persistSession();
    this.broadcastState();

    logger.info('BatchQueueManager', `Processing job ${this.session.currentJobIndex + 1}/${this.session.totalJobs}: "${currentJob.title}" at "${currentJob.company}"`);

    if (this.session.mode === 'new_tab') {
      // Companion Tab Mode: Open job in companion tab
      chrome.tabs.create({ url: currentJob.url, active: true }, (tab) => {
        if (!tab || !tab.id) {
          logger.error('BatchQueueManager', 'Failed to create worker tab for job', { url: currentJob.url });
          this.advanceJob('failed', 'Could not open application tab');
          return;
        }

        this.session.workerTabId = tab.id;
        this.persistSession();

        // Wait for page to finish loading
        this.waitForTabReady(tab.id, () => {
          this.executeAutofillInTab(tab.id!);
        });
      });
    } else {
      // Same Tab Mode: Navigate the search tab directly
      const tabId = this.session.searchTabId;
      if (!tabId) return;

      chrome.tabs.update(tabId, { url: currentJob.url }, () => {
        this.waitForTabReady(tabId, () => {
          this.executeAutofillInTab(tabId);
        });
      });
    }
  }

  private waitForTabReady(tabId: number, onReady: () => void): void {
    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Small delay for dynamic frameworks to mount forms
        setTimeout(() => {
          onReady();
        }, this.session.autoFillDelayMs);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  }

  private async executeAutofillInTab(tabId: number): Promise<void> {
    if (!this.session.active) return;

    this.session.status = 'filling';
    await this.persistSession();
    this.broadcastState();

    const profile = await storage.getProfile();
    const settings = await storage.getSettings();

    // Ensure content script is ready and trigger autofill
    chrome.tabs.sendMessage(
      tabId,
      {
        type: 'BG_TRIGGER_FILL',
        source: 'background',
        payload: { profile, settings, fillPayload: { forceAll: true } },
        timestamp: new Date().toISOString()
      },
      (_res) => {
        if (!this.session.active) return;

        this.session.status = 'awaiting_user_submit';
        const currentJob = this.session.jobs[this.session.currentJobIndex];
        if (currentJob) {
          currentJob.status = 'awaiting_review';
        }

        this.persistSession();
        this.broadcastState();

        // Render overlay bar in worker tab
        chrome.tabs.sendMessage(
          tabId,
          {
            type: 'CRAWLER_STATE_UPDATED',
            source: 'background',
            payload: { session: this.session },
            timestamp: new Date().toISOString()
          },
          () => {
            void chrome.runtime?.lastError;
          }
        );
      }
    );
  }

  public async advanceJob(action: 'completed' | 'skipped' | 'failed', errorMessage?: string): Promise<void> {
    if (!this.session.active) return;

    const currentJob = this.session.jobs[this.session.currentJobIndex];
    if (currentJob) {
      currentJob.status = action;
      if (errorMessage) currentJob.errorMessage = errorMessage;
    }

    // Clean up worker tab in new_tab mode
    if (this.session.mode === 'new_tab' && this.session.workerTabId) {
      try {
        chrome.tabs.remove(this.session.workerTabId);
      } catch {
        // ignore
      }
      this.session.workerTabId = undefined;

      // Refocus the main search tab
      if (this.session.searchTabId) {
        chrome.tabs.update(this.session.searchTabId, { active: true });
      }
    }

    this.session.currentJobIndex++;
    await this.persistSession();
    this.broadcastState();

    // Small polite pause before opening the next job
    setTimeout(() => {
      this.processCurrentJob();
    }, 1500);
  }

  /**
   * EMERGENCY STOP / KILL SWITCH
   * Instantly halts the crawler, removes tabs, and resets state.
   */
  public async stopCrawl(): Promise<void> {
    logger.warn('BatchQueueManager', 'Emergency STOP / Kill switch engaged!');

    const workerTabId = this.session.workerTabId;
    const searchTabId = this.session.searchTabId;

    this.session.active = false;
    this.session.status = 'idle';

    // Broadcast hard abort signal to all involved tabs
    const tabsToAbort = [searchTabId, workerTabId].filter((id): id is number => typeof id === 'number');
    for (const tid of tabsToAbort) {
      try {
        chrome.tabs.sendMessage(
          tid,
          {
            type: 'BG_ABORT_FILL',
            source: 'background',
            timestamp: new Date().toISOString()
          },
          () => {
            void chrome.runtime?.lastError;
          }
        );
      } catch {
        // ignore
      }
    }

    // Preserve the current application tab so user can review or manually submit without losing progress
    this.session.workerTabId = undefined;

    if (searchTabId) {
      try {
        chrome.tabs.update(searchTabId, { active: true });
      } catch {
        // ignore
      }
    }

    await this.persistSession();
    this.broadcastState();
  }

  public handleSecurityPaused(trigger: string): void {
    logger.warn('BatchQueueManager', `Crawler paused due to security trigger: ${trigger}`);
    this.session.status = 'paused_security';
    this.session.securityTrigger = trigger;
    this.persistSession();
    this.broadcastState();
  }

  private broadcastState(): void {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    const tabsToNotify: number[] = [];
    if (this.session.searchTabId) tabsToNotify.push(this.session.searchTabId);
    if (this.session.workerTabId) tabsToNotify.push(this.session.workerTabId);

    for (const tid of tabsToNotify) {
      try {
        chrome.tabs.sendMessage(
          tid,
          {
            type: 'CRAWLER_STATE_UPDATED',
            source: 'background',
            payload: { session: this.session },
            timestamp: new Date().toISOString()
          },
          () => {
            void chrome.runtime?.lastError;
          }
        );
      } catch {
        // ignore
      }
    }
  }
}

export const batchQueueManager = new BatchQueueManager();
