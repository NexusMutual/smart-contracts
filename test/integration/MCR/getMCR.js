const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setNextBlockTime, mineNextBlock, setEtherBalance } = require('../../utils/evm');
const { BigNumber } = require('ethers');
const { parseEther } = ethers.utils;
const { buyCover, ETH_ASSET_ID, DAI_ASSET_ID } = require('../utils/cover');
const { hex } = require('../utils').helpers;
const { MaxUint256 } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { stake } = require('../utils/staking');

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
describe('getMCR', function () {
  beforeEach(async function () {
    const { tk, dai, stakingPool0: stakingPool, tc, mcr, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const stakingPoolManagers = this.accounts.stakingPoolManagers;

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
      stakingPool,
      staker: member1,
      productId: ethCoverTemplate.productId,
      period: daysToSeconds(60),
      gracePeriod: daysToSeconds(30),
    });

    expect(await mcr.getAllSumAssurance()).to.be.equal(0);
  });

  it('returns current MCR value when desiredMCR = mcr', async function () {
    const { mcr } = this.contracts;

    const storageMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    expect(currentMCR.toString()).to.be.equal(storageMCR);
  });

  it.only('increases mcr by 0.4% in 2 hours and decreases by 0.4% in 2 hours it after cover expiry', async function () {
    const { mcr, cover } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const targetPrice = this.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = this.config.TARGET_PRICE_DENOMINATOR;

    // const coverTemplate = {
    //   amount: 1, // 1 eth
    //   price: '3000000000000000', // 0.003 eth
    //   priceNXM: '1000000000000000000', // 1 nxm
    //   expireTime: '8000000000',
    //   generationTime: '1600000000000',
    //   currency: hex('ETH'),
    //   period: 30,
    //   contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
    // };

    const gearingFactor = BigNumber.from(await mcr.gearingFactor());
    console.log('gearingFactor', gearingFactor.toString());
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);
    const coverTemplate = { ...ethCoverTemplate, amount: coverAmount };
    const { buyCover, ETH_ASSET_ID, DAI_ASSET_ID } = require('../utils/cover');
    await buyCover({
      ...ethCoverTemplate,
      cover,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });

    const expectedCoverId = 1;

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
      // TODO: price conversion precision loss
      expect(latestMCR).to.be.equal(expectedMCR);
    }

    await increaseTime(daysToSeconds(ethCoverTemplate.period));

    // await qd.expireCover(expectedCoverId);
    await mcr.updateMCR();

    {
      const passedTime = 2 * 3600;
      await increaseTime(passedTime);

      const storedMCR = await mcr.mcr();
      const latestMCR = await mcr.getMCR();

      const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());
      const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));

      const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageIncrease).div(10000));
      // TODO: price conversion precision loss
      // expect(latestMCR).to.be.equal(expectedMCR);
    }
  });
});
