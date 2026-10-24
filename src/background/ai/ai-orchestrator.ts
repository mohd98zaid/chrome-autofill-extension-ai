import { AIProvider } from '../../types/ai';
import { LocalAIProvider } from './local-provider';
import { CloudAIAdapter } from './cloud-adapter';
import { GeminiAIAdapter } from './gemini-adapter';
import { storage } from '../../storage';
import { logger } from '../../utils/logger';
import { cleanAnswerText } from '../../utils/text-cleaner';

export class AIOrchestrator {
  private localProvider: LocalAIProvider;
  private cloudProvider: CloudAIAdapter | null = null;
  private lastCloudConfigKey = '';
  private geminiProvider: GeminiAIAdapter | null = null;
  private lastGeminiConfigKey = '';

  constructor() {
    this.localProvider = new LocalAIProvider();
  }

  public async getActiveProvider(): Promise<AIProvider> {
    const settings = await storage.getSettings();

    const apiKey = (settings.aiApiKey || '').trim();
    const hasCloudKey = Boolean(apiKey.length > 5 && settings.aiProvider !== 'local');

    if (hasCloudKey) {
      if (settings.aiProvider === 'gemini' || apiKey.startsWith('AQ.') || apiKey.startsWith('AIza')) {
        const geminiKey = `${apiKey}|${settings.aiModelName || 'gemini-flash-lite-latest'}`;
        if (!this.geminiProvider || this.lastGeminiConfigKey !== geminiKey) {
          this.geminiProvider = new GeminiAIAdapter({
            apiKey,
            model: settings.aiModelName || 'gemini-flash-lite-latest',
            maxOutputTokens: 4096,
            temperature: 0.1
          });
          this.lastGeminiConfigKey = geminiKey;
        }
        if (await this.geminiProvider.isAvailable()) {
          return this.geminiProvider;
        }
      }

      const isNvidia = settings.aiProvider === 'nvidia' || apiKey.startsWith('nvapi-');
      const baseUrl = settings.aiBaseUrl || (isNvidia ? 'https://integrate.api.nvidia.com/v1' : undefined);
      const model = settings.aiModelName || (isNvidia ? 'openai/gpt-oss-20b' : undefined);
      const fallbackModel = settings.aiFallbackModel || (isNvidia ? 'nvidia/nemotron-3.5-lightning-30b-a3b' : undefined);
      const cloudKey = `${apiKey}|${baseUrl}|${model}|${fallbackModel}`;

      if (!this.cloudProvider || this.lastCloudConfigKey !== cloudKey) {
        this.cloudProvider = new CloudAIAdapter({
          apiKey,
          baseUrl,
          model,
          fallbackModel,
          timeoutMs: 15000
        });
        this.lastCloudConfigKey = cloudKey;
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

    // Ensure answer is cleaned to first-person, no long dashes, and fits maxLength
    result.answer = cleanAnswerText(result.answer, req.maxLength);

    // Check grounding: cloud providers evaluate grounding directly in prompt; for local provider run local audit
    if (provider.name === 'local') {
      const grounding = await provider.validateGrounding({
        textToAudit: result.answer,
        approvedEvidence: req.profileEvidence
      });

      if (grounding.status === 'failed') {
        result.groundingStatus = 'failed';
        result.unsupportedClaims = grounding.unsupportedClaims;
      }
    }

    return result;
  }

  public async generateCoverLetter(req: Parameters<AIProvider['generateCoverLetter']>[0]) {
    try {
      const provider = await this.getActiveProvider();
      const result = await provider.generateCoverLetter(req);

      // Grounding check
      try {
        const grounding = await provider.validateGrounding({
          textToAudit: result.coverLetter,
          approvedEvidence: req.profileEvidence || []
        });

        if (grounding.status === 'failed') {
          result.groundingStatus = 'failed';
          result.unsupportedClaims = grounding.unsupportedClaims;
        }
      } catch (gErr) {
        logger.warn('AIOrchestrator', 'Grounding validation warning', { error: String(gErr) });
      }

      return result;
    } catch (err) {
      logger.warn('AIOrchestrator', 'Primary provider failed for cover letter, falling back to local synthesis', {
        error: String(err)
      });
      return this.localProvider.generateCoverLetter(req);
    }
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
