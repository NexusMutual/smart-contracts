const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { contract } = require('@openzeppelin/test-environment');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType, Role } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [member],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose,
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';
const fourthContract = '0x0000000000000000000000000000000000000004';

async function enrollStakers (master, members) {
  for (const member of members) {
    await master.enrollMember(member, Role.Member);
  }
}

async function stake (token, staking, amount, contracts, allocations, member) {
  const maxLeverage = '10';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
  await staking.stake(amount, contracts, allocations, { from: member });
}

describe.only('gas checks', function () {

  this.timeout(5000);
  this.slow(2000);

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.stake(ether('1'), [], [], { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('process burn', async function () {
    const { staking, token } = this;

    const allocations = ['1', '3', '2'].map(ether);
    const contracts = [firstContract, secondContract, thirdContract];
    await stake(token, staking, ether('3'), contracts, allocations, member);

    await staking.pushBurn(firstContract, ether('0.5'), { from: internalContract });
    const timestamp = await time.latest();
    const burnCount = await staking.burnCount();
    const firstBurn = await staking.firstBurn();
    const burn = await staking.burns(firstBurn);

    assert.strictEqual(burnCount.toString(), '1');

    // Check set burn values
    assert.strictEqual(burn.amount.toString(), ether('0.5').toString());
    assert.strictEqual(burn.burnedAt.toString(), timestamp.toString());
    assert.strictEqual(burn.contractAddress, firstContract);
    assert.strictEqual(burn.next.toString(), '0');
  });

  it('push reward and process it', async function () {
    const { staking, token } = this;

    const rewardAmount = ether('0.5');
    const stakeAmount = ether('3');
    const allocations = ['1', '3', '2'].map(ether);
    const contracts = [firstContract, secondContract, thirdContract];
    await stake(token, staking, stakeAmount, contracts, allocations, member);

    assert.strictEqual(await staking.hasPendingRewards(), false);
    assert.strictEqual(await staking.hasPendingActions(), false);

    // fund internal contract with reward value
    await token.transfer(internalContract, rewardAmount);

    // aprove staking contract to withdraw reward and push reward
    await token.approve(staking.address, rewardAmount, { from: internalContract });
    await staking.pushReward(firstContract, rewardAmount, internalContract, { from: internalContract });

    assert.strictEqual(await staking.hasPendingActions(), true);
    assert.strictEqual(await staking.hasPendingRewards(), true);

    const timestamp = await time.latest();
    const rewardCount = await staking.rewardCount();
    assert.strictEqual(rewardCount.toString(), '1');

    // fetch reward
    const firstRewardIndex = await staking.firstReward();
    const reward = await staking.rewards(firstRewardIndex);

    // check reward values
    assert.strictEqual(reward.amount.toString(), rewardAmount.toString());
    assert.strictEqual(reward.rewardedAt.toString(), timestamp.toString());
    assert.strictEqual(reward.contractAddress, firstContract);
    assert.strictEqual(reward.next.toString(), '0');

    // process pending reward
    await staking.processPendingActions();

    assert.strictEqual(await staking.hasPendingActions(), false);
    assert.strictEqual(await staking.hasPendingRewards(), false);

    const newFirstRewardIndex = await staking.firstReward();
    const nullReward = await staking.rewards(newFirstRewardIndex);

    // reward should be "null"
    assert.strictEqual(newFirstRewardIndex.toString(), '0');
    assert.strictEqual(nullReward.amount.toString(), '0');
    assert.strictEqual(nullReward.rewardedAt.toString(), '0');
    assert.strictEqual(nullReward.contractAddress, '0x0000000000000000000000000000000000000000');
    assert.strictEqual(nullReward.next.toString(), '0');

    const staker = await staking.stakers(member);
    assert.strictEqual(staker.reward.toString(), rewardAmount.toString());
  });

  it('pushes reward and processes it for 10 users', async function () {

    this.timeout(10000);
    this.slow(5000);

    const { master, staking, token } = this;
    const stakers = generalPurpose.slice(0, 10);
    const rewardAmount = ether('50');

    await enrollStakers(master, stakers);

    const initialContractInfo = await staking.contracts(secondContract);
    assert.strictEqual(initialContractInfo.staked.toString(), '0');

    const stakeAmounts = ['15', '25', '50'].map(ether);
    const possibleAllocations = [
      ['2', '3', '2'].map(ether),
      ['4', '6', '5'].map(ether),
      ['9', '8', '7'].map(ether),
    ];

    const possibleContracts = [
      [firstContract, secondContract, thirdContract], //  1, 2, 3
      [firstContract, secondContract, fourthContract], // 1, 2, 4
      [firstContract, thirdContract, fourthContract], //  1, 3, 4
    ];

    await enrollStakers(master, stakers);
    const expectedStake = ether('0');

    for (const i in stakers) {
      const member = stakers[i];
      const stakeAmount = stakeAmounts[i % 3];
      const allocations = possibleAllocations[i % 3];
      const contracts = possibleContracts[i % 3];
      await stake(token, staking, stakeAmount, contracts, allocations, member);

      const contractIndex = contracts.indexOf(secondContract);

      if (contractIndex === -1) {
        continue;
      }

      const allocation = allocations[contractIndex];
      expectedStake.iadd(allocation);
    }

    const contract = await staking.contracts(secondContract);
    assert(expectedStake.eq(contract.staked));

    // fund, approve, reward
    await token.transfer(internalContract, rewardAmount);
    await token.approve(staking.address, rewardAmount, { from: internalContract });
    await staking.pushReward(secondContract, rewardAmount, internalContract, { from: internalContract });

    // process pending reward
    await staking.processPendingActions();

    for (const i in stakers) {
      const member = stakers[i];
      const allocations = possibleAllocations[i % 3];
      const contracts = possibleContracts[i % 3];

      const staker = await staking.stakers(member);
      const contractIndex = contracts.indexOf(secondContract);

      if (contractIndex === -1) {
        assert.strictEqual(staker.reward.toString(), '0');
        continue;
      }

      const allocation = allocations[contractIndex];
      const expectedReward = allocation.mul(rewardAmount).div(expectedStake);

      assert(expectedReward.eq(staker.reward));
    }

    // withdraw rewards
    const staker = await staking.stakers(stakers[0]);
    const reward = staker.reward;

    await staking.withdrawReward(stakers[0], reward, { from: stakers[0] });
  });

});
