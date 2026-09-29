import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Briefcase,
  Cpu,
  Bookmark,
  Shield,
  Save,
  Plus,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  FileText,
  Sparkles,
  RefreshCw,
  GraduationCap,
  HelpCircle,
  Edit2,
  Check
} from 'lucide-react';
import { UserProfile, Settings, Skill, ProfileSchema, Experience, Education, CustomQA } from '../types/profile';
import { FieldMapping } from '../types/session';

export const Options: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'skills' | 'qa' | 'ai' | 'mappings' | 'privacy'>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Q&A Knowledge Bank states
  const [qaSearch, setQaSearch] = useState('');
  const [showAddQa, setShowAddQa] = useState(false);
  const [newQaQuestion, setNewQaQuestion] = useState('');
  const [newQaAnswer, setNewQaAnswer] = useState('');
  const [newQaTag, setNewQaTag] = useState('');
  const [editingQaId, setEditingQaId] = useState<string | null>(null);
  const [editingQaAnswer, setEditingQaAnswer] = useState('');

  // New skill input states
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillProficiency, setNewSkillProficiency] = useState<Skill['proficiency']>('intermediate');

  // New experience form states
  const [showAddExp, setShowAddExp] = useState(false);
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpCompany, setNewExpCompany] = useState('');
  const [newExpLocation, setNewExpLocation] = useState('');
  const [newExpStartDate, setNewExpStartDate] = useState('');
  const [newExpEndDate, setNewExpEndDate] = useState('');
  const [newExpCurrent, setNewExpCurrent] = useState(false);
  const [newExpDescription, setNewExpDescription] = useState('');

  // New education form states
  const [showAddEdu, setShowAddEdu] = useState(false);
  const [newEduInstitution, setNewEduInstitution] = useState('');
  const [newEduDegree, setNewEduDegree] = useState('');
  const [newEduField, setNewEduField] = useState('');
  const [newEduStartDate, setNewEduStartDate] = useState('');
  const [newEduEndDate, setNewEduEndDate] = useState('');

  // Resume import modal states
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [importingResume, setImportingResume] = useState(false);

  // JSON Import & Export states
  const [showJsonPasteModal, setShowJsonPasteModal] = useState(false);
  const [jsonPasteText, setJsonPasteText] = useState('');
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const SAMPLE_CV_TEXT = `Alex Taylor
Senior Full-Stack Engineer | 5+ Years | San Francisco, CA
+1 555-0199 | Email: alex.taylor@example.com | LinkedIn: https://linkedin.com/in/alextaylor | GitHub: https://github.com/alextaylor | Portfolio: https://alextaylor.dev
Nationality: American | Visa: Citizen | Notice Period: 2 Weeks | Open to Remote

PROFESSIONAL SUMMARY
Experienced Full-Stack Software Engineer with 5+ years building scalable distributed web applications, cloud-native services, and AI-assisted tooling using React, TypeScript, Node.js, and Python.

CORE COMPETENCIES & KEY SKILLS
TypeScript, React, Python, Node.js, Next.js, PostgreSQL, Docker, Kubernetes, AWS, GraphQL, REST APIs, CI/CD, Git, Tailwind CSS

EXPERIENCE
Acme Corp · Senior Software Engineer
San Francisco, CA | Jan 2021 – Present
- Led architecture and deployment of real-time collaboration microservices serving 1M+ active users.
- Optimized query latency by 40% across PostgreSQL and Redis caching tiers.
- Mentored junior engineers and instituted automated end-to-end testing practices.

EDUCATION
University of California, Berkeley · B.S. in Computer Science
Berkeley, CA | Aug 2016 – May 2020`;

  const handleImportResume = () => {
    if (!resumeText.trim()) return;
    setImportingResume(true);
    chrome.runtime.sendMessage(
      {
        type: 'UI_PARSE_RESUME',
        source: 'options',
        payload: { resumeText },
        timestamp: new Date().toISOString()
      },
      (res) => {
        setImportingResume(false);
        if (res?.success) {
          setProfile(res.data?.profile || null);
          setShowResumeModal(false);
          flashStatus('Profile successfully populated from CV/Resume!');
          loadAll();
        } else {
          alert('Failed to parse resume: ' + (res?.error?.message || 'Unknown error'));
        }
      }
    );
  };

  const profileRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    const handleFlush = () => {
      if (profileRef.current && typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ user_profile: profileRef.current });
      }
    };
    window.addEventListener('beforeunload', handleFlush);
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') handleFlush();
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
      window.removeEventListener('beforeunload', handleFlush);
      document.removeEventListener('visibilitychange', handleVisChange);
    };
  }, []);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = () => {
    // 1. Instant local restore from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['user_profile', 'cv_profiles', 'active_profile_id', 'settings', 'mappings'], (res) => {
        if (res.user_profile) {
          setProfile(res.user_profile as UserProfile);
        }
        if (Array.isArray(res.cv_profiles)) {
          setProfiles(res.cv_profiles as UserProfile[]);
        }
        if (res.settings) {
          setSettings(res.settings as Settings);
        }
        if (Array.isArray(res.mappings)) {
          setMappings(res.mappings as FieldMapping[]);
        }
      });
    }

    // 2. Query service worker for latest synced data
    chrome.runtime.sendMessage({ type: 'UI_GET_PROFILE', source: 'options', timestamp: new Date().toISOString() }, (res) => {
      if (res?.success && res.data) setProfile(res.data);
    });
    chrome.runtime.sendMessage({ type: 'UI_GET_PROFILES', source: 'options', timestamp: new Date().toISOString() }, (res) => {
      if (res?.success && Array.isArray(res.data)) setProfiles(res.data);
    });
    chrome.runtime.sendMessage({ type: 'UI_GET_SETTINGS', source: 'options', timestamp: new Date().toISOString() }, (res) => {
      if (res?.success && res.data) setSettings(res.data);
    });
    chrome.runtime.sendMessage({ type: 'UI_GET_MAPPINGS', source: 'options', timestamp: new Date().toISOString() }, (res) => {
      if (res?.success && res.data) setMappings(res.data || []);
    });
  };

  const saveProfileDirect = (updated: UserProfile) => {
    // Write directly to local storage immediately
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ user_profile: updated });
    }
    // Sync with background worker, cv_profiles list, and IndexedDB
    chrome.runtime.sendMessage(
      { type: 'UI_UPDATE_PROFILE', source: 'options', payload: updated, timestamp: new Date().toISOString() },
      (res) => {
        if (res?.success || res?.updated) {
          // synced
        }
      }
    );
  };

  const handleSaveProfile = () => {
    if (!profile) return;
    saveProfileDirect(profile);
    flashStatus('Profile saved successfully to persistent memory!');
  };

  const handleSaveSettings = () => {
    if (!settings) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ settings });
    }
    chrome.runtime.sendMessage(
      { type: 'UI_UPDATE_SETTINGS', source: 'options', payload: settings, timestamp: new Date().toISOString() },
      (res) => {
        if (res?.success) {
          flashStatus('Settings saved successfully');
        }
      }
    );
  };

  const flashStatus = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const isProfileFirstLoad = useRef(true);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isProfileFirstLoad.current) {
      if (profile) {
        isProfileFirstLoad.current = false;
      }
      return;
    }
    if (!profile) return;

    // Immediately persist to local storage so no keystroke is ever lost
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ user_profile: profile });
    }

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      chrome.runtime.sendMessage(
        { type: 'UI_UPDATE_PROFILE', source: 'options', payload: profile, timestamp: new Date().toISOString() },
        (res) => {
          if (res?.success || res?.updated) flashStatus('All profile changes auto-saved');
        }
      );
    }, 400);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [profile]);

  const handleAddSkill = () => {
    if (!newSkillName.trim() || !profile) return;
    const trimmed = newSkillName.trim();
    if (profile.skills.some((s) => s.canonicalName.toLowerCase() === trimmed.toLowerCase())) {
      flashStatus(`Skill "${trimmed}" already exists in your profile`);
      return;
    }
    const newSkill: Skill = {
      id: `skill_${Date.now()}`,
      canonicalName: trimmed,
      aliases: [],
      proficiency: newSkillProficiency,
      years: null,
      source: ['profile'],
      verified: true
    };
    const updated = {
      ...profile,
      skills: [...profile.skills, newSkill]
    };
    setProfile(updated);
    setNewSkillName('');
    saveProfileDirect(updated);
    flashStatus(`Skill "${trimmed}" added and saved!`);
  };

  const handleRemoveSkill = (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      skills: profile.skills.filter((s) => s.id !== id)
    };
    setProfile(updated);
    saveProfileDirect(updated);
    flashStatus('Skill removed and saved!');
  };

  const handleAddExperience = () => {
    if (!profile || !newExpTitle.trim() || !newExpCompany.trim()) return;
    const newExp: Experience = {
      id: `exp_${Date.now()}`,
      title: newExpTitle.trim(),
      company: newExpCompany.trim(),
      location: newExpLocation.trim(),
      startDate: newExpStartDate.trim(),
      endDate: newExpCurrent ? 'Present' : newExpEndDate.trim(),
      current: newExpCurrent,
      description: newExpDescription.trim(),
      skills: [],
      achievements: [],
      verified: true
    };
    const updated = {
      ...profile,
      experiences: [newExp, ...profile.experiences]
    };
    setProfile(updated);
    saveProfileDirect(updated);
    setShowAddExp(false);
    setNewExpTitle('');
    setNewExpCompany('');
    setNewExpLocation('');
    setNewExpStartDate('');
    setNewExpEndDate('');
    setNewExpCurrent(false);
    setNewExpDescription('');
    flashStatus('Experience added and saved!');
  };

  const handleRemoveExperience = (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      experiences: profile.experiences.filter((e) => e.id !== id)
    };
    setProfile(updated);
    saveProfileDirect(updated);
    flashStatus('Experience removed and saved!');
  };

  const handleAddEducation = () => {
    if (!profile || !newEduInstitution.trim() || !newEduDegree.trim()) return;
    const newEdu: Education = {
      id: `edu_${Date.now()}`,
      institution: newEduInstitution.trim(),
      degree: newEduDegree.trim(),
      field: newEduField.trim(),
      startDate: newEduStartDate.trim(),
      endDate: newEduEndDate.trim(),
      verified: true
    };
    const updated = {
      ...profile,
      education: [newEdu, ...profile.education]
    };
    setProfile(updated);
    saveProfileDirect(updated);
    setShowAddEdu(false);
    setNewEduInstitution('');
    setNewEduDegree('');
    setNewEduField('');
    setNewEduStartDate('');
    setNewEduEndDate('');
    flashStatus('Education added and saved!');
  };

  const handleRemoveEducation = (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      education: profile.education.filter((e) => e.id !== id)
    };
    setProfile(updated);
    saveProfileDirect(updated);
    flashStatus('Education removed and saved!');
  };

  const handleDeleteMapping = (id: string) => {
    chrome.runtime.sendMessage(
      { type: 'UI_DELETE_MAPPING', source: 'options', payload: { id }, timestamp: new Date().toISOString() },
      () => {
        setMappings(mappings.filter((m) => m.id !== id));
      }
    );
  };

  const handleAddQA = () => {
    if (!profile || !newQaQuestion.trim() || !newQaAnswer.trim()) return;
    const newEntry: CustomQA = {
      id: `qa_${Date.now()}`,
      question: newQaQuestion.trim(),
      answer: newQaAnswer.trim(),
      tags: newQaTag.trim() ? [newQaTag.trim()] : ['custom'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = {
      ...profile,
      customQA: [newEntry, ...(profile.customQA || [])]
    };
    setProfile(updated);
    saveProfileDirect(updated);
    setShowAddQa(false);
    setNewQaQuestion('');
    setNewQaAnswer('');
    setNewQaTag('');
    flashStatus('Question & Answer saved to memory bank!');
  };

  const handleDeleteQA = (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      customQA: (profile.customQA || []).filter((q) => q.id !== id)
    };
    setProfile(updated);
    saveProfileDirect(updated);
    flashStatus('Answer removed from memory bank!');
  };

  const handleSaveEditQA = (id: string) => {
    if (!profile || !editingQaAnswer.trim()) return;
    const updated = {
      ...profile,
      customQA: (profile.customQA || []).map((q) =>
        q.id === id ? { ...q, answer: editingQaAnswer.trim(), updatedAt: new Date().toISOString() } : q
      )
    };
    setProfile(updated);
    saveProfileDirect(updated);
    setEditingQaId(null);
    setEditingQaAnswer('');
    flashStatus('Answer updated in memory bank!');
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
    flashStatus('Profile exported as JSON!');
  };

  const processJsonImport = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.identity && !parsed.identity.fullName && (parsed.identity.firstName || parsed.identity.lastName)) {
        parsed.identity.fullName = `${parsed.identity.firstName || ''} ${parsed.identity.lastName || ''}`.trim();
      }
      const validated = ProfileSchema.parse(parsed);
      setProfile(validated);
      chrome.runtime.sendMessage(
        { type: 'UI_UPDATE_PROFILE', source: 'options', payload: validated, timestamp: new Date().toISOString() },
        (res) => {
          if (res?.success || res?.updated) {
            flashStatus('Profile imported & saved successfully!');
            setShowJsonPasteModal(false);
            setJsonPasteText('');
            loadAll();
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

  const handleDeleteProfile = (profileId: string) => {
    if (profiles.length <= 1) {
      alert('Cannot delete the only profile. At least one profile must be retained.');
      return;
    }
    const toDelete = profiles.find((p) => p.id === profileId);
    const name = toDelete?.experiences[0]?.title || toDelete?.identity.fullName || profileId;
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;

    chrome.runtime.sendMessage(
      { type: 'UI_DELETE_PROFILE', source: 'options', payload: { id: profileId }, timestamp: new Date().toISOString() },
      (res) => {
        if (res?.success) {
          flashStatus('Profile deleted successfully');
          loadAll();
        } else {
          alert('Failed to delete profile: ' + (res?.error?.message || 'Storage error'));
        }
      }
    );
  };

  if (!profile || !settings) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto my-8 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col md:flex-row">
      {/* Sidebar Nav */}
      <nav className="w-full md:w-64 bg-slate-50 p-4 border-r border-slate-200 space-y-1">
        <div className="pb-4 mb-2 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">Job Assistant</h2>
          <p className="text-xs text-slate-500">Configuration & Profile</p>
        </div>

        {profiles.length > 1 && (
          <div className="pb-3 mb-2 border-b border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold uppercase text-slate-500">Active CV Profile</label>
              <button
                type="button"
                onClick={() => handleDeleteProfile(profile.id)}
                className="text-red-500 hover:text-red-700 flex items-center space-x-1 text-[10px] font-medium"
                title="Delete this profile"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
            <select
              value={profile.id}
              onChange={(e) => {
                const targetId = e.target.value;
                chrome.runtime.sendMessage(
                  { type: 'UI_SET_ACTIVE_PROFILE', source: 'options', payload: { id: targetId }, timestamp: new Date().toISOString() },
                  () => {
                    loadAll();
                    flashStatus('Switched active profile');
                  }
                );
              }}
              className="w-full text-xs font-medium border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-800"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.experiences[0]?.title || p.identity.fullName || 'CV Profile'}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => setActiveTab('profile')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'profile' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Profile & Contact</span>
        </button>

        <button
          onClick={() => setActiveTab('skills')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'skills' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Skills & Experience</span>
        </button>

        <button
          onClick={() => setActiveTab('qa')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'qa' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <HelpCircle className="w-4 h-4" />
            <span>Q&A Memory Bank</span>
          </div>
          {(profile.customQA?.length || 0) > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === 'qa' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {profile.customQA?.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'ai' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>AI Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('mappings')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'mappings' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Site Mappings</span>
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'privacy' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Privacy & Data</span>
        </button>
      </nav>

      {/* Main Panel */}
      <main className="flex-1 p-6 md:p-8 space-y-6">
        {saveStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{saveStatus}</span>
          </div>
        )}

        {/* Tab 1: Profile */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Personal Information</h3>
                <p className="text-xs text-slate-500">Source of truth for autofilling identity and contact fields.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={jsonFileInputRef}
                  accept=".json,application/json"
                  onChange={handleJsonFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                  title="Import complete profile from a .json file on your disk"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>Import JSON File</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowJsonPasteModal(true)}
                  className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                  title="Paste raw JSON profile code directly"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Paste JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportProfile}
                  className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                  title="Download complete profile as a .json file"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowResumeModal(true)}
                  className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Import CV (Gemini)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={profile.identity.firstName}
                  onChange={(e) =>
                    setProfile({ ...profile, identity: { ...profile.identity, firstName: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={profile.identity.lastName}
                  onChange={(e) =>
                    setProfile({ ...profile, identity: { ...profile.identity, lastName: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={profile.identity.email}
                  onChange={(e) =>
                    setProfile({ ...profile, identity: { ...profile.identity, email: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={profile.identity.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, identity: { ...profile.identity, phone: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={profile.location.addressLine}
                  onChange={(e) =>
                    setProfile({ ...profile, location: { ...profile.location, addressLine: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={profile.location.city}
                  onChange={(e) =>
                    setProfile({ ...profile, location: { ...profile.location, city: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State / Province</label>
                <input
                  type="text"
                  value={profile.location.state}
                  onChange={(e) =>
                    setProfile({ ...profile, location: { ...profile.location, state: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Postal / Zip Code</label>
                <input
                  type="text"
                  value={profile.location.zipCode}
                  onChange={(e) =>
                    setProfile({ ...profile, location: { ...profile.location, zipCode: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country</label>
                <input
                  type="text"
                  value={profile.location.country}
                  onChange={(e) =>
                    setProfile({ ...profile, location: { ...profile.location, country: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">Links & Portfolios</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">LinkedIn URL</label>
                  <input
                    type="url"
                    value={profile.links.linkedin}
                    onChange={(e) =>
                      setProfile({ ...profile, links: { ...profile.links, linkedin: e.target.value } })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">GitHub URL</label>
                  <input
                    type="url"
                    value={profile.links.github}
                    onChange={(e) =>
                      setProfile({ ...profile, links: { ...profile.links, github: e.target.value } })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Portfolio / Website</label>
                  <input
                    type="url"
                    value={profile.links.portfolio}
                    onChange={(e) =>
                      setProfile({ ...profile, links: { ...profile.links, portfolio: e.target.value } })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">Preferences & Authorization</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work Authorization</label>
                  <input
                    type="text"
                    value={profile.preferences.workAuthorization}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        preferences: { ...profile.preferences, workAuthorization: e.target.value }
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Visa Status</label>
                  <input
                    type="text"
                    value={profile.preferences.visaStatus}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        preferences: { ...profile.preferences, visaStatus: e.target.value }
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notice Period (Days)</label>
                  <input
                    type="number"
                    value={profile.preferences.noticePeriodDays}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        preferences: { ...profile.preferences, noticePeriodDays: parseInt(e.target.value) || 0 }
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Desired Salary</label>
                  <input
                    type="text"
                    value={profile.preferences.desiredSalary}
                    placeholder="e.g. $140,000 / yr"
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        preferences: { ...profile.preferences, desiredSalary: e.target.value }
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={handleSaveProfile}
                className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 shadow-xs transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save Profile Details</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Skills */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Verified Skills Inventory</h3>
                <p className="text-xs text-slate-500">
                  Skills used for matching against JD requirements and filling tag/checkbox controls.
                </p>
              </div>
              <button
                onClick={handleSaveProfile}
                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Skills</span>
              </button>
            </div>

            {/* Add Skill Form */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row items-end space-y-2 md:space-y-0 md:space-x-3">
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-slate-700 mb-1">Skill / Technology Name</label>
                <input
                  type="text"
                  placeholder="e.g. TypeScript, React, Python, Docker"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                />
              </div>

              <div className="w-full md:w-44">
                <label className="block text-xs font-medium text-slate-700 mb-1">Proficiency</label>
                <select
                  value={newSkillProficiency}
                  onChange={(e) => setNewSkillProficiency(e.target.value as Skill['proficiency'])}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </div>

              <button
                onClick={handleAddSkill}
                className="w-full md:w-auto py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center justify-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>

            {/* Skills List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {profile.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between shadow-xs"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{skill.canonicalName}</p>
                    <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium capitalize">
                      {skill.proficiency}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveSkill(skill.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Work Experience Section */}
            <div className="pt-6 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                    <span>Work Experience</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Roles, employers, dates, and descriptions used for filling employment history fields.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddExp(!showAddExp)}
                  className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddExp ? 'Cancel' : 'Add Experience'}</span>
                </button>
              </div>

              {showAddExp && (
                <div className="p-4 bg-slate-50 border border-blue-200 rounded-lg space-y-3">
                  <h4 className="text-xs font-bold text-blue-900">Add New Work Experience</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Job Title / Role *</label>
                      <input
                        type="text"
                        placeholder="e.g. Senior Software Engineer"
                        value={newExpTitle}
                        onChange={(e) => setNewExpTitle(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Company / Organization *</label>
                      <input
                        type="text"
                        placeholder="e.g. Tata Consultancy Services"
                        value={newExpCompany}
                        onChange={(e) => setNewExpCompany(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Location</label>
                      <input
                        type="text"
                        placeholder="e.g. New Delhi, India"
                        value={newExpLocation}
                        onChange={(e) => setNewExpLocation(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Start Date</label>
                        <input
                          type="text"
                          placeholder="e.g. Apr 2021"
                          value={newExpStartDate}
                          onChange={(e) => setNewExpStartDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">End Date</label>
                        <input
                          type="text"
                          placeholder="e.g. Present"
                          disabled={newExpCurrent}
                          value={newExpCurrent ? 'Present' : newExpEndDate}
                          onChange={(e) => setNewExpEndDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white disabled:bg-slate-100 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newExpCurrentCheck"
                      checked={newExpCurrent}
                      onChange={(e) => setNewExpCurrent(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <label htmlFor="newExpCurrentCheck" className="text-xs text-slate-600">
                      I currently work in this role
                    </label>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">Role Description / Responsibilities</label>
                    <textarea
                      rows={3}
                      placeholder="Key achievements, technologies used, responsibilities..."
                      value={newExpDescription}
                      onChange={(e) => setNewExpDescription(e.target.value)}
                      className="w-full p-2 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowAddExp(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddExperience}
                      disabled={!newExpTitle.trim() || !newExpCompany.trim()}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md shadow-xs"
                    >
                      Save Experience
                    </button>
                  </div>
                </div>
              )}

              {profile.experiences.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No work experiences added yet.</p>
              ) : (
                <div className="space-y-3">
                  {profile.experiences.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-slate-900">{exp.title}</h4>
                          <p className="text-xs font-semibold text-blue-600">{exp.company}</p>
                          <p className="text-[11px] text-slate-500">
                            {exp.startDate} – {exp.current ? 'Present' : exp.endDate || 'Present'} {exp.location && `· ${exp.location}`}
                          </p>
                          {exp.description && (
                            <p className="text-xs text-slate-700 mt-2 whitespace-pre-line bg-slate-50 p-2.5 rounded border border-slate-100">
                              {exp.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveExperience(exp.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors ml-2"
                          title="Delete experience"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Education Section */}
            <div className="pt-6 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    <span>Education & Qualifications</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Degrees, universities, fields of study, and graduation dates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddEdu(!showAddEdu)}
                  className="py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddEdu ? 'Cancel' : 'Add Education'}</span>
                </button>
              </div>

              {showAddEdu && (
                <div className="p-4 bg-slate-50 border border-emerald-200 rounded-lg space-y-3">
                  <h4 className="text-xs font-bold text-emerald-900">Add New Education</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Degree / Qualification *</label>
                      <input
                        type="text"
                        placeholder="e.g. B. Tech, Bachelor of Technology, Master"
                        value={newEduDegree}
                        onChange={(e) => setNewEduDegree(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">School / Institution / University *</label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. APJ Abdul Kalam Technical University"
                        value={newEduInstitution}
                        onChange={(e) => setNewEduInstitution(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Field of Study / Major</label>
                      <input
                        type="text"
                        placeholder="e.g. Computer Science & Engineering"
                        value={newEduField}
                        onChange={(e) => setNewEduField(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Start Date</label>
                        <input
                          type="text"
                          placeholder="e.g. Aug 2015"
                          value={newEduStartDate}
                          onChange={(e) => setNewEduStartDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Graduation Date</label>
                        <input
                          type="text"
                          placeholder="e.g. Jun 2019"
                          value={newEduEndDate}
                          onChange={(e) => setNewEduEndDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddEdu(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddEducation}
                      disabled={!newEduInstitution.trim() || !newEduDegree.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md shadow-xs"
                    >
                      Save Education
                    </button>
                  </div>
                </div>
              )}

              {profile.education.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No education entries added yet.</p>
              ) : (
                <div className="space-y-3">
                  {profile.education.map((edu) => (
                    <div
                      key={edu.id}
                      className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-slate-900">{edu.degree}</h4>
                          <p className="text-xs font-semibold text-emerald-700">{edu.institution}</p>
                          <p className="text-[11px] text-slate-500">
                            {edu.field && `${edu.field} · `}{edu.startDate} – {edu.endDate}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveEducation(edu.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors ml-2"
                          title="Delete education"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Q&A Memory Bank */}
        {activeTab === 'qa' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
                  <HelpCircle className="w-5 h-5 text-blue-600" />
                  <span>Q&A Memory Bank (Learned Answers)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Questions learned in real-time by the AI Agent or added manually. Future job applications automatically reuse these answers in 0 ms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddQa(true)}
                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Q&A</span>
              </button>
            </div>

            {/* Search filter bar */}
            {(profile.customQA?.length || 0) > 0 && (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Search saved questions or answers..."
                  value={qaSearch}
                  onChange={(e) => setQaSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            )}

            {/* Add Q&A Form */}
            {showAddQa && (
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900">Add Question & Grounded Answer</h4>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Question / Field Prompt *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Why do you want to work at this company? or Describe your experience with LangChain"
                    value={newQaQuestion}
                    onChange={(e) => setNewQaQuestion(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Answer *
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Provide the preferred answer that the AI agent should inject into form fields..."
                    value={newQaAnswer}
                    onChange={(e) => setNewQaAnswer(e.target.value)}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500 leading-relaxed font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Tag / Category (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. behavioral, technical, leadership"
                    value={newQaTag}
                    onChange={(e) => setNewQaTag(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddQa(false);
                      setNewQaQuestion('');
                      setNewQaAnswer('');
                      setNewQaTag('');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddQA}
                    disabled={!newQaQuestion.trim() || !newQaAnswer.trim()}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md shadow-xs"
                  >
                    Save to Memory Bank
                  </button>
                </div>
              </div>
            )}

            {/* List of saved QA */}
            {(!profile.customQA || profile.customQA.length === 0) ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2">
                <HelpCircle className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">No questions saved in memory yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  When you autofill job applications, the Real-Time AI Agent generates answers for any unmapped questions on-the-fly and saves them here. You can also add your own predefined answers above!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {profile.customQA
                  .filter((item) => {
                    if (!qaSearch.trim()) return true;
                    const q = qaSearch.toLowerCase();
                    return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
                  })
                  .map((item) => {
                    const isEditing = editingQaId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-all shadow-xs space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 pr-2 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                {item.tags?.[0] || 'Q&A'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Saved {new Date(item.createdAt || Date.now()).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">{item.question}</h4>
                          </div>
                          <div className="flex items-center space-x-1">
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQaId(item.id);
                                  setEditingQaAnswer(item.answer);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                                title="Edit answer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteQA(item.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                              title="Delete question & answer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              rows={4}
                              value={editingQaAnswer}
                              onChange={(e) => setEditingQaAnswer(e.target.value)}
                              className="w-full p-2.5 text-xs border border-blue-400 rounded-md focus:ring-1 focus:ring-blue-500 font-sans leading-relaxed"
                            />
                            <div className="flex justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingQaId(null)}
                                className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditQA(item.id)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center space-x-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-700 whitespace-pre-line bg-slate-50 p-2.5 rounded border border-slate-100 leading-relaxed">
                            {item.answer}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: AI Settings */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">AI Intelligence Configuration</h3>
                <p className="text-xs text-slate-500">
                  Control AI fallback providers, confidence thresholds, and privacy boundaries.
                </p>
              </div>
              <button
                onClick={handleSaveSettings}
                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Settings</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Active AI Provider</label>
                <select
                  value={settings.aiProvider}
                  onChange={(e) => setSettings({ ...settings, aiProvider: e.target.value as Settings['aiProvider'] })}
                  className="w-full md:w-72 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                >
                  <option value="local">Local Heuristic (Privacy-First / Offline)</option>
                  <option value="openai">OpenAI Compatible (Cloud)</option>
                  <option value="gemini">Google Gemini (Cloud)</option>
                  <option value="custom">Custom Endpoint</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="allowCloudAI"
                  checked={settings.allowCloudAI}
                  onChange={(e) => setSettings({ ...settings, allowCloudAI: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="allowCloudAI" className="text-xs font-medium text-slate-700">
                  Enable Cloud AI Providers (Requires API Key)
                </label>
              </div>

              {settings.allowCloudAI && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4 mt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">API Key</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={settings.aiApiKey || ''}
                        placeholder="sk-..."
                        onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
                        className="w-full px-3 py-2 pr-10 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Model Name</label>
                    <input
                      type="text"
                      placeholder="gpt-4o-mini or gemini-1.5-flash"
                      value={settings.aiModelName || ''}
                      onChange={(e) => setSettings({ ...settings, aiModelName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Base URL (Optional)</label>
                    <input
                      type="url"
                      placeholder="https://api.openai.com/v1"
                      value={settings.aiBaseUrl || ''}
                      onChange={(e) => setSettings({ ...settings, aiBaseUrl: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 space-y-4">
                <h4 className="text-sm font-semibold text-slate-800">Confidence Thresholds</h4>

                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                    <span>Auto-Fill Threshold</span>
                    <span className="font-bold text-blue-600">{Math.round(settings.autoFillThreshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.05"
                    value={settings.autoFillThreshold}
                    onChange={(e) => setSettings({ ...settings, autoFillThreshold: parseFloat(e.target.value) })}
                    className="w-full accent-blue-600"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Fields with confidence above this value are automatically filled.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Mappings */}
        {activeTab === 'mappings' && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Learned Site Mappings</h3>
              <p className="text-xs text-slate-500">
                Custom field signatures remembered on specific domains for instant deterministic matching.
              </p>
            </div>

            {mappings.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No site mappings saved yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Domain</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Semantic Type</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Confidence</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {mappings.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2 font-mono text-slate-700">{m.domain}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{m.semanticType}</td>
                        <td className="px-3 py-2 text-emerald-600 font-semibold">{Math.round(m.confidence * 100)}%</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleDeleteMapping(m.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Privacy */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Privacy & Data Management</h3>
              <p className="text-xs text-slate-500">Export or completely purge extension data from your device.</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">Export Profile Data (JSON)</h4>
                  <p className="text-[11px] text-slate-500">Download all saved profile information in JSON format.</p>
                </div>
                <button
                  onClick={handleExportProfile}
                  className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export JSON</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">Import Profile Data (JSON)</h4>
                  <p className="text-[11px] text-slate-500">Restore or update profile details from a JSON file or paste JSON directly.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => jsonFileInputRef.current?.click()}
                    className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                    title="Upload JSON file from your computer"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>Upload File</span>
                  </button>
                  <button
                    onClick={() => setShowJsonPasteModal(true)}
                    className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                    title="Paste raw JSON profile code"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-600" />
                    <span>Paste JSON</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-red-900 flex items-center space-x-1">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>Purge All Extension Data</span>
                  </h4>
                  <p className="text-[11px] text-red-700">
                    Permanently deletes all profiles, resumes, site mappings, and cached sessions.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to delete all saved data? This cannot be undone.')) {
                      chrome.storage.local.clear(() => {
                        window.location.reload();
                      });
                    }
                  }}
                  className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium shadow-xs"
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Resume Import Modal */}
      {showResumeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Import CV / Resume with Gemini</h3>
              </div>
              <button
                onClick={() => setShowResumeModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Paste your CV or Resume text below. <strong>Gemini 3.8 Flash</strong> will automatically extract your contact details, location, skills, and work history directly into your verified profile.
            </p>

            <textarea
              rows={10}
              placeholder="Paste your CV text here (e.g. Alex Taylor, Email: alex.taylor@example.com, Phone, Skills, Experiences)..."
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="w-full p-3 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
            />

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setResumeText(SAMPLE_CV_TEXT)}
                className="py-1.5 px-3 text-xs text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg font-medium border border-indigo-200 transition-colors flex items-center space-x-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Load Sample CV</span>
              </button>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowResumeModal(false)}
                  className="py-1.5 px-3 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportResume}
                  disabled={importingResume || !resumeText.trim()}
                  className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-xs"
                >
                  {importingResume ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting with Gemini...</span>
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
          </div>
        </div>
      )}

      {/* JSON Paste Import Modal */}
      {showJsonPasteModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Import Profile from JSON</h3>
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

            <p className="text-xs text-slate-500">
              Paste complete or partial Profile JSON below. The data will be validated against the schema, merged with defaults, and saved immediately into your profile.
            </p>

            <textarea
              rows={12}
              value={jsonPasteText}
              onChange={(e) => setJsonPasteText(e.target.value)}
              placeholder={`{\n  "identity": {\n    "fullName": "Alex Taylor",\n    "email": "alex.taylor@example.com",\n    "phone": "+1 555-0199"\n  },\n  "location": {\n    "city": "San Francisco",\n    "country": "United States"\n  },\n  "skills": [\n    { "canonicalName": "TypeScript", "proficiency": "advanced" }\n  ]\n}`}
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                onClick={() => {
                  if (profile) setJsonPasteText(JSON.stringify(profile, null, 2));
                }}
                type="button"
                className="text-xs text-blue-600 hover:underline"
              >
                Load current profile JSON into editor
              </button>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setShowJsonPasteModal(false);
                    setJsonPasteText('');
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => processJsonImport(jsonPasteText)}
                  disabled={!jsonPasteText.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium shadow-xs"
                >
                  Parse & Import Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
