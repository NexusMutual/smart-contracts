const { accounts, web3,
  ethers
} = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;
const { parseEther } = ethers.utils;
const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;

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
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('returns current MCR value when desiredMCR = mcr', async function () {
    const { mcr } = this.contracts;

    const storageMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    expect(currentMCR.toString()).to.be.equal(storageMCR);
  });

  // [todo]: enable with issue https://github.com/NexusMutual/smart-contracts/issues/387
  it.skip('increases mcr by 0.4% in 2 hours and then decreases by 0.4% in 2 hours it after cover expiry', async function () {
    const { mcr, qt: quotation } = this.contracts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);
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
