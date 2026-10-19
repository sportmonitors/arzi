#!/usr/bin/env node
/**
 * Strip proxy env vars before OpenNext build/deploy.
 * undici/wrangler reject socks5:// as HTTP(S)_PROXY.
 */
import {spawnSync} from 'node:child_process';

const command = process.argv[2] || 'deploy';
const allowed = new Set(['preview', 'deploy', 'upload']);
if (!allowed.has(command)) {
  console.error(`Usage: node scripts/cf-build-env.mjs <preview|deploy|upload>`);
  process.exit(1);
}

const cleanEnv = {...process.env};
for (const key of Object.keys(cleanEnv)) {
  if (/proxy/i.test(key)) {
    delete cleanEnv[key];
  }
}
cleanEnv.NEXTJS_ENV = 'production';
cleanEnv.NO_PROXY = '*';
cleanEnv.no_proxy = '*';

const run = (args) => {
  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    env: cleanEnv,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['opennextjs-cloudflare', 'build']);
run(['opennextjs-cloudflare', command]);
