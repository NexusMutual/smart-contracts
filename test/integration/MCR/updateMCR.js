const { accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;

const { enrollMember } = require('../utils/enroll');
const { buyCover } = require('../utils/buyCover');
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

describe('updateMCR', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);

    await enrollMember(this.contracts, [member4], {
      initialTokens: ether('1000'),
    });

    await enrollMember(this.contracts, [member5], {
      initialTokens: ether('500'),
    });
  });

  it('buyNXM does not trigger updateMCR if minUpdateTime has not passed', async function () {
    const { p1: pool, mcr } = this.contracts;

    const buyValue = ether('1000');
    const member = member1;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await pool.buyNXM('0', { from: member, value: buyValue });
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    assert.equal(lastUpdateTimeAfter.toString(), lastUpdateTimeBefore.toString());
  });

  it('sellNXM does not trigger updateMCR if minUpdateTime has not passed', async function () {
    const { p1: pool, mcr } = this.contracts;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await pool.sellNXM('0', '0', { from: member1, gasPrice: 0 });
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    assert.equal(lastUpdateTimeAfter.toString(), lastUpdateTimeBefore.toString());
  });

  it('buyNXM triggers updateMCR if minUpdateTime has passed, increases mcrFloor and decreases desiredMCR', async function () {
    const { p1: pool, mcr } = this.contracts;

    const buyValue = ether('1000');
    const member = member1;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await time.increase(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();
    const mcrFloorBefore = await mcr.mcrFloor();

    const tx = await pool.buyNXM('0', { from: member, value: buyValue });

    const block = await web3.eth.getBlock(tx.receipt.blockNumber);
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();

    assert(lastUpdateTimeBefore.lt(lastUpdateTimeAfter));
    assert.equal(lastUpdateTimeAfter.toString(), block.timestamp.toString());
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    assert(
      desireMCRAfter.lt(desireMCRBefore),
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('sellNXM triggers updateMCR if minUpdateTime has passed, increases mcrFloor and decreases desiredMCR', async function () {
    const { p1: pool, mcr } = this.contracts;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await time.increase(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();
    const mcrFloorBefore = await mcr.mcrFloor();

    const tx = await pool.sellNXM('0', '0', { from: member1, gasPrice: 0 });
    const block = await web3.eth.getBlock(tx.receipt.blockNumber);
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();

    assert(lastUpdateTimeBefore.lt(lastUpdateTimeAfter));
    assert.equal(lastUpdateTimeAfter.toString(), block.timestamp.toString());
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    assert(
      desireMCRAfter.lt(desireMCRBefore),
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('increases mcrFloor and decreases desiredMCR (0 sumAssured) if minUpdateTime has passed', async function () {
    const { mcr } = this.contracts;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await time.increase(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();
    const mcrFloorBefore = await mcr.mcrFloor();

    const tx = await mcr.updateMCR();
    const block = await web3.eth.getBlock(tx.receipt.blockNumber);
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();

    assert(lastUpdateTimeBefore.lt(lastUpdateTimeAfter));
    assert.equal(lastUpdateTimeAfter.toString(), block.timestamp.toString());
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    assert(
      desireMCRAfter.lt(desireMCRBefore),
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('increases desiredMCR if totalSumAssured is high enough', async function () {
    const { mcr } = this.contracts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor.mul(currentMCR).add(ether('10')).div(ether('1')).div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    await buyCover({ ...this.contracts, cover, coverHolder });

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await time.increase(await mcr.minUpdateTime());

    const mcrFloorBefore = await mcr.mcrFloor();

    const tx = await mcr.updateMCR();
    const block = await web3.eth.getBlock(tx.receipt.blockNumber);
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();
    const expectedDesiredMCR = ether(coverAmount.toString()).div(gearingFactor).mul(ratioScale);

    assert(lastUpdateTimeBefore.lt(lastUpdateTimeAfter));
    assert.equal(lastUpdateTimeAfter.toString(), block.timestamp.toString());
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    assert.equal(desireMCRAfter.toString(), expectedDesiredMCR.toString());
  });

  it('increases desiredMCR if totalSumAssured is high enough and subsequently decreases to mcrFloor it when totalSumAssured falls to 0', async function () {
    const { mcr, qt: quotation } = this.contracts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor.mul(currentMCR).add(ether('10')).div(ether('1')).div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    await buyCover({ ...this.contracts, cover, coverHolder });
    const expectedCoverId = 1;

    await time.increase(await mcr.minUpdateTime());

    await mcr.updateMCR();

    await time.increase(time.duration.days(cover.period));

    await quotation.expireCover(expectedCoverId);

    await mcr.updateMCR();
    const mcrFloorAfter = await mcr.mcrFloor();

    const mcrAfterCoverExpiry = await mcr.desiredMCR();
    assert.equal(mcrAfterCoverExpiry.toString(), mcrFloorAfter.toString());
  });

  it('increases mcrFloor by 1% after 2 days pass', async function () {
    const { mcr } = this.contracts;

    const maxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();

    const previousMCRFloor = await mcr.mcrFloor();
    await time.increase(time.duration.days(2));
    await mcr.updateMCR();

    const currentMCRFloor = await mcr.mcrFloor();

    const expectedMCRFloor = previousMCRFloor.mul(ratioScale.add(maxMCRFloorIncrement)).divn(ratioScale);
    assert.equal(currentMCRFloor.toString(), expectedMCRFloor.toString());
  });
});
