const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const Decimal = require('decimal.js');
const { toBN } = web3.utils;

const {
  calculateEthForNXMRelativeError,
  calculateNXMForEthRelativeError,
  calculateMCRRatio,
  getTokenSpotPrice,
} = require('../utils').tokenPrice;

const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;

const [, member1, member2, member3, member4, member5, coverHolder, nonMember1, payoutAddress] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '3000000000000000', // 0.003 eth
  priceNXM: '1000000000000000000', // 1 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 30,
  contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
};

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ratioScale = toBN(10000);

describe.only('getMCR', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);

    await enrollMember(this.contracts, [member4], {
      initialTokens: ether('1000'),
    });

    await enrollMember(this.contracts, [member5], {
      initialTokens: ether('500'),
    });
  });

  it('returns current MCR value when desiredMCR = mcr', async function () {
    const { mcr } = this.contracts;

    const storageMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    assert.equal(currentMCR.toString(), storageMCR.toString());
  });

  it.only('increases mcr towards by 0.4% after 2 hours', async function () {
    const { p1: pool, mcr } = this.contracts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor.mul(currentMCR.add(ether('300'))).div(ether('1')).div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    await buyCover({ ...this.contracts, cover, coverHolder });

    await time.increase(await mcr.minUpdateTime());
    await mcr.updateMCR();

    const desireMCR = await mcr.desiredMCR();
    console.log({
      desireMCR: desireMCR.toString(),
    });

    const passedTime = time.duration.hours(2);
    await time.increase(passedTime);

    const storedMCR = await mcr.mcr();
    const latestMCR = await mcr.getMCR();

    const maxMCRIncrement = await mcr.maxMCRIncrement();
    const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));

    const expectedMCR = storedMCR.mul(expectedPercentageIncrease).divn(10000).add(storedMCR);
    assert.equal(latestMCR.toString(), expectedMCR.toString());
  });
});
