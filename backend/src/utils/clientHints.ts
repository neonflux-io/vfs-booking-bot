/** Client Hint `sec-ch-ua-platform` must match the User-Agent OS or WAFs flag the session. */
export function secChUaPlatformFromUserAgent(ua: string): string {
  if (/Mac OS X|Macintosh/i.test(ua)) return '"macOS"';
  if (/Linux|X11|CrOS/i.test(ua)) return '"Linux"';
  if (/Windows/i.test(ua)) return '"Windows"';
  return '"Linux"';
}

/** Specific Arch string for WAF bypass. */
export function secChUaArchFromUserAgent(ua: string): string {
  if (ua.includes('x86_64') || ua.includes('Win64')) return '"x86"';
  if (ua.includes('arm64')) return '"arm"';
  return '"x86"';
}

/** Full version list (Z-pattern) for Cloudflare/Datadome bypass. */
export function secChUaFullVersionList(chromeVersion: string): string {
  return `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not:A-Brand";v="24"`;
}
