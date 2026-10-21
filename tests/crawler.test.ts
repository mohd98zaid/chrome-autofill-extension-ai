import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobPortalDetector } from '../src/content/crawler/job-portal-detector';
import { BatchQueueManager } from '../src/background/crawler/batch-queue-manager';
import { JobListingItem } from '../src/types/crawler';

describe('Job Portal Detector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects platform from hostname', () => {
    expect(JobPortalDetector.detectPlatform('www.linkedin.com')).toBe('linkedin');
    expect(JobPortalDetector.detectPlatform('indeed.com')).toBe('indeed');
    expect(JobPortalDetector.detectPlatform('naukri.com')).toBe('naukri');
    expect(JobPortalDetector.detectPlatform('boards.greenhouse.io')).toBe('greenhouse');
    expect(JobPortalDetector.detectPlatform('jobs.lever.co')).toBe('lever');
    expect(JobPortalDetector.detectPlatform('company.myworkdayjobs.com')).toBe('workday');
    expect(JobPortalDetector.detectPlatform('example.com')).toBe('generic');
  });

  it('extracts job cards from LinkedIn markup', () => {
    document.body.innerHTML = `
      <div class="job-card-container">
        <a class="job-card-list__title" href="https://www.linkedin.com/jobs/view/123456?trackingId=xyz&ref=search">
          Senior Full Stack Engineer
        </a>
        <div class="job-card-container__primary-description">Acme Technologies</div>
        <div class="job-card-container__metadata-item">Remote, US</div>
      </div>
      <div class="job-card-container">
        <a class="job-card-list__title" href="https://www.linkedin.com/jobs/view/789012">
          AI Solutions Architect
        </a>
        <div class="job-card-container__primary-description">Globex Corp</div>
      </div>
    `;

    // Mock platform detection
    vi.spyOn(JobPortalDetector, 'detectPlatform').mockReturnValue('linkedin');

    const jobs = JobPortalDetector.extractJobListings(5);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBe('Senior Full Stack Engineer');
    expect(jobs[0].company).toBe('Acme Technologies');
    expect(jobs[0].location).toBe('Remote, US');
    // Ensure tracking params stripped
    expect(jobs[0].url).toBe('https://www.linkedin.com/jobs/view/123456');
    expect(jobs[1].title).toBe('AI Solutions Architect');
    expect(jobs[1].company).toBe('Globex Corp');
  });

  it('extracts job cards from Indeed markup and strips query garbage', () => {
    document.body.innerHTML = `
      <div class="job_seen_beacon">
        <a class="jcs-JobTitle" href="https://www.indeed.com/viewjob?jk=abcdef123&from=serp">
          <span>Python Backend Developer</span>
        </a>
        <span data-testid="company-name">Initech</span>
        <div data-testid="text-location">Austin, TX</div>
      </div>
    `;

    vi.spyOn(JobPortalDetector, 'detectPlatform').mockReturnValue('indeed');

    const jobs = JobPortalDetector.extractJobListings(5);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Python Backend Developer');
    expect(jobs[0].company).toBe('Initech');
    expect(jobs[0].location).toBe('Austin, TX');
    expect(jobs[0].url).toBe('https://www.indeed.com/viewjob?jk=abcdef123');
  });

  it('extracts generic career page job links and removes duplicates', () => {
    document.body.innerHTML = `
      <div class="careers-list">
        <div class="job-item">
          <a href="/careers/frontend-engineer-101">Frontend Engineer</a>
          <span class="employer">Startup Co</span>
        </div>
        <div class="job-item">
          <a href="/careers/frontend-engineer-101">Frontend Engineer (Duplicate)</a>
        </div>
        <div class="job-item">
          <a href="/careers/devops-specialist-102">DevOps Specialist</a>
          <span class="employer">Startup Co</span>
        </div>
        <a href="/privacy-policy">Privacy Policy</a>
      </div>
    `;

    vi.spyOn(JobPortalDetector, 'detectPlatform').mockReturnValue('generic');

    const jobs = JobPortalDetector.extractJobListings(10);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBe('Frontend Engineer');
    expect(jobs[1].title).toBe('DevOps Specialist');
  });

  it('respects maxCount limit', () => {
    document.body.innerHTML = `
      <div>
        <a href="/jobs/1">Job 1</a>
        <a href="/jobs/2">Job 2</a>
        <a href="/jobs/3">Job 3</a>
        <a href="/jobs/4">Job 4</a>
      </div>
    `;

    vi.spyOn(JobPortalDetector, 'detectPlatform').mockReturnValue('generic');
    const jobs = JobPortalDetector.extractJobListings(2);
    expect(jobs).toHaveLength(2);
  });
});

describe('Batch Queue Manager & Kill Switch', () => {
  let queueManager: BatchQueueManager;

  beforeEach(() => {
    (global as any).chrome = {
      storage: {
        local: {
          get: vi.fn((_keys: any, cb: any) => cb({})),
          set: vi.fn((_data: any, cb?: any) => cb && cb())
        }
      },
      tabs: {
        sendMessage: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      },
      runtime: {
        lastError: null
      }
    };

    queueManager = new BatchQueueManager();
  });

  it('manages queue state, progression, and emergency kill switch', async () => {
    // 1. Initial idle state
    const initial = queueManager.getState();
    expect(initial.active).toBe(false);
    expect(initial.status).toBe('idle');

    // 2. Mock start crawl response from content script
    const mockJobs: JobListingItem[] = [
      { id: '1', title: 'Job 1', company: 'Acme', url: 'https://example.com/job/1', platform: 'generic', status: 'pending' },
      { id: '2', title: 'Job 2', company: 'Globex', url: 'https://example.com/job/2', platform: 'generic', status: 'pending' }
    ];

    (chrome.tabs.sendMessage as any).mockImplementation((_tabId: number, msg: any, cb: any) => {
      if (msg.type === 'CONTENT_EXTRACT_JOBS') {
        cb({ success: true, data: { jobs: mockJobs } });
      } else {
        cb({ success: true });
      }
    });

    const startRes = await queueManager.startCrawl(100, { maxJobs: 2, mode: 'new_tab' });
    expect(startRes.success).toBe(true);
    expect(startRes.jobCount).toBe(2);

    const activeState = queueManager.getState();
    expect(activeState.active).toBe(true);
    expect(activeState.totalJobs).toBe(2);
    expect(activeState.currentJobIndex).toBe(0);

    // 3. Emergency Kill Switch engaged
    await queueManager.stopCrawl();
    const stoppedState = queueManager.getState();
    expect(stoppedState.active).toBe(false);
    expect(stoppedState.status).toBe('idle');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ type: 'BG_ABORT_FILL' }),
      expect.any(Function)
    );
  });

  it('handles security challenge pause', () => {
    queueManager.handleSecurityPaused('turnstile');
    const state = queueManager.getState();
    expect(state.status).toBe('paused_security');
    expect(state.securityTrigger).toBe('turnstile');
  });
});
