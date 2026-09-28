import { AIProvider } from '../../types/ai';
import { LocalAIProvider } from './local-provider';
import { CloudAIAdapter } from './cloud-adapter';
import { GeminiAIAdapter } from './gemini-adapter';
import { storage } from '../../storage';
import { logger } from '../../utils/logger';

export class AIOrchestrator {
  private localProvider: LocalAIProvider;
  private cloudProvider: CloudAIAdapter | null = null;
  private geminiProvider: GeminiAIAdapter | null = null;

  constructor() {
    this.localProvider = new LocalAIProvider();
  }

  public async getActiveProvider(): Promise<AIProvider> {
    const settings = await storage.getSettings();

    if (settings.allowCloudAI && settings.aiApiKey && settings.aiProvider !== 'local') {
      if (settings.aiProvider === 'gemini' || settings.aiApiKey.startsWith('AQ.') || settings.aiApiKey.startsWith('AIza')) {
        if (!this.geminiProvider) {
          this.geminiProvider = new GeminiAIAdapter({
            apiKey: settings.aiApiKey,
            model: settings.aiModelName || 'gemini-3.8-flash',
            maxOutputTokens: 4096,
            temperature: 0.1
          });
        }
        if (await this.geminiProvider.isAvailable()) {
          return this.geminiProvider;
        }
      }

      if (!this.cloudProvider) {
        this.cloudProvider = new CloudAIAdapter({
          apiKey: settings.aiApiKey,
          baseUrl: settings.aiBaseUrl,
          model: settings.aiModelName
        });
      }
      if (await this.cloudProvider.isAvailable()) {
        return this.cloudProvider;
      }
    }

    return this.localProvider;
  }

  public async classifyField(req: Parameters<AIProvider['classifyField']>[0]) {
    const provider = await this.getActiveProvider();
    logger.info('AIOrchestrator', `Classifying field using provider: ${provider.name}`);
    return provider.classifyField(req);
  }

  public async mapOption(req: Parameters<AIProvider['mapOption']>[0]) {
    const provider = await this.getActiveProvider();
    return provider.mapOption(req);
  }

  public async matchSkills(req: Parameters<AIProvider['matchSkills']>[0]) {
    const provider = await this.getActiveProvider();
    return provider.matchSkills(req);
  }

  public async generateAnswer(req: Parameters<AIProvider['generateAnswer']>[0]) {
    const provider = await this.getActiveProvider();
    const result = await provider.generateAnswer(req);

    // Double check grounding per Security.md Section 10
    const grounding = await provider.validateGrounding({
      textToAudit: result.answer,
      approvedEvidence: req.profileEvidence
    });

    if (grounding.status === 'failed') {
      result.groundingStatus = 'failed';
      result.unsupportedClaims = grounding.unsupportedClaims;
    }

    return result;
  }

  public async generateCoverLetter(req: Parameters<AIProvider['generateCoverLetter']>[0]) {
    const provider = await this.getActiveProvider();
    const result = await provider.generateCoverLetter(req);

    // Grounding check
    const grounding = await provider.validateGrounding({
      textToAudit: result.coverLetter,
      approvedEvidence: req.profileEvidence
    });

    if (grounding.status === 'failed') {
      result.groundingStatus = 'failed';
      result.unsupportedClaims = grounding.unsupportedClaims;
    }

    return result;
  }

  public async extractJD(req: Parameters<AIProvider['extractJD']>[0]) {
    const provider = await this.getActiveProvider();
    return provider.extractJD(req);
  }

  public async parseResume(req: Parameters<AIProvider['parseResume']>[0]) {
    try {
      const provider = await this.getActiveProvider();
      logger.info('AIOrchestrator', `Parsing resume with provider: ${provider.name}`);
      return await provider.parseResume(req);
    } catch (err) {
      logger.warn('AIOrchestrator', `Active provider failed to parse resume (${err}), falling back to local deterministic parser`);
      return this.localProvider.parseResume(req);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
