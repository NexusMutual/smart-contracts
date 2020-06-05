let node = {
  gasLimit: 8e6, // Maximum gas per block
}

if (process.env.TEST_ENV_FORK) {
  console.log(`Forking from ${process.env.TEST_ENV_FORK}`);
  node.fork = process.env.TEST_ENV_FORK;
  // current board members
  node.unlocked_accounts = [ '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
    '0x10c9FD785D6AE23D90Bf70358Cb3e6F3E8C3759C',
    '0xdb5b7477503ed92B803d9dCEa82ea1E3Fa091160',
    '0x8D38C81B7bE9Dbe7440D66B92d4EF529806baAE7',
    '0x23E1B127Fd62A4dbe64cC30Bb30FFfBfd71BcFc6' ];
}

module.exports = {

  accounts: {
    amount: 100, // Number of unlocked accounts
    ether: 1000000, // Initial balance of unlocked accounts (in ether)
  },

  contracts: {
    type: 'truffle', // Contract abstraction to use: 'truffle' for @truffle/contract or 'web3' for web3-eth-contract
    // defaultGas: 2e6, // Maximum gas for contract calls (when unspecified)

    // Options available since v0.1.2
    // defaultGasPrice: 20e9, // Gas price for contract calls (when unspecified)
    artifactsDir: 'build/contracts', // Directory where contract artifacts are stored
  },
  node,
};
