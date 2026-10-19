import {getCloudflareContext} from '@opennextjs/cloudflare';

const isLocalDev =
  process.env.NODE_ENV === 'development' ||
  process.env.NEXTJS_ENV === 'development';

/**
 * Resolve D1 without pulling `wrangler` into production bundles.
 * OpenNext Workers inject context on globalThis per request (sync).
 * Async mode falls back to importing wrangler — only safe in `next dev`.
 */
export async function getDB(): Promise<D1Database> {
  try {
    const {env} = getCloudflareContext({async: false});
    if (env?.DB) return env.DB;
  } catch {
    // No injected Worker context yet.
  }

  if (!isLocalDev) {
    throw new Error(
      'D1 unavailable: Cloudflare Worker context missing. Use OpenNext Workers deploy (not Vercel/Node).'
    );
  }

  try {
    const {env} = await getCloudflareContext({async: true});
    if (!env?.DB) {
      throw new Error(
        'D1 binding "DB" is missing. Check wrangler.toml, then run npm run db:migrate:local.'
      );
    }
    return env.DB;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('initOpenNextCloudflareForDev')) {
      throw new Error(
        'Cloudflare context unavailable. Use `npm run dev` (OpenNext init) — not plain `next start`.'
      );
    }
    if (message.includes("Cannot find package 'wrangler'")) {
      throw new Error(
        'D1 unavailable outside Cloudflare Workers (wrangler not bundled).'
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
}
