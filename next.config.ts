import type {NextConfig} from 'next';

/** undici/wrangler crash on socks5:// — strip before any Cloudflare init. */
function stripSocksProxiesFromEnv() {
  for (const key of Object.keys(process.env)) {
    if (!/proxy/i.test(key)) continue;
    // Keep app-specific SOCKS for firestore-rest / clockify (socks-proxy-agent).
    if (key === 'CLOCKIFY_PROXY_URL') continue;
    const value = process.env[key] || '';
    if (/^socks/i.test(value) || key === 'ALL_PROXY' || key === 'all_proxy') {
      delete process.env[key];
    }
  }
}

stripSocksProxiesFromEnv();

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;

// Only for `next dev` — must not run during OpenNext / production build.
if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare').then(({initOpenNextCloudflareForDev}) => {
    stripSocksProxiesFromEnv();
    initOpenNextCloudflareForDev();
  });
}
