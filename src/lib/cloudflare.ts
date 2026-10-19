import {getCloudflareContext} from '@opennextjs/cloudflare';

export async function getDB(): Promise<D1Database> {
  try {
    const {env} = await getCloudflareContext({async: true});
    if (!env?.DB) {
      throw new Error(
        'D1 binding "DB" is missing. Check wrangler.toml, then run npm run db:migrate:local (or deploy).'
      );
    }
    return env.DB;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('initOpenNextCloudflareForDev')) {
      throw new Error(
        'Cloudflare context unavailable. Use `npm run dev` (OpenNext init) or a Workers deploy — not plain `next start`.'
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
}
