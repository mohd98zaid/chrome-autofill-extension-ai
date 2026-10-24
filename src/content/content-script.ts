import { DOMScanner } from './scanner/dom-scanner';
import { DeterministicClassifier } from './classifier/deterministic-classifier';
import { InteractionEngine } from './interaction/interaction-engine';
import { VerificationEngine } from './verification/verification-engine';
import { MutationWatcher } from './mutation/mutation-watcher';
import { JDExtractor } from './jd/jd-extractor';
import {
  ExtensionMessage,
  ExtensionResponse,
  PageScannedPayload,
  TriggerFillPayload
} from '../types/messages';
import { FieldDescriptor, SemanticFieldType } from '../types/taxonomy';
import { UserProfile, Settings, CustomQA } from '../types/profile';
import { FilledFieldRecord, FieldStatus } from '../types/session';
import { resolveFieldValue, interpolateCoverLetter } from './resolver/field-resolver';
import { cleanAnswerText } from '../utils/text-cleaner';
import { JobPortalDetector } from './crawler/job-portal-detector';
import { CrawlerOverlay } from './crawler/crawler-overlay';
import { MultiStepWizardRunner } from './crawler/multi-step-runner';
import { CrawlerSession } from '../types/crawler';
import { logger } from '../utils/logger';

class ContentScriptController {
  private scanner: DOMScanner;
  private classifier: DeterministicClassifier;
  private interactionEngine: InteractionEngine;
  private verificationEngine: VerificationEngine;
  private mutationWatcher: MutationWatcher;
  private jdExtractor: JDExtractor;

  private currentDescriptors: Map<string, FieldDescriptor> = new Map();
  private elementMap: Map<string, HTMLElement> = new Map();
  private isFilling = false;
  private isAborted = false;
  private lastUserInteractionTime = 0;

  public isUserActivelyInteracting(): boolean {
    return Date.now() - this.lastUserInteractionTime < 2500;
  }

  private isTopFrame(): boolean {
    try {
      return typeof window !== 'undefined' && window.self === window.top;
    } catch {
      return false;
    }
  }

  private safeSendMessage<T = any>(
    message: ExtensionMessage<unknown>,
    callback?: (response: ExtensionResponse<T> | undefined) => void
  ): void {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          logger.debug('ContentScript', `Runtime message acknowledged with status: ${lastErr.message}`);
          return;
        }
        if (callback) {
          callback(response);
        }
      });
    } catch (err) {
      logger.debug('ContentScript', `safeSendMessage exception: ${String(err)}`);
    }
  }

  private setupUserActivityListeners(): void {
    const onUserActivity = (e: Event) => {
      if (e.isTrusted) {
        this.lastUserInteractionTime = Date.now();
      }
    };
    window.addEventListener('keydown', onUserActivity, { passive: true, capture: true });
    window.addEventListener('mousedown', onUserActivity, { passive: true, capture: true });
    window.addEventListener('pointerdown', onUserActivity, { passive: true, capture: true });
    window.addEventListener('touchstart', onUserActivity, { passive: true, capture: true });
    window.addEventListener('wheel', onUserActivity, { passive: true, capture: true });

    // Listen for broadcast abort from parent/sibling frames
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'BG_ABORT_FILL') {
        this.abortCurrentOperation('Broadcast abort from top frame');
      }
    });

    this.setupRealtimeAutoLearning();
  }

  /**
   * Real-Time User Learning Loop (Reverse-Engineered from Jobs Co-Pilot / JobPilot pattern):
   * When a user manually fills in an unanswered question, corrects an answer, or selects
   * a choice on the page, the extension captures { question, answer } and permanently
   * records it into customQA so the user is never asked again.
   */
  private setupRealtimeAutoLearning(): void {
    const handleUserEdit = (e: Event) => {
      // 1. Only capture genuine human user interactions
      if (!e.isTrusted) return;
      // 2. Do not record while automated filling is executing
      if (this.isFilling) return;

      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof HTMLElement)) return;

      const tag = target.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;

      const inputEl = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

      // 3. Ignore password, file, hidden, or submit inputs (safety rule)
      const type = (inputEl.getAttribute('type') || '').toLowerCase();
      if (type === 'password' || type === 'file' || type === 'hidden' || type === 'submit' || type === 'button') {
        return;
      }

      // 4. Extract user's value
      let val = '';
      if (inputEl instanceof HTMLSelectElement) {
        val = inputEl.selectedOptions[0]?.text?.trim() || inputEl.value?.trim();
      } else if (type === 'checkbox') {
        const chk = inputEl as HTMLInputElement;
        const lbl = this.scanner.findLabelText(chk) || '';
        val = chk.checked ? (lbl || 'Yes') : 'No';
      } else if (type === 'radio') {
        const rad = inputEl as HTMLInputElement;
        if (!rad.checked) return;
        val = this.scanner.findLabelText(rad) || rad.value || 'Yes';
      } else {
        val = inputEl.value?.trim() || '';
      }

      if (!val || val.length < 1) return;

      // 5. Discover question prompt or label
      const labelText = this.scanner.findLabelText(inputEl);
      const prompt = this.scanner.findQuestionPrompt(inputEl, labelText) || labelText;

      if (!prompt || prompt.trim().length < 4) return;

      // 6. Skip standard personal identity fields (name, email, phone) which are managed in Profile
      if (/^(first\s*name|last\s*name|full\s*name|email|phone|mobile|tel)$/i.test(prompt.trim())) {
        return;
      }

      const detectedCompany = this.jdExtractor.findCompany() || 'learned';

      logger.info('ContentScript', `[Auto-Learn] Captured manual user answer for "${prompt.slice(0, 30)}..." => "${val.slice(0, 30)}..."`);

      // Persist to user customQA memory bank via background service worker
      this.safeSendMessage({
        type: 'UI_SAVE_QA',
        source: 'content',
        payload: {
          question: prompt.trim(),
          answer: val.trim(),
          tags: [detectedCompany]
        },
        timestamp: new Date().toISOString()
      });
    };

    // Listen on change (selects, radios, checkboxes, blur commits)
    window.addEventListener('change', handleUserEdit, { passive: true, capture: true });
  }

  public abortCurrentOperation(reason: string = 'User requested stop'): void {
    logger.warn('ContentScript', `ABORTING all automation immediately: ${reason}`);
    this.isAborted = true;
    this.isFilling = false;
    CrawlerOverlay.remove();
    CrawlerOverlay.removeLauncherPill();
    try {
      if (document.activeElement && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } catch {}

    // Broadcast hard abort signal to all child iframes if in top frame
    if (this.isTopFrame()) {
      try {
        const frames = window.frames;
        for (let i = 0; i < frames.length; i++) {
          try {
            frames[i].postMessage({ type: 'BG_ABORT_FILL', source: 'content_top' }, '*');
          } catch {
            // Cross-origin iframe security restrictions handled gracefully
          }
        }
      } catch {
        // Cross-origin window.frames access handled gracefully
      }
    }
  }

  constructor() {
    this.scanner = new DOMScanner();
    this.classifier = new DeterministicClassifier();
    this.interactionEngine = new InteractionEngine();
    this.verificationEngine = new VerificationEngine();
    this.jdExtractor = new JDExtractor();

    this.mutationWatcher = new MutationWatcher({
      onMutation: () => this.handleMutation()
    });

    this.init();
  }

  private init() {
    logger.info('ContentScript', 'Initializing content script controller');
    this.setupMessageListener();
    this.setupUserActivityListeners();
    this.mutationWatcher.start();

    // Passive scan on idle load - STRICTLY read-only, never auto-click or auto-trigger anything
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      this.scanAndNotify(false);
    } else {
      window.addEventListener('DOMContentLoaded', () => this.scanAndNotify(false));
    }

    // Schedule SPA delayed rescans as REST API data renders into the DOM (strictly read-only)
    setTimeout(() => this.scanAndNotify(false), 400);
    setTimeout(() => this.scanAndNotify(false), 1200);
    setTimeout(() => this.scanAndNotify(false), 2500);

    // If top frame and on a job portal/board page, check for jobs and display subtle launcher pill
    if (this.isTopFrame()) {
      try {
        if (JobPortalDetector.isSearchOrBoardPage()) {
          setTimeout(() => {
            try {
              const jobs = JobPortalDetector.extractJobListings(5);
              if (jobs.length > 0) {
                CrawlerOverlay.renderLauncherPill(jobs.length, () => {
                  this.safeSendMessage({
                    type: 'CRAWLER_START',
                    source: 'content',
                    payload: { maxJobs: jobs.length, mode: 'new_tab' },
                    timestamp: new Date().toISOString()
                  });
                });
              }
            } catch (err) {
              logger.debug('ContentScript', 'Error extracting job listings in launcher', { error: String(err) });
            }
          }, 1800);
        }
      } catch (err) {
        logger.debug('ContentScript', 'isSearchOrBoardPage check failed', { error: String(err) });
      }
    }
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage<unknown>,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: ExtensionResponse<unknown>) => void
      ) => {
        this.handleMessage(message)
          .then((data) => sendResponse({ success: true, data }))
          .catch((err) => sendResponse({ success: false, error: { code: 'E_CONTENT', message: String(err) } }));
        return true; // Keep channel open for async response
      }
    );
  }

  private async handleMessage(message: ExtensionMessage<unknown>): Promise<unknown> {
    logger.debug('ContentScript', `Received message: ${message.type}`);

    switch (message.type) {
      case 'BG_TRIGGER_SCAN':
        return this.scanAndNotify(false);

      case 'BG_TRIGGER_FILL':
        return this.executeFillWithMultiStep(message.payload as { profile: UserProfile; settings: Settings; fillPayload?: TriggerFillPayload });

      case 'BG_HIGHLIGHT_FIELD':
        return this.highlightField((message.payload as { fieldId: string }).fieldId);

      case 'BG_INSERT_COVER_LETTER':
        return this.insertCoverLetter((message.payload as { text: string }).text);

      case 'BG_EXTRACT_PAGE_VALUES':
        return this.extractCurrentPageValues();

      case 'BG_EXTRACT_JOB_DETAILS':
        return this.jdExtractor.extract();

      case 'BG_DISMISS_SECURITY':
        return { success: true, acknowledged: true };

      case 'BG_ABORT_FILL':
      case 'CRAWLER_STOP':
        this.abortCurrentOperation('Abort signal received from background');
        return { success: true, aborted: true };

      case 'CONTENT_EXTRACT_JOBS': {
        const maxCount = (message.payload as { maxCount?: number })?.maxCount || 10;
        const jobs = JobPortalDetector.extractJobListings(maxCount);
        return { jobs };
      }

      case 'CRAWLER_STATE_UPDATED': {
        const session = (message.payload as { session: CrawlerSession })?.session;
        if (!session || !session.active) {
          this.abortCurrentOperation('Crawler session inactive');
          return { acknowledged: true };
        }

        CrawlerOverlay.render(
          session,
          () => {
            this.safeSendMessage({
              type: 'CRAWLER_NEXT_JOB',
              source: 'content',
              timestamp: new Date().toISOString()
            });
          },
          () => {
            this.safeSendMessage({
              type: 'CRAWLER_SKIP_JOB',
              source: 'content',
              timestamp: new Date().toISOString()
            });
          },
          () => {
            this.abortCurrentOperation('Kill switch clicked on overlay');
            this.safeSendMessage({
              type: 'CRAWLER_STOP',
              source: 'content',
              timestamp: new Date().toISOString()
            });
          }
        );
        return { acknowledged: true };
      }

      default:
        return { acknowledged: true };
    }
  }

  public async scanAndNotify(allowAutoExpand: boolean = false): Promise<PageScannedPayload> {
    const isTopFrame = this.isTopFrame();
    try {
      let scanResult = this.scanner.scan();

      // NEVER auto-expand during passive scans. Only allow if explicitly permitted during active user-initiated fill.
      if (allowAutoExpand && isTopFrame && scanResult.fields.length <= 1) {
        const didExpand = await this.expandCandidateSections();
        if (didExpand) {
          scanResult = this.scanner.scan();
        }
      }

      // Subframes without any actual form fields must NEVER notify background or overwrite main tab session
      if (!isTopFrame && scanResult.fields.length === 0) {
        return {
          url: window.location.href,
          domain: window.location.hostname,
          title: document.title,
          fields: [],
          isJobDescriptionPresent: false
        };
      }

      this.currentDescriptors.clear();
      this.elementMap = scanResult.elementMap || new Map();
      for (const f of scanResult.fields) {
        this.currentDescriptors.set(f.id, f);
      }

      // Always report active security challenge to background coordinator (Rule 9)
      if (scanResult.securityTrigger && (isTopFrame || scanResult.fields.length > 0)) {
        this.safeSendMessage({
          type: 'CONTENT_SECURITY_DETECTED',
          source: 'content',
          payload: scanResult.securityTrigger,
          timestamp: new Date().toISOString()
        });
      }

      const jd = isTopFrame ? this.jdExtractor.extract() : null;

      const payload: PageScannedPayload = {
        url: window.location.href,
        domain: window.location.hostname,
        title: document.title,
        fields: scanResult.fields,
        isJobDescriptionPresent: Boolean(jd),
        jobDetails: jd
          ? {
              title: jd.title || '',
              company: jd.company || '',
              location: jd.location || '',
              description: jd.description || ''
            }
          : undefined
      };

      this.safeSendMessage({
        type: 'CONTENT_PAGE_SCANNED',
        source: 'content',
        payload,
        timestamp: new Date().toISOString()
      });

      return payload;
    } catch (err) {
      logger.debug('ContentScript', 'scanAndNotify encountered error', { error: String(err) });
      return {
        url: window.location.href,
        domain: window.location.hostname,
        title: document.title,
        fields: [],
        isJobDescriptionPresent: false
      };
    }
  }

  private async executeFillWithMultiStep(payload: {
    profile: UserProfile;
    settings: Settings;
    fillPayload?: TriggerFillPayload;
  }): Promise<{ filledCount: number; records: FilledFieldRecord[]; lastStageReached?: boolean }> {
    this.isAborted = false;

    // Yield if user is actively interacting with the page
    while (this.isUserActivelyInteracting()) {
      if (this.isAborted) return { filledCount: 0, records: [] };
      logger.info('ContentScript', 'User is actively interacting with page. Yielding multi-step wizard...');
      await new Promise((r) => setTimeout(r, 400));
    }

    // 1. If no fields currently detected on page, attempt to click "Apply" / "Easy Apply"
    const initialScan = this.scanner.scan();
    if (initialScan.fields.length === 0) {
      if (this.isAborted) return { filledCount: 0, records: [] };
      await MultiStepWizardRunner.clickInitialApplyButton();
      if (this.isAborted) return { filledCount: 0, records: [] };
    }

    let totalFilled = 0;
    const allRecords: FilledFieldRecord[] = [];
    const maxSteps = 10;
    let stepCount = 0;
    let lastClickedButton: HTMLElement | null = null;

    while (stepCount < maxSteps) {
      if (this.isAborted) {
        logger.warn('ContentScript', 'Multi-step wizard aborted by kill switch.');
        break;
      }

      while (this.isUserActivelyInteracting()) {
        if (this.isAborted) break;
        logger.info('ContentScript', 'User is typing or clicking. Yielding step progression...');
        await new Promise((r) => setTimeout(r, 400));
      }
      if (this.isAborted) break;

      stepCount++;
      logger.info('ContentScript', `Processing application wizard step ${stepCount}...`);

      let res: { filledCount: number; records: FilledFieldRecord[] };
      try {
        res = await this.executeFill(payload);
      } catch (fillErr) {
        logger.warn('ContentScript', 'Step fill execution encountered error', { error: String(fillErr) });
        res = { filledCount: 0, records: [] };
      }
      totalFilled += res.filledCount;
      allRecords.push(...res.records);

      if (this.isAborted) break;

      await new Promise((r) => setTimeout(r, 600));
      if (this.isAborted) break;

      // Check if validation error is present on current step (e.g. required field missing)
      const errorIndicator = document.querySelector(
        '.artdeco-inline-feedback--error, [aria-invalid="true"], .input-error, [class*="error-message" i]'
      );
      if (errorIndicator) {
        logger.warn('ContentScript', 'Validation error present on step. Pausing automation for user correction.');
        return { filledCount: totalFilled, records: allRecords, lastStageReached: true };
      }

      const stepButton = MultiStepWizardRunner.findStepButton();

      if (stepButton.type === 'final') {
        // Last stage reached! STOP automation completely and return focus to user
        logger.info('ContentScript', `Final submission stage reached with button: "${stepButton.label}". Pausing for user review.`);

        if (document.activeElement && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        // Listen for user submission confirmation to auto-advance crawler
        MultiStepWizardRunner.listenForSubmissionSuccess(() => {
          if (!this.isAborted) {
            this.safeSendMessage({
              type: 'CRAWLER_NEXT_JOB',
              source: 'content',
              timestamp: new Date().toISOString()
            });
          }
        });

        return { filledCount: totalFilled, records: allRecords, lastStageReached: true };
      } else if (stepButton.type === 'intermediate' && stepButton.button) {
        if (this.isAborted) break;

        // If the same intermediate button has already been clicked without advancing, avoid infinite clicking loop
        if (stepButton.button === lastClickedButton) {
          logger.warn('ContentScript', 'Intermediate button did not advance page. Pausing for user intervention.');
          return { filledCount: totalFilled, records: allRecords, lastStageReached: true };
        }
        lastClickedButton = stepButton.button;

        logger.info('ContentScript', `Advancing intermediate step with button: "${stepButton.label}"`);
        stepButton.button.click();
        await new Promise((r) => setTimeout(r, 1200));
        if (this.isAborted) break;

        const postClickError = document.querySelector(
          '.artdeco-inline-feedback--error, [aria-invalid="true"], .input-error, [class*="error-message" i]'
        );
        if (postClickError) {
          logger.warn('ContentScript', 'Validation error appeared after step advancement. Pausing for user correction.');
          return { filledCount: totalFilled, records: allRecords, lastStageReached: true };
        }
      } else {
        // No further step buttons found (single-page form or completed)
        break;
      }
    }

    return { filledCount: totalFilled, records: allRecords };
  }

  private async executeFill(payload: {
    profile: UserProfile;
    settings: Settings;
    fillPayload?: TriggerFillPayload;
  }): Promise<{ filledCount: number; records: FilledFieldRecord[] }> {
    if (this.isAborted) {
      return { filledCount: 0, records: [] };
    }
    if (this.isFilling) {
      throw new Error('Fill operation already in progress');
    }
    this.isFilling = true;

    const { profile, settings, fillPayload } = payload;
    const records: FilledFieldRecord[] = [];

    try {
      // Step 0: Auto-expand empty repeatable sections & collapsed accordions (e.g. SAP SuccessFactors, Workday)
      const didExpand = await this.expandCandidateSections();
      if (didExpand) {
        // Refresh scanned fields so newly rendered inputs are included
        const rescan = this.scanner.scan();
        this.currentDescriptors.clear();
        this.elementMap = rescan.elementMap || new Map();
        for (const f of rescan.fields) {
          this.currentDescriptors.set(f.id, f);
        }
      }

      const descriptorsToFill = fillPayload?.fieldIds
        ? fillPayload.fieldIds.map((id) => this.currentDescriptors.get(id)).filter((d): d is FieldDescriptor => !!d)
        : Array.from(this.currentDescriptors.values());

      // Ensure country is processed before state so country-dependent state dropdowns are populated
      descriptorsToFill.sort((a, b) => {
        const aType = this.classifier.classify(a).semanticType;
        const bType = this.classifier.classify(b).semanticType;
        if (aType === 'country' && bType === 'state') return -1;
        if (aType === 'state' && bType === 'country') return 1;
        return 0;
      });

      // Extract page JD context once for application-aware field resolution & cover letter synthesis
      const pageJd = this.jdExtractor.extract();
      const detectedCompany = pageJd?.company || this.jdExtractor.findCompany() || '';
      const detectedRole = pageJd?.title || this.jdExtractor.findJobTitle() || '';
      const detectedJD = pageJd?.description || '';

      const failedSelects: { field: FieldDescriptor; element: HTMLElement; targetValue: any; classification: any }[] = [];

      for (const field of descriptorsToFill) {
        if (this.isAborted) {
          logger.warn('ContentScript', 'Fill loop aborted by kill switch.');
          break;
        }

        // If user is actively typing or clicking elsewhere on page, yield immediately
        while (this.isUserActivelyInteracting()) {
          if (this.isAborted) break;
          logger.info('ContentScript', 'User is actively interacting with page. Yielding autofill...');
          await new Promise((r) => setTimeout(r, 400));
        }
        if (this.isAborted) break;

        // Find DOM element
        const element = this.findElement(field);
        if (!element || !this.scanner.isVisible(element)) continue;

        // If this exact element is currently focused by user, NEVER interfere or overwrite
        if (document.activeElement === element) {
          logger.info('ContentScript', `User is currently focused on field ${field.id}. Skipping.`);
          continue;
        }

        // Classify field
        const classification = this.classifier.classify(field);
        const sectionIndex = this.getSectionIndex(element, classification.semanticType);

        // Resolve value from profile using centralized resolver (Rules 30, 31, 32)
        const resolveRes = resolveFieldValue({
          semanticType: classification.semanticType,
          field,
          profile,
          sectionIndex,
          sectionHeading: field.sectionHeading,
          applicationContext: {
            company: detectedCompany,
            role: detectedRole,
            jdText: detectedJD
          }
        });

        // Security check: High impact fields check (Rule 11: forceAll must NEVER bypass high impact/safety fields!)
        const isHighImpact = this.isHighImpactField(classification.semanticType);
        if (isHighImpact) {
          if (resolveRes.status !== 'RESOLVED' || resolveRes.value === undefined || resolveRes.value === null || resolveRes.value === '') {
            logger.warn('ContentScript', `Skipping high-impact field without explicit user profile configuration: ${classification.semanticType}`);
            records.push({
              fieldId: field.id,
              fieldSignature: field.fieldSignature,
              semanticType: classification.semanticType,
              controlType: field.controlType,
              status: 'NEEDS_USER',
              attemptedValue: '',
              verifiedValue: '',
              verified: false,
              verificationMessage: resolveRes.reason || 'High-impact field requires user review',
              strategyUsed: 'skipped_high_impact',
              confidence: classification.confidence,
              source: classification.source,
              timestamp: new Date().toISOString()
            });
            continue;
          }
        }

        // Confidence check against settings (forceAll only allows attempting ordinary low-confidence fields)
        let targetValue: string | string[] | boolean | null =
          resolveRes.status === 'RESOLVED' && resolveRes.value !== undefined ? resolveRes.value : null;

        // Check if field is a question, custom field, or unmapped input
        const isQuestionCandidate =
          classification.semanticType === 'application_question' ||
          classification.semanticType === 'custom' ||
          classification.semanticType === 'unknown' ||
          field.controlType === 'textarea' ||
          Boolean(field.questionPrompt && field.questionPrompt.length >= 4) ||
          Boolean(field.labelText && /\b(how|what|why|which|do|does|have|has|are|is|please|describe|select|will|can|could|would|should|years|sponsorship|relocate|authorized)\b|\?/i.test(field.labelText));

        // For specific domain experience questions in textareas (e.g. "How many years... in QA, AI/ML testing..."),
        // give precedence to Q&A memory bank / AI domain answering over generic global year calculation
        if (
          field.controlType === 'textarea' &&
          classification.semanticType === 'years_experience' &&
          field.labelText &&
          /\b(in|testing|with|for)\b/i.test(field.labelText)
        ) {
          targetValue = null;
        }

        const hasPromptText = Boolean(
          (field.questionPrompt && field.questionPrompt.trim().length >= 3) ||
          (field.labelText && field.labelText.trim().length >= 3) ||
          (field.placeholder && field.placeholder.trim().length >= 3) ||
          (field.nearbyText && field.nearbyText.trim().length >= 3) ||
          (field.name && field.name.trim().length >= 3)
        );

        if ((isQuestionCandidate || settings.aiEnabled) && hasPromptText && (targetValue === null || targetValue === undefined || targetValue === '')) {
          const qVal = await this.resolveQuestionField(
            field,
            element,
            profile,
            settings,
            detectedCompany,
            detectedRole
          );
          if (qVal !== null && qVal !== undefined && qVal !== '') {
            targetValue = qVal;
            classification.confidence = 0.95;
            classification.source = 'ai';
          }
        }

        if (classification.confidence < settings.autoFillThreshold && !fillPayload?.forceAll && targetValue === null) {
          logger.info('ContentScript', `Field confidence (${classification.confidence}) below auto-fill threshold (${settings.autoFillThreshold})`);
          continue;
        }

        // Dynamic AI or Predefined Cover Letter Synthesis (grounded in JD & Company)
        if (
          classification.semanticType === 'cover_letter' ||
          (field.controlType === 'textarea' &&
            classification.semanticType !== 'linkedin' &&
            classification.semanticType !== 'github' &&
            classification.semanticType !== 'portfolio' &&
            classification.semanticType !== 'skills' &&
            classification.semanticType !== 'country' &&
            /cover\s*letter/i.test(field.labelText || field.placeholder || ''))
        ) {
          let letterContent: string | null = null;

          // Step 1: If AI enabled, generate tailored cover letter matching JD & company
          if (settings.aiEnabled) {
            logger.info('ContentScript', `Synthesizing tailored AI cover letter for ${detectedCompany} - ${detectedRole}`);
            letterContent = await this.generateTailoredCoverLetter(
              profile,
              detectedCompany,
              detectedRole,
              detectedJD
            );
          }

          // Step 2: If AI was not used or returned empty, use predefined cover letter
          if (!letterContent && profile.coverLetter?.trim()) {
            const candidateName =
              profile.identity.fullName ||
              `${profile.identity.firstName || ''} ${profile.identity.lastName || ''}`.trim() ||
              'Candidate';
            const topSkills = profile.skills.slice(0, 6).map((s) => s.canonicalName).join(', ');
            letterContent = interpolateCoverLetter(profile.coverLetter, {
              company: detectedCompany || 'Hiring Team',
              role: detectedRole || 'Open Position',
              candidateName,
              skills: topSkills
            });
          }

          // Step 3: Grounded fallback if neither AI nor predefined cover letter exists
          if (!letterContent) {
            const candidateName =
              profile.identity.fullName ||
              `${profile.identity.firstName || ''} ${profile.identity.lastName || ''}`.trim() ||
              'Candidate';
            const primaryExp = profile.experiences?.[0];
            const topSkills = profile.skills.slice(0, 5).map((s) => s.canonicalName).join(', ') || 'relevant skills';
            const cleanRole = (detectedRole || 'open position')
              .replace(/^(?:join\s+(?:the\s+|our\s+)?|apply\s+(?:for\s+)?)/i, '')
              .trim() || 'open position';
            const expSentence = primaryExp
              ? `As a ${primaryExp.title} at ${primaryExp.company}`
              : (profile.summary || 'With extensive hands-on experience delivering high-quality solutions');

            letterContent = `Dear Hiring Team at ${detectedCompany || 'your organization'},\n\nI am writing to express my strong enthusiasm for the ${cleanRole} position at ${detectedCompany || 'your organization'}. ${expSentence}, I have developed deep expertise in ${topSkills}.\n\nThroughout my career, I have focused on architecting resilient solutions, driving efficiency, and delivering high-quality results. With my hands-on background and dedication to technical excellence, I am confident in my ability to contribute meaningfully to your team.\n\nI welcome the opportunity to discuss how my qualifications align with your requirements. Thank you for your time and consideration.\n\nSincerely,\n${candidateName}`;
          }

          targetValue = letterContent;
        }



        if (targetValue === null || targetValue === undefined || targetValue === '') {
          if (field.isRequired) {
            records.push({
              fieldId: field.id,
              fieldSignature: field.fieldSignature,
              semanticType: classification.semanticType,
              controlType: field.controlType,
              status: 'NEEDS_USER',
              attemptedValue: '',
              verifiedValue: '',
              verified: false,
              verificationMessage: resolveRes.reason || 'Required field has no verified value in profile',
              strategyUsed: 'none',
              confidence: classification.confidence,
              source: classification.source,
              timestamp: new Date().toISOString()
            });
          }
          continue;
        }

        // If State dropdown options are loading asynchronously after country, wait a tick
        if (classification.semanticType === 'state' && element instanceof HTMLSelectElement && element.options.length <= 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }

        // Interact with element
        const interaction = await this.interactionEngine.fill(element, field, targetValue);

        if (!interaction.success && (field.controlType === 'select' || element instanceof HTMLSelectElement)) {
          failedSelects.push({ field, element, targetValue, classification });
        }

        // Verify result (Rules 12, 14, 18: Only verified passes)
        const verification = this.verificationEngine.verify(element, field, targetValue);

        const status: FieldStatus = verification.verified
          ? 'VERIFIED'
          : verification.hasValidationError || interaction.success
          ? 'FAILED'
          : 'NEEDS_USER';

        const record: FilledFieldRecord = {
          fieldId: field.id,
          fieldSignature: field.fieldSignature,
          semanticType: classification.semanticType,
          controlType: field.controlType,
          status,
          attemptedValue: targetValue,
          verifiedValue: verification.actualValue ?? '',
          verified: verification.verified,
          verificationMessage: verification.message,
          strategyUsed: interaction.strategyUsed,
          confidence: classification.confidence,
          source: classification.source,
          timestamp: new Date().toISOString()
        };

        records.push(record);

        // Notify background of filled field
        this.safeSendMessage({
          type: 'CONTENT_FIELD_FILLED',
          source: 'content',
          payload: record,
          timestamp: new Date().toISOString()
        });

        // Small delay between field interactions for natural DOM event processing
        await new Promise((resolve) => setTimeout(resolve, 60));
      }

      // Retry pass for dependent selects (e.g. State options loaded via AJAX after Country was chosen)
      if (failedSelects.length > 0 && !this.isAborted) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        for (const item of failedSelects) {
          if (this.isAborted) break;
          const retryInteraction = await this.interactionEngine.fill(item.element, item.field, item.targetValue);
          if (retryInteraction.success) {
            const verification = this.verificationEngine.verify(item.element, item.field, item.targetValue);
            const retryStatus: FieldStatus = verification.verified ? 'VERIFIED' : 'FAILED';
            const record: FilledFieldRecord = {
              fieldId: item.field.id,
              fieldSignature: item.field.fieldSignature,
              semanticType: item.classification.semanticType,
              controlType: item.field.controlType,
              status: retryStatus,
              attemptedValue: item.targetValue,
              verifiedValue: verification.actualValue ?? '',
              verified: verification.verified,
              verificationMessage: verification.message,
              strategyUsed: retryInteraction.strategyUsed,
              confidence: item.classification.confidence,
              source: item.classification.source,
              timestamp: new Date().toISOString()
            };
            records.push(record);
            this.safeSendMessage({
              type: 'CONTENT_FIELD_FILLED',
              source: 'content',
              payload: record,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } finally {
      this.isFilling = false;
      if (this.isAborted && document.activeElement && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    return { filledCount: records.length, records };
  }

  private async expandCandidateSections(): Promise<boolean> {
    let expandedAny = false;

    // Safety guard: NEVER click navigation, submission, or wizard action triggers
    const DANGEROUS_ACTION_REGEX = /\b(submit|start|get\s*started|apply|continue|next|proceed|finish|done|review|send|complete|register|sign\s*in|login|log\s*in|save\s*&\s*submit)\b/i;

    const isSafeToExpand = (el: HTMLElement, directText: string): boolean => {
      if (el.getAttribute('type') === 'submit') return false;
      if (DANGEROUS_ACTION_REGEX.test(directText)) return false;
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (DANGEROUS_ACTION_REGEX.test(aria)) return false;
      if (el.tagName === 'A') {
        const href = (el.getAttribute('href') || '').trim();
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) return false;
      }
      return true;
    };

    // 0. Check for global "Expand All" / "Open All" controls
    const expandAllBtn = Array.from(
      document.querySelectorAll<HTMLElement>('a, button, [role="button"], span')
    ).find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      return (t === 'expand all' || t === 'expand all sections' || t === 'open all') && isSafeToExpand(b, t);
    });
    if (expandAllBtn && this.scanner.isVisible(expandAllBtn)) {
      try {
        expandAllBtn.click();
        expandedAny = true;
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        // ignore
      }
    }

    // 1. Expand collapsed accordion headers (e.g. SAP SuccessFactors orange bars, Workday sections)
    const sectionKeywords = [
      'profile information',
      'personal information',
      'contact information',
      'candidate information',
      'employment details',
      'work experience',
      'employment history',
      'work history',
      'formal education',
      'academic history',
      'language skills',
      'languages',
      'job-specific questions',
      'application questions',
      'general information'
    ];

    const headerCandidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[aria-expanded="false"], div[class*="accordion"], [role="tab"], div[class*="rcm"]'
      )
    );

    for (const el of headerCandidates) {
      const directText = (el.textContent || '').trim().toLowerCase();
      if (!isSafeToExpand(el, directText)) continue;

      if (
        directText.length < 80 &&
        sectionKeywords.some((kw) => directText.includes(kw))
      ) {
        const isAriaCollapsed = el.getAttribute('aria-expanded') === 'false';
        const hasRightArrow = directText.startsWith('>') || directText.includes('›') || directText.includes('▶') || directText.includes('►');
        const hasCollapsedClass = typeof el.className === 'string' && (el.className.includes('collapsed') || el.className.includes('closed'));
        const next = el.nextElementSibling as HTMLElement | null;
        const nextHidden = next && (next.offsetParent === null || window.getComputedStyle(next).display === 'none' || next.hasAttribute('hidden'));

        if (isAriaCollapsed || hasRightArrow || hasCollapsedClass || nextHidden) {
          try {
            el.click();
            expandedAny = true;
          } catch {
            // ignore
          }
        }
      }
    }

    if (expandedAny) {
      await new Promise((r) => setTimeout(r, 350));
    }

    // 2. Click "(+) Add" in empty repeatable sections (e.g. SAP SuccessFactors: "There are no items in this section.")
    const emptyIndicators = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      return text.includes('there are no items in this section');
    });

    for (const indicator of emptyIndicators) {
      const container = indicator.closest('div, section, fieldset') || indicator.parentElement;
      if (container) {
        const addBtn = Array.from(
          container.querySelectorAll<HTMLElement>('a, button, [role="button"], span')
        ).find((b) => {
          const t = (b.textContent || '').trim().toLowerCase();
          return (t === 'add' || t === '+ add' || t === '(+) add' || t.startsWith('add ')) && isSafeToExpand(b, t);
        });
        if (addBtn) {
          try {
            addBtn.click();
            expandedAny = true;
          } catch {
            // ignore
          }
        }
      }
    }

    // 3. Generic Add button detection in section containers with no inputs
    const containers = Array.from(
      document.querySelectorAll<HTMLElement>(
        'fieldset, section, [data-automation-id*="panel"], [data-automation-id*="section"], div[class*="section"], div[class*="panel"], div[class*="card"], div[class*="accordion"], div[class*="rcm"]'
      )
    );

    for (const container of containers) {
      const headerEl = container.querySelector(
        'h1, h2, h3, h4, h5, h6, [role="heading"], legend, div[class*="title"], div[class*="header"]'
      );
      const headerText = (headerEl?.textContent || container.getAttribute('aria-label') || '').toLowerCase().trim();

      const isTargetSection = sectionKeywords.some((kw) => headerText.includes(kw));
      if (isTargetSection) {
        const existingInputs = container.querySelectorAll('input:not([type="hidden"]), select, textarea');
        if (existingInputs.length === 0) {
          const addBtn = Array.from(
            container.querySelectorAll<HTMLElement>('a, button, [role="button"], span')
          ).find((b) => {
            const bText = (b.textContent || '').trim().toLowerCase();
            const autoId = (b.getAttribute('data-automation-id') || '').toLowerCase();
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            const isAddMatch =
              bText === 'add' ||
              bText === '+ add' ||
              bText === '(+) add' ||
              bText.startsWith('add ') ||
              autoId.includes('add') ||
              aria.includes('add');
            return isAddMatch && isSafeToExpand(b, bText);
          });

          if (addBtn && this.scanner.isVisible(addBtn)) {
            try {
              addBtn.click();
              expandedAny = true;
            } catch {
              // ignore
            }
          }
        }
      }
    }

    // 4. Workday specific Add buttons fallback
    const workdayAddButtons = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button[data-automation-id*="Add"], button[data-automation-id*="add"], [data-uxi-element-id*="add"]'
      )
    );
    for (const btn of workdayAddButtons) {
      const btnText = (btn.textContent || '').trim().toLowerCase();
      if (this.scanner.isVisible(btn) && isSafeToExpand(btn, btnText)) {
        const parentSection =
          btn.closest('fieldset, section, [data-automation-id*="panel"]') || btn.parentElement?.parentElement;
        if (parentSection) {
          const hasInputs = parentSection.querySelector('input:not([type="hidden"]), select, textarea');
          if (!hasInputs) {
            try {
              btn.click();
              expandedAny = true;
            } catch {
              // ignore
            }
          }
        }
      }
    }

    if (expandedAny) {
      await new Promise((r) => setTimeout(r, 450));
    }

    return expandedAny;
  }

  private getSectionIndex(element: HTMLElement, semanticType: SemanticFieldType): number {
    const isExp = [
      'current_company',
      'current_title',
      'start_date',
      'end_date',
      'job_description',
      'currently_work_here'
    ].includes(semanticType);

    const isEdu = ['school', 'degree', 'education'].includes(semanticType);

    if (!isExp && !isEdu) {
      return 0;
    }

    const repeaterSelector = isExp
      ? '[data-automation-id*="workExperience"], [data-automation-id*="experience"], fieldset, [class*="experience-item"], [class*="experience-entry"], [class*="work-history"], [class*="job-history"], [data-testid*="experience"]'
      : '[data-automation-id*="education"], fieldset, [class*="education-item"], [class*="education-entry"], [data-testid*="education"]';

    const container = element.closest<HTMLElement>(repeaterSelector);
    if (!container || !container.parentElement) {
      return 0;
    }

    const dataIdx = container.getAttribute('data-index') || container.getAttribute('data-item-index');
    if (dataIdx && !isNaN(parseInt(dataIdx, 10))) {
      return parseInt(dataIdx, 10);
    }

    const siblings = Array.from(container.parentElement.querySelectorAll(repeaterSelector)).filter(
      (el) => el.parentElement === container.parentElement
    );
    if (siblings.length > 1) {
      const idx = siblings.indexOf(container);
      if (idx >= 0) return idx;
    }

    const heading = container.querySelector('h1, h2, h3, h4, h5, h6, legend, [role="heading"]');
    if (heading?.textContent) {
      const numMatch = heading.textContent.match(/(?:#|\b)(\d+)\b/);
      if (numMatch) {
        const parsed = parseInt(numMatch[1], 10);
        return parsed > 0 ? parsed - 1 : 0;
      }
    }

    return 0;
  }

  private isHighImpactField(type: SemanticFieldType): boolean {
    const highImpact: SemanticFieldType[] = [
      'criminal_record',
      'legal_question',
      'security_question'
    ];
    return highImpact.includes(type);
  }

  private findElement(field: FieldDescriptor): HTMLElement | null {
    // 1. Direct in-memory pointer (0ms, 100% accurate, no selector ambiguity)
    const directEl = this.elementMap.get(field.id);
    if (directEl && document.contains(directEl)) {
      return directEl;
    }

    // 2. data-autofill-id stamped during scan
    const tagged = document.querySelector<HTMLElement>(`[data-autofill-id="${CSS.escape(field.id)}"]`);
    if (tagged) {
      this.elementMap.set(field.id, tagged);
      return tagged;
    }

    // 3. Native DOM id if present and not dynamic
    if (field.domId) {
      const isDynamic = /[:_]\d+|ember\d+|react-|ng-|\b\d{5,}\b/.test(field.domId);
      if (!isDynamic) {
        const el = document.getElementById(field.domId);
        if (el) return el;
      }
    }

    // 4. Selector query
    if (field.selector) {
      try {
        const el = document.querySelector<HTMLElement>(field.selector);
        if (el) return el;
      } catch {
        // Fall back
      }
    }

    return null;
  }

  private highlightField(fieldId: string) {
    const field = this.currentDescriptors.get(fieldId);
    if (!field) return;

    const el = this.findElement(field);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origOutline = el.style.outline;
      const origBoxShadow = el.style.boxShadow;
      el.style.outline = '2px solid #3b82f6';
      el.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.5)';

      setTimeout(() => {
        el.style.outline = origOutline;
        el.style.boxShadow = origBoxShadow;
      }, 2000);
    }
  }

  public async insertCoverLetter(text: string): Promise<{ success: boolean; message: string }> {
    // 1. Look for any field classified as cover_letter or containing textarea
    for (const desc of this.currentDescriptors.values()) {
      if (desc.controlType === 'textarea' || (desc.labelText && /cover\s*letter/i.test(desc.labelText))) {
        const el = this.findElement(desc);
        if (el && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
          const res = await this.interactionEngine.fillTextInput(el, text);
          if (res.success) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { success: true, message: 'Cover letter inserted into detected field!' };
          }
        }
      }
    }

    // 2. Direct DOM query fallback for any textarea on page
    const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
    for (const ta of textareas) {
      const match =
        ta.name.toLowerCase().includes('cover') ||
        ta.id.toLowerCase().includes('cover') ||
        ta.placeholder.toLowerCase().includes('cover') ||
        ta.getAttribute('aria-label')?.toLowerCase().includes('cover');
      if (match) {
        const res = await this.interactionEngine.fillTextInput(ta, text);
        if (res.success) {
          ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { success: true, message: 'Cover letter inserted successfully!' };
        }
      }
    }

    // 3. Fallback to first visible textarea if any
    const visible = textareas.filter((ta) => this.scanner.isVisible(ta));
    if (visible.length > 0) {
      const res = await this.interactionEngine.fillTextInput(visible[0], text);
      if (res.success) {
        visible[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { success: true, message: 'Cover letter inserted into application textarea!' };
      }
    }

    return { success: false, message: 'Could not find a cover letter textarea on this page.' };
  }

  public extractCurrentPageValues(): Record<string, string> {
    const extracted: Record<string, string> = {};

    // 1. Check all scanned field descriptors
    for (const field of this.currentDescriptors.values()) {
      const element = this.findElement(field);
      if (!element || !this.scanner.isVisible(element)) continue;

      let val = '';
      if (element instanceof HTMLInputElement) {
        if (element.type === 'password' || element.type === 'file' || element.type === 'hidden' || element.type === 'submit') continue;
        if (element.type === 'checkbox' || element.type === 'radio') {
          if (element.checked) {
            val = element.value || 'true';
          }
        } else {
          val = element.value;
        }
      } else if (element instanceof HTMLTextAreaElement) {
        val = element.value;
      } else if (element instanceof HTMLSelectElement) {
        val = element.value || (element.selectedOptions[0]?.text || '');
      }

      val = (val || '').trim();
      if (!val) continue;

      const classification = this.classifier.classify(field);
      const semType = classification.semanticType;
      if (semType && semType !== 'unknown') {
        extracted[semType] = val;
      }
    }

    // 2. Also inspect any visible inputs in DOM in case some were dynamically added/filled
    const allInputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
    for (const el of allInputs) {
      if (!this.scanner.isVisible(el)) continue;
      let val = '';
      if (el instanceof HTMLInputElement) {
        if (el.type === 'password' || el.type === 'file' || el.type === 'hidden' || el.type === 'submit') continue;
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (el.checked) val = el.value || 'true';
        } else {
          val = el.value;
        }
      } else {
        val = el.value;
      }
      val = (val || '').trim();
      if (!val) continue;

      const placeholder = 'placeholder' in el ? ((el as HTMLInputElement).placeholder || '') : '';
      const nameAttr = `${el.name || ''} ${el.id || ''} ${el.getAttribute('aria-label') || ''} ${placeholder}`.toLowerCase();
      if (!extracted.first_name && /first\s*name/i.test(nameAttr)) extracted.first_name = val;
      else if (!extracted.last_name && /last\s*name/i.test(nameAttr)) extracted.last_name = val;
      else if (!extracted.full_name && /full\s*name|candidate\s*name/i.test(nameAttr)) extracted.full_name = val;
      else if (!extracted.email && /email/i.test(nameAttr)) extracted.email = val;
      else if (!extracted.phone && /phone|mobile|tel/i.test(nameAttr)) extracted.phone = val;
      else if (!extracted.linkedin && /linkedin/i.test(nameAttr)) extracted.linkedin = val;
      else if (!extracted.github && /github/i.test(nameAttr)) extracted.github = val;
      else if (!extracted.portfolio && /portfolio|website/i.test(nameAttr)) extracted.portfolio = val;
      else if (!extracted.city && /city/i.test(nameAttr)) extracted.city = val;
      else if (!extracted.address && /address|street/i.test(nameAttr)) extracted.address = val;
    }

    logger.info('ContentScript', 'Extracted page values for profile sync', { count: Object.keys(extracted).length });
    return extracted;
  }


  private async resolveQuestionField(
    field: FieldDescriptor,
    element: HTMLElement,
    profile: UserProfile,
    settings: Settings,
    detectedCompany: string,
    detectedRole: string
  ): Promise<string | string[] | boolean | null> {
    let promptText = (field.questionPrompt || field.labelText || field.nearbyText || field.placeholder || '').trim();

    // If it's a radio or checkbox button, the label is usually just "Yes" or "No"
    if ((field.controlType === 'radio' || field.controlType === 'checkbox') && (!promptText || promptText.length < 15 || /^(yes|no|true|false|agree|male|female|other|decline|prefer not|na|n\/a)$/i.test(promptText))) {
      const fieldset = element.closest('fieldset');
      const legendText = fieldset?.querySelector('legend')?.textContent?.trim();
      if (legendText && legendText.length > 5) {
        promptText = legendText;
      } else if (field.sectionHeading && field.sectionHeading.length > 5) {
        promptText = field.sectionHeading;
      } else {
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const qEl = parent.querySelector('legend, h1, h2, h3, h4, h5, h6, [role="heading"], [class*="label" i], [class*="title" i], [class*="question" i], p');
          const txt = qEl?.textContent?.trim();
          if (txt && txt.length > 5 && !/^(yes|no|true|false)$/i.test(txt)) {
            promptText = txt;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
      }
    }

    if (!promptText || promptText.length < 3) return null;

    const candidateName =
      profile.identity?.fullName ||
      `${profile.identity?.firstName || ''} ${profile.identity?.lastName || ''}`.trim();

    // Step A: Check Q&A Memory Bank for existing predefined or learned answer
    let rememberedAnswer = this.findMatchingQA(promptText, profile.customQA || []);
    if (rememberedAnswer) {
      rememberedAnswer = cleanAnswerText(rememberedAnswer, field.maxLength, candidateName);
      logger.info('ContentScript', `Reusing saved answer from Q&A memory bank for: "${promptText.slice(0, 35)}..."`);
      if (field.controlType === 'textarea' || field.controlType === 'text') {
        return rememberedAnswer;
      }
      if (field.controlType === 'select' || field.controlType === 'combobox' || field.controlType === 'searchable_select') {
        // Find matching option in field.options if available
        if (field.options && field.options.length > 0) {
          const remLower = rememberedAnswer.toLowerCase().trim();
          const matched = field.options.find((opt) => {
            const oLower = opt.label.toLowerCase().trim();
            return oLower === remLower || oLower.includes(remLower) || remLower.includes(oLower);
          });
          if (matched) return matched.value || matched.label;
        }
        return rememberedAnswer;
      }
      if (field.controlType === 'radio' || field.controlType === 'checkbox') {
        const myLabel = (field.labelText || '').toLowerCase().trim();
        const remLower = rememberedAnswer.toLowerCase().trim();
        if (myLabel && (myLabel === remLower || remLower.includes(myLabel) || myLabel.includes(remLower))) {
          return true;
        }
        if (/^yes\b/i.test(remLower) && /^yes\b/i.test(myLabel)) {
          return true;
        }
        if (field.controlType === 'radio') {
          return false;
        }
      }
    }

    // Step B: Real-Time AI Generation if enabled
    if (settings.aiEnabled) {
      if (field.controlType === 'textarea' || field.controlType === 'text') {
        const aiRes = await this.generateAndSaveRealtimeAnswer(promptText, field, detectedCompany, detectedRole);
        if (aiRes?.answer) {
          const cleaned = cleanAnswerText(aiRes.answer, field.maxLength, candidateName);
          this.recordNewQA(profile, promptText, cleaned, detectedCompany);
          return cleaned;
        }
      }

      if (field.controlType === 'select' || field.controlType === 'combobox' || field.controlType === 'searchable_select') {
        let optionLabels = (field.options || [])
          .map((o) => o.label)
          .filter((l) => l && !/^(?:select|choose|please select|--)/i.test(l.trim()));
        
        if (optionLabels.length === 0 && element.tagName === 'SELECT') {
          const sel = element as HTMLSelectElement;
          optionLabels = Array.from(sel.options)
            .map((o) => o.text.trim())
            .filter((l) => l && !/^(?:select|choose|please select|--)/i.test(l.trim()));
        }

        if (optionLabels.length > 0) {
          const isMulti = element instanceof HTMLSelectElement && element.multiple;
          const aiRes = await this.generateAndSaveRealtimeAnswer(promptText, field, detectedCompany, detectedRole, optionLabels, isMulti);
          if (aiRes?.answer) {
            this.recordNewQA(profile, promptText, aiRes.answer, detectedCompany);
            // Return option value matching the answer
            const ansLower = aiRes.answer.toLowerCase().trim();
            const matched = (field.options || []).find((o) => {
              const l = o.label.toLowerCase().trim();
              const v = (o.value || '').toLowerCase().trim();
              return l === ansLower || v === ansLower || l.includes(ansLower) || ansLower.includes(l);
            });
            return matched ? (matched.value || matched.label) : aiRes.answer;
          }
        }
      }

      if (field.controlType === 'radio' || field.controlType === 'checkbox') {
        let optionLabels = (field.options || []).map((o) => o.label).filter(Boolean);
        if (optionLabels.length <= 1) {
          const name = element.getAttribute('name');
          if (name) {
            const root = element.closest('form') || document;
            try {
              const siblings = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="${field.controlType}"][name="${CSS.escape(name)}"]`));
              if (siblings.length > 1) {
                optionLabels = siblings.map((sib) => {
                  const sibLabel = sib.closest('label')?.textContent?.trim() || (sib.id ? document.querySelector(`label[for="${CSS.escape(sib.id)}"]`)?.textContent?.trim() : '') || sib.value || '';
                  return sibLabel;
                }).filter(Boolean);
              }
            } catch {}
          }
          if (optionLabels.length <= 1) {
            optionLabels = ['Yes', 'No'];
          }
        }

        if (optionLabels.length > 0) {
          const aiRes = await this.generateAndSaveRealtimeAnswer(
            promptText,
            field,
            detectedCompany,
            detectedRole,
            optionLabels,
            field.controlType === 'checkbox'
          );
          if (aiRes) {
            this.recordNewQA(profile, promptText, aiRes.answer, detectedCompany);
            const myLabel = (field.labelText || (element as HTMLInputElement).value || '').toLowerCase().trim();
            const selected = (aiRes.selectedOptions || [aiRes.answer]).map((s) => s.toLowerCase().trim());
            const isMatch = selected.some((s) => s === myLabel || s.includes(myLabel) || myLabel.includes(s));
            return isMatch;
          }
        }
      }
    }

    return null;
  }

  private recordNewQA(profile: UserProfile, question: string, answer: string, company?: string) {
    if (!profile.customQA) profile.customQA = [];
    const exists = profile.customQA.some((q) => q.question.toLowerCase() === question.toLowerCase());
    if (!exists) {
      profile.customQA.push({
        id: `qa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        question,
        answer,
        tags: company ? [company.trim()] : ['realtime_ai'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  private findMatchingQA(questionText: string, customQA: CustomQA[]): string | null {
    if (!questionText || !customQA || customQA.length === 0) return null;
    const cleanQ = questionText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    const qWords = new Set(cleanQ.split(/\s+/).filter((w) => w.length > 3));

    // 1. Exact or substring match
    for (const item of customQA) {
      const cleanStored = item.question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
      if (cleanQ === cleanStored || cleanQ.includes(cleanStored) || cleanStored.includes(cleanQ)) {
        return item.answer;
      }
    }

    // 2. High keyword overlap match (> 60% of significant words)
    if (qWords.size >= 2) {
      let bestMatch: CustomQA | null = null;
      let highestRatio = 0;

      for (const item of customQA) {
        const storedWords = item.question
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3);
        if (storedWords.length === 0) continue;
        const common = storedWords.filter((w) => qWords.has(w));
        const ratio = common.length / Math.max(qWords.size, storedWords.length);
        if (ratio > 0.6 && ratio > highestRatio) {
          highestRatio = ratio;
          bestMatch = item;
        }
      }

      if (bestMatch) return bestMatch.answer;
    }

    return null;
  }

  private async generateAndSaveRealtimeAnswer(
    questionText: string,
    field: FieldDescriptor,
    company?: string,
    role?: string,
    options?: string[],
    isMultiSelect?: boolean
  ): Promise<{ answer: string; selectedOptions?: string[] } | null> {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        return null;
      }
      const pageTitle = document.title || '';
      const domain = window.location.hostname || '';

      const response = await new Promise<{ answer?: string; selectedOptions?: string[]; saved?: boolean }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'CONTENT_GENERATE_AND_SAVE_ANSWER',
            source: 'content',
            payload: {
              question: questionText,
              company: company || pageTitle || domain,
              role: role || 'Job Applicant',
              options,
              isMultiSelect,
              maxLength: field.maxLength,
              maxWords: field.controlType === 'textarea' ? 120 : 35
            },
            timestamp: new Date().toISOString()
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({});
            } else {
              resolve(res?.data || res || {});
            }
          }
        );
      });

      if (!response?.answer) return null;
      return {
        answer: response.answer,
        selectedOptions: response.selectedOptions || (response.answer ? [response.answer] : [])
      };
    } catch (err) {
      logger.warn('ContentScript', 'Dynamic AI answering failed', { error: String(err) });
      return null;
    }
  }

  public async generateTailoredCoverLetter(
    profile: UserProfile,
    company: string,
    role: string,
    jdText: string
  ): Promise<string | null> {
    const candidateName =
      profile.identity.fullName ||
      `${profile.identity.firstName || ''} ${profile.identity.lastName || ''}`.trim() ||
      '';

    const cleanRole = (role || 'Target Role')
      .replace(/^(?:join\s+(?:the\s+|our\s+)?|apply\s+(?:for\s+)?)/i, '')
      .trim() || 'Target Role';

    const evidence: string[] = [];
    if (candidateName) {
      evidence.push(`Applicant Name: ${candidateName}`);
    }
    if (profile.summary?.trim()) {
      evidence.push(`Professional Summary: ${profile.summary.trim()}`);
    }
    if (profile.skills && profile.skills.length > 0) {
      evidence.push(`Key skills: ${profile.skills.slice(0, 8).map((s) => s.canonicalName).join(', ')}`);
    }
    for (const exp of profile.experiences || []) {
      if (exp.title && exp.company) {
        evidence.push(`${exp.title} at ${exp.company}${exp.description ? `: ${exp.description}` : ''}`);
      }
    }
    const locStr = [profile.location?.city, profile.location?.country].filter(Boolean).join(', ');
    if (locStr) {
      evidence.push(`Location: ${locStr}`);
    }

    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        return null;
      }
      const response = await new Promise<{ coverLetter?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'UI_GENERATE_COVER_LETTER',
            source: 'content',
            payload: {
              company: company || 'Hiring Team',
              role: cleanRole,
              jobDescription: jdText || '',
              jdText: jdText || '',
              profileEvidence: evidence,
              candidateName,
              predefinedTemplate: profile.coverLetter || '',
              tone: 'professional'
            },
            timestamp: new Date().toISOString()
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({});
            } else {
              resolve(res?.data || res || {});
            }
          }
        );
      });

      if (response?.coverLetter && response.coverLetter.trim().length > 20) {
        return response.coverLetter.trim();
      }
    } catch (err) {
      logger.warn('ContentScript', 'Tailored cover letter generation error', { error: String(err) });
    }

    return null;
  }

  private handleMutation() {
    try {
      if (this.isFilling) return;
      this.scanAndNotify();
    } catch (err) {
      logger.debug('ContentScript', 'handleMutation error', { error: String(err) });
    }
  }
}

// Instantiate controller in content page safely
try {
  new ContentScriptController();
} catch (err) {
  logger.debug('ContentScript', 'ContentScriptController initialization error', { error: String(err) });
}
