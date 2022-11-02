const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('expireCover', function () {
  const expireCoverFixture = {
    productId: 2, // ybETH
    coverAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days
    gracePeriod: 3600 * 24 * 30,
    amount: parseEther('10'),
    priceDenominator: 10000,
    coverId: 0,
    segmentId: 0,
  };

  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
    return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
  }

  async function stake({ stakingPool, staker, productId, period, gracePeriod }) {
    // Staking inputs
    const stakingAmount = parseEther('6000');
    const lastBlock = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

    // Stake to open up capacity
    await stakingPool.connect(staker).depositTo([
      {
        amount: stakingAmount,
        trancheId: firstTrancheId,
        tokenId: 1, // new position
        destination: AddressZero,
      },
    ]);
    await stakingPool.setTargetWeight(productId, 10);
  }

  async function transferYieldToken({ tokenOwner, coverBuyer1, ybETH, yc }) {
    await ybETH.connect(tokenOwner).transfer(coverBuyer1.address, parseEther('100'));
    await ybETH.connect(coverBuyer1).approve(yc.address, parseEther('100'));
  }

  async function buyCover({
    amount,
    targetPrice,
    priceDenominator,
    productId,
    coverAsset,
    period,
    cover,
    coverBuyer1,
  }) {
    const expectedPremium = amount.mul(targetPrice).div(priceDenominator);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );
  }

  async function submitIncident({ yc, productId, period, signer }) {
    // submit incident
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    await yc
      .connect(signer)
      .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
  }

  it('expire a cover that had a claim paid out fully', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // enable active cover tracking
    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // fully paid cover
    await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, amount, nonMember1.address, []);

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });

  it('expire a cover that had a claim paid out fully, cover tracking enabled after cover buy', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    {
      const segment = await cover.coverSegments(coverId, segmentId);

      // NOTE: the active cover amount for the cover asset has to be correctly set, otherwise it will cause
      // underflow on redeemPayout and expireCover when updating totalActiveCoverInAsset
      await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([coverAsset], [segment.amount]);
    }

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // fully paid cover
    await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, amount, nonMember1.address, []);

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });

  it('expire a cover that had a partial claim paid out', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // enable active cover tracking
    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // partial paid cover
    const claimAmount = amount.div(2);
    await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, claimAmount, nonMember1.address, []);

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });

  it('expire a cover that had a partial claim paid out, cover tracking enabled after cover buy', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    {
      const segment = await cover.coverSegments(coverId, segmentId);

      // NOTE: the active cover amount for the cover asset has to be correctly set, otherwise it will cause
      // underflow on redeemPayout and expireCover when updating totalActiveCoverInAsset
      await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([coverAsset], [segment.amount]);
    }

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybETH.connect(coverBuyer1).approve(yc.address, parseEther('10000'));

    // partial paid cover
    const claimAmount = amount.div(2);
    await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, claimAmount, nonMember1.address, []);

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });

  it('expire a cover that had a partial claim paid out, cover tracking enabled after payout', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // partial paid cover
    const claimAmount = amount.div(2);
    await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, claimAmount, nonMember1.address, []);

    {
      const segment = await cover.coverSegments(coverId, segmentId);

      // NOTE: the active cover amount for the cover asset has to be correctly set, otherwise it will cause
      // underflow on redeemPayout and expireCover when updating totalActiveCoverInAsset
      await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([coverAsset], [segment.amount]);
    }

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });

  it('expire a cover that had rejected claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // enable active cover tracking
    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));
    await as.connect(staker2).castVotes([0], [false], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1'), nonMember1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });

  it('expire a cover that had rejected claim, cover tracking enabled after cover buy', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, coverId, segmentId } = expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice,
      cover,
      coverBuyer1,
    });

    {
      const segment = await cover.coverSegments(coverId, segmentId);

      // NOTE: the active cover amount for the cover asset has to be correctly set, otherwise it will cause
      // underflow on expireCover when updating totalActiveCoverInAsset
      await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([coverAsset], [segment.amount]);
    }

    // submit incident
    await submitIncident({ yc, productId, period, signer: this.accounts.defaultSender });

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));
    await as.connect(staker2).castVotes([0], [false], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1'), nonMember1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + period + 1);
    }

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(false);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }

    await cover.expireCover(coverId);

    {
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.expired).to.be.equal(true);

      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(0);
    }
  });
});
