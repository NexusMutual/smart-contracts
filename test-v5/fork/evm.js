const { ethers } = require('hardhat');

// https://hardhat.org/hardhat-network/docs/reference
// https://tenderlydev.notion.site/Custom-RPC-API-83a89eae23524faa9853371c21088173

const { BigNumber } = ethers;
const { hexValue } = ethers.utils;

// this hex function produces evm-compatible hex strings:
// - strips leading zeroes (0x01 -> 0x1)
// - keeps one zero if the value is zero (0x00 -> 0x0)
const hex = n => hexValue(BigNumber.from(n));

const methods = {
  common: send => ({
    snapshot: async () => send('evm_snapshot', []),
    revert: async snapshotId => send('evm_revert', [snapshotId]),
    mine: async () => send('evm_mine', []),
  }),

  hardhat: send => ({
    impersonate: async address => send('hardhat_impersonateAccount', [address]),
    // NOTE: sets next block timestamp. this WILL NOT MINE a block!
    increaseTime: async timestamp => send('evm_increaseTime', [timestamp]),
    mine: async (blocks = 1) => send('hardhat_mine', [hex(blocks)]),
    setBalance: async (address, wei) => send('hardhat_setBalance', [address, hex(wei)]),
    setCode: async (address, code) => send('hardhat_setCode', [address, code]),
    setNonce: async (address, nonce) => send('hardhat_setNonce', [address, hex(nonce)]),
    setStorageAt: async (address, slot, value) => send('hardhat_setStorageAt', [address, slot, hex(value)]),
    setNextBlockBaseFee: async fee => send('hardhat_setNextBlockBaseFeePerGas', [hex(fee)]),
  }),

  tenderly: send => ({
    // on tenderly all accounts are impersonated by default
    impersonate: () => {},
    // NOTE: this WILL MINE a block with a specific timestamp
    increaseTime: async timestamp => send('evm_increaseTime', [timestamp]),
    mine: async (blocks = 1) => send('evm_increaseBlocks', [hex(blocks)]),
    setBalance: async (address, wei) => send('tenderly_setBalance', [address, hex(wei)]),
    setCode: () => notImplemented(),
    setNonce: () => notImplemented(),
    setStorageAt: async (address, slot, value) => send('tenderly_setStorageAt', [address, slot, hex(value)]),
    // the cheatcode doesn't exist on tenderly but we can just set `gasPrice: 0` and it works
    setNextBlockBaseFee: () => {},
  }),
};

const notImplemented = () => {
  throw new Error('Not implemented due to missing documentation');
};

const factory = () => {
  const evm = {};

  const connect = async provider => {
    const tests = [
      { name: 'hardhat', regex: /HardhatNetwork/ },
      { name: 'tenderly', regex: /Tenderly/ },
    ];

    // find node type
    const clientVersion = await provider.send('web3_clientVersion');
    const test = tests.find(test => test.regex.test(clientVersion));
    const { name: node = 'unknown' } = test;

    // cleanup evm object
    Object.keys(evm).forEach(key => delete evm[key]);

    Object.assign(
      evm, // target
      methods.common(provider.send.bind(provider)),
      methods[node](provider.send.bind(provider)),
      { provider, connect },
    );
  };

  Object.assign(evm, { connect });

  return evm;
};

module.exports = factory;
