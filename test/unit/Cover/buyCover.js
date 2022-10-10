const { expect } = require('chai');
const { ethers } = require('hardhat');

const { createStakingPool, assertCoverFields } = require('./helpers');
const { bnEqual } = require('../utils').helpers;

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;
const { BigNumber } = ethers;
const gracePeriodInDays = 120;

describe('buyCover', function () {
  it('should purchase new cover using 1 staking pool', async function () {
    const { cover } = this;

    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
    } = this.accounts;

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 364; // 30 days

    const amount = parseEther('1000');
    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');
    const capacityFactor = '10000';

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

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

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId, {
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
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
    } = this.accounts;

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 28; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const capacityFactor = '10000';

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

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

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId, {
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

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const commissionRatio = '500'; // 5%

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
    bnEqual(difference, expectedPremium);

    const commissionDifference = commissionNxmBalanceAfter.sub(commissionNxmBalanceBefore);
    bnEqual(commissionDifference, expectedCommission);

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId, {
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
      members: [coverBuyer, stakingPoolManager],
      generalPurpose: [commissionReceiver],
    } = this.accounts;

    const productId = 0;
    const coverAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const commissionRatio = '500'; // 5%

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
    bnEqual(difference, expectedPremium);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    bnEqual(commissionDifference, expectedCommission);

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
    });
  });

  it('should purchase new cover using USDC with commission', async function () {
    const { cover, usdc } = this;

    const {
      members: [coverBuyer, stakingPoolManager],
      generalPurpose: [commissionReceiver],
    } = this.accounts;

    const productId = 0;
    const coverAsset = 2; // USDC
    const period = 3600 * 24 * 30; // 30 days

    const amount = BigNumber.from(1000e6); // 6 decimals

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const commissionRatio = '500'; // 5%

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
    bnEqual(difference, expectedPremium);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    bnEqual(commissionDifference, expectedCommission);

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId, {
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
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

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

    const productId = 0;
    const coverAsset = 10; // not ETH nor DAI nor USDC
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

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

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 27; // 27 days

    const amount = parseEther('1000');

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

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 366;

    const amount = parseEther('1000');

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

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

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
    const [coverBuyer, stakingPoolManager] = this.accounts.members;

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 364; // 30 days

    const amount = BigNumber.from('0');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

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

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

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
      governanceContracts: [gv1],
      members: [member1],
      members: [coverBuyer1, stakingPoolManager],
    } = this.accounts;

    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 364; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const capacityFactor = '10000';

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

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
});
