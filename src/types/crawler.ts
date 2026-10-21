/**
 * Crawler & Batch Application Types
 */

export interface JobListingItem {
  id: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  platform: string;
  status: 'pending' | 'active' | 'awaiting_review' | 'completed' | 'skipped' | 'failed';
  errorMessage?: string;
}

export type CrawlerStatus =
  | 'idle'
  | 'scanning_jobs'
  | 'navigating'
  | 'filling'
  | 'awaiting_user_submit'
  | 'completed'
  | 'paused_security';

export interface CrawlerSession {
  active: boolean;
  status: CrawlerStatus;
  searchTabId?: number;
  workerTabId?: number;
  currentJobIndex: number;
  totalJobs: number;
  jobs: JobListingItem[];
  mode: 'new_tab' | 'same_tab';
  maxBatchSize: number;
  autoFillDelayMs: number;
  error?: string;
  securityTrigger?: string;
}

export interface StartCrawlPayload {
  maxJobs?: number;
  mode?: 'new_tab' | 'same_tab';
}
