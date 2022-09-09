module.exports = {
  skipFiles: [
    'mocks/',
    'abstract/',
    'interfaces/',
    'external/',
    'utils/',
    'modules/legacy',
    'modules/token/external',
    'modules/governance/external',
    'monitoring',
  ],
  providerOptions: {
    default_balance_ether: 100000000,
  },
};
