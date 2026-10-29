// Starts the app the way it runs online (poems on a server, accounts, signing in) but entirely on this
// computer, with no account or key: the "server" is part of this process, its database lives in memory,
// and signing in takes any email address and the code 123456. It starts empty and forgets everything when
// it is stopped. For trying the app; see the README for the real thing.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3200';
const env = {
  ...process.env,
  NEXT_PUBLIC_DATA_BACKEND: 'server',
  NEXT_PUBLIC_TEST_AUTH: '1',
  PALIMPSEST_DEMO: '1',
};
delete env.NODE_ENV; // `next dev` sets it

console.log('');
console.log('Palimpsest, local demo (poems on a server, with accounts)');
console.log(`  Open http://localhost:${port}`);
console.log('  Sign in with ANY email address and the code 123456. Nothing is sent anywhere.');
console.log('  Everything you save is kept in memory and is gone when you stop this (Ctrl+C).');
console.log('');

const next = spawn(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', port], {
  cwd: root,
  env,
  stdio: 'inherit',
});
next.on('exit', code => process.exit(code ?? 0));
process.on('SIGINT', () => next.kill('SIGINT'));
process.on('SIGTERM', () => next.kill('SIGTERM'));
