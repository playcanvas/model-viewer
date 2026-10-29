import reactConfig from '@playcanvas/eslint-config/react';
import typescriptConfig from '@playcanvas/eslint-config/typescript';

export default [
    ...typescriptConfig,
    ...reactConfig,
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    }
];
