const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime, setEtherBalance } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

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

async function totalActiveCoverSetup() {
  const fixture = await loadFixture(setup);
  const { tk, stakingProducts, stakingPool1 } = fixture.contracts;
  const { stakingPoolManagers } = fixture.accounts;

  const members = fixture.accounts.members.slice(0, 5);
  const amount = parseEther('10000');
  for (const member of members) {
    await tk.connect(fixture.accounts.defaultSender).transfer(member.address, amount);
  }

  await stakingProducts
    .connect(stakingPoolManagers[0])
    .setProducts(await stakingPool1.getPoolId(), [stakedProductParamTemplate]);

  return fixture;
}

// TODO: needs refactor without yeildTokenIncident
describe.skip('totalActiveCover', function () {
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

  async function transferYieldToken({ tokenOwner, coverBuyer1, ybETH, cg }) {
    await ybETH.connect(tokenOwner).transfer(coverBuyer1.address, parseEther('100'));
    await ybETH.connect(coverBuyer1).approve(cg.address, parseEther('100'));
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
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );
  }

  async function submitIncident({ gv, cg, productId, period }) {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    const gvSigner = await ethers.getImpersonatedSigner(gv.address);
    await setEtherBalance(gvSigner.address, ethers.utils.parseEther('1'));

    await cg
      .connect(gvSigner)
      .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
  }

  it('expire a cover that had a claim paid out fully', async function () {
    const fixture = await loadFixture(totalActiveCoverSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { cover, stakingProducts, stakingPool1, as, cg, gv, ybETH } = fixture.contracts;
    const [coverBuyer1, staker1] = fixture.accounts.members;
    const [nonMember1] = fixture.accounts.nonMembers;
    const { BUCKET_SIZE } = fixture.config;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      buyCoverFixture;

    expect(await stakingProducts.stakingPool(1)).to.be.equal(stakingPool1.address);

    // Stake to open up capacity
    await stake({ contracts: fixture.contracts, stakingPool: stakingPool1, staker: staker1, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: fixture.accounts.defaultSender, coverBuyer1, cg, ybETH });

    // Buy Cover
    await buyCover({
      ...buyCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ gv, cg, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + payoutCooldown);
    }

    // fully paid cover
    await cg.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, amount, nonMember1.address, []);

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(BUCKET_SIZE.add(period).add(currentTime).toNumber());
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);
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
      const segment = await cover.coverSegmentWithRemainingAmount(coverId + 1, segmentId);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segment.amount);
    }
  });

  it('expire a cover that had a partial claim paid out', async function () {
    const fixture = await loadFixture(totalActiveCoverSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { cover, stakingPool1, as, cg, gv, ybETH } = fixture.contracts;
    const [coverBuyer1, staker1] = fixture.accounts.members;
    const [nonMember1] = fixture.accounts.nonMembers;

    const { productId, coverAsset, period, gracePeriod, amount, coverId, segmentId, incidentId, assessmentId } =
      buyCoverFixture;

    // Stake to open up capacity
    await stake({ contracts: fixture.contracts, stakingPool: stakingPool1, staker: staker1, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: fixture.accounts.defaultSender, coverBuyer1, cg, ybETH });

    // Buy Cover
    await buyCover({
      ...buyCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ gv, cg, productId, period });

    // accept incident
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + payoutCooldown);
    }

    // partial paid cover
    const claimAmount = amount.div(2);
    // const segmentBeforeBurn = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);

    await cg.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, claimAmount, nonMember1.address, []);

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
      const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);
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
      const segment = await cover.coverSegmentWithRemainingAmount(coverId + 1, segmentId);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segment.amount);
    }
  });

  it('expire a cover that had rejected claim', async function () {
    const fixture = await loadFixture(totalActiveCoverSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { cover, stakingPool1, as, cg, gv, ybETH } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;
    const [nonMember1] = fixture.accounts.nonMembers;

    const { productId, coverAsset, period, gracePeriod, coverId, segmentId, incidentId, assessmentId } =
      buyCoverFixture;

    // Stake to open up capacity
    await stake({ contracts: fixture.contracts, stakingPool: stakingPool1, staker: staker1, period, gracePeriod });

    // cover buyer gets yield token
    await transferYieldToken({ tokenOwner: fixture.accounts.defaultSender, coverBuyer1, cg, ybETH });

    // Buy Cover
    await buyCover({
      ...buyCoverFixture,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      cover,
      coverBuyer1,
    });

    // submit incident
    await submitIncident({ gv, cg, productId, period });

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([assessmentId], [true], ['Assessment data hash'], parseEther('100'));
    await as.connect(staker2).castVotes([assessmentId], [false], ['Assessment data hash'], parseEther('100'));

    {
      // advance past payout cooldown
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();

      const { end } = await as.getPoll(assessmentId);
      await setTime(end + payoutCooldown);
    }

    await expect(
      cg.connect(coverBuyer1).redeemPayout(incidentId, coverId, segmentId, parseEther('1'), nonMember1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    {
      // advance past expire time
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(BUCKET_SIZE.add(period).add(currentTime).toNumber());
    }

    // Verify that the cover period is over
    const { timestamp } = await ethers.provider.getBlock('latest');
    const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);
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
      const segment = await cover.coverSegmentWithRemainingAmount(coverId + 1, segmentId);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(segment.amount);
    }
  });
});
