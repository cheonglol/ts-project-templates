module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [ // Enforce specific commit types
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert'
      ]
    ],
    'subject-full-stop': [ // Disallow full stop at the end of the subject
      2,
      'never',
      '.'
    ],
    'body-max-line-length': [ // Maximum line length for the body
      2,
      'always',
      100
    ],
    'footer-max-line-length': [ // Maximum line length for the footer
      2,
      'always',
      100
    ]
  }
};