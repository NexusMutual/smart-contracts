const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getTranches, TRANCHE_DURATION } = require('./helpers');
const { setEtherBalance, increaseTime } = require('../../utils/evm');
const { daysToSeconds } = require('../../../lib/helpers');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('updateTranches', function () {
  const depositToFixture = {
    poolId: 0,
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    productInitializationParams: [
      {
        productId: 0,
        weight: 100,
        initialPrice: 500,
        targetPrice: 500,
      },
    ],
    amount: parseEther('100'),
    trancheId: 0,
    tokenId: 0,
    destination: AddressZero,
    depositNftId: 1,
    ipfsDescriptionHash: 'Description Hash',
  };

  beforeEach(async function () {
    const { stakingPool, cover } = this;
    const { defaultSender: manager } = this.accounts;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = depositToFixture;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));
    this.coverSigner = coverSigner;

    await stakingPool
      .connect(coverSigner)
      .initialize(
        manager.address,
        false,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        poolId,
        ipfsDescriptionHash,
      );
  });

  it('expires tranche with no previous updates', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(daysToSeconds(0), daysToSeconds(0));

    // Deposit. In this internal call to updateTranches _rewardsSharesSupply is 0
    // so it only updates lastAccNxmUpdate and return
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    // increase time to expire the first active tranche
    await increaseTime(TRANCHE_DURATION);

    await expect(stakingPool.updateTranches(true));

    const expiredTranche = await stakingPool.expiredTranches(firstActiveTrancheId);
    expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(0);
    expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount);
    expect(expiredTranche.stakeShareSupplyAtExpiry).to.equal(Math.sqrt(amount));
  });

  it('does not revert when expires multiple tranches', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(daysToSeconds('0'), daysToSeconds('0'));

    // deposit
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    // increase time to expire a couple of tranches
    await increaseTime(TRANCHE_DURATION * 2);

    await expect(stakingPool.updateTranches(true)).to.not.reverted;
  });
});
