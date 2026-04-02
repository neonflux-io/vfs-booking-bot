import https from 'https';
import { SocksProxyAgent } from 'socks-proxy-agent';

export type ProxyTunnelConfig = {
  host: string;
  port: number;
  auth?: { username: string; password?: string };
};

/** Playwright `proxy.server` — supports http(s):// or socks5:// host prefix. */
export function playwrightProxyServer(proxy: ProxyTunnelConfig): string {
  try {
    if (proxy.host.includes('://')) {
      const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(proxy.host)
        ? proxy.host
        : `http://${proxy.host}`;
      const u = new URL(normalized);
      return `${u.protocol}//${u.hostname}:${proxy.port}`;
    }
  } catch {
    /* fall through */
  }
  return `http://${proxy.host}:${proxy.port}`;
}

/**
 * Axios cannot use SOCKS via its built-in `proxy` option; route through an agent instead.
 * HTTP proxies use axios `proxy` + relaxed TLS agent for common residential MITM setups.
 */
export function axiosProxyTunnelOptions(
  proxy: ProxyTunnelConfig | false | undefined | null,
): Record<string, unknown> {
  if (!proxy) return {};

  const isSocks = /^socks5:\/\//i.test(proxy.host) || /^socks4:\/\//i.test(proxy.host);
  if (isSocks) {
    const hostname = proxy.host.replace(/^socks5:\/\//i, '').replace(/^socks4:\/\//i, '');
    const auth = proxy.auth;
    let url: string;
    if (auth?.username) {
      const u = encodeURIComponent(auth.username);
      const p = encodeURIComponent(auth.password ?? '');
      url = `socks5://${u}:${p}@${hostname}:${proxy.port}`;
    } else {
      url = `socks5://${hostname}:${proxy.port}`;
    }
    const agent = new SocksProxyAgent(url);
    return {
      proxy: false,
      httpAgent: agent,
      httpsAgent: agent,
    };
  }

  return {
    proxy: {
      host: proxy.host,
      port: proxy.port,
      protocol: 'http' as const,
      auth: proxy.auth
        ? { username: proxy.auth.username, password: proxy.auth.password ?? '' }
        : undefined,
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  };
}
