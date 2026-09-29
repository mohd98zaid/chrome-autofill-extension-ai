import { JobRecord } from '../../types/session';

export class JDExtractor {
  public extract(root: Document = document): Partial<JobRecord> | null {
    // 1. Try structured JSON-LD first (highest precision)
    const jsonLdJob = this.extractFromJSONLD(root);
    if (jsonLdJob && jsonLdJob.title && jsonLdJob.company) return jsonLdJob;

    // 2. Try common Job Board description containers
    const domJob = this.extractFromDOM(root);
    if (domJob && domJob.title) return domJob;

    // 3. Fallback: On dedicated /apply or application forms (like Breezy HR, Workday, Greenhouse, etc.)
    // where full description isn't rendered, still reliably extract Title, Company, and Location!
    const title = this.findJobTitle(root);
    const company = this.findCompany(root);
    const location = this.findLocation(root);

    if (title || company) {
      return {
        id: `job_${Date.now()}`,
        url: window.location.href,
        domain: window.location.hostname,
        company: company || 'Hiring Team',
        title: title || 'Target Role',
        location: location || '',
        description: '',
        requirements: [],
        skills: [],
        source: 'page',
        capturedAt: new Date().toISOString()
      };
    }

    return null;
  }

  private extractFromJSONLD(root: Document): Partial<JobRecord> | null {
    const scripts = root.querySelectorAll('script[type="application/ld+json"]');
    for (const script of Array.from(scripts)) {
      try {
        const data = JSON.parse(script.textContent || '');
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            const company = typeof item.hiringOrganization === 'object' ? item.hiringOrganization?.name || '' : '';
            const title = item.title || '';
            const description = cleanHtmlToText(item.description || '');
            const location = typeof item.jobLocation === 'object' ? item.jobLocation?.address?.addressLocality || '' : '';

            return {
              id: `job_${Date.now()}`,
              url: window.location.href,
              domain: window.location.hostname,
              company: this.cleanCompanyName(company) || this.findCompany(root),
              title: this.cleanJobTitle(title) || this.findJobTitle(root),
              location,
              description,
              requirements: this.extractBulletPoints(description),
              skills: [],
              source: 'page',
              capturedAt: new Date().toISOString()
            };
          }
        }
      } catch {
        // Skip malformed JSON
      }
    }
    return null;
  }

  private extractFromDOM(root: Document): Partial<JobRecord> | null {
    const jdSelectors = [
      '[data-testid="job-description"]',
      '.job-description',
      '#job-description',
      '.description__text',
      '#job-details',
      '.job-details',
      '[class*="jobDescription"]',
      '[class*="job-details"]',
      'main article',
      'article'
    ];

    let jdContainer: HTMLElement | null = null;
    for (const sel of jdSelectors) {
      const el = root.querySelector<HTMLElement>(sel);
      if (el && (el.textContent?.trim().length || 0) > 100) {
        jdContainer = el;
        break;
      }
    }

    if (!jdContainer) {
      const main = root.querySelector('main');
      if (main && (main.textContent?.trim().length || 0) > 200) {
        jdContainer = main;
      }
    }

    const title = this.findJobTitle(root);
    const company = this.findCompany(root);
    const location = this.findLocation(root);

    if (!jdContainer && !title && !company) return null;

    const description = jdContainer ? cleanHtmlToText(jdContainer.innerText || jdContainer.textContent || '') : '';

    return {
      id: `job_${Date.now()}`,
      url: window.location.href,
      domain: window.location.hostname,
      company: company || 'Hiring Team',
      title: title || 'Target Role',
      location: location || '',
      description,
      requirements: this.extractBulletPoints(description),
      skills: [],
      source: 'page',
      capturedAt: new Date().toISOString()
    };
  }

  public findJobTitle(root: Document = document): string {
    // 1. Check meta tags (og:title, twitter:title)
    const metaTitle =
      root.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      root.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    if (metaTitle && this.isValidJobTitle(metaTitle)) {
      const cleaned = this.cleanJobTitle(metaTitle);
      if (this.isValidJobTitle(cleaned)) return cleaned;
    }

    // 2. Check prominent job title headings and classes
    const titleSelectors = [
      'h1',
      '[data-testid*="job-title" i]',
      '[data-automation-id*="jobTitle" i]',
      '[data-automation-id*="jobPostingHeader" i]',
      '.job-title',
      '.jobTitle',
      '.posting-headline h2',
      '.job-header h1',
      '.app-title',
      '.header-hero h1',
      '.header-hero h2',
      '[class*="job-title" i]',
      '[class*="jobTitle" i]',
      '[class*="position-title" i]',
      '[class*="posting-title" i]',
      'h2'
    ];

    for (const sel of titleSelectors) {
      const els = Array.from(root.querySelectorAll<HTMLElement>(sel));
      for (const el of els) {
        const text = (el.textContent || '').trim();
        if (text && this.isValidJobTitle(text)) {
          const cleaned = this.cleanJobTitle(text);
          if (this.isValidJobTitle(cleaned)) return cleaned;
        }
      }
    }

    // 3. Document title parsing (e.g. "Tier III Service Desk Engineer - Unio Digital")
    if (root.title) {
      const cleanedDocTitle = this.cleanJobTitle(root.title);
      if (this.isValidJobTitle(cleanedDocTitle)) {
        return cleanedDocTitle;
      }
    }

    // 4. URL path slug parsing (e.g. /p/e03e9b1c94de-tier-iii-service-desk-engineer/apply)
    try {
      const pathname = window.location.pathname;
      const slugMatch = pathname.match(/(?:p\/[a-f0-9]+-|\/jobs\/|\/careers\/|\/positions\/|\/job\/)([a-z0-9\-]+)/i);
      if (slugMatch && slugMatch[1]) {
        const slugTitle = slugMatch[1]
          .replace(/[-_]+/g, ' ')
          .replace(/\b(?:apply|job|details)\b/gi, '')
          .trim();
        if (slugTitle.length > 3) {
          return formatTitleCase(slugTitle);
        }
      }
    } catch {
      // ignore
    }

    return '';
  }

  public findCompany(root: Document = document): string {
    // 1. Check meta tags (og:site_name, author)
    const metaCompany =
      root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      root.querySelector('meta[name="author"]')?.getAttribute('content');
    if (metaCompany && this.isValidCompany(metaCompany)) return this.cleanCompanyName(metaCompany);

    // 2. Logo / Header image alt text (e.g. alt="unio DIGITAL" in Breezy HR header)
    const logoSelectors = [
      'header img[alt]',
      'nav img[alt]',
      '.logo img[alt]',
      '.company-logo img[alt]',
      '.navbar-brand img[alt]',
      '[class*="logo" i] img[alt]',
      'img[alt*="logo" i]'
    ];
    for (const sel of logoSelectors) {
      const img = root.querySelector<HTMLImageElement>(sel);
      const alt = img?.getAttribute('alt')?.trim();
      if (alt && this.isValidCompany(alt)) {
        return this.cleanCompanyName(alt);
      }
    }

    // 3. Check company-name DOM elements
    const companySelectors = [
      '.company-name',
      '[data-company-name]',
      '[class*="company-name" i]',
      '[class*="org-name" i]',
      '[data-automation-id*="company" i]',
      '.topcard__flavor--black-link'
    ];
    for (const sel of companySelectors) {
      const el = root.querySelector<HTMLElement>(sel);
      const text = el?.textContent?.trim();
      if (text && this.isValidCompany(text)) {
        return this.cleanCompanyName(text);
      }
    }

    // 4. Document title parsing (e.g. "Tier III Service Desk Engineer - Unio Digital" or "Tier III Service Desk Engineer at Unio Digital")
    if (root.title) {
      const atMatch = root.title.match(/(?:at|@)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s*[-|–•]|\s*$)/i);
      if (atMatch && atMatch[1] && this.isValidCompany(atMatch[1])) {
        return this.cleanCompanyName(atMatch[1]);
      }
      const dashParts = root.title.split(/[-|–•]/);
      if (dashParts.length >= 2) {
        const candidate = dashParts[dashParts.length - 1].trim();
        if (this.isValidCompany(candidate)) {
          return this.cleanCompanyName(candidate);
        }
      }
    }

    // 5. Hostname Subdomain Parsing on Hosted ATS Platforms (e.g. unio-digital.breezy.hr -> Unio Digital)
    try {
      const hostname = window.location.hostname.toLowerCase();
      const atsDomains = [
        'breezy.hr',
        'greenhouse.io',
        'lever.co',
        'myworkdayjobs.com',
        'talentrecruit.com',
        'smartrecruiters.com',
        'workable.com',
        'ashbyhq.com',
        'recruitee.com',
        'bamboohr.com',
        'jobvite.com',
        'icims.com'
      ];

      for (const ats of atsDomains) {
        if (hostname.includes(ats)) {
          const prefix = hostname.replace(`.${ats}`, '').replace(/^www\./, '');
          const sub = prefix.split('.')[0];
          if (sub && sub !== 'boards' && sub !== 'jobs' && sub !== 'careers' && sub !== 'apply' && sub !== 'app') {
            return this.cleanCompanyName(sub.replace(/[-_]+/g, ' '));
          }
        }
      }

      // 6. Generic domain fallback
      const domainClean = hostname.replace(/^www\./, '').replace(/^careers?\./, '').split('.')[0];
      if (this.isValidCompany(domainClean)) {
        return this.cleanCompanyName(domainClean);
      }
    } catch {
      // ignore
    }

    return '';
  }

  public findLocation(root: Document = document): string {
    const locSelectors = [
      '[class*="location" i]',
      '[class*="workplace" i]',
      '[data-automation-id*="location" i]',
      '.header-hero .meta',
      '[class*="meta" i]'
    ];
    for (const sel of locSelectors) {
      const el = root.querySelector<HTMLElement>(sel);
      const text = el?.textContent?.trim();
      if (text && text.length > 2 && text.length < 100 && !/apply/i.test(text)) {
        return text;
      }
    }
    return '';
  }

  private isValidJobTitle(raw: string): boolean {
    const s = raw.toLowerCase().trim();
    if (s.length < 3 || s.length > 100) return false;
    if (
      /^(?:apply\s*now|job\s*application|application\s*form|careers|home|login|sign\s*in|submit\b|this\s*job|the\s*job|job\s*posting|job\s*details|job\s*description|open\s*positions?|join\s*us|work\s*with\s*us)/i.test(
        s
      )
    ) {
      return false;
    }
    return true;
  }

  private cleanJobTitle(raw: string): string {
    let t = raw.trim();
    // Remove ATS branding and suffixes
    t = t.replace(/\s*[-|–•]\s*(?:Breezy\s*HR|Workday|Greenhouse|Lever|SmartRecruiters|Taleo|TalentRecruit|Jobvite|Careers).*$/i, '');
    // Remove "at Company" suffix e.g. "Engineer at Acme" -> "Engineer"
    t = t.replace(/\s+at\s+[\w\s&.,-]+$/i, '');
    // Remove " - Company" suffix
    if (t.includes(' - ')) {
      t = t.split(' - ')[0].trim();
    } else if (t.includes(' | ')) {
      t = t.split(' | ')[0].trim();
    }
    // Remove "Apply for" prefix
    t = t.replace(/^(?:Apply\s+for|Application\s+for|Job\s+Application\s*:?)\s*/i, '').trim();
    return t;
  }

  private isValidCompany(raw: string): boolean {
    const s = raw.toLowerCase().trim();
    if (s.length < 2 || s.length > 60) return false;
    if (/^breezy\s*hr$|^workday$|^greenhouse$|^lever$|^login$|^careers?$|^apply$|^home$/i.test(s)) return false;
    return true;
  }

  private cleanCompanyName(raw: string): string {
    let c = raw.trim();
    // Remove " Logo" or " logo" suffix
    c = c.replace(/\s+logo$/i, '');
    c = c.replace(/[-_]+/g, ' ');
    // If all lowercase, uppercase, or mixed unusual casing (e.g. unio DIGITAL), normalize cleanly
    const words = c.split(/\s+/).map((w) => {
      if (w === w.toUpperCase() || w === w.toLowerCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      return w;
    });
    return words.join(' ').trim();
  }

  private extractBulletPoints(text: string): string[] {
    const lines = text.split('\n');
    const bullets: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[•\-*▪]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        const clean = trimmed.replace(/^[•\-*▪\d.]+\s*/, '').trim();
        if (clean.length > 10 && clean.length < 300) {
          bullets.push(clean);
        }
      }
    }

    return bullets;
  }
}

function formatTitleCase(str: string): string {
  const acronyms = new Set(['ai', 'ml', 'qa', 'it', 'hr', 'ui', 'ux', 'aws', 'gcp', 'sql', 'bi', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'x']);
  return str
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (acronyms.has(lower)) {
        return lower.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function cleanHtmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
