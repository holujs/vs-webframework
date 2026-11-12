import { root } from './metadata.mjs';
import { publishHelp, publishSelectedResult, readPublishOptions } from './publication.mjs';

async function main(): Promise<void> {
  const options = readPublishOptions(process.argv.slice(2));
  if (options.help) {
    console.log(publishHelp);
    return;
  }
  const result = await publishSelectedResult(root, options);
  console.log(
    `${result.created ? 'Published' : 'Already published'} results/published/${result.name}; refreshed README.md`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
