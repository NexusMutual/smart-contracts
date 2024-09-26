module.exports = {
  parserPreset: 'conventional-changelog-conventionalcommits',
  prompt: {
    questions: {
      body: {
        description: 'Provide a longer description of the change.',
      },
      breaking: {
        description: 'Describe the breaking changes.',
      },
      breakingBody: {
        description:
          'A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself.',
      },
      isBreaking: {
        description: 'Are there any breaking changes?',
      },
      isIssueAffected: {
        description: 'Does this change affect any open issues?',
      },
      issues: {
        description: 'Add issue references (e.g. "fix #123", "re #123".).',
      },
      issuesBody: {
        description:
          'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself.',
      },
      scope: {
        description: 'What is the scope of this change (e.g. component or file name)?',
      },
      subject: {
        description: 'Write a short, imperative tense description of the change.',
      },
      type: {
        description: "Select the type of change that you're committing",
        enum: {
          breaking: {
            description: 'Breaking change',
            emoji: '✨',
            title: 'Breaking',
          },
          build: {
            description:
              'Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)',
            emoji: '🛠',
            title: 'Builds',
          },
          chore: {
            description: "Other changes that don't modify src or test files",
            emoji: '♻️',
            title: 'Chores',
          },
          ci: {
            description:
              // eslint-disable-next-line max-len
              'Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)',
            emoji: '⚙️',
            title: 'Continuous Integrations',
          },
          docs: {
            description: 'Documentation only changes',
            emoji: '📚',
            title: 'Documentation',
          },
          feat: {
            description: 'A new feature',
            emoji: '✨',
            title: 'Features',
          },
          fix: {
            description: 'A bug fix',
            emoji: '🐛',
            title: 'Bug Fixes',
          },
          perf: {
            description: 'A code change that improves performance',
            emoji: '🚀',
            title: 'Performance Improvements',
          },
          refactor: {
            description: 'A code change that neither fixes a bug nor adds a feature',
            emoji: '📦',
            title: 'Code Refactoring',
          },
          revert: {
            description: 'Reverts a previous commit',
            emoji: '🗑',
            title: 'Reverts',
          },
          style: {
            description:
              'Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)',
            emoji: '💎',
            title: 'Styles',
          },
          test: {
            description: 'Adding missing tests or correcting existing tests',
            emoji: '🚨',
            title: 'Tests',
          },
        },
      },
    },
  },
  rules: {
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],
    'footer-max-line-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 100],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'type-enum': [
      2,
      'always',
      ['build', 'breaking', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'],
    ],
  },
};
