import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JDExtractor } from '../src/content/jd/jd-extractor';

describe('JDExtractor', () => {
  let extractor: JDExtractor;
  const originalLocation = window.location;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.title = '';
    extractor = new JDExtractor();
  });

  afterEach(() => {
    // restore location
    delete (window as any).location;
    (window as any).location = originalLocation;
  });

  it('extracts job details accurately from Breezy HR apply page (DOM + logo + meta)', () => {
    delete (window as any).location;
    window.location = new URL('https://unio-digital.breezy.hr/p/e03e9b1c94de-tier-iii-service-desk-engineer/apply?token=fb34a3772ef4') as any;

    document.head.innerHTML = `
      <title>Tier III Service Desk Engineer - Unio Digital</title>
    `;
    document.body.innerHTML = `
      <header>
        <div class="logo">
          <img alt="unio DIGITAL" src="/logo.png" />
        </div>
      </header>
      <div class="header-hero">
        <h1>Tier III Service Desk Engineer</h1>
        <div class="meta">Tucson, AZ - Remote</div>
      </div>
      <form id="application_form">
        <input type="text" name="name" />
      </form>
    `;

    const job = extractor.extract(document);
    expect(job).not.toBeNull();
    expect(job?.title).toBe('Tier III Service Desk Engineer');
    expect(job?.company).toBe('Unio Digital');
    expect(job?.location).toBe('Tucson, AZ - Remote');
  });

  it('extracts job title and company from URL slug and subdomain on bare apply forms', () => {
    delete (window as any).location;
    window.location = new URL('https://unio-digital.breezy.hr/p/e03e9b1c94de-tier-iii-service-desk-engineer/apply') as any;

    document.head.innerHTML = `<title>Apply for this job</title>`;
    document.body.innerHTML = `<form><input name="email" /></form>`;

    const job = extractor.extract(document);
    expect(job).not.toBeNull();
    expect(job?.title).toBe('Tier III Service Desk Engineer');
    expect(job?.company).toBe('Unio Digital');
  });

  it('extracts job details from JSON-LD schema with highest fidelity', () => {
    delete (window as any).location;
    window.location = new URL('https://jobs.example.com/posting/12345') as any;

    document.head.innerHTML = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Staff AI Engineer",
        "hiringOrganization": {
          "@type": "Organization",
          "name": "Google DeepMind"
        },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "addressLocality": "London, UK"
          }
        },
        "description": "<p>We are seeking a Staff AI Engineer to build LLM systems.</p>"
      }
      </script>
    `;

    const job = extractor.extract(document);
    expect(job).not.toBeNull();
    expect(job?.title).toBe('Staff AI Engineer');
    expect(job?.company).toBe('Google DeepMind');
    expect(job?.location).toBe('London, UK');
  });

  it('extracts job details from OpenGraph meta tags', () => {
    delete (window as any).location;
    window.location = new URL('https://careers.acme.corp/view') as any;

    document.head.innerHTML = `
      <meta property="og:title" content="Senior Cloud Architect at Acme Corp" />
      <meta property="og:site_name" content="Acme Corp" />
    `;

    const job = extractor.extract(document);
    expect(job).not.toBeNull();
    expect(job?.title).toBe('Senior Cloud Architect');
    expect(job?.company).toBe('Acme Corp');
  });
});
