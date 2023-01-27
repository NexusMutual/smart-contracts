const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('../../../lib/helpers');
const { stake } = require('../utils/staking');
const { divCeil } = require('../../unit/StakingPool/helpers');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
describe('buyCover', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  // TODO: The expected premium and the actual premium forwarded are off by 1 decimal place.
  // The js value has 1 extra decimal place.
  it.only('should buy cover using ETH and forward correct premium to capital pool', async function () {
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR, ONE_NXM } = this.config;
    const { cover, stakingPool0, p1 } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0;
    const period = daysToSeconds(30); // 30 days
    const gracePeriod = daysToSeconds(30);

    const stakedProduct = await stakingPool0.products(productId);
    //
    // // Get NXM/ETH amounts and prices
    const nxmPriceInCoverAsset = await p1.getTokenPrice();
    const amount = parseEther('1');
    let amountNxm = divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset);

    // Round nxm amount up to the nearest allocation unit
    amountNxm = amountNxm.mod(NXM_PER_ALLOCATION_UNIT).eq(0)
      ? amountNxm
      : amountNxm.add(NXM_PER_ALLOCATION_UNIT).sub(amountNxm.mod(NXM_PER_ALLOCATION_UNIT));

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    const expectedPremiumNxm = amountNxm
      .mul(BigNumber.from(stakedProduct.targetPrice))
      .div(TARGET_PRICE_DENOMINATOR)
      .mul(BigNumber.from(period))
      .div(daysToSeconds(365));

    const expectedPremium = expectedPremiumNxm.mul(nxmPriceInCoverAsset).div(ONE_NXM);

    const poolBalanceBefore = await ethers.provider.getBalance(p1.address);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );
    expect(await ethers.provider.getBalance(p1.address)).to.equal(poolBalanceBefore.add(expectedPremium));
  });
});
