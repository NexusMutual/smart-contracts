const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { withdrawNXMSetup } = require('./setup');
const { MaxUint256 } = ethers;

const TRANCHE_DURATION_SECONDS = 91 * 24 * 60 * 60;

describe('withdrawNXM', function () {
  let fixture;
  let tokenController;

  beforeEach(async function () {
    fixture = await loadFixture(withdrawNXMSetup);
    tokenController = fixture.contracts.tokenController;
  });

  it('should handle empty arrays correctly', async function () {
    // Get a manager account
    const [manager] = fixture.accounts.stakingPoolManagers;

    const stakingPoolDeposits = [];
    const stakingPoolManagerRewards = [];

    await expect(tokenController.connect(manager).withdrawNXM(stakingPoolDeposits, stakingPoolManagerRewards)).to.not.be
      .reverted;
  });

  it('should revert when called by non-staking pool manager', async function () {
    const [nonManager] = fixture.accounts.members;

    const stakingPoolDeposits = [{ tokenId: 999, trancheIds: [1] }];
    const stakingPoolManagerRewards = [];

    await expect(
      tokenController.connect(nonManager).withdrawNXM(stakingPoolDeposits, stakingPoolManagerRewards),
    ).to.be.revertedWithCustomError(fixture.contracts.stakingNFT, 'NotMinted');
  });

  it('should handle both staking pool deposits and manager rewards', async function () {
    const { stakingPool1, token, tokenController, stakingViewer } = fixture.contracts;
    const { stakingPoolManagerRewards } = fixture;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await token.balanceOf(manager.address);
    const [tokenId] = fixture.tokenIds; // StakingPool1 stake tokenId

    await time.increase(TRANCHE_DURATION_SECONDS * 7);
    await stakingPool1.processExpirations(true);

    const [tokenBefore] = await stakingViewer.getTokens([tokenId]);
    expect(tokenBefore.expiredStake).to.equal(fixture.stakeAmount);

    const stakingPoolDeposits = [{ tokenId, trancheIds: [fixture.trancheId] }]; // StakingPool1 deposits

    await token.connect(manager).approve(tokenController, MaxUint256);
    await tokenController.connect(manager).withdrawNXM(stakingPoolDeposits, stakingPoolManagerRewards);

    const [tokenAfter] = await stakingViewer.getTokens([tokenId]);
    const balanceAfter = await token.balanceOf(manager.address);

    expect(balanceAfter).to.equal(balanceBefore + tokenBefore.expiredStake + tokenBefore.rewards);
    expect(tokenAfter.expiredStake.toString()).to.equal('0');
  });
});
