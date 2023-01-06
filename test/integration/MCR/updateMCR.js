const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;
const { MaxUint256 } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const {
  helpers: { hex },
} = require('../utils');
const { enrollClaimAssessor } = require('../utils/enroll');
const { buyCover } = require('../utils').buyCover;
const { addIncident } = require('../utils/incidents');
const { voteClaim } = require('../utils/voteClaim');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { stake } = require('../utils/staking');

const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');

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

const ratioScale = BigNumber.from(10000);

const increaseTime = async interval => {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
  const timestamp = currentTime + interval;
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('updateMCR', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('buyNXM does not trigger updateMCR if minUpdateTime has not passed', async function () {
    const { p1: pool, mcr } = this.contracts;
    const [member] = this.accounts.members;

    const buyValue = parseEther('1000');

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await pool.connect(member).buyNXM('0', { value: buyValue });
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    assert.equal(lastUpdateTimeAfter.toString(), lastUpdateTimeBefore.toString());
  });

  it('sellNXM does not trigger updateMCR if minUpdateTime has not passed', async function () {
    const { p1: pool, mcr } = this.contracts;
    const [member] = this.accounts.members;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await pool.connect(member).sellNXM('0', '0');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();

    assert.equal(lastUpdateTimeAfter.toString(), lastUpdateTimeBefore.toString());
  });

  it('buyNXM triggers updateMCR if minUpdateTime passes, increases mcrFloor, decreases desiredMCR', async function () {
    const { p1: pool, mcr } = this.contracts;
    const [member] = this.accounts.members;

    const buyValue = parseEther('1000');

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await increaseTime(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();
    const mcrFloorBefore = await mcr.mcrFloor();

    await pool.connect(member).buyNXM('0', { value: buyValue });

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();

    assert(lastUpdateTimeBefore < lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    assert(
      desireMCRAfter.lt(desireMCRBefore),
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  it('sellNXM triggers updateMCR if minUpdateTime passes, increases mcrFloor, decreases desiredMCR', async function () {
    const { p1: pool, mcr } = this.contracts;
    const [member] = this.accounts.members;

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();

    await increaseTime(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();
    const mcrFloorBefore = await mcr.mcrFloor();

    await pool.connect(member).sellNXM('0', '0');

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();

    assert(lastUpdateTimeBefore < lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
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

    await increaseTime(await mcr.minUpdateTime());

    const desireMCRBefore = await mcr.desiredMCR();
    const mcrFloorBefore = await mcr.mcrFloor();

    await mcr.updateMCR();
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();

    assert(lastUpdateTimeBefore < lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    assert(
      desireMCRAfter.lt(desireMCRBefore),
      `Desired MCR post update ${desireMCRAfter.toString()} is not less than before ${desireMCRBefore.toString()}`,
    );
  });

  // [todo] deal with test once active cover amount measurement is settled
  it.skip('increases desiredMCR if totalSumAssured is high enough', async function () {
    const { mcr, stakingPool0, cover } = this.contracts;

    const [coverHolder, staker1] = this.accounts.members;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = BigNumber.from(gearingFactor)
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = daysToSeconds(30);
    const gracePeriod = 3600 * 24 * 30;
    const amount = coverAmount;

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    const expectedPremium = parseEther('1');
    await cover.connect(coverHolder).buyCover(
      {
        coverId: MaxUint256,
        owner: coverHolder.address,
        productId,
        coverAsset: 0,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: ethers.constants.AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount, allocationId: MaxUint256 }],
      { value: expectedPremium },
    );

    const lastUpdateTimeBefore = await mcr.lastUpdateTime();
    await increaseTime(await mcr.minUpdateTime());

    const mcrFloorBefore = await mcr.mcrFloor();

    await mcr.updateMCR();
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const lastUpdateTimeAfter = await mcr.lastUpdateTime();
    const mcrFloorAfter = await mcr.mcrFloor();
    const desireMCRAfter = await mcr.desiredMCR();
    const expectedDesiredMCR = coverAmount.div(gearingFactor).mul(ratioScale);

    assert(lastUpdateTimeBefore < lastUpdateTimeAfter);
    expect(lastUpdateTimeAfter).to.be.equal(currentTime);
    assert(
      mcrFloorAfter.gt(mcrFloorBefore),
      `MCR floor post update ${mcrFloorAfter.toString()} is not greater than before ${mcrFloorBefore.toString()}`,
    );
    expect(desireMCRAfter).to.be.equal(expectedDesiredMCR);
  });

  // [todo] deal with test once active cover amount measurement is settled
  // eslint-disable-next-line max-len
  it.skip('increases desiredMCR if totalSumAssured is high enough and subsequently decreases to mcrFloor it when totalSumAssured falls to 0', async function () {
    const { mcr, qt: quotation } = this.contracts;
    const [coverHolder] = this.accounts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    await buyCover({ ...this.contracts, cover, coverHolder });
    const expectedCoverId = 1;

    await increaseTime(await mcr.minUpdateTime());

    await mcr.updateMCR();

    await increaseTime(daysToSeconds(cover.period));

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
    await increaseTime(daysToSeconds(2));
    await mcr.updateMCR();

    const currentMCRFloor = await mcr.mcrFloor();

    const expectedMCRFloor = previousMCRFloor.mul(ratioScale.add(maxMCRFloorIncrement)).div(ratioScale);
    expect(currentMCRFloor.toString()).to.be.equal(expectedMCRFloor.toString());
  });

  it.skip('claim payout triggers updateMCR and sets desiredMCR to mcrFloor (sumAssured = 0)', async function () {
    // [todo] test with new contracts that call sendPayout
    const { mcr, cl: claims, tk: token, p1: pool } = this.contracts;
    const owner = this.accounts.defaultSender;
    const [coverHolder, member1] = this.accounts;

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor
      .mul(currentMCR.add(parseEther('300')))
      .div(parseEther('1'))
      .div(ratioScale);

    // fund pool to pay for cover
    await pool.sendEther({ from: owner, value: coverAmount.mul(parseEther('1')) });

    const cover = { ...coverTemplate, amount: coverAmount };
    await buyCover({ ...this.contracts, cover, coverHolder });
    const expectedCoverId = 1;
    const expectedClaimId = 1;

    await increaseTime(await mcr.minUpdateTime());

    await mcr.updateMCR();

    await claims.submitClaim(expectedCoverId, {
      from: coverHolder,
    });

    const lockTokens = parseEther('1000000000');
    await token.transfer(member1, lockTokens, {
      from: owner,
    });
    await enrollClaimAssessor(this.contracts, [member1], { lockTokens });
    await voteClaim({ ...this.contracts, claimId: expectedClaimId, verdict: '1', voter: member1 });

    const block = await ethers.provider.getBlock('latest');
    const expectedUpdateTime = block.timestamp;

    const lastUpdateTime = await mcr.lastUpdateTime();
    const mcrFloor = await mcr.mcrFloor();
    const desiredMCR = await mcr.desiredMCR();
    assert.equal(lastUpdateTime.toString(), expectedUpdateTime.toString());
    assert.equal(desiredMCR.toString(), mcrFloor.toString());
  });

  it.skip('incidents.redeemPayout triggers updateMCR', async function () {
    // [todo] test with new contracts that call sendPayout
    const { incidents, qd, p1, mcr } = this.contracts;
    const owner = this.accounts.defaultSender;
    const [coverHolder] = this.accounts;

    const ETH = await p1.ETH();
    const productId = '0x000000000000000000000000000000000000000e';
    const ybETH = await ERC20MintableDetailed.new('yield bearing ETH', 'ybETH', 18);
    await incidents.addProducts([productId], [ybETH.address], [ETH], { from: owner });

    const cover = { ...coverTemplate, amount: 20, currency: hex('ETH'), contractAddress: productId };
    await buyCover({ ...this.contracts, cover, coverHolder });

    const { blockTimestamp: coverStartDate } = await ethers.provider.getBlock('latest');
    const priceBefore = parseEther('2.5'); // ETH per ybETH
    const sumAssured = parseEther('1').muln(cover.amount);

    // sumAssured DAI = tokenAmount ybETH @ priceBefore
    // 500 ETH  /  2 ETH/ybETH  =  1000 ybETH
    const tokenAmount = parseEther('1').mul(sumAssured).div(priceBefore);

    const incidentDate = coverStartDate.addn(1);
    await addIncident(this.contracts, [owner], cover.contractAddress, incidentDate, priceBefore);

    await ybETH.mint(coverHolder, tokenAmount);
    await ybETH.approve(incidents.address, tokenAmount, { from: coverHolder });

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const incidentId = '0';

    await incidents.redeemPayout(
      coverId,
      incidentId,
      tokenAmount,
      // gas price set to 0 so we can know the payout exactly
      { from: coverHolder, gasPrice: 0 },
    );
    const block = await ethers.provider.getBlock('latest');
    const expectedUpdateTime = block.timestamp;
    const lastUpdateTime = await mcr.lastUpdateTime();
    assert.equal(lastUpdateTime.toString(), expectedUpdateTime.toString());
  });
});
