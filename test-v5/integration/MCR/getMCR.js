const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setNextBlockTime, mineNextBlock, setEtherBalance } = require('../../utils/evm');
const { BigNumber } = require('ethers');
const { parseEther } = ethers.utils;
const { MaxUint256 } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { stake } = require('../utils/staking');
const { buyCover, ETH_ASSET_ID } = require('../utils/cover');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const increaseTime = async interval => {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
  const timestamp = currentTime + interval;
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const ratioScale = BigNumber.from(10000);

const ethCoverTemplate = {
  productId: 0, // DEFAULT_PRODUCT
  coverAsset: ETH_ASSET_ID, // ETH
  period: daysToSeconds(30), // 30 days
  gracePeriod: daysToSeconds(30),
  amount: parseEther('1'),
  priceDenominator: 10000,
  coverId: 0,
  segmentId: 0,
  incidentId: 0,
  assessmentId: 0,
};

async function getMCRSetup() {
  const fixture = await loadFixture(setup);
  const { tk, dai, stakingPool1: stakingPool, tc, mcr, cover } = fixture.contracts;
  const [member1] = fixture.accounts.members;
  const [nonMember1] = fixture.accounts.nonMembers;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000000'));

  for (const daiHolder of [member1, nonMember1]) {
    // mint  tokens
    await dai.mint(daiHolder.address, parseEther('1000000000000'));

    // approve token controller and cover
    await dai.connect(daiHolder).approve(cover.address, MaxUint256);
  }

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));
  await tk.connect(member1).approve(tc.address, MaxUint256);
  await stake({
    contracts: fixture.contracts,
    stakingPool,
    staker: member1,
    productId: ethCoverTemplate.productId,
    period: daysToSeconds(60),
    gracePeriod: daysToSeconds(30),
    amount: parseEther('1000000'),
  });

  expect(await mcr.getTotalActiveCoverAmount()).to.be.equal(0);

  return fixture;
}

describe('getMCR', function () {
  it('returns current MCR value when desiredMCR = mcr', async function () {
    const fixture = await loadFixture(getMCRSetup);
    const { mcr } = fixture.contracts;

    const storageMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    expect(currentMCR.toString()).to.be.equal(storageMCR);
  });

  it.skip('increases mcr by 0.4% in 2 hours and decreases by 0.4% in 2 hours it after cover expiry', async function () {
    const fixture = await loadFixture(getMCRSetup);
    const { mcr, cover } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;

    const gearingFactor = BigNumber.from(await mcr.gearingFactor());
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor.mul(currentMCR.add(parseEther('300'))).div(ratioScale);

    await buyCover({
      ...ethCoverTemplate,
      cover,
      expectedPremium: coverAmount,
      amount: coverAmount,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });

    await increaseTime(await mcr.minUpdateTime());
    await mcr.updateMCR();

    {
      const passedTime = 2 * 3600; // 2 hours
      await increaseTime(passedTime);

      const storedMCR = await mcr.mcr();
      const latestMCR = await mcr.getMCR();

      const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());
      const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));

      const expectedMCR = storedMCR.mul(expectedPercentageIncrease).div(10000).add(storedMCR);
      expect(latestMCR).to.be.equal(expectedMCR);
    }

    // expire cover and update mcr (must buy new cover to reduce totalActiveCoverInAsset)
    await increaseTime(ethCoverTemplate.period);
    await buyCover({
      ...ethCoverTemplate,
      cover,
      expectedPremium: coverAmount,
      amount: 1,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });
    await mcr.updateMCR();

    {
      const passedTime = 2 * 3600;
      await increaseTime(passedTime);

      const storedMCR = await mcr.mcr();
      const latestMCR = await mcr.getMCR();

      const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());
      const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));

      expect(storedMCR).to.not.be.equal(latestMCR);
      const expectedMCR = storedMCR.add(storedMCR.mul(expectedPercentageIncrease).div(10000));

      // TODO: assertion is off
      expect(latestMCR).to.be.equal(expectedMCR);
    }
  });
});
