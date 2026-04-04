import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidian from 'eslint-plugin-obsidianmd';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  obsidian.configs.all,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
