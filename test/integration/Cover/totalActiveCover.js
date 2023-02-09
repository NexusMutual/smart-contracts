const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime, setEtherBalance } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const stakedProductParamTemplate = {
  productId: 2,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const buyCoverFixture = {
  productId: 2, // ybETH
  coverAsset: 0, // ETH
  period: daysToSeconds(30), // 30 days
  gracePeriod: daysToSeconds(30),
  amount: parseEther('10'),
  priceDenominator: 10000,
  coverId: 1,
  segmentId: 0,
  incidentId: 0,
  assessmentId: 0,
};

describe('totalActiveCover', function () {
  beforeEach(async function () {
    const { tk, stakingProducts, stakingPool0 } = this.contracts;
    const { stakingPoolManagers } = this.accounts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }

    await stakingProducts
      .connect(stakingPoolManagers[0])
      .setProducts(await stakingPool0.getPoolId(), [stakedProductParamTemplate]);
  });

  function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
    return Math.floor((lastBlock.timestamp + period + gracePeriod) / daysToSeconds(91));
  }

  async function stake({ stakingPool, staker, period, gracePeriod }) {
    // Staking inputs
    const stakingAmount = parseEther('6000');
    const lastBlock = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

    // Stake to open up capacity
    await stakingPool.connect(staker).depositTo(stakingAmount, firstTrancheId, 0, AddressZero);
    await stakingPool.connect(staker).depositTo(stakingAmount, firstTrancheId + 1, 0, AddressZero);
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
        coverId: 0,
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
      [{ poolId: 0, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );
  }

  async function submitIncident({ gv, yc, productId, period }) {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    const gvSigner = await ethers.getImpersonatedSigner(gv.address);
    await setEtherBalance(gvSigner.address, ethers.utils.parseEther('1'));

    await yc
      .connect(gvSigner)
      .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
  }

  it('expire a cover that had a claim paid out fully', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, stakingPool0, as, yc, gv, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const { BUCKET_SIZE } = this.config;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      buyCoverFixture;

    expect(await cover.stakingPool(0)).to.be.equal(stakingPool0.address);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...buyCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period });

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
      await setTime(BUCKET_SIZE.add(period).add(currentTime).toNumber());
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.period + segment.start).to.be.lt(timestamp);

      // Doesn't expire until buyCover/burnStake is called
      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }
    {
      const buyFixture = { ...buyCoverFixture, amount: parseEther('17') };
      await buyCover({
        ...buyFixture,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        cover,
        coverBuyer1,
      });
      const segment = await cover.coverSegments(coverId + 1, segmentId);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segment.amount);
    }
  });

  it('expire a cover that had a partial claim paid out', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { BUCKET_SIZE } = this.config;
    const { cover, stakingPool0, as, yc, gv, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      buyCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...buyCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period });

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
    // const segmentBeforeBurn = await cover.coverSegments(coverId, segmentId);

    await yc.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, claimAmount, nonMember1.address, []);

    // TODO: convert claim amount to cover asset
    // expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segmentBeforeBurn.amount.sub(claimAmount));

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(BUCKET_SIZE.add(period).add(currentTime).toNumber());
    }

    {
      // Verify that the cover period is over
      const { timestamp } = await ethers.provider.getBlock('latest');
      const segment = await cover.coverSegments(coverId, segmentId);
      expect(segment.period + segment.start).to.be.lt(timestamp);

      // Doesn't expire until buyCover/burnStake is called
      const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
      expect(activeCoverAmount).to.be.equal(segment.amount);
    }
    {
      const buyFixture = { ...buyCoverFixture, amount: parseEther('17') };
      await buyCover({
        ...buyFixture,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        cover,
        coverBuyer1,
      });
      const segment = await cover.coverSegments(coverId + 1, segmentId);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segment.amount);
    }
  });

  it('expire a cover that had rejected claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { BUCKET_SIZE } = this.config;
    const { cover, stakingPool0, as, yc, gv, ybETH } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const { productId, coverAsset, period, gracePeriod, coverId, segmentId, incidentId, assessmentId } =
      buyCoverFixture;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: this.accounts.defaultSender, coverBuyer1, yc, ybETH });

    // Buy Cover
    await buyCover({
      ...buyCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ gv, yc, productId, period });

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
      await setTime(BUCKET_SIZE.add(period).add(currentTime).toNumber());
    }

    // Verify that the cover period is over
    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment = await cover.coverSegments(coverId, segmentId);
    expect(segment.period + segment.start).to.be.lt(timestamp);

    // Doesn't explicitly expire until buyCover/burnStake is called
    const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
    expect(activeCoverAmount).to.be.equal(segment.amount);

    {
      const buyFixture = { ...buyCoverFixture, amount: parseEther('6') };
      await buyCover({
        ...buyFixture,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        cover,
        coverBuyer1,
      });
      const segment = await cover.coverSegments(coverId + 1, segmentId);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segment.amount);
    }
  });
});
