#!/usr/bin/env node
/**
 * Start next dev after clearing shell SOCKS HTTP(S)_PROXY vars.
 * CLOCKIFY_PROXY_URL is kept for Firestore/Clockify via socks-proxy-agent.
 */
import {spawn} from 'node:child_process';

const env = {...process.env};
for (const key of Object.keys(env)) {
  if (!/proxy/i.test(key)) continue;
  if (key === 'CLOCKIFY_PROXY_URL') continue;
  delete env[key];
}

const child = spawn(
  'npx',
  ['next', 'dev', '--turbopack', '-p', '9002'],
  {stdio: 'inherit', env}
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
