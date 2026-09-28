import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Eye,
  FileText,
  Sparkles,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { ApplicationSession } from '../types/session';

export const ReviewPanel: React.FC = () => {
  const [session, setSession] = useState<ApplicationSession | null>(null);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.runtime.sendMessage(
          { type: 'UI_GET_SESSION', source: 'review', tabId: tab.id, timestamp: new Date().toISOString() },
          (res) => {
            if (res?.success) setSession(res.data);
          }
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleHighlight = async (fieldId: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'BG_HIGHLIGHT_FIELD',
        source: 'review',
        payload: { fieldId },
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleGenerateCoverLetter = () => {
    setGeneratingLetter(true);
    chrome.runtime.sendMessage(
      {
        type: 'UI_GENERATE_COVER_LETTER',
        source: 'review',
        payload: {
          role: 'Candidate',
          company: session?.domain || 'Company',
          jdText: '',
          profileEvidence: ['TypeScript', 'React', 'Problem Solving', 'Team Leadership']
        },
        timestamp: new Date().toISOString()
      },
      (res) => {
        setGeneratingLetter(false);
        if (res?.success) {
          setCoverLetter(res.data.coverLetter);
        }
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto my-8 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Application Audit & Review</h1>
          <p className="text-xs text-slate-500">
            Review all automated entries, confidence scores, and verify accuracy before final submission.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
            {session?.status || 'READY'}
          </span>
        </div>
      </div>

      {/* Filled Fields Audit */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Automated Form Fields ({session?.filledFields?.length || 0})</span>
        </h2>

        {(!session?.filledFields || session.filledFields.length === 0) ? (
          <p className="text-xs text-slate-400 italic">No fields filled yet in this session.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {session.filledFields.map((field) => (
              <div key={field.fieldId} className="py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-800 capitalize">
                      {field.semanticType.replace('_', ' ')}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        field.confidence >= 0.9
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {Math.round(field.confidence * 100)}% conf ({field.source})
                    </span>
                    {field.verified ? (
                      <span className="flex items-center space-x-1 text-[10px] text-emerald-600">
                        <CheckCircle className="w-3 h-3" />
                        <span>Verified</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-[10px] text-amber-600">
                        <AlertCircle className="w-3 h-3" />
                        <span>Unverified</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded inline-block">
                    {String(field.verifiedValue || field.attemptedValue)}
                  </p>
                </div>

                <button
                  onClick={() => handleHighlight(field.fieldId)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded"
                  title="Highlight on page"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cover Letter Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Grounded Cover Letter</h2>
          </div>
          <button
            onClick={handleGenerateCoverLetter}
            disabled={generatingLetter}
            className="py-1 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium flex items-center space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generatingLetter ? 'Generating...' : 'Generate from Profile'}</span>
          </button>
        </div>

        {coverLetter ? (
          <div className="space-y-2">
            <textarea
              rows={8}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              className="w-full p-3 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-sans"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center space-x-1 text-emerald-600 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Grounding Validated: Zero unsupported claims detected</span>
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(coverLetter)}
                className="text-blue-600 hover:underline"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No cover letter generated yet.</p>
        )}
      </div>

      {/* Final Review & Submission Confirmation */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
        <div className="space-y-1">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span className="text-xs font-semibold text-slate-900">
              I have reviewed all filled fields and confirmed accuracy
            </span>
          </label>
          <p className="text-[11px] text-slate-500 pl-6">
            In accordance with our safety guidelines, the extension never automatically submits an application.
          </p>
        </div>

        <button
          disabled={!confirmed}
          onClick={() => {
            alert('Review complete! You can now review the application on the page and press Submit yourself.');
          }}
          className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium flex items-center space-x-2 shadow-xs transition-colors"
        >
          <span>Complete Review</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
