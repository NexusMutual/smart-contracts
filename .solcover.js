module.exports = {
  skipFiles: [
    'abstract/',
    'external/',
    'interfaces/',
    'mocks/',
    'modules/assessment/AssessmentViews.sol',
    'modules/cover/CoverViewer.sol',
    'modules/cover/ProductsV1.sol',
    'modules/governance/external',
    'modules/legacy',
    'modules/token/external',
    'utils/',
  ],
  providerOptions: {
    default_balance_ether: 100000000,
  },
};
