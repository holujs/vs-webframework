import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'results/runs/**', '.yarn/**'] },
  ...tseslint.configs.recommended,
);
