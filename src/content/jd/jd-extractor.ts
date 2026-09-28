import { JobRecord } from '../../types/session';

export class JDExtractor {
  public extract(root: Document = document): Partial<JobRecord> | null {
    // 1. Try structured JSON-LD first (highest precision)
    const jsonLdJob = this.extractFromJSONLD(root);
    if (jsonLdJob) return jsonLdJob;

    // 2. Try common Job Board containers (LinkedIn, Indeed, Greenhouse, Lever, Workday)
    const domJob = this.extractFromDOM(root);
    if (domJob) return domJob;

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
              company,
              title,
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
      // Fallback: check main or body if it looks like a job page
      const main = root.querySelector('main');
      if (main && (main.textContent?.trim().length || 0) > 200) {
        jdContainer = main;
      }
    }

    if (!jdContainer) return null;

    const description = cleanHtmlToText(jdContainer.innerText || jdContainer.textContent || '');
    const title = this.findJobTitle(root);
    const company = this.findCompany(root);

    return {
      id: `job_${Date.now()}`,
      url: window.location.href,
      domain: window.location.hostname,
      company,
      title,
      location: '',
      description,
      requirements: this.extractBulletPoints(description),
      skills: [],
      source: 'page',
      capturedAt: new Date().toISOString()
    };
  }

  private findJobTitle(root: Document): string {
    const h1 = root.querySelector('h1');
    if (h1 && h1.textContent) {
      return h1.textContent.trim();
    }
    return root.title.split(/[-|–]/)[0].trim();
  }

  private findCompany(root: Document): string {
    const metaCompany = root.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    if (metaCompany) return metaCompany.trim();

    const companyEl = root.querySelector('.company-name, [data-company-name], .topcard__flavor--black-link');
    if (companyEl && companyEl.textContent) {
      return companyEl.textContent.trim();
    }

    return window.location.hostname.replace(/^www\./, '').split('.')[0];
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

function cleanHtmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
