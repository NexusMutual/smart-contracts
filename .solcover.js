module.exports = {
  skipFiles: ['external', 'EventCaller.sol', 'dummyDaiFeed.sol', 'mocks'],
  providerOptions: {
    default_balance_ether: 10000000000, // Extra zero, coverage consumes more gas
    network_id: 5777,
    mnemonic:
      'grocery obvious wire insane limit weather parade parrot patrol stock blast ivory',
    total_accounts: 30
  }
};
