module.exports = {
  skipFiles: [
    'mocks/',
    'abstract/',
    'interfaces/',
    'external/',
    'modules/token/external',
    'modules/governance/external',
  ],
  providerOptions: {
    default_balance_ether: 100000000,
  },
};
