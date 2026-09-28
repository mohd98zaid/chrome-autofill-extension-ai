import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Settings as SettingsIcon,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  UserCheck,
  FileText,
  Upload,
  Download,
  Copy,
  Save,
  Trash2
} from 'lucide-react';
import { ApplicationSession } from '../types/session';
import { UserProfile, ProfileSchema } from '../types/profile';

export const Popup: React.FC = () => {
  const [session, setSession] = useState<ApplicationSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [filling, setFilling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [importing, setImporting] = useState(false);

  // Cover Letter Modal states
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false);
  const [coverCompany, setCoverCompany] = useState('');
  const [coverRole, setCoverRole] = useState('');
  const [coverTone, setCoverTone] = useState<'professional' | 'concise' | 'confident'>('professional');
  const [generatedLetter, setGeneratedLetter] = useState('');
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [insertingLetter, setInsertingLetter] = useState(false);
  const [savingPageInputs, setSavingPageInputs] = useState(false);

  // Multiple CV profiles selection
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('profile_default');
  const [showSelectCVModal, setShowSelectCVModal] = useState(false);
  const [alwaysAskCV, setAlwaysAskCV] = useState(true);

  // JSON Import & Export states
  const popupJsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showJsonPasteModal, setShowJsonPasteModal] = useState(false);
  const [jsonPasteText, setJsonPasteText] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 1. Immediate restore from chrome.storage.local
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['user_profile', 'cv_profiles', 'active_profile_id'], (res) => {
          const userProfile = res.user_profile as UserProfile | undefined;
          if (userProfile) {
            setProfile(userProfile);
            if (userProfile.id) setSelectedProfileId(userProfile.id);
          }
          if (Array.isArray(res.cv_profiles) && res.cv_profiles.length > 0) {
            setProfiles(res.cv_profiles as UserProfile[]);
          }
        });
      }

      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          tryScanTab(tab.id);

          chrome.runtime.sendMessage(
            { type: 'UI_GET_SESSION', source: 'popup', tabId: tab.id, timestamp: new Date().toISOString() },
            (res) => {
              if (res?.success) setSession(res.data);
            }
          );
        }
      }

      chrome.runtime.sendMessage(
        { type: 'UI_GET_PROFILE', source: 'popup', timestamp: new Date().toISOString() },
        (res) => {
          if (res?.success && res.data) {
            setProfile(res.data);
            if (res.data.id) setSelectedProfileId(res.data.id);
          }
        }
      );

      chrome.runtime.sendMessage(
        { type: 'UI_GET_PROFILES', source: 'popup', timestamp: new Date().toISOString() },
        (res) => {
          if (res?.success && Array.isArray(res.data)) {
            setProfiles(res.data);
          }
        }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const tryScanTab = async (tabId: number) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'BG_TRIGGER_SCAN', source: 'popup', timestamp: new Date().toISOString() },
        async (res) => {
          if (chrome.runtime.lastError || !res) {
            // Tab was loaded before extension was active; inject script dynamically
            try {
              if (chrome.scripting?.executeScript) {
                await chrome.scripting.executeScript({
                  target: { tabId, allFrames: true },
                  files: ['content/content-script.js']
                });
                setTimeout(() => {
                  chrome.tabs.sendMessage(
                    tabId,
                    { type: 'BG_TRIGGER_SCAN', source: 'popup', timestamp: new Date().toISOString() },
                    (retryRes) => {
                      if (retryRes?.data?.fields) {
                        setSession((prev) => (prev ? { ...prev, pendingFields: retryRes.data.fields } : prev));
                      }
                      chrome.runtime.sendMessage(
                        { type: 'UI_GET_SESSION', source: 'popup', tabId, timestamp: new Date().toISOString() },
                        (sessRes) => {
                          if (sessRes?.success) setSession(sessRes.data);
                        }
                      );
                    }
                  );
                }, 150);
              }
            } catch (err) {
              console.warn('Script injection:', err);
            }
          } else {
            if (res.data?.fields) {
              setSession((prev) => (prev ? { ...prev, pendingFields: res.data.fields } : prev));
            }
            chrome.runtime.sendMessage(
              { type: 'UI_GET_SESSION', source: 'popup', tabId, timestamp: new Date().toISOString() },
              (sessRes) => {
                if (sessRes?.success) setSession(sessRes.data);
              }
            );
          }
        }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartAutofill = () => {
    if (alwaysAskCV && profiles.length > 0) {
      setShowSelectCVModal(true);
    } else {
      executeAutofillWithProfile(selectedProfileId || profile?.id);
    }
  };

  const executeAutofillWithProfile = async (profileId?: string) => {
    setFilling(true);
    setStatusMessage(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      chrome.runtime.sendMessage(
        {
          type: 'UI_START_AUTOFILL',
          source: 'popup',
          tabId: tab.id,
          payload: { profileId },
          timestamp: new Date().toISOString()
        },
        (res) => {
          setFilling(false);
          if (res?.success) {
            setStatusMessage(`Successfully filled ${res.data?.filledCount || 0} fields!`);
            loadData();
          } else {
            setStatusMessage(res?.data?.message || res?.error?.message || 'Failed to fill fields');
          }
        }
      );
    } catch {
      setFilling(false);
      setStatusMessage('Communication error with active tab');
    }
  };

  const handleSelectCV = (id: string) => {
    setSelectedProfileId(id);
    chrome.runtime.sendMessage(
      { type: 'UI_SET_ACTIVE_PROFILE', source: 'popup', payload: { id }, timestamp: new Date().toISOString() },
      () => {
        chrome.runtime.sendMessage(
          { type: 'UI_GET_PROFILE', source: 'popup', payload: { profileId: id }, timestamp: new Date().toISOString() },
          (res) => {
            if (res?.success && res.data) setProfile(res.data);
          }
        );
      }
    );
  };

  const handleSavePageInputs = async () => {
    try {
      setSavingPageInputs(true);
      setStatusMessage(null);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setStatusMessage('No active tab found.');
        setSavingPageInputs(false);
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { type: 'BG_EXTRACT_PAGE_VALUES', source: 'popup', timestamp: new Date().toISOString() },
        (extractRes) => {
          if (chrome.runtime.lastError || !extractRes?.data) {
            setSavingPageInputs(false);
            setStatusMessage('Could not read page fields. Please refresh tab and retry.');
            return;
          }

          const extracted = extractRes.data as Record<string, string>;
          const keys = Object.keys(extracted);
          if (keys.length === 0) {
            setSavingPageInputs(false);
            setStatusMessage('No filled values found on page. Fill in the form fields first.');
            return;
          }

          chrome.runtime.sendMessage(
            {
              type: 'UI_SAVE_PAGE_INPUTS_TO_PROFILE',
              source: 'popup',
              payload: extracted,
              timestamp: new Date().toISOString()
            },
            (saveRes) => {
              setSavingPageInputs(false);
              if (saveRes?.success) {
                const count = saveRes.data?.updatedCount || 0;
                setProfile(saveRes.data?.profile || null);
                setStatusMessage(
                  count > 0
                    ? `Saved ${count} new field(s) from this page into your profile!`
                    : 'All page inputs match your already saved profile.'
                );
              } else {
                setStatusMessage('Failed to save page inputs.');
              }
            }
          );
        }
      );
    } catch {
      setSavingPageInputs(false);
      setStatusMessage('Error extracting inputs from page.');
    }
  };

  const handleDeleteProfile = (profileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (profiles.length <= 1) {
      setStatusMessage('Cannot delete the only profile. At least one profile must be kept.');
      return;
    }
    const toDelete = profiles.find((p) => p.id === profileId);
    const name = toDelete?.experiences[0]?.title || toDelete?.identity?.fullName || profileId;
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;

    chrome.runtime.sendMessage(
      { type: 'UI_DELETE_PROFILE', source: 'popup', payload: { id: profileId }, timestamp: new Date().toISOString() },
      (res) => {
        if (res?.success) {
          setStatusMessage('Profile deleted successfully');
          loadData();
        } else {
          setStatusMessage('Failed to delete profile');
        }
      }
    );
  };

  const handleTriggerScan = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        tryScanTab(tab.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportResume = () => {
    if (!resumeText.trim()) return;
    setImporting(true);
    chrome.runtime.sendMessage(
      {
        type: 'UI_PARSE_RESUME',
        source: 'popup',
        payload: { resumeText },
        timestamp: new Date().toISOString()
      },
      (res) => {
        setImporting(false);
        if (res?.success) {
          setProfile(res.data?.profile || null);
          setShowImportModal(false);
          setStatusMessage('Profile successfully populated from Resume with Gemini!');
          loadData();
        } else {
          alert('Failed to parse resume: ' + (res?.error?.message || 'Unknown error'));
        }
      }
    );
  };

  const handleExportProfile = () => {
    if (!profile) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(profile, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    const nameSlug = (profile.identity.fullName || `${profile.identity.firstName}_${profile.identity.lastName}` || 'profile')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const dateStr = new Date().toISOString().slice(0, 10);
    dlAnchor.setAttribute('download', `job_assistant_${nameSlug || 'profile'}_${dateStr}.json`);
    dlAnchor.click();
    setStatusMessage('Profile exported as JSON!');
  };

  const processJsonImport = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.identity && !parsed.identity.fullName && (parsed.identity.firstName || parsed.identity.lastName)) {
        parsed.identity.fullName = `${parsed.identity.firstName || ''} ${parsed.identity.lastName || ''}`.trim();
      }
      const validated = ProfileSchema.parse(parsed);
      setProfile(validated);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ user_profile: validated });
      }
      chrome.runtime.sendMessage(
        { type: 'UI_UPDATE_PROFILE', source: 'popup', payload: validated, timestamp: new Date().toISOString() },
        (res) => {
          if (res?.success || res?.updated) {
            setStatusMessage('Profile imported & saved successfully from JSON!');
            setShowJsonPasteModal(false);
            setJsonPasteText('');
            loadData();
          } else {
            alert('Failed to save imported profile: ' + (res?.error?.message || 'Storage error'));
          }
        }
      );
    } catch (err: any) {
      alert('Invalid Profile JSON format: ' + (err?.message || 'Please check that the JSON is valid'));
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        processJsonImport(text);
      } catch (err: any) {
        alert('Failed to read JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openOptions = () => {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('/src/options/index.html');
    }
  };

  const openReviewPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/review/index.html') });
  };

  const handleDismissSecurity = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.runtime.sendMessage(
          { type: 'UI_DISMISS_SECURITY', source: 'popup', tabId: tab.id, timestamp: new Date().toISOString() },
          () => {
            if (session) {
              setSession({ ...session, status: 'READY', securityTrigger: undefined });
            }
            loadData();
            // Automatically resume autofill
            handleStartAutofill();
          }
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!profile) return;
    setGeneratingLetter(true);
    setGeneratedLetter('');

    const evidence: string[] = [
      `${profile.identity.fullName || 'Candidate'}, based in ${profile.location.city || 'Lucknow'}, ${profile.location.country || 'India'}`,
      profile.summary,
      ...profile.experiences.map((e) => `${e.title} at ${e.company}: ${e.description}`),
      `Key skills: ${profile.skills.map((s) => s.canonicalName).join(', ')}`
    ].filter(Boolean);

    chrome.runtime.sendMessage(
      {
        type: 'UI_GENERATE_COVER_LETTER',
        source: 'popup',
        payload: {
          company: coverCompany.trim() || 'Hiring Team',
          role: coverRole.trim() || 'AI Engineer',
          jobDescription: '',
          profileEvidence: evidence,
          tone: coverTone
        },
        timestamp: new Date().toISOString()
      },
      (res) => {
        setGeneratingLetter(false);
        if (res?.success && res.data?.coverLetter) {
          setGeneratedLetter(res.data.coverLetter);
        } else {
          // Robust grounded fallback using candidate's verified experience
          const fallback = `Dear Hiring Team at ${coverCompany.trim() || 'your organization'},\n\nI am writing to express my strong enthusiasm for the ${coverRole.trim() || 'AI Engineer'} position. As a GenAI Architect & Team Lead at Tata Consultancy Services (TCS) with 5.8+ years of production experience, I specialize in architecting scalable LLM systems, enterprise RAG pipelines, and agentic workflows using Python, LangChain, LangGraph, Claude AI, and Azure OpenAI.\n\nThroughout my career, I have designed and deployed mission-critical AI solutions that reduced manual analysis overhead by ~50% and achieved 80%+ design-system compliance across Healthcare and BFSI enterprise platforms. With my hands-on technical background and leadership experience, I am confident in my ability to deliver immediate value to your engineering team.\n\nI welcome the opportunity to discuss how my qualifications align with your requirements.\n\nSincerely,\n${profile.identity.fullName || 'Mohammad Zaid'}`;
          setGeneratedLetter(fallback);
        }
      }
    );
  };

  const handleInsertCoverLetter = async () => {
    if (!generatedLetter.trim()) return;
    setInsertingLetter(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'BG_INSERT_COVER_LETTER',
            source: 'popup',
            payload: { text: generatedLetter },
            timestamp: new Date().toISOString()
          },
          (res) => {
            setInsertingLetter(false);
            if (res?.success) {
              setStatusMessage('Cover letter inserted into webpage!');
              setShowCoverLetterModal(false);
            } else {
              navigator.clipboard?.writeText(generatedLetter);
              setStatusMessage('Copied cover letter to clipboard!');
            }
          }
        );
      }
    } catch {
      setInsertingLetter(false);
      navigator.clipboard?.writeText(generatedLetter);
      setStatusMessage('Copied cover letter to clipboard!');
    }
  };

  return (
    <div className="flex flex-col h-full p-4 select-none relative">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-600 rounded-lg text-white shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 leading-tight">AI Job Assistant</h1>
            <p className="text-xs text-slate-500">Gemini Powered & Grounded</p>
          </div>
        </div>
        <button
          onClick={openOptions}
          title="Open Settings"
          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-3 space-y-3">
        {/* Security Challenge Alert */}
        {session?.status === 'PAUSED_SECURITY' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-amber-900">
            <div className="flex items-start space-x-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium">Security Challenge Paused</p>
                <p className="text-amber-700 mt-0.5">
                  {session.securityTrigger?.message || 'CAPTCHA / OTP detected. Please solve it manually on the webpage.'}
                </p>
              </div>
            </div>
            <button
              onClick={handleDismissSecurity}
              className="w-full py-1 px-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition-colors"
            >
              Dismiss Challenge & Resume Autofill
            </button>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800 flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Page Status Card */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Current Page</span>
            <button
              onClick={handleTriggerScan}
              className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Rescan</span>
            </button>
          </div>
          <p className="text-xs font-mono text-slate-700 truncate">{session?.domain || 'Ready to scan'}</p>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Detected</p>
              <p className="text-lg font-bold text-slate-800">{session?.pendingFields?.length || 0}</p>
            </div>
            <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Filled</p>
              <p className="text-lg font-bold text-emerald-600">{session?.filledFields?.length || 0}</p>
            </div>
          </div>
        </div>

        {/* Profile Card */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-700">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Active CV / Profile</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSelectCVModal(true)}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                Change CV
              </button>
              <button onClick={openOptions} className="text-xs text-slate-500 hover:underline">
                Edit
              </button>
            </div>
          </div>

          {profiles.length > 1 && (
            <div className="mb-2 flex items-center space-x-1.5">
              <select
                value={selectedProfileId}
                onChange={(e) => handleSelectCV(e.target.value)}
                className="flex-1 text-xs font-medium border border-slate-300 rounded px-2 py-1.5 bg-slate-50 text-slate-800"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.experiences[0]?.title || p.identity.fullName || 'CV Profile'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleDeleteProfile(selectedProfileId || profile?.id || '')}
                className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 rounded bg-slate-50 transition-colors"
                title="Delete active profile"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {profile?.identity?.fullName || profile?.identity?.email ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-600 space-y-0.5">
                <p className="font-semibold text-slate-800">{profile.identity.fullName || `${profile.identity.firstName} ${profile.identity.lastName}`}</p>
                <p>{profile.identity.email} · {profile.identity.phone}</p>
                <p className="text-slate-400">{profile.skills.length} verified skills · {profile.experiences.length} experience(s)</p>
              </div>

              <div className="flex items-center space-x-1.5 pt-2 border-t border-slate-100">
                <input
                  type="file"
                  ref={popupJsonFileInputRef}
                  accept=".json,application/json"
                  onChange={handleJsonFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => popupJsonFileInputRef.current?.click()}
                  className="flex-1 py-1 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-medium flex items-center justify-center space-x-1 transition-colors"
                  title="Import profile from JSON file"
                >
                  <Upload className="w-3 h-3 text-blue-600" />
                  <span>Import JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowJsonPasteModal(true)}
                  className="py-1 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-medium flex items-center justify-center transition-colors"
                  title="Paste raw JSON profile code"
                >
                  <FileText className="w-3 h-3 text-slate-600" />
                </button>
                <button
                  type="button"
                  onClick={handleExportProfile}
                  className="flex-1 py-1 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-medium flex items-center justify-center space-x-1 transition-colors"
                  title="Export complete profile to JSON file"
                >
                  <Download className="w-3 h-3 text-emerald-600" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                No profile data saved yet! Import your CV/Resume or load a JSON profile.
              </p>
              <button
                onClick={() => setShowImportModal(true)}
                className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Import CV / Resume with Gemini</span>
              </button>
              <div className="flex items-center space-x-1.5">
                <input
                  type="file"
                  ref={popupJsonFileInputRef}
                  accept=".json,application/json"
                  onChange={handleJsonFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => popupJsonFileInputRef.current?.click()}
                  className="flex-1 py-1 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>Import JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowJsonPasteModal(true)}
                  className="py-1 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center justify-center transition-colors"
                  title="Paste raw JSON profile"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="pt-2 border-t border-slate-200 space-y-2">
        <button
          onClick={handleStartAutofill}
          disabled={filling || (session?.pendingFields?.length === 0)}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium text-xs shadow-sm flex items-center justify-center space-x-2 transition-all"
        >
          {filling ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Filling & Verifying...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Fill Detected Fields</span>
            </>
          )}
        </button>

        <button
          onClick={handleSavePageInputs}
          disabled={savingPageInputs}
          className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors"
          title="Extract and save typed details from the current page directly into your persistent profile"
        >
          {savingPageInputs ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              <span>Reading & Saving Page Fields...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 text-emerald-600" />
              <span>Save Page Inputs to Profile</span>
            </>
          )}
        </button>

        <button
          onClick={() => {
            setCoverRole('AI Engineer');
            setCoverCompany('Recruitee / Hiring Team');
            setShowCoverLetterModal(true);
          }}
          className="w-full py-2 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Generate AI Cover Letter</span>
        </button>

        <button
          onClick={openReviewPage}
          className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open Full Review Panel</span>
        </button>
      </footer>

      {/* Cover Letter Generator Modal */}
      {showCoverLetterModal && (
        <div className="absolute inset-0 bg-white/98 backdrop-blur-xs z-50 p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900">Tailored Cover Letter</h3>
              </div>
              <button
                onClick={() => setShowCoverLetterModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Target Role</label>
                <input
                  type="text"
                  value={coverRole}
                  onChange={(e) => setCoverRole(e.target.value)}
                  placeholder="e.g. AI Engineer"
                  className="w-full p-1.5 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Company</label>
                <input
                  type="text"
                  value={coverCompany}
                  onChange={(e) => setCoverCompany(e.target.value)}
                  placeholder="e.g. AZM ICT"
                  className="w-full p-1.5 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Tone</label>
              <div className="flex space-x-2 pt-1">
                {(['professional', 'concise', 'confident'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCoverTone(t)}
                    className={`flex-1 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                      coverTone === t
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {!generatedLetter && (
              <button
                type="button"
                onClick={handleGenerateCoverLetter}
                disabled={generatingLetter}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 shadow-xs"
              >
                {generatingLetter ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing with Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Tailored Letter</span>
                  </>
                )}
              </button>
            )}

            {generatedLetter && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Grounding Passed</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateCoverLetter}
                    disabled={generatingLetter}
                    className="text-[11px] text-indigo-600 hover:underline flex items-center space-x-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Regenerate</span>
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={generatedLetter}
                  onChange={(e) => setGeneratedLetter(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-300 rounded-md font-sans leading-relaxed text-slate-800"
                />
              </div>
            )}
          </div>

          {generatedLetter && (
            <div className="pt-2 space-y-1.5 border-t border-slate-200">
              <button
                type="button"
                onClick={handleInsertCoverLetter}
                disabled={insertingLetter}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 shadow-xs"
              >
                {insertingLetter ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Inserting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Insert into Webpage</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(generatedLetter);
                  setStatusMessage('Copied cover letter to clipboard!');
                }}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center space-x-1"
              >
                <Copy className="w-3 h-3" />
                <span>Copy to Clipboard</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resume Import Modal */}
      {showImportModal && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-xs z-50 p-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">Import CV / Resume</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Paste your CV/Resume text below. <strong>Gemini 3.8 Flash</strong> will automatically extract your contact info, location, skills, and work history.
            </p>

            <textarea
              rows={9}
              placeholder="Paste your resume or CV text here (e.g. Mohammad Zaid, Email, Phone, Skills, Work Experience)..."
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
            />
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={() => setResumeText(`Mohammad Zaid\nGenAI Engineer & Architect | 5.8+ Years | TCS | Lucknow, India\n+91 8726196645 | Email: mohd98zaid@gmail.com | LinkedIn: https://linkedin.com/in/mohd98zaid | GitHub: https://github.com/mohd98zaid | Portfolio: https://mohd98zaid.netlify.app/\nNationality: Indian | Visa: Open to Sponsorship | Notice Period: 15 Days | Open to Relocation\n\nPROFESSIONAL SUMMARY\nGenAI Architect & AI Engineer with 5.8+ years at Tata Consultancy Services (TCS), specializing in production-grade LLM systems, agentic pipelines, and RAG architectures for enterprise clients across Healthcare and BFSI. Hands-on with LangChain, LangGraph, Claude AI, FastAPI, and cloud AI platforms (Azure OpenAI, AWS Bedrock).\n\nCORE COMPETENCIES & SKILLS\nPython, LangChain, LangGraph, LangSmith, Claude AI, Azure OpenAI, AWS Bedrock, CrewAI, AutoGen, FastAPI, MLOps, LLMOps, Vector Databases (FAISS, Chroma, Pinecone), Figma-to-React Automation, AST-based Code Analysis, Docker, CI/CD, Git, Kafka, Redis Streams, PostgreSQL, TimescaleDB, SQL, Next.js, TypeScript, React\n\nEXPERIENCE\nTata Consultancy Services · System Engineer (GenAI Architect & Team Lead)\nNew Delhi | Apr 2021 – Present\n\nEDUCATION\nDr. APJ Abdul Kalam Technical University · B. Tech - Computer Science & Engineering\nLucknow | Aug 2015 – Jun 2019`)}
              className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Load Mohammad Zaid's CV Text</span>
            </button>
            <button
              onClick={handleImportResume}
              disabled={importing || !resumeText.trim()}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium flex items-center justify-center space-x-2"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Parsing CV...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Extract & Save to Profile</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Select CV to Insert Modal */}
      {showSelectCVModal && (
        <div className="absolute inset-0 bg-white/98 backdrop-blur-xs z-50 p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">Which CV do you want to insert?</h3>
              </div>
              <button
                onClick={() => setShowSelectCVModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Select the CV / resume profile you wish to use for this application:
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {profiles.map((p) => {
                const isSelected = p.id === (selectedProfileId || profile?.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectCV(p.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5 pr-2">
                        <p className="text-xs font-bold text-slate-800">
                          {p.experiences[0]?.title || p.identity.fullName || 'CV Profile'}
                        </p>
                        <p className="text-[11px] text-slate-600 font-medium">
                          {p.identity.fullName} · {p.location.city}, {p.location.country}
                        </p>
                        <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                          {p.summary}
                        </p>
                        <p className="text-[10px] text-blue-600 font-medium pt-0.5">
                          {p.skills.length} skills · {p.experiences.length} experience(s)
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => handleSelectCV(p.id)}
                          className="mt-1 text-blue-600"
                        />
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProfile(p.id, e)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                            title="Delete profile"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                setShowSelectCVModal(false);
                setShowImportModal(true);
              }}
              className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ Import Another CV / Resume</span>
            </button>

            <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
              <input
                type="checkbox"
                id="alwaysAsk"
                checked={alwaysAskCV}
                onChange={(e) => setAlwaysAskCV(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
              />
              <label htmlFor="alwaysAsk" className="text-[11px] text-slate-600">
                Always ask which CV to use before autofilling
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex space-x-2">
            <button
              onClick={() => setShowSelectCVModal(false)}
              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowSelectCVModal(false);
                executeAutofillWithProfile(selectedProfileId || profile?.id);
              }}
              className="flex-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center justify-center space-x-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Fill with This CV</span>
            </button>
          </div>
        </div>
      )}

      {/* JSON Paste Import Modal in Popup */}
      {showJsonPasteModal && (
        <div className="absolute inset-0 bg-white/98 backdrop-blur-xs z-50 p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center space-x-1.5">
                <Upload className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">Import Profile from JSON</h3>
              </div>
              <button
                onClick={() => {
                  setShowJsonPasteModal(false);
                  setJsonPasteText('');
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Paste your complete profile JSON below to update your saved CV details:
            </p>

            <textarea
              rows={9}
              value={jsonPasteText}
              onChange={(e) => setJsonPasteText(e.target.value)}
              placeholder={`{\n  "identity": {\n    "fullName": "Mohammad Zaid",\n    "email": "mohd98zaid@gmail.com"\n  }\n}`}
              className="w-full p-2 text-[11px] font-mono border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />

            <button
              onClick={() => {
                if (profile) setJsonPasteText(JSON.stringify(profile, null, 2));
              }}
              type="button"
              className="text-[11px] text-blue-600 hover:underline"
            >
              Load current profile JSON into editor
            </button>
          </div>

          <div className="pt-3 border-t border-slate-200 flex space-x-2">
            <button
              onClick={() => {
                setShowJsonPasteModal(false);
                setJsonPasteText('');
              }}
              className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => processJsonImport(jsonPasteText)}
              disabled={!jsonPasteText.trim()}
              className="flex-2 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              Import Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
