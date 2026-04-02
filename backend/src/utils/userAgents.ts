/**
 * Shared user-agent pool — single source of truth for all modules.
 *
 * All agents are Chrome 134 on Linux to match the Docker (Jammy) environment
 * where Playwright runs.  The `ch` field is the Sec-CH-UA header value that
 * must be consistent with the UA string.
 */

export interface UserAgent {
  ua: string;
  ch: string;
  version: string;
}

export const USER_AGENTS: UserAgent[] = [
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
    version: '134.0.0.0',
  },
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="132", "Chromium";v="132", "Not:A-Brand";v="24"',
    version: '132.0.0.0',
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
    version: '134.0.0.0',
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
    version: '134.0.0.0',
  },
];

export function getRandomAgent(): UserAgent {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Returns just the UA string (for contexts that only need the string, e.g. browser.factory). */
export function getRandomUaString(): string {
  return getRandomAgent().ua;
}
