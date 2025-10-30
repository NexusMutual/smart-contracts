module.exports = {
  rules: {
    'imports-on-top': 'error',
    'naming-convention': [
      'error',
      [
        {
          selector: 'stateVariable',
          format: ['UPPER_CASE', 'camelCase'],
          modifiers: ['constant'],
        },
        {
          selector: 'stateVariable',
          format: ['UPPER_CASE', 'camelCase'],
          modifiers: ['immutable'],
        },
      ],
    ],
    'no-console': 'error',
    'no-default-visibility': 'error',
    'no-duplicate-imports': 'error',
    'no-uninitialized-immutable-references': 'error',
    'no-unused-vars': ['error', { ignorePattern: '^__unused_' }],
    'sort-imports': 'error',
  },
  ignores: ['contracts/mocks/**/*.sol'],
};
