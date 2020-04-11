const { ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { contract } = require('@openzeppelin/test-environment');

const accounts = require('../utils/accounts');
const { ParamType, Role } = require('../utils/constants');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenMock = contract.fromArtifact('TokenMock');

const {
  members: [memberOne, memberTwo, memberThree],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function setup () {

  const master = await MasterMock.new();
  const token = await TokenMock.new();
  const staking = await PooledStaking.new();

  await token.initialize();
  await staking.initialize(master.address, token.address);

  await master.enrollInternal(internalContract);
  await master.enrollGovernance(governanceContract);
  await staking.updateParameter(ParamType.MAX_LEVERAGE, '10', { from: governanceContract });

  return {
    master,
    token,
    staking,
  };
}

async function bringStakers (deployedContracts, stakers) {

  const { staking, token } = deployedContracts;
  const amount = ether('1');
  const contracts = [firstContract, secondContract, thirdContract];
  const allocations = [ether('1'), ether('1'), ether('1')];

  for (const staker of stakers) {
    await token.transfer(staker, amount); // fund staker account from default address
    await token.approve(staking.address, amount, { from: staker });
    await staking.stake(amount, contracts, allocations, { from: staker });
  }
}

const reward = async ({ staking, token }) => {
  const rewardAmount = ether('5');
  await token.transfer(internalContract, rewardAmount);
  await token.approve(staking.address, rewardAmount, { from: internalContract });
  await staking.pushReward(secondContract, rewardAmount, internalContract, { from: internalContract });
};

const printEvents = result => {
  result.logs.forEach(({ args }) => {
    console.log(`${args[0].toString()} -- ${args[1]}`);
  });
};

const to = promise =>
  new Promise(resolve => {
    promise
      .then(r => resolve([r, null]))
      .catch(e => resolve([null, e]));
  });

describe.only('gas checks', function () {

  this.timeout(0);

  it.only('calculate estimates for reward processing', async function () {

    let gasLimit = 0;
    let upper = 0;
    let lower = 0;
    let direction = '?';

    while (true) {

      if (upper && upper - lower < 50) {
        console.log(`Optimal gas limit for one reward cycle: ${upper}+`);
        return;
      }

      // setup
      const { master, staking, token } = await setup();
      const deployedContracts = { master, staking, token };
      await master.enrollMember(memberOne, Role.Member);
      await master.enrollMember(memberTwo, Role.Member);
      await master.enrollMember(memberThree, Role.Member);

      // calculate gas usage for a single staker
      if (gasLimit === 0) {

        console.log('[?] Test run for gas measurement');

        await bringStakers(deployedContracts, [memberOne, memberTwo]);
        await reward(deployedContracts);

        const testRun = await staking.processPendingActions();
        console.log(`[i] Consumed ${testRun.receipt.gasUsed}\n`);

        const testRunFinished = testRun.logs[0].args[0];
        assert(testRunFinished, 'Test run should process all items');

        gasLimit = Math.floor(testRun.receipt.gasUsed * 10);
        // gasLimit = 41263;
        upper = gasLimit;

        continue;
      }

      // divide et impera
      const middle = Math.floor((upper + lower) / 2);
      console.log(`[${direction}] Testing with reward cycle gas limit ${middle}`);

      await bringStakers(deployedContracts, [memberOne, memberTwo]);
      await reward(deployedContracts);

      await staking.updateParameter(ParamType.REWARD_CYCLE_GAS_LIMIT, middle, { from: governanceContract });

      const [firstResult] = await to(staking.processPendingActions({ gas: gasLimit }));
      const firstIndex = await staking.processedToStakerIndex();

      const [result, error] = await to(staking.processPendingActions({ gas: gasLimit }));
      const index = await staking.processedToStakerIndex();

      firstResult && console.log(`[o] 1 - gas used: ${firstResult.receipt.gasUsed}`);
      result && console.log(`[o] 2 - gas used: ${result.receipt.gasUsed}`);

      // console.log(`[i] firstIndex = ${firstIndex.toString()}, index = ${index.toString()}`);

      if (error) {
        assert.strictEqual(
          error.message,
          'Returned error: VM Exception while processing transaction: out of gas',
          'We encountered an unexpected error while calculating gas estimates!',
        );

        direction = '+';
        lower = middle;
        console.log('[x] Ran out of gas\n');
        continue;
      }

      // the first call shouldn't finish both actions
      const firstFinished = firstResult.logs[0].args[0];

      if (firstFinished) {
        gasLimit = firstResult.receipt.gasUsed - 1;
        console.log('[x] First finished both actions\n');
        continue;
      }

      const finished = result.logs[0].args[0];

      if (!finished) {
        direction = '-';
        upper = middle;
        console.log('[x] Second call did not process all the items\n');
        continue;
      }

      throw new Error('what should I do here?');

      if (result) {

        // the first call shouldn't finish both actions
        // const firstFinished = !!firstResult.logs[0].args[0];
        // assert(!firstFinished, 'Gas limit too high: first call processed all items');

        // the first call should process one and only one item
        // assert(firstIndex.toString() === '1', 'Gas limit too low: first call did not process any items');

        direction = '-';
        upper = middle;
        // console.log(`[o] Number of processed items: ${index.sub(firstIndex).toString()}`);
        console.log(`[o] Gas used: ${result.receipt.gasUsed}\n`);
      }
    }
  });

});
