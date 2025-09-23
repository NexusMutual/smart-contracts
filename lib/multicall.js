// const { ethers } = require('hardhat');
const hre = require('hardhat');

const { ethers } = hre;

console.log('hre:', hre);
console.log('ethers:', ethers);

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

// See multicall3.com
const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

const multicall = async (calls, batchSize = 200) => {
  const multicall = await ethers.getContractAt('IMulticall3', multicall3Address);
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
