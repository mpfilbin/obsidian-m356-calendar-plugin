import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidian from 'eslint-plugin-obsidianmd';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { obsidianmd: obsidian },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...obsidian.ruleConfigs.recommended,
      'obsidianmd/ui/sentence-case': ['error', { enforceCamelCaseLower: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
