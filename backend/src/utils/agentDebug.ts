import fs from 'fs';
import path from 'path';

const LOG_PATH =
  process.env.AGENT_DEBUG_LOG_PATH || path.join(process.cwd(), 'debug-98adce.log');

/** NDJSON debug line for agent session 98adce — no secrets/PII in data. */
export function agentDebug(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  const line =
    JSON.stringify({
      sessionId: '98adce',
      timestamp: Date.now(),
      ...payload,
    }) + '\n';
  try {
    fs.appendFileSync(LOG_PATH, line, 'utf8');
  } catch (e) {
    console.warn('[AGENT_DEBUG_FS_FAIL]', (e as Error).message, 'path=', LOG_PATH);
  }
  fetch('http://host.docker.internal:7639/ingest/0165e98e-0397-4049-aca6-3a73385b7086', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '98adce',
    },
    body: JSON.stringify({
      sessionId: '98adce',
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
}
