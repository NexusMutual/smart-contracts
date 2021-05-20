const { accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;

const { enrollMember } = require('../utils/enroll');
const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;

const [, member1, member2, member3, member4, member5, coverHolder] = accounts;

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

const ratioScale = toBN(10000);

describe('getMCR', function () {

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

  it('increases mcr towards by 0.4% in 2 hours and then decreases by 0.4% in 2 hours it after cover expiry', async function () {
    const { mcr, qt: quotation } = this.contracts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor.mul(currentMCR.add(ether('300'))).div(ether('1')).div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    await buyCover({ ...this.contracts, cover, coverHolder });
    const expectedCoverId = 1;

    await time.increase(await mcr.minUpdateTime());
    await mcr.updateMCR();

    {
      const passedTime = time.duration.hours(2);
      await time.increase(passedTime);

      const storedMCR = await mcr.mcr();
      const latestMCR = await mcr.getMCR();

      const maxMCRIncrement = await mcr.maxMCRIncrement();
      const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));

      const expectedMCR = storedMCR.mul(expectedPercentageIncrease).divn(10000).add(storedMCR);
      assert.equal(latestMCR.toString(), expectedMCR.toString());
    }

    await time.increase(time.duration.days(cover.period));

    await quotation.expireCover(expectedCoverId);
    await mcr.updateMCR();

    {
      const passedTime = time.duration.hours(2);
      await time.increase(passedTime);

      const storedMCR = await mcr.mcr();
      const latestMCR = await mcr.getMCR();

      const maxMCRIncrement = await mcr.maxMCRIncrement();
      const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));

      const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageIncrease).divn(10000));
      assert.equal(latestMCR.toString(), expectedMCR.toString());
    }
  });
});
