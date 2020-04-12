const { ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { contract } = require('@openzeppelin/test-environment');

const accounts = require('../utils/accounts');
const { ParamType, Role } = require('../utils/constants');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenMock = contract.fromArtifact('TokenMock');

const {
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose,
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

async function stake (deployedContracts, stakers) {

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

const setupFor = async (amount, gasLimit = undefined) => {

  const deployedContracts = await setup();
  const { staking, master } = deployedContracts;
  const stakers = generalPurpose.slice(0, amount);

  for (const staker of stakers) {
    await master.enrollMember(staker, Role.Member);
  }

  await stake(deployedContracts, stakers);
  await reward(deployedContracts);

  if (gasLimit) {
    await staking.updateParameter(ParamType.REWARD_CYCLE_GAS_LIMIT, gasLimit, { from: governanceContract });
  }

  return deployedContracts;
};

const measure = async (staking, gas) => {

  const result = await staking.processPendingActions({ gas });
  const { gasUsed } = result.receipt;
  const finished = !!result.logs[0].args[0];

  return { gasUsed, finished };
};

const setupAndMeasure = async (amount, { gas, gasLimit } = {}) => {
  const { staking } = await setupFor(amount, gasLimit);
  return measure(staking, gas);
};

describe.only('gas checks', function () {

  this.timeout(0);

  it('basic measurements', async function () {

    let previous = 0;

    for (let i = 1; i <= 20; i++) {
      const { gasUsed, finished } = await setupAndMeasure(i);
      const run = i.toString().padStart(2, ' ');

      const diff = previous ? Math.abs(gasUsed - previous) : ' -- ';
      previous = gasUsed;

      const gas = `${gasUsed}`.padStart(8, ' ');
      console.log(`[${finished ? 'o' : 'x'}] stakers ${run}, gas ${gas}, diff ${diff}`);
    }

  });

  it('segment measurements', async function () {
    const { gasUsed: fulltx } = await setupAndMeasure(1);
    const { gasUsed: first } = await setupAndMeasure(3);
    const { gasUsed: second } = await setupAndMeasure(4);

    const loopCost = second - first;
    const costs = [];

    costs.push({ title: 'one loop', value: loopCost });
    costs.push({ title: 'full tx', value: fulltx });

    // set high gas limit to force short branch
    const million = 1000000;
    const { staking } = await setupFor(4, million);

    for (let i = 0; i < 4; i++) {
      const [{ gasUsed, finished }, error] = await to(measure(staking, million));
      assert(error === null, `#${i} should not error out`);
      const shouldFinish = i === 3;
      assert(shouldFinish === finished, 'first should take the short path and not finish');
      costs.push({ title: `cycle #${i + 1}`, value: gasUsed });
    }

    costs.map(({ title, value }) => console.log(`${title.padEnd(10, ' ')}  ${value}`));
  });

  it.only('test chosen gas value', async function () {

    async function runTests (gasLimit) {

      const gasAmounts = [100000, 150000, 200000, 1000000];
      const iterationAmounts = [1, 2, 3, 20];
      const oogError = 'Returned error: VM Exception while processing transaction: out of gas';

      console.log(`\n [i] Cycle gas limit: ${gasLimit}`);

      for (const gas of gasAmounts) {

        console.log(` [i] Gas: ${gas}`);

        for (const iterations of iterationAmounts) {

          const { staking } = await setupFor(iterations, gasLimit);
          let finished = false;
          let counter = 0;

          while (!finished) {

            counter++;
            const [result, error] = await to(measure(staking, gas));

            if (error && error.message === oogError) {
              console.log(` [x] Out of gas error! gas = ${gas}, stakers = ${iterations}`);
            }

            if (error) {
              throw error;
            }

            finished = result.finished;
          }

          console.log(`     - ${iterations} iterations finished in ${counter} calls`);
        }

        await to(setupAndMeasure(2, { gas, gasLimit }));
        await to(setupAndMeasure(3, { gas, gasLimit }));
        await to(setupAndMeasure(4, { gas, gasLimit }));
      }
    }

    let gasLimit = 35000;

    while (true) {
      const [, error] = await to(runTests(gasLimit));

      if (!error) {
        break;
      }

      gasLimit += 1000;
    }

    console.log(`\n [!] Minimum gasLimit = ${gasLimit} [!]\n`);
  });

});
