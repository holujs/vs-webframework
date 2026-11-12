import { root } from './metadata.mjs';
import { updateLatestReadme } from './publication.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: npm run results:latest [-- --check]');
}
const name = await updateLatestReadme(root, args[0] === '--check');
console.log(`Latest published benchmark: ${name ?? 'none'}`);
