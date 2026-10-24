import { JobListingItem } from '../../types/crawler';
import { logger } from '../../utils/logger';

export class JobPortalDetector {
  /**
   * Identifies the current portal platform based on hostname
   */
  public static detectPlatform(hostname: string = window.location.hostname): string {
    const host = hostname.toLowerCase();
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('indeed.com')) return 'indeed';
    if (host.includes('naukri.com')) return 'naukri';
    if (host.includes('wellfound.com') || host.includes('angel.co')) return 'wellfound';
    if (host.includes('glassdoor.com')) return 'glassdoor';
    if (host.includes('greenhouse.io')) return 'greenhouse';
    if (host.includes('lever.co')) return 'lever';
    if (host.includes('ashbyhq.com')) return 'ashby';
    if (host.includes('myworkdayjobs.com')) return 'workday';
    return 'generic';
  }

  /**
   * Checks if current page has search listings or job boards
   */
  public static isSearchOrBoardPage(): boolean {
    const path = window.location.pathname.toLowerCase();
    const host = window.location.hostname.toLowerCase();

    if (host.includes('linkedin.com') && path.includes('/jobs')) return true;
    if (host.includes('indeed.com') && (path.includes('/jobs') || path.includes('/m/jobs'))) return true;
    if (host.includes('naukri.com') && (path.includes('-jobs') || path.includes('/jobs'))) return true;
    if (host.includes('wellfound.com') && path.includes('/jobs')) return true;
    if (host.includes('glassdoor.com') && path.includes('/job')) return true;
    if (host.includes('greenhouse.io') || host.includes('lever.co') || host.includes('ashbyhq.com') || host.includes('myworkdayjobs.com')) {
      return true;
    }

    // Generic heuristic: page contains multiple job links
    const jobLinks = document.querySelectorAll(
      'a[href*="/job/" i], a[href*="/jobs/" i], a[href*="/career/" i], a[href*="/careers/" i], a[href*="/opening/" i], a[href*="/position/" i]'
    );
    return jobLinks.length >= 2;
  }

  /**
   * Extracts available job listings from the current page
   */
  public static extractJobListings(maxCount: number = 10): JobListingItem[] {
    const platform = this.detectPlatform();
    logger.info('JobPortalDetector', `Extracting job listings for platform: ${platform}`);

    let items: JobListingItem[] = [];

    switch (platform) {
      case 'linkedin':
        items = this.extractLinkedIn(maxCount);
        break;
      case 'indeed':
        items = this.extractIndeed(maxCount);
        break;
      case 'naukri':
        items = this.extractNaukri(maxCount);
        break;
      case 'greenhouse':
      case 'lever':
      case 'ashby':
      case 'workday':
        items = this.extractBoardPlatform(platform, maxCount);
        break;
      default:
        items = this.extractGeneric(maxCount);
        break;
    }

    // If platform-specific extractor found nothing, fallback to generic
    if (items.length === 0) {
      items = this.extractGeneric(maxCount);
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    return unique.slice(0, maxCount);
  }

  private static extractLinkedIn(maxCount: number): JobListingItem[] {
    const items: JobListingItem[] = [];

    // 1. If currently viewed job in details pane has active "Easy Apply", include it first
    const activeApplyBtn = document.querySelector('#jobs-apply-button-id, button.jobs-apply-button, button[aria-label*="Easy Apply" i]');
    if (activeApplyBtn && !activeApplyBtn.textContent?.toLowerCase().includes('applied')) {
      const topTitle = document.querySelector(
        'h1.t-24, h1[class*="job-title" i], .jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, .jobs-details__main-content h1'
      )?.textContent?.trim();
      const topCompany = document.querySelector(
        '.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, .jobs-details-top-card__company-url'
      )?.textContent?.trim();

      if (topTitle) {
        items.push({
          id: `li_active_${Date.now()}`,
          title: topTitle,
          company: topCompany || 'Company',
          url: this.normalizeUrl(window.location.href),
          platform: 'linkedin',
          status: 'pending'
        });
      }
    }

    // 2. Scan search result cards in list
    const cards = document.querySelectorAll(
      '.job-card-container, .jobs-search-results__list-item, .scaffold-layout__list-item, [data-occludable-job-id], [data-job-id], .jobs-search-results-list__list-item'
    );

    cards.forEach((card, idx) => {
      if (items.length >= maxCount) return;

      const link = card.querySelector<HTMLAnchorElement>(
        'a.job-card-list__title, a.job-card-container__link, a[href*="/jobs/view/"], a[data-control-id]'
      );
      const rawJobId =
        card.getAttribute('data-job-id') ||
        card.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
        card.getAttribute('data-occludable-job-id') ||
        (link?.href ? link.href.match(/\/jobs\/view\/(\d+)/)?.[1] : undefined);

      const title = (link?.textContent || card.querySelector('.job-card-list__title')?.textContent || '').trim();
      if (!title) return;

      const companyEl = card.querySelector(
        '.job-card-container__primary-description, .job-card-container__company-name, .artdeco-entity-lockup__subtitle'
      );
      const company = companyEl ? (companyEl.textContent || '').trim() : 'Company';

      const locEl = card.querySelector('.job-card-container__metadata-item');
      const location = locEl ? (locEl.textContent || '').trim() : undefined;

      const cardUrl = link && link.href && !link.href.startsWith('javascript')
        ? this.normalizeUrl(link.href)
        : rawJobId
        ? `https://www.linkedin.com/jobs/view/${rawJobId}/`
        : window.location.href;

      const cleanId = rawJobId ? `li_${rawJobId}` : `li_${idx}_${Date.now()}`;

      items.push({
        id: cleanId,
        title,
        company,
        location,
        url: cardUrl,
        platform: 'linkedin',
        status: 'pending'
      });
    });

    return items;
  }

  private static extractIndeed(maxCount: number): JobListingItem[] {
    const items: JobListingItem[] = [];
    const cards = document.querySelectorAll('.job_seen_beacon, td.resultContent, .slider_item');

    cards.forEach((card, idx) => {
      if (items.length >= maxCount) return;
      const link = card.querySelector<HTMLAnchorElement>('a.jcs-JobTitle, a[href*="/rc/clk"], a[href*="/viewjob"]');
      if (!link || !link.href) return;

      const title = (link.textContent || '').trim();
      if (!title) return;

      const compEl = card.querySelector('[data-testid="company-name"], .companyName');
      const company = compEl ? (compEl.textContent || '').trim() : 'Company';

      const locEl = card.querySelector('[data-testid="text-location"], .companyLocation');
      const location = locEl ? (locEl.textContent || '').trim() : undefined;

      items.push({
        id: `ind_${idx}_${Date.now()}`,
        title,
        company,
        location,
        url: this.normalizeUrl(link.href),
        platform: 'indeed',
        status: 'pending'
      });
    });

    return items;
  }

  private static extractNaukri(maxCount: number): JobListingItem[] {
    const items: JobListingItem[] = [];
    const cards = document.querySelectorAll('.cust-job-tuple, .srp-jobtuple-wrapper');

    cards.forEach((card, idx) => {
      if (items.length >= maxCount) return;
      const link = card.querySelector<HTMLAnchorElement>('a.title');
      if (!link || !link.href) return;

      const title = (link.textContent || '').trim();
      if (!title) return;

      const compEl = card.querySelector('a.comp-name');
      const company = compEl ? (compEl.textContent || '').trim() : 'Company';

      const locEl = card.querySelector('.locWdth, .loc-wrap');
      const location = locEl ? (locEl.textContent || '').trim() : undefined;

      items.push({
        id: `nk_${idx}_${Date.now()}`,
        title,
        company,
        location,
        url: this.normalizeUrl(link.href),
        platform: 'naukri',
        status: 'pending'
      });
    });

    return items;
  }

  private static extractBoardPlatform(platform: string, maxCount: number): JobListingItem[] {
    const items: JobListingItem[] = [];
    const links = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/jobs/"], a[href*="/job/"], a[data-automation-id="jobTitle"], a.posting-title'
    );

    links.forEach((link, idx) => {
      if (items.length >= maxCount) return;
      const href = link.href;
      const title = (link.textContent || '').trim();
      if (!href || !title || title.length < 3 || /^(apply|view|share|login|back)$/i.test(title)) return;

      const container = link.closest('.opening, .posting, [role="listitem"], tr, div') || link.parentElement;
      const compEl = container?.querySelector('.company, .employer, [data-automation-id="company"]');
      const company = compEl ? (compEl.textContent || '').trim() : document.title.split(/[-|–]/)[0].trim();

      items.push({
        id: `${platform}_${idx}_${Date.now()}`,
        title,
        company: company || 'Company',
        url: this.normalizeUrl(href),
        platform,
        status: 'pending'
      });
    });

    return items;
  }

  private static extractGeneric(maxCount: number): JobListingItem[] {
    const items: JobListingItem[] = [];
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));

    const jobUrlPattern = /\/(?:jobs?|careers?|positions?|openings?)\/(?:view\/|detail\/)?[a-zA-Z0-9_-]+/i;
    const ignorePattern = /\/(?:login|signup|signin|terms|privacy|contact|about|faq|help|search|categories)\b/i;

    let index = 0;
    for (const a of anchors) {
      if (items.length >= maxCount) break;
      const href = a.href;
      if (!href || href.startsWith('javascript:') || href.includes('#')) continue;
      if (ignorePattern.test(href)) continue;

      if (jobUrlPattern.test(href)) {
        const text = (a.textContent || '').trim();
        if (!text || text.length < 3 || text.length > 120) continue;
        if (/^(apply|view|view job|click here|read more|learn more|details)$/i.test(text)) continue;

        const parent = a.closest('[class*="job" i], [class*="card" i], li, tr, article') || a.parentElement;
        const compEl = parent?.querySelector('[class*="company" i], [class*="employer" i], [class*="org" i]');
        const company = compEl ? (compEl.textContent || '').trim() : window.location.hostname.replace(/^www\./, '');

        items.push({
          id: `gen_${index++}_${Date.now()}`,
          title: text,
          company,
          url: this.normalizeUrl(href),
          platform: 'generic',
          status: 'pending'
        });
      }
    }

    return items;
  }

  private static normalizeUrl(rawUrl: string): string {
    try {
      const u = new URL(rawUrl, window.location.origin);
      // Strip tracking params
      ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'trackingId', 'trk', 'from'].forEach((p) => {
        u.searchParams.delete(p);
      });
      return u.href;
    } catch {
      return rawUrl;
    }
  }
}
