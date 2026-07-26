import {HttpsProxyAgent} from 'https-proxy-agent';
import {SocksProxyAgent} from 'socks-proxy-agent';

export const getProxyUrl = () =>
  process.env.CLOCKIFY_PROXY_URL ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.ALL_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  process.env.all_proxy;

export const getProxyAgent = (proxyUrl = getProxyUrl()) => {
  if (!proxyUrl) return undefined;
  return proxyUrl.startsWith('socks')
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);
};
