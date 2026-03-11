'use client';
import { useState } from 'react';
import { useCaptchaPrompt } from '@/hooks/useCaptchaPrompt';

export function CaptchaModal() {
  const { prompt, submitSolution, dismissPrompt } = useCaptchaPrompt();
  const [token, setToken] = useState('');

  if (!prompt) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    submitSolution(token.trim());
    setToken('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-2">CAPTCHA Required</h2>
        <p className="text-sm text-gray-500 mb-4">
          Session: <code className="text-xs">{prompt.sessionId}</code>
        </p>

        {prompt.image && (
          <img
            src={`data:image/png;base64,${prompt.image}`}
            alt="CAPTCHA"
            className="w-full rounded border mb-4"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            className="input"
            placeholder="Enter CAPTCHA solution or token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={dismissPrompt}>
              Dismiss
            </button>
            <button type="submit" className="btn-primary">Submit</button>
          </div>
        </form>
      </div>
    </div>
  );
}
