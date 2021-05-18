module.exports = {
  skipFiles: [
    'mocks/',
    'abstract/',
    'interfaces/',
    'external/',
    'modules/token/external',
    'modules/governance/external',
  ],
  // Prevents these errors (probably because coverage is compiled without gas optimizations)
  // Error: Returned error: sender doesn't have enough funds to send tx. The upfront cost is: 8796093022200000000000 and the sender's account only has: 975594920000000000
  providerOptions: {
      default_balance_ether: 100000000,
  }
};
