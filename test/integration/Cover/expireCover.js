const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime, setEtherBalance } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;
const { MaxUint256 } = ethers.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

// [todo] remove if expireCover is no longer useful
//  enable with issue https://github.com/NexusMutual/smart-contracts/issues/387
describe.skip('expireCover', function () {
  const expireCoverFixture = {
    productId: 2, // ybETH
    coverAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days
    gracePeriod: 3600 * 24 * 30,
    amount: parseEther('10'),
    priceDenominator: 10000,
    coverId: 0,
    segmentId: 0,
    incidentId: 0,
    assessmentId: 0,
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
    await stakingPool.connect(staker).depositTo(
      stakingAmount,
      firstTrancheId,
      0, // new position
      AddressZero,
    );
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
      [{ poolId: '0', coverAmountInAsset: amount.toString(), allocationId: MaxUint256 }],
      {
        value: expectedPremium,
      },
    );
  }

  async function submitIncident({ yc, productId, period }) {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    const { gv } = this.contracts;
    const gvSigner = await ethers.getImpersonatedSigner(gv.address);
    await setEtherBalance(gvSigner.address, ethers.utils.parseEther('1'));

    await yc
      .connect(gvSigner)
      .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
  }

  it('expire a cover that had a claim paid out fully, cover tracking enabled before cover buy', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

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
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // fully paid cover
    await yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, amount, nonMember1.address, []);

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
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
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
    await submitIncident({ yc, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // fully paid cover
    await yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, amount, nonMember1.address, []);

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

  it('expire a cover that had a partial claim paid out, cover tracking enabled before cover buy', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

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
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // partial paid cover
    const claimAmount = amount.div(2);
    await yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, claimAmount, nonMember1.address, []);

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
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
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
    await submitIncident({ yc, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybETH.connect(coverBuyer1).approve(yc.address, parseEther('10000'));

    // partial paid cover
    const claimAmount = amount.div(2);
    await yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, claimAmount, nonMember1.address, []);

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
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // partial paid cover
    const claimAmount = amount.div(2);
    await yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, claimAmount, nonMember1.address, []);

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
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

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
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ yc, productId, period });

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));
    await as.connect(staker2).castVotes([assessmentId], [false], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, parseEther('1'), nonMember1.address, []),
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
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { emergencyAdmin } = this.accounts;

    const { productId, coverAsset, period, gracePeriod, coverId, segmentId, incidentId, assessmentId } =
      expireCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...expireCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
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
    await submitIncident({ yc, productId, period });

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));
    await as.connect(staker2).castVotes([assessmentId], [false], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, parseEther('1'), nonMember1.address, []),
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
