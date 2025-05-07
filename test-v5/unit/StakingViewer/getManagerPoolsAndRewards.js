const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');
const { calculateCurrentTrancheId } = require('../utils').stakingPool;

describe('getManagerPoolsAndRewards', function () {
  it('getManagerPoolsAndRewards should return the managed pools and rewards for the manager', async function () {
    const fixture = await loadFixture(setup);
    const [manager] = fixture.accounts.members;
    const { stakingViewer } = fixture.contracts;
    const { stakedNxmAmount } = fixture.stakingPool;

    const { pools, rewards, totalRewards } = await stakingViewer.getManagerPoolsAndRewards(manager.address);

    // pools
    const [managedStakingPool] = pools;
    expect(managedStakingPool.poolId.toString()).to.equal('1');
    expect(managedStakingPool.isPrivatePool).to.equal(false);
    expect(managedStakingPool.manager).to.equal(manager.address);
    expect(managedStakingPool.poolFee.toString()).to.equal('5');
    expect(managedStakingPool.maxPoolFee.toString()).to.equal('5');
    expect(managedStakingPool.activeStake).to.equal(stakedNxmAmount);
    expect(managedStakingPool.currentAPY.toString()).to.equal('0');

    // rewards
    const [tokenReward] = rewards;
    expect(tokenReward.tokenId.toString()).to.equal('0');
    expect(tokenReward.poolId.toString()).to.equal('1');
    expect(tokenReward.activeStake.toString()).to.equal('0');
    expect(tokenReward.expiredStake.toString()).to.equal('0');
    expect(tokenReward.rewards.toString()).to.equal('0');

    const expectedTrancheId = await calculateCurrentTrancheId();
    tokenReward.deposits.forEach(deposit => {
      expect(deposit.tokenId.toString()).to.equal('0');
      expect(deposit.stake.toString()).to.equal('0');
      expect(deposit.trancheId.toString()).to.equal(expectedTrancheId.toString());
      expect(deposit.stakeShares.toString()).to.equal('0');
      expect(deposit.reward.toString()).to.equal('0');
    });

    expect(totalRewards.toString()).to.equal('0');
  });
});
