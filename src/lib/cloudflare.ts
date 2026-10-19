import {getCloudflareContext} from '@opennextjs/cloudflare';

export async function getDB(): Promise<D1Database> {
  const {env} = await getCloudflareContext({async: true});
  if (!env?.DB) {
    throw new Error('D1 binding "DB" is missing. Run wrangler / apply migrations.');
  }
  return env.DB;
}
