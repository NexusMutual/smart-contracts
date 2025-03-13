const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;
const { MaxUint256 } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { acceptClaim } = require('../utils/voteClaim');
const { setNextBlockTime, mineNextBlock, setEtherBalance } = require('../../utils/evm');
const { stake } = require('../utils/staking');
const { buyCover, ETH_ASSET_ID } = require('../utils/cover');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { setNextBlockBaseFee } = require('../utils').evm;

const newEthCoverTemplate = {
  productId: 0, // DEFAULT_PRODUCT
  coverAsset: ETH_ASSET_ID, // ETH
  period: daysToSeconds(30), // 30 days
  gracePeriod: daysToSeconds(90),
  amount: parseEther('100'),
  priceDenominator: 10000,
  coverId: 0,
  segmentId: 0,
  incidentId: 0,
  assessmentId: 0,
};

const ratioScale = BigNumber.from(10000);

const increaseTime = async interval => {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
  const timestamp = currentTime + interval;
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function updateMCRSetup() {
  const fixture = await loadFixture(setup);
  const { tk, stakingPool1: stakingPool, tc, mcr } = fixture.contracts;
  const [member1] = fixture.accounts.members;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000000'));
  await setEtherBalance(member1.address, parseEther('1000000'));

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));
  await tk.connect(member1).approve(tc.address, MaxUint256);
  await stake({
    contracts: fixture.contracts,
    stakingPool,
    staker: member1,
    productId: newEthCoverTemplate.productId,
    period: daysToSeconds(187),
    gracePeriod: daysToSeconds(90),
    amount: parseEther('10000000000'),
  });
  await stake({
    contracts: fixture.contracts,
    stakingPool,
    staker: member1,
    productId: 2,
    period: daysToSeconds(187),
    gracePeriod: daysToSeconds(90),
    amount: parseEther('10000000000'),
  });
  expect(await mcr.getTotalActiveCoverAmount()).to.be.equal(0);

  return fixture;
}

describe('updateMCR', function () {
  it('buyNXM does not trigger updateMCR if minUpdateTime has not passed', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    const { mcr, ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const buyValue = parseEther('1000');
    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 3600;
    await ra.connect(member).swap('0', '0', deadline, { value: buyValue });
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    expect(lastUpdateTimeAfter).to.be.equal(lastUpdateTimeBefore);
  });

  it('sellNXM does not trigger updateMCR if minUpdateTime has not passed', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    const { mcr, ra, tk } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 3600;
    const sellAmount = parseEther('1');
    await tk.connect(member).approve(ra.address, sellAmount);

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await ra.connect(member).swap(sellAmount, '0', deadline);
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    expect(lastUpdateTimeAfter).to.be.equal(lastUpdateTimeBefore);
  });

  it('buyNXM triggers updateMCR if minUpdateTime passes, decreases desiredMCR', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    const { ra, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const buyValue = parseEther('1000');

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await increaseTime(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 3600;
    await ra.connect(member).swap('0', '0', deadline, { value: buyValue });

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const desireMCRAfter = await mcr.desiredMCR();

    expect(lastUpdateTimeBefore).to.be.lt(lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    expect(desireMCRAfter).to.be.lt(
      desireMCRBefore,
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('sellNXM triggers updateMCR if minUpdateTime passes, decreases desiredMCR', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    const { ra, tk, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await increaseTime(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 3600;
    const sellAmount = parseEther('1');
    await tk.connect(member).approve(ra.address, sellAmount);
    await ra.connect(member).swap(sellAmount, '0', deadline);

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const desireMCRAfter = await mcr.desiredMCR();

    expect(lastUpdateTimeBefore).to.be.lt(lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    expect(desireMCRAfter).to.be.lt(
      desireMCRBefore,
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('decreases desiredMCR (0 sumAssured) if minUpdateTime has passed', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    const { mcr } = fixture.contracts;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await increaseTime(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();

    await mcr.updateMCR();
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const desireMCRAfter = await mcr.desiredMCR();

    expect(lastUpdateTimeBefore).to.be.lt(lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    expect(desireMCRAfter).to.be.lt(
      desireMCRBefore,
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('increases desiredMCR', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    const { mcr, cover } = fixture.contracts;

    const [coverHolder] = fixture.accounts.members;

    const coverAmount = parseEther('1');

    // buy cover
    const newCoverBuyParams = {
      ...newEthCoverTemplate,
      amount: coverAmount,
      cover,
      coverBuyer: coverHolder,
      targetPrice: fixture.DEFAULT_PRODUCTS[0].targetPrice,
      expectedPremium: parseEther('100000'),
    };
    await buyCover({
      ...newCoverBuyParams,
    });

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await increaseTime(await mcr.minUpdateTime());
    await mcr.updateMCR();

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    const desireMCRAfter = await mcr.desiredMCR();
    const gearingFactor = await mcr.gearingFactor();
    const getTotalActiveCoverAmount = await mcr.getTotalActiveCoverAmount();

    const expectedDesiredMCR = getTotalActiveCoverAmount.mul(ratioScale).div(gearingFactor);

    expect(lastUpdateTimeBefore).to.be.lt(lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    expect(desireMCRAfter).to.be.equal(expectedDesiredMCR);
  });

  it('claim payout triggers updateMCR and sets desiredMCR to mcrFloor (sumAssured = 0)', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    // [todo] test with new contracts that call sendPayout
    const { mcr, ci: claims, as, cover } = fixture.contracts;
    const [coverHolder, member1] = fixture.accounts.members;

    const gearingFactor = BigNumber.from(await mcr.gearingFactor());
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);

    // buy cover
    const newCoverBuyParams = {
      ...newEthCoverTemplate,
      amount: coverAmount,
      cover,
      coverBuyer: coverHolder,
      targetPrice: 100,
      expectedPremium: parseEther('1'),
    };
    const expectedCoverId = 1;
    await buyCover({
      ...newCoverBuyParams,
    });

    const coverId = await cover.getCoverDataCount();
    const coverData = await cover.getCoverData(coverId);

    // Update MCR
    await increaseTime(await mcr.minUpdateTime());
    await mcr.updateMCR();
    // Claim for full amount and accept it
    await claims.connect(coverHolder).submitClaim(expectedCoverId, coverData.amount, '', { value: parseEther('100') });
    const assessmentId = 0;
    const claimId = 0;
    const assessmentStakingAmount = parseEther('1000');

    await acceptClaim({ staker: member1, assessmentStakingAmount, as, assessmentId });

    // Burn tokens and update MCR
    await claims.connect(coverHolder).redeemClaimPayout(claimId);

    const { timestamp: expectedUpdateTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTime = await mcr.lastUpdateTime();
    const desiredMCR = await mcr.desiredMCR();

    expect(desiredMCR).to.be.equal(0);
    expect(lastUpdateTime).to.be.equal(expectedUpdateTime);
  });

  // TODO: refactor tokenYieldIncident
  it.skip('incidents.redeemPayout triggers updateMCR', async function () {
    const fixture = await loadFixture(updateMCRSetup);
    // [todo] test with new contracts that call sendPayout
    const { ybETH, dai, as, cover, cg, gv, mcr } = fixture.contracts;
    const [coverHolder] = fixture.accounts.members;

    // buy cover
    const newCoverBuyParams = {
      ...newEthCoverTemplate,
      productId: 2,
      coverAsset: ETH_ASSET_ID,
      amount: 20,
      cover,
      coverBuyer: coverHolder,
      targetPrice: 100,
      expectedPremium: parseEther('1'),
    };
    await dai.mint(coverHolder.address, parseEther('100000'));
    await dai.connect(coverHolder).approve(cover.address, MaxUint256);
    await buyCover({
      ...newCoverBuyParams,
    });

    // submit incident
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      const gvSigner = await ethers.getImpersonatedSigner(gv.address);
      await setEtherBalance(gvSigner.address, ethers.utils.parseEther('1'));
      await cg
        .connect(gvSigner)
        .submitIncident(
          newCoverBuyParams.productId,
          fixture.DEFAULT_PRODUCTS[0].targetPrice,
          currentTime + newCoverBuyParams.period / 2,
          parseEther('100'),
          '',
        );
    }

    // accept incident
    await as.connect(coverHolder).castVotes([0], [true], ['Assessment data hash'], parseEther('100'));

    // advance past payout cooldown
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
    const { end } = await as.getPoll(0);
    await increaseTime(end - currentTime + payoutCooldown);

    const priceBefore = parseEther('2.5'); // ETH per ybETH
    const sumAssured = parseEther('1').mul(newCoverBuyParams.amount);

    // sumAssured DAI = tokenAmount ybETH @ priceBefore
    // 500 ETH  /  2 ETH/ybETH  =  1000 ybETH
    const tokenAmount = parseEther('1').mul(sumAssured).div(priceBefore);
    await ybETH.mint(coverHolder.address, parseEther('1000000000'));
    await ybETH.connect(coverHolder).approve(cg.address, MaxUint256);
    const coverId = 1;
    const incidentId = 0;

    // Redeem payout
    // gas price set to 0 so we can know the payout exactly
    await setNextBlockBaseFee(0);
    await cg
      .connect(coverHolder)
      .redeemPayout(incidentId, coverId, 0 /* segmentId */, tokenAmount, coverHolder.address, [], { gasPrice: 0 });
    const block = await ethers.provider.getBlock('latest');
    const expectedUpdateTime = block.timestamp;
    const lastUpdateTime = await mcr.lastUpdateTime();
    expect(lastUpdateTime).to.be.equal(expectedUpdateTime);
  });
});
