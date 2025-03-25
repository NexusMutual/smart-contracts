const { ethers } = require('hardhat');
const Addresses = require('../deployments/src/addresses.json');
const { assert, expect } = require('chai');

const { Cover } = Addresses;
const { BigNumber } = ethers;
const { AddressZero } = ethers.constants;
const { keccak256, parseEther } = ethers.utils;

const bnToZeroPaddedHex = n => '0x' + BigNumber.from(n).toHexString().replace('0x', '').padStart(64, '0');
const hex = n =>
  BigNumber.from(n)
    .toHexString()
    .replace(/^0x[0]+/, '0x');

const deployBlock = 16792244;

const getEvents = async poolId => {
  const cover = await ethers.getContractAt('Cover', Cover);
  const stakingPoolAddress = await cover.stakingPool(poolId);
  const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);

  const topic0 = [
    stakingPool.interface.getEventTopic('StakeDeposited'),
    stakingPool.interface.getEventTopic('DepositExtended'),
    stakingPool.interface.getEventTopic('Withdraw'),
  ];

  const filter = {
    address: stakingPoolAddress,
    topics: [topic0],
  };

  const events = await stakingPool.queryFilter(filter, deployBlock);
  console.log(`Fetched ${events.length} events for pool ${poolId}`);

  return events;
};

const simulateTx = async (poolAddress, tx, blockNumber, stateOverrides, blockOverrides) => {
  const params = [tx, blockNumber, stateOverrides, blockOverrides];
  const result = await ethers.provider.send('tenderly_simulateTransaction', params);
  const { stateChanges } = result;
  console.log('result', result);
  return stateChanges.find(i => i.address === poolAddress.toLowerCase()).storage;
};

const deployStakingPool = async () => {
  const { StakingNFT, NXMToken, Cover, TokenController, NXMaster, StakingProducts } = Addresses;
  const StakingPoolFactory = await ethers.getContractFactory('StakingPool');

  const args = [StakingNFT, NXMToken, Cover, TokenController, NXMaster, StakingProducts];
  const { data: input } = StakingPoolFactory.getDeployTransaction(...args);
  const tx = { from: AddressZero, input };

  const { trace } = await ethers.provider.send('tenderly_simulateTransaction', [tx, 'latest', {}, {}]);
  const [create] = trace;

  return create.output;
};

const getManagerDepositSlots = () => {
  const pos = bnToZeroPaddedHex(9);
  const outerMappingSlot = keccak256(bnToZeroPaddedHex(0) + pos.replace('0x', ''));
  const trancheIds = new Array(22).fill(0).map((_, i) => 212 + i);

  const innerMappingSlots = trancheIds.flatMap(trancheId => {
    const slot = keccak256(bnToZeroPaddedHex(trancheId) + outerMappingSlot.replace('0x', ''));
    // const nextSlot = BigNumber.from(slot).add(1).toHexString();
    // return [slot, nextSlot];
    return [slot];
  });

  return innerMappingSlots;
};

const processPool = async (poolId, code) => {
  const cover = await ethers.getContractAt('Cover', Cover);
  const stakingPoolAddress = (await cover.stakingPool(poolId)).toLowerCase();
  const events = await getEvents(poolId);
  const blockTxes = {};
  const managerSlots = getManagerDepositSlots();
  console.log('managerSlots', managerSlots);

  for (const event of events) {
    const { blockNumber, transactionHash } = event;
    blockTxes[blockNumber] = (blockTxes[blockNumber] || new Set()).add(transactionHash);
  }

  for (const [blockNumber, txs] of Object.entries(blockTxes)) {
    assert(txs.size <= 1, `Multiple txs in block ${blockNumber}`);
  }

  const [_unusedAction, ...actions] = Object.entries(blockTxes)
    .map(([blockNumber, [txHash]]) => ({ blockNumber, txHash }))
    .sort((a, b) => a.blockNumber - b.blockNumber);

  // slot => value
  let stateDiff = {};

  for (const action of actions) {
    const { blockNumber, txHash } = action;
    const { timestamp } = await ethers.provider.getBlock(hex(blockNumber));
    const { data: input, from, to } = await ethers.provider.getTransaction(txHash);

    const tx = { from, to, input };
    const simulationBlock = hex(blockNumber - 1);
    const blockOverrides = { block: hex(blockNumber), timestamp: hex(timestamp) };

    // console.log('simulationBlock', simulationBlock);
    console.log('stateOverrides', { [stakingPoolAddress]: { stateDiff } });
    // console.log('blockOverrides', blockOverrides);
    console.log('tx', tx);
    console.log('txHash', txHash);
    console.log('blockNumber', blockNumber);
    console.log('date', new Date(timestamp * 1000).toISOString());

    const originalChanges = await simulateTx(
      stakingPoolAddress,
      tx,
      simulationBlock,
      { [stakingPoolAddress]: { stateDiff } },
      blockOverrides,
    );

    const patchedChanges = await simulateTx(
      stakingPoolAddress,
      tx,
      simulationBlock,
      { [stakingPoolAddress]: { stateDiff, code } },
      blockOverrides,
    );

    const originalChangesManagerSlots = originalChanges.filter(({ slot }) => managerSlots.includes(slot));
    const patchedChangesManagerSlots = patchedChanges.filter(({ slot }) => managerSlots.includes(slot));

    console.log('originalChangesManagerSlots', originalChangesManagerSlots);
    console.log('patchedChangesManagerSlots', patchedChangesManagerSlots);

    expect(originalChangesManagerSlots).to.deep.equal(patchedChangesManagerSlots);

    const persistedChanges = patchedChanges
      .filter(({ slot }) => managerSlots.includes(slot))
      .map(({ slot, newValue }) => [slot, newValue]);

    const diff = Object.fromEntries(persistedChanges);
    console.log('diff', diff);
    stateDiff = { ...stateDiff, ...diff };
  }

  return actions;
};

async function main() {
  const stakingPoolCode = await deployStakingPool();
  const poolIds = [2, 24];

  for (const poolId of poolIds) {
    await processPool(poolId, stakingPoolCode);
  }

  process.exit(0);

  for (const event of events) {
    const { data: input, blockNumber } = event;
    const { tokenId, amount, trancheId } = args;
    const { previousValue, newValue } = stateChanges[trancheId];
  }

  const slot = '0x92e85d02570a8092d09a6e3a57665bc3815a2699a4074001bf1ccabf660f5a36';
  const original = BigNumber.from('0x0000000000000b41000000000000000000000000000002b19379dc52e64c595c');
  const replaced = original.sub(parseEther('1000'));

  const overrides = {
    [Cover]: {
      stateDiff: {
        [slot]: bnToZeroPaddedHex(replaced),
      },
    },
  };

  const blockNumber = 17678418;
  await simulateTx(cover, poolId, blockNumber, overrides);

  // const coverChanges = stateChanges.find(i => i.address === Cover.toLowerCase()).storage;
  // const { previousValue, newValue } = coverChanges.find(i => i.slot === slot);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

// [ activeCover(uint256) method Response ]
// totalActiveCoverInAsset   uint192 :  12720433433830247651676
// lastBucketUpdateId   uint64 :  2881

/*
   [
    {
      "from": "0xe2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2",
      "to": "0x6b175474e89094c44da98b954eedeac495271d0f",
      "input": "0x40c10f19000000000000000000000000e58b9ee93700a616b50509c8292977fa7a0f8ce10000000000000000000000000000000000000000000000001bc16d674ec80000",
      "maxFeePerGas": "0x6d974775d",
      "maxPriorityFeePerGas": "0x3b9aca00",
      "accessList": [
        {
          "address": "0x1234567890abcdef1234567890abcdef12345678",
          "storageKeys": [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
          ]
        }
      ],
      "maxFeePerBlobGas": "0x12a05f200"
    },
    "latest",
    {
      "0xe2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2": {
        "balance": "0x3635c9adc5dea00000"
      },
      "0x6b175474e89094c44da98b954eedeac495271d0f": {
        "stateDiff": {
          "0xedd7d04419e9c48ceb6055956cbb4e2091ae310313a4d1fa7cbcfe7561616e03": "0x0000000000000000000000000000000000000000000000000000000000000001"
        },
        "balance": "0x8062461898512542557",
        "nonce": "0x1e91"
      }
    },
    {
      "number": "0x129d59a",
      "time": "0x18e7ac25d30",
      "gasLimit": "0x1c9c380",
      "baseFee": "0x6d974775d"
    }
  ]
   */
