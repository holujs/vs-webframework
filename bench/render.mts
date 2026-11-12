import { regenerateReport } from './report.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: npm run report -- <results-directory>');
await regenerateReport(directory);
