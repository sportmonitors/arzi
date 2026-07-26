import {HttpsProxyAgent} from 'https-proxy-agent';
import {SocksProxyAgent} from 'socks-proxy-agent';

const isVercelRuntime = () =>
  process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

/**
 * Local Iran networking may need a SOCKS/HTTP proxy.
 * On Vercel the network can reach Google/Clockify directly — never use a proxy
 * there (especially not 127.0.0.1, which does not exist in the serverless sandbox).
 */
export const getProxyUrl = (): string | undefined => {
  if (isVercelRuntime()) return undefined;

  return (
    process.env.CLOCKIFY_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.all_proxy ||
    undefined
  );
};

export const getProxyAgent = (proxyUrl = getProxyUrl()) => {
  if (!proxyUrl) return undefined;
  return proxyUrl.startsWith('socks')
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);
};
