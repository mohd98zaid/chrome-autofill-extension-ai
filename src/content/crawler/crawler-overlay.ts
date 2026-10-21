import { CrawlerSession } from '../../types/crawler';

export class CrawlerOverlay {
  private static containerId = '__autofill_crawler_overlay_root';
  private static pillId = '__autofill_crawler_launcher_pill';

  public static render(
    session: CrawlerSession,
    onNext: () => void,
    onSkip: () => void,
    onStop: () => void
  ): void {
    this.removeLauncherPill();

    let container = document.getElementById(this.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this.containerId;
      container.style.position = 'fixed';
      container.style.top = '12px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.zIndex = '2147483647';
      container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      container.style.maxWidth = '92vw';
      container.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)';
      container.style.borderRadius = '12px';
      container.style.overflow = 'hidden';
      document.body.appendChild(container);
    }

    const currentJob = session.jobs[session.currentJobIndex];
    const total = session.totalJobs || session.jobs.length;
    const currentNum = session.currentJobIndex + 1;

    let statusText = 'Auto-filling application fields...';
    let statusBg = '#2563eb'; // blue

    if (session.status === 'awaiting_user_submit') {
      statusText = 'Fields filled! Please review and click Submit on page.';
      statusBg = '#16a34a'; // green
    } else if (session.status === 'paused_security') {
      statusText = 'Security Challenge Detected: Solve CAPTCHA or click Stop.';
      statusBg = '#dc2626'; // red
    } else if (session.status === 'navigating') {
      statusText = 'Navigating to next job listing...';
      statusBg = '#4f46e5';
    }

    container.innerHTML = `
      <div style="background: #111827; color: #f9fafb; padding: 12px 18px; border-radius: 12px; border: 1px solid #374151; display: flex; align-items: center; gap: 16px; font-size: 13px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${statusBg}; box-shadow: 0 0 8px ${statusBg};"></span>
          <span style="font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px;">Batch Apply</span>
          <span style="background: #374151; padding: 2px 8px; border-radius: 9999px; font-weight: 600; font-size: 11px;">Job ${currentNum}/${total}</span>
        </div>

        <div style="border-left: 1px solid #4b5563; padding-left: 12px; display: flex; flex-direction: column;">
          <span style="font-weight: 600; color: #ffffff; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${currentJob ? currentJob.title : 'Job Application'}
          </span>
          <span style="color: #9ca3af; font-size: 11px;">
            ${currentJob ? currentJob.company : ''} &bull; ${statusText}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; margin-left: 8px;">
          <button id="__btn_crawler_next" style="background: #16a34a; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; transition: background 0.15s;">
            Next Job &rarr;
          </button>

          <button id="__btn_crawler_skip" style="background: #374151; color: #e5e7eb; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 12px; transition: background 0.15s;">
            Skip
          </button>

          <button id="__btn_crawler_stop" style="background: #b91c1c; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; transition: background 0.15s;" title="Instant Kill Switch">
            &#9632; KILL SWITCH
          </button>
        </div>
      </div>
    `;

    const btnNext = container.querySelector('#__btn_crawler_next') as HTMLButtonElement;
    const btnSkip = container.querySelector('#__btn_crawler_skip') as HTMLButtonElement;
    const btnStop = container.querySelector('#__btn_crawler_stop') as HTMLButtonElement;

    if (btnNext) btnNext.onclick = onNext;
    if (btnSkip) btnSkip.onclick = onSkip;
    if (btnStop) btnStop.onclick = onStop;
  }

  public static remove(): void {
    const el = document.getElementById(this.containerId);
    if (el) {
      el.remove();
    }
  }

  public static renderLauncherPill(detectedCount: number, onStart: () => void): void {
    if (document.getElementById(this.pillId) || document.getElementById(this.containerId)) return;

    const pill = document.createElement('div');
    pill.id = this.pillId;
    pill.style.position = 'fixed';
    pill.style.bottom = '24px';
    pill.style.right = '24px';
    pill.style.zIndex = '2147483646';
    pill.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    pill.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)';
    pill.style.borderRadius = '9999px';
    pill.style.overflow = 'hidden';

    pill.innerHTML = `
      <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 10px 18px; display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.2);">
        <span style="font-size: 16px;">&#128640;</span>
        <span>Auto-Apply Search (${detectedCount} Jobs)</span>
        <button id="__btn_dismiss_crawler_pill" style="background: transparent; border: none; color: #93c5fd; cursor: pointer; font-size: 16px; margin-left: 6px; padding: 0 4px;" title="Dismiss">&times;</button>
      </div>
    `;

    document.body.appendChild(pill);

    pill.onclick = (e) => {
      const target = e.target as HTMLElement;
      if (target.id === '__btn_dismiss_crawler_pill') {
        e.stopPropagation();
        pill.remove();
        return;
      }
      pill.remove();
      onStart();
    };
  }

  public static removeLauncherPill(): void {
    const pill = document.getElementById(this.pillId);
    if (pill) pill.remove();
  }
}
