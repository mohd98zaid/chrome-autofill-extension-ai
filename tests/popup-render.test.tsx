import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import ReactDOMClient from 'react-dom/client';
import { Popup } from '../src/popup/Popup';
import { ErrorBoundary } from '../src/popup/ErrorBoundary';

describe('Popup Component Rendering & Resilience', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock Chrome Extension API
    const chromeMock: any = {
      storage: {
        local: {
          get: vi.fn((_keys, cb) => cb({ user_profile: null, cv_profiles: [], active_profile_id: null })),
          set: vi.fn((_data, cb) => cb && cb())
        }
      },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 1, title: 'AI Engineer - OpenAI' }]),
        sendMessage: vi.fn((_tabId, _msg, cb) => cb && cb({ success: true, data: {} })),
        create: vi.fn()
      },
      runtime: {
        lastError: null,
        sendMessage: vi.fn((_msg, cb) => cb && cb({ success: true, data: null })),
        openOptionsPage: vi.fn(),
        getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`)
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([])
      }
    };

    (global as any).chrome = chromeMock;
  });

  it('renders initial empty state gracefully inside ErrorBoundary', async () => {
    const root = ReactDOMClient.createRoot(container);
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Popup />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('AI Job Assistant');
    expect(container.innerHTML).toContain('Active CV / Profile');
    expect(container.innerHTML).toContain('No profile data saved yet');
    root.unmount();
  });

  it('renders correctly with partial profile and missing optional arrays', async () => {
    const partialProfile: any = {
      id: 'profile_partial',
      identity: {
        fullName: 'Jane Doe',
        email: 'jane@example.com'
      }
      // skills, experiences, location intentionally undefined
    };

    (global as any).chrome.storage.local.get = vi.fn((_keys, cb) =>
      cb({
        user_profile: partialProfile,
        cv_profiles: [partialProfile],
        active_profile_id: 'profile_partial'
      })
    );

    const root = ReactDOMClient.createRoot(container);
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Popup />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('Jane Doe');
    expect(container.innerHTML).toContain('0 verified skills');
    root.unmount();
  });

  it('renders correctly when multiple CV profiles exist in storage', async () => {
    const p1: any = {
      id: 'cv_1',
      identity: { fullName: 'Alex Rivera' },
      skills: [{ canonicalName: 'TypeScript' }],
      experiences: [{ title: 'Fullstack Dev', company: 'Tech Inc' }]
    };
    const p2: any = {
      id: 'cv_2',
      identity: { fullName: 'Alex R. - ML Spec' },
      skills: [{ canonicalName: 'Python' }],
      experiences: [{ title: 'ML Engineer', company: 'AI Labs' }]
    };

    (global as any).chrome.storage.local.get = vi.fn((_keys, cb) =>
      cb({
        user_profile: p1,
        cv_profiles: [p1, p2],
        active_profile_id: 'cv_1'
      })
    );

    const root = ReactDOMClient.createRoot(container);
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Popup />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('Alex Rivera');
    expect(container.innerHTML).toContain('Fullstack Dev');
    root.unmount();
  });
});
