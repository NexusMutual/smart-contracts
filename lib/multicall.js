const { ethers } = require('ethers');

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

// See multicall3.com
const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

/* eslint-disable max-len */
const multicallAbi = [
  'function aggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)',
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
  'function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
  'function blockAndAggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes32 blockHash, tuple(bool success, bytes returnData)[] returnData)',
  'function getBasefee() view returns (uint256 basefee)',
  'function getBlockHash(uint256 blockNumber) view returns (bytes32 blockHash)',
  'function getBlockNumber() view returns (uint256 blockNumber)',
  'function getChainId() view returns (uint256 chainid)',
  'function getCurrentBlockCoinbase() view returns (address coinbase)',
  'function getCurrentBlockDifficulty() view returns (uint256 difficulty)',
  'function getCurrentBlockGasLimit() view returns (uint256 gaslimit)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
  'function getLastBlockHash() view returns (bytes32 blockHash)',
  'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
  'function tryBlockAndAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes32 blockHash, tuple(bool success, bytes returnData)[] returnData)',
];
/* eslint-enable max-len */

const multicall = async (calls, provider, batchSize = 200) => {
  const multicall = new ethers.Contract(multicall3Address, multicallAbi, provider);
  const inputs = [...calls];
  const outputs = [];
  let processed = 0;

  while (inputs.length > 0) {
    const batch = inputs.splice(0, batchSize);
    const { returnData } = await multicall.aggregate.staticCall(batch);
    outputs.push(...returnData);
    process.stdout.write(`\rProcessed ${(processed += batch.length)}/${calls.length} calls`);
  }

  process.stdout.write('\n');

  return outputs;
};

const encodeWithSelector = (fragment, params) => {
  const data = abiCoder.encode(fragment.inputs, params);
  return ethers.concat([fragment.selector, data]);
};

const decodeResult = (fragment, data) => abiCoder.decode(fragment.outputs, data);

module.exports = { multicall, encodeWithSelector, decodeResult };
