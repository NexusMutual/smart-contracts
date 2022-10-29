const { expect } = require('chai');
const { ethers } = require('hardhat');

const { createStakingPool, assertCoverFields } = require('./helpers');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;
const gracePeriodInDays = 120;

const buyCoverFixture = {
  productId: 0,
  coverAsset: 0, // ETH
  coverId: 0,
  period: 3600 * 24 * 30, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260,
  priceDenominator: 10000,
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  capacityFactor: 10000,
  expectedPremium: parseEther('1000').mul(260).div(10000), // amount * targetPriceRatio / priceDenominator
};

describe('buyCover', function () {
  beforeEach(async function () {
    const { cover } = this;

    const {
      governanceContracts: [gv1],
      members: [stakingPoolManager],
    } = this.accounts;

    await cover.connect(gv1).updateUintParameters([0], [buyCoverFixture.capacityFactor]);

    await createStakingPool(
      cover,
      buyCoverFixture.productId,
      buyCoverFixture.capacity,
      buyCoverFixture.targetPriceRatio,
      buyCoverFixture.activeCover,
      stakingPoolManager,
      stakingPoolManager,
      buyCoverFixture.targetPriceRatio,
    );
  });

  it('should purchase new cover using 1 staking pool', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, targetPriceRatio, productId, coverAsset, period, expectedPremium, coverId } = buyCoverFixture;

    const tx = await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
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
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );
    await tx.wait();

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
    });
  });

  it('should purchase new cover using 2 staking pools', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer, stakingPoolManager],
    } = this.accounts;

    const { amount, targetPriceRatio, productId, coverAsset, period, expectedPremium, coverId, capacity, activeCover } =
      buyCoverFixture;

    // create a 2nd pool
    await createStakingPool(
      cover,
      productId,
      capacity,
      targetPriceRatio,
      activeCover,
      stakingPoolManager,
      stakingPoolManager,
      targetPriceRatio,
    );

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
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
      [
        { poolId: '0', coverAmountInAsset: amount.div(2) },
        { poolId: '1', coverAmountInAsset: amount.div(2) },
      ],
      {
        value: expectedPremium,
      },
    );

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
    });
  });

  it('should purchase new cover using NXM with commission', async function () {
    const { cover, nxm, tokenController } = this;

    const [coverBuyer, stakingPoolManager] = this.accounts.members;

    const { amount, targetPriceRatio, productId, coverAsset, period, priceDenominator, coverId } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedBasePremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedCommission = expectedBasePremium.mul(commissionRatio).div(priceDenominator);
    const expectedPremium = expectedBasePremium.add(expectedCommission);

    await nxm.mint(coverBuyer.address, parseEther('100000'));
    await nxm.connect(coverBuyer).approve(tokenController.address, parseEther('100000'));

    const nxmBalanceBefore = await nxm.balanceOf(coverBuyer.address);
    const commissionNxmBalanceBefore = await nxm.balanceOf(stakingPoolManager.address);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWithNXM: true,
        commissionRatio,
        commissionDestination: stakingPoolManager.address,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      { value: '0' },
    );

    const nxmBalanceAfter = await nxm.balanceOf(coverBuyer.address);
    const commissionNxmBalanceAfter = await nxm.balanceOf(stakingPoolManager.address);

    const difference = nxmBalanceBefore.sub(nxmBalanceAfter);
    expect(difference).to.be.equal(expectedPremium);

    const commissionDifference = commissionNxmBalanceAfter.sub(commissionNxmBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
    });
  });

  it('should purchase new cover using DAI with commission', async function () {
    const { cover, dai } = this;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = this.accounts;

    const coverAsset = 1; // DAI

    const { amount, targetPriceRatio, productId, period, priceDenominator, coverId } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedBasePremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedCommission = expectedBasePremium.mul(commissionRatio).div(10000);
    const expectedPremium = expectedBasePremium.add(expectedCommission);

    await dai.mint(coverBuyer.address, parseEther('100000'));

    await dai.connect(coverBuyer).approve(cover.address, parseEther('100000'));

    const daiBalanceBefore = await dai.balanceOf(coverBuyer.address);
    const commissionDaiBalanceBefore = await dai.balanceOf(commissionReceiver.address);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: commissionReceiver.address,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: '0',
      },
    );

    const daiBalanceAfter = await dai.balanceOf(coverBuyer.address);
    const commissionDaiBalanceAfter = await dai.balanceOf(commissionReceiver.address);

    const difference = daiBalanceBefore.sub(daiBalanceAfter);
    expect(difference).to.be.equal(expectedPremium);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
    });
  });

  it.skip('should purchase new cover using USDC with commission', async function () {
    const { cover, usdc } = this;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = this.accounts;

    const coverAsset = 2; // USDC
    const { amount, targetPriceRatio, productId, period, priceDenominator, coverId } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedBasePremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedCommission = expectedBasePremium.mul(commissionRatio).div(10000);
    const expectedPremium = expectedBasePremium.add(expectedCommission);

    await usdc.mint(coverBuyer.address, parseEther('100000'));

    await usdc.connect(coverBuyer).approve(cover.address, parseEther('100000'));

    const daiBalanceBefore = await usdc.balanceOf(coverBuyer.address);
    const commissionDaiBalanceBefore = await usdc.balanceOf(commissionReceiver.address);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: commissionReceiver.address,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: '0',
      },
    );

    const daiBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const commissionDaiBalanceAfter = await usdc.balanceOf(commissionReceiver.address);

    const difference = daiBalanceBefore.sub(daiBalanceAfter);
    expect(difference).to.be.equal(expectedPremium);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
    });
  });

  it('should revert for unavailable product', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const productId = 1337;
    const { amount, coverAsset, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Product not found');
  });

  it('should revert for unsupported payout asset', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const coverAsset = 10; // not ETH nor DAI nor USDC
    const { amount, productId, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Payout asset is not supported');
  });

  it('should revert for period too short', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const period = 3600 * 24 * 27; // 27 days

    const { amount, productId, coverAsset } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Cover period is too short');
  });

  it('should revert for period too long', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const period = 3600 * 24 * 366;
    const { amount, productId, coverAsset } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Cover period is too long');
  });

  it('should revert for commission rate too high', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, productId, coverAsset, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: '2501',
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Commission rate is too high');
  });

  it('should revert when cover amount is 0', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;

    const amount = 0;
    const { productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
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
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: amount = 0');
  });

  it('should revert when the allocated cover amount is less than the expected cover amount', async function () {
    const { cover } = this;

    const {
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;
    const tooLargeExpectedAmount = amount.add(10);

    await expect(
      cover.connect(member1).buyCover(
        {
          owner: coverBuyer1.address,
          productId,
          coverAsset,
          amount: tooLargeExpectedAmount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: The selected pools ran out of capacity');
  });

  it('reverts if system is paused', async function () {
    const { cover, master } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await master.setEmergencyPause(true);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
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
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('System is paused');
  });

  it('reverts if caller is not member', async function () {
    const { cover } = this;

    const {
      nonMembers: [nonMember],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(nonMember).buyCover(
        {
          owner: nonMember.address,
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
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it('reverts if owner is address zero', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: AddressZero,
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
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('INVALID_RECIPIENT');
  });

  it('reverts if not supported payment asset', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const paymentAsset = 10; // not ETH nor DAI nor USDC
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.reverted;
  });

  it('reverts if deprecated payment asset', async function () {
    const { cover, pool } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const paymentAsset = 1; // DAI
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // Deprecate DAI
    const daiCoverAssetBitmap = 0b10;
    await pool.setDeprecatedCoverAssetsBitmap(daiCoverAssetBitmap);

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Payment asset deprecated');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator } = buyCoverFixture;
    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);
    const maxPremiumInAsset = expectedPremium.div(2);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Price exceeds maxPremiumInAsset');
  });

  it('reverts if empty array of allocationRequests', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
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
        [],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWithPanic('0x12'); // (Division or modulo division by zero)
  });
});
