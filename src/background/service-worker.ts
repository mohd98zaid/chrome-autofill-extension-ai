import { storage, deduplicateSkills, deduplicateExperiences, deduplicateEducation } from '../storage';
import { aiOrchestrator } from './ai/ai-orchestrator';
import { CustomQA } from '../types/profile';
import {
  ExtensionMessage,
  ExtensionResponse,
  PageScannedPayload,
  TriggerFillPayload
} from '../types/messages';
import { ApplicationSession, FilledFieldRecord } from '../types/session';
import { FieldDescriptor } from '../types/taxonomy';
import { logger } from '../utils/logger';

class BackgroundService {
  private sessions: Map<number, ApplicationSession> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    logger.info('ServiceWorker', 'Initializing extension service worker');
    this.setupListeners();
  }

  private setupListeners() {
    // Chrome runtime message dispatcher
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage<any>,
        sender: chrome.runtime.MessageSender,
        sendResponse: (res: ExtensionResponse<any>) => void
      ) => {
        this.dispatchMessage(message, sender)
          .then((data) => sendResponse({ success: true, data }))
          .catch((err) => {
            logger.error('ServiceWorker', `Error processing ${message.type}`, { error: String(err) });
            sendResponse({ success: false, error: { code: 'E_DISPATCH', message: String(err) } });
          });
        return true; // Keep channel open for async response
      }
    );

    // Clean up sessions when tab is closed
    chrome.tabs?.onRemoved?.addListener((tabId: number) => {
      this.sessions.delete(tabId);
    });
  }

  private async dispatchMessage(message: ExtensionMessage<any>, sender: chrome.runtime.MessageSender): Promise<any> {
    const tabId = sender.tab?.id || message.tabId || 0;

    switch (message.type) {
      // --- Content Script Events ---
      case 'CONTENT_PAGE_SCANNED':
        return this.handlePageScanned(tabId, message.payload as PageScannedPayload, sender.frameId ?? 0);

      case 'CONTENT_FIELD_FILLED':
        return this.handleFieldFilled(tabId, message.payload as FilledFieldRecord);

      case 'CONTENT_SECURITY_DETECTED':
        // Only accept security challenges from top frame or subframes with form fields
        if ((sender.frameId ?? 0) === 0) {
          return this.handleSecurityDetected(tabId, message.payload);
        }
        return { ignored: true };

      // --- UI Actions (Popup / Review Panel) ---
      case 'UI_GET_SESSION':
        return this.getSession(tabId);

      case 'UI_DISMISS_SECURITY': {
        const session = await this.getSession(tabId);
        session.status = 'READY';
        session.securityTrigger = undefined;
        await storage.saveSession(session);
        try {
          chrome.tabs.sendMessage(tabId, {
            type: 'BG_DISMISS_SECURITY',
            source: 'background',
            timestamp: new Date().toISOString()
          });
        } catch {
          // ignore
        }
        return session;
      }

      case 'UI_START_AUTOFILL':
        return this.startAutofill(tabId, message.payload as TriggerFillPayload | undefined);

      case 'UI_PAUSE_AUTOFILL':
        return this.pauseAutofill(tabId);

      case 'UI_GET_PROFILE':
        return storage.getProfile(message.payload?.profileId);

      case 'UI_GET_PROFILES':
        return storage.getProfiles();

      case 'UI_SET_ACTIVE_PROFILE':
        await storage.setActiveProfileId(message.payload?.id);
        return { success: true };

      case 'UI_DELETE_PROFILE':
        return storage.deleteProfile(message.payload?.id);

      case 'UI_UPDATE_PROFILE':
        await storage.saveProfile(message.payload);
        return { updated: true, success: true };

      case 'CONTENT_GENERATE_AND_SAVE_ANSWER': {
        const payload = message.payload as {
          question: string;
          company?: string;
          role?: string;
          maxWords?: number;
        };
        const currentProfile = await storage.getProfile();

        // Build rich profile evidence for grounding
        const profileEvidence = [
          `Candidate Name: ${currentProfile.identity.fullName || `${currentProfile.identity.firstName} ${currentProfile.identity.lastName}`}`,
          `Professional Summary: ${currentProfile.summary}`,
          `Work Experience: ${currentProfile.experiences.map((e) => `${e.title} at ${e.company} (${e.startDate} - ${e.endDate}): ${e.description}`).join('; ')}`,
          `Education: ${currentProfile.education.map((ed) => `${ed.degree} in ${ed.field} from ${ed.institution}`).join('; ')}`,
          `Skills: ${currentProfile.skills.map((s) => s.canonicalName).join(', ')}`,
          `Location: ${currentProfile.location.city}, ${currentProfile.location.country}`,
          `Notice Period: ${currentProfile.preferences.noticePeriodDays} days`,
          `Work Authorization: ${currentProfile.preferences.workAuthorization}`
        ];

        // Generate grounded answer via AI Orchestrator
        const aiRes = await aiOrchestrator.generateAnswer({
          question: payload.question,
          profileEvidence,
          jdContext: payload.company ? `Company: ${payload.company}. Target Role: ${payload.role || 'Job Applicant'}` : undefined,
          maxWords: payload.maxWords || 120
        });

        // Persist to profile's customQA Knowledge Bank
        const newQA: CustomQA = {
          id: `qa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          question: payload.question.trim(),
          answer: aiRes.answer.trim(),
          tags: payload.company ? [payload.company.trim()] : ['general'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const existingQA = currentProfile.customQA || [];
        const filtered = existingQA.filter((q) => q.question.toLowerCase() !== payload.question.trim().toLowerCase());
        const updatedQA = [newQA, ...filtered];

        const updatedProfile = {
          ...currentProfile,
          customQA: updatedQA,
          updatedAt: new Date().toISOString()
        };

        await storage.saveProfile(updatedProfile);
        logger.info('ServiceWorker', `Generated and saved Q&A for: "${payload.question.slice(0, 40)}..."`);

        return {
          answer: aiRes.answer,
          qaId: newQA.id,
          saved: true
        };
      }

      case 'UI_SAVE_QA': {
        const item = message.payload as { id?: string; question: string; answer: string; tags?: string[] };
        const currentProfile = await storage.getProfile();
        const existingQA = currentProfile.customQA || [];
        const qaId = item.id || `qa_${Date.now()}`;
        const updatedItem: CustomQA = {
          id: qaId,
          question: item.question.trim(),
          answer: item.answer.trim(),
          tags: item.tags || ['general'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const filtered = existingQA.filter((q) => q.id !== qaId);
        const updatedProfile = {
          ...currentProfile,
          customQA: [updatedItem, ...filtered],
          updatedAt: new Date().toISOString()
        };
        await storage.saveProfile(updatedProfile);
        return { success: true, item: updatedItem };
      }

      case 'UI_DELETE_QA': {
        const { id } = message.payload as { id: string };
        const currentProfile = await storage.getProfile();
        const existingQA = currentProfile.customQA || [];
        const updatedProfile = {
          ...currentProfile,
          customQA: existingQA.filter((q) => q.id !== id),
          updatedAt: new Date().toISOString()
        };
        await storage.saveProfile(updatedProfile);
        return { success: true };
      }

      case 'UI_SAVE_PAGE_INPUTS_TO_PROFILE': {
        const extracted = message.payload as Record<string, string>;
        const current = await storage.getProfile();
        let updatedCount = 0;

        const updatedProfile = {
          ...current,
          identity: { ...current.identity },
          location: { ...current.location },
          links: { ...current.links },
          preferences: { ...current.preferences }
        };

        if (extracted.first_name && extracted.first_name !== current.identity.firstName) {
          updatedProfile.identity.firstName = extracted.first_name;
          updatedCount++;
        }
        if (extracted.last_name && extracted.last_name !== current.identity.lastName) {
          updatedProfile.identity.lastName = extracted.last_name;
          updatedCount++;
        }
        if (extracted.full_name && extracted.full_name !== current.identity.fullName) {
          updatedProfile.identity.fullName = extracted.full_name;
          updatedCount++;
        }
        if (extracted.email && extracted.email !== current.identity.email) {
          updatedProfile.identity.email = extracted.email;
          updatedCount++;
        }
        if (extracted.phone && extracted.phone !== current.identity.phone) {
          updatedProfile.identity.phone = extracted.phone;
          updatedCount++;
        }
        if (extracted.address && extracted.address !== current.location.addressLine) {
          updatedProfile.location.addressLine = extracted.address;
          updatedCount++;
        }
        if (extracted.city && extracted.city !== current.location.city) {
          updatedProfile.location.city = extracted.city;
          updatedCount++;
        }
        if (extracted.state && extracted.state !== current.location.state) {
          updatedProfile.location.state = extracted.state;
          updatedCount++;
        }
        if (extracted.zip_code && extracted.zip_code !== current.location.zipCode) {
          updatedProfile.location.zipCode = extracted.zip_code;
          updatedCount++;
        }
        if (extracted.country && extracted.country !== current.location.country) {
          updatedProfile.location.country = extracted.country;
          updatedCount++;
        }
        if (extracted.linkedin && extracted.linkedin !== current.links.linkedin) {
          updatedProfile.links.linkedin = extracted.linkedin;
          updatedCount++;
        }
        if (extracted.github && extracted.github !== current.links.github) {
          updatedProfile.links.github = extracted.github;
          updatedCount++;
        }
        if (extracted.portfolio && extracted.portfolio !== current.links.portfolio) {
          updatedProfile.links.portfolio = extracted.portfolio;
          updatedCount++;
        }
        if (extracted.work_authorization && extracted.work_authorization !== current.preferences.workAuthorization) {
          updatedProfile.preferences.workAuthorization = extracted.work_authorization;
          updatedCount++;
        }
        if (extracted.visa_status && extracted.visa_status !== current.preferences.visaStatus) {
          updatedProfile.preferences.visaStatus = extracted.visa_status;
          updatedCount++;
        }
        if (extracted.salary && extracted.salary !== current.preferences.desiredSalary) {
          updatedProfile.preferences.desiredSalary = extracted.salary;
          updatedCount++;
        }

        if (updatedCount > 0) {
          await storage.saveProfile(updatedProfile);
        }

        return { updatedCount, profile: updatedProfile };
      }

      case 'UI_GET_SETTINGS':
        return storage.getSettings();

      case 'UI_UPDATE_SETTINGS':
        return storage.saveSettings(message.payload);

      case 'UI_GET_MAPPINGS':
        return storage.getMappings(message.payload?.domain);

      case 'UI_SAVE_MAPPING':
        await storage.saveMapping(message.payload);
        return { saved: true };

      case 'UI_DELETE_MAPPING':
        await storage.deleteMapping(message.payload.id);
        return { deleted: true };

      case 'UI_GENERATE_COVER_LETTER':
        return aiOrchestrator.generateCoverLetter(message.payload);

      case 'UI_GENERATE_ANSWER':
        return aiOrchestrator.generateAnswer(message.payload);

      case 'UI_PARSE_RESUME': {
        const parsed = await aiOrchestrator.parseResume(message.payload);
        const currentProfile = await storage.getProfile();

        const cleanNonEmpty = (obj: any) => {
          if (!obj || typeof obj !== 'object') return {};
          const out: any = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v !== null && v !== undefined && v !== 'null' && v !== '') {
              out[k] = v;
            }
          }
          return out;
        };

        const updatedProfile = {
          ...currentProfile,
          identity: {
            ...currentProfile.identity,
            ...cleanNonEmpty(parsed.identity)
          },
          location: {
            ...currentProfile.location,
            ...cleanNonEmpty(parsed.location)
          },
          summary: parsed.summary || currentProfile.summary,
          links: {
            ...currentProfile.links,
            ...cleanNonEmpty(parsed.links)
          },
          skills: deduplicateSkills([
            ...currentProfile.skills,
            ...(parsed.skills || []).map((s: any, idx: number) => ({
              id: `skill_${Date.now()}_${idx}`,
              canonicalName: s.canonicalName,
              aliases: [],
              proficiency: s.proficiency || 'intermediate',
              years: null,
              source: ['resume'],
              verified: true
            }))
          ]),
          experiences: deduplicateExperiences([
            ...(parsed.experiences?.map((e: any, idx: number) => ({
              id: `exp_${Date.now()}_${idx}`,
              company: e.company || '',
              title: e.title || '',
              startDate: e.startDate || '',
              endDate: e.endDate || '',
              current: false,
              location: e.location || '',
              description: e.description || '',
              skills: [],
              achievements: [],
              verified: true
            })) || []),
            ...currentProfile.experiences
          ]),
          education: deduplicateEducation([
            ...(parsed.education?.map((ed: any, idx: number) => ({
              id: `edu_${Date.now()}_${idx}`,
              institution: ed.institution || '',
              degree: ed.degree || '',
              field: ed.field || '',
              startDate: ed.startDate || '',
              endDate: ed.endDate || '',
              verified: true
            })) || []),
            ...currentProfile.education
          ])
        };
        await storage.saveProfile(updatedProfile);
        return { success: true, profile: updatedProfile };
      }

      case 'AI_CLASSIFY_FIELD_REQUEST':
        return aiOrchestrator.classifyField(message.payload);

      default:
        logger.warn('ServiceWorker', `Unhandled message type: ${message.type}`);
        return { unhandled: true };
    }
  }

  private async getSession(tabId: number): Promise<ApplicationSession> {
    let session = this.sessions.get(tabId);
    if (!session) {
      session = (await storage.getSession(tabId)) || {
        id: `sess_${Date.now()}`,
        tabId,
        url: '',
        domain: '',
        status: 'DISCOVERING',
        pageState: {},
        filledFields: [],
        pendingFields: [],
        unresolvedFields: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.sessions.set(tabId, session);
    }
    return session;
  }

  private async handlePageScanned(tabId: number, payload: PageScannedPayload, frameId: number = 0): Promise<ApplicationSession> {
    const session = await this.getSession(tabId);

    if (frameId === 0) {
      // Main frame: primary source of page URL, domain
      session.url = payload.url;
      session.domain = payload.domain;
    }

    // Maintain multi-frame field storage so frame 0 never wipes out fields discovered by subframes (or vice versa)
    if (!session.pageState) {
      session.pageState = {};
    }
    const frameFieldsMap = (session.pageState.frameFields as Record<string, FieldDescriptor[]>) || {};
    frameFieldsMap[String(frameId)] = payload.fields || [];
    session.pageState.frameFields = frameFieldsMap;

    // Aggregate across all frames
    const allFieldsMap = new Map<string, FieldDescriptor>();
    for (const frameIdStr of Object.keys(frameFieldsMap)) {
      const fList = frameFieldsMap[frameIdStr];
      if (Array.isArray(fList)) {
        for (const f of fList) {
          allFieldsMap.set(f.id, f);
        }
      }
    }
    session.pendingFields = Array.from(allFieldsMap.values());

    session.status = session.status === 'PAUSED_SECURITY' ? 'PAUSED_SECURITY' : 'READY';
    await storage.saveSession(session);
    return session;
  }

  private async handleFieldFilled(tabId: number, record: FilledFieldRecord): Promise<void> {
    const session = await this.getSession(tabId);
    session.filledFields.push(record);
    session.pendingFields = session.pendingFields.filter((f) => f.id !== record.fieldId);
    await storage.saveSession(session);
  }

  private async handleSecurityDetected(tabId: number, trigger: { type: any; message: string }): Promise<void> {
    const session = await this.getSession(tabId);
    session.status = 'PAUSED_SECURITY';
    session.securityTrigger = {
      type: trigger.type,
      message: trigger.message,
      timestamp: new Date().toISOString()
    };
    logger.warn('ServiceWorker', `Security challenge encountered on tab ${tabId}. Pausing automation.`, trigger);
    await storage.saveSession(session);
  }

  private async startAutofill(tabId: number, fillPayload?: TriggerFillPayload): Promise<{ success: boolean; message?: string }> {
    const session = await this.getSession(tabId);

    // If currently paused due to security challenge, treat user-initiated autofill as an explicit override
    if (session.status === 'PAUSED_SECURITY') {
      logger.info('ServiceWorker', `Overriding PAUSED_SECURITY because user initiated autofill on tab ${tabId}`);
      session.status = 'READY';
      session.securityTrigger = undefined;
      try {
        chrome.tabs.sendMessage(tabId, {
          type: 'BG_DISMISS_SECURITY',
          source: 'background',
          timestamp: new Date().toISOString()
        });
      } catch {
        // ignore
      }
    }

    session.status = 'FILLING';
    await storage.saveSession(session);

    const profile = await storage.getProfile((fillPayload as any)?.profileId);
    const settings = await storage.getSettings();

    try {
      // Send command to content script in tab
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'BG_TRIGGER_FILL',
        source: 'background',
        payload: {
          profile,
          settings,
          fillPayload
        },
        timestamp: new Date().toISOString()
      });

      session.status = 'COMPLETED_REVIEW';
      await storage.saveSession(session);

      return { success: true, ...response };
    } catch (err) {
      session.status = 'FAILED_RECOVERABLE';
      await storage.saveSession(session);
      return { success: false, message: `Could not communicate with tab: ${String(err)}` };
    }
  }

  private async pauseAutofill(tabId: number): Promise<void> {
    const session = await this.getSession(tabId);
    session.status = 'NEEDS_USER';
    await storage.saveSession(session);
  }
}

// Start service worker
new BackgroundService();
