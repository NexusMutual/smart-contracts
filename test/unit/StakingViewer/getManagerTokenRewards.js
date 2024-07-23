const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');
const { calculateCurrentTrancheId } = require('../utils').stakingPool;

describe('getManagerTokenRewardsByAddr', function () {
  it('getManagerTokenRewardsByAddr should return the correct rewards for the manager', async function () {
    const fixture = await loadFixture(setup);
    const [manager] = fixture.accounts.members;
    const { stakingViewer } = fixture.contracts;

    const [tokenReward] = await stakingViewer.getManagerTokenRewardsByAddr(manager.address);

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
  });
});
