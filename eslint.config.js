import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import onlyWarn from 'eslint-plugin-only-warn';

export default [
    js.configs.recommended,
    eslintConfigPrettier,
    ...tseslint.configs.recommended,
    {
        plugins: {
            onlyWarn,
        },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-empty-object-type': 'warn',
            '@typescript-eslint/no-empty-interface': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-this-alias': 'off',
        },
    },
    {
        ignores: ['dist/**'],
    },
];
