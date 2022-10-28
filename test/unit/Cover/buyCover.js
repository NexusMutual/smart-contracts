const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');

const { createStakingPool, assertCoverFields } = require('./helpers');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;
const gracePeriodInDays = 120;

const buyCoverFixture = {
  productId: 0,
  coverAsset: 0, // ETH
  coverId: 0,
  poolId: 0,
  segmentId: 0,
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

  it('reverts if allocationRequest coverAmountInAsset is 0', async function () {
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
        [{ poolId: '0', coverAmountInAsset: 0 }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: coverAmountInAsset = 0'); // (Division or modulo division by zero)
  });

  it('retrieves ERC20 payment from caller', async function () {
    const { cover, dai } = this;

    const {
      members: [coverBuyer, coverReceiver],
    } = this.accounts;

    const coverAsset = 1; // DAI
    const { amount, productId, period, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    await dai.mint(coverBuyer.address, parseEther('100000'));
    await dai.connect(coverBuyer).approve(cover.address, parseEther('100000'));

    const daiBalanceBefore = await dai.balanceOf(coverBuyer.address);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverReceiver.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio: 0,
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: '0',
      },
    );

    const daiBalanceAfter = await dai.balanceOf(coverBuyer.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.sub(expectedPremium));
  });

  it('store cover and segment data', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer],
    } = this.accounts;

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, coverId, poolId, segmentId } =
      buyCoverFixture;
    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

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
      [{ poolId, coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );

    const globalRewardsRatio = await cover.globalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const storedCoverData = await cover.coverData(coverId);
    expect(storedCoverData.productId).to.be.equal(productId);
    expect(storedCoverData.coverAsset).to.be.equal(coverAsset);
    expect(storedCoverData.amountPaidOut).to.be.equal(0);

    const coverSegmentsCount = await cover.coverSegmentsCount(coverId);
    expect(coverSegmentsCount).to.be.equal(1);

    const segment = await cover.coverSegments(coverId, segmentId);
    expect(segment.gracePeriodInDays).to.be.equal(gracePeriodInDays);
    expect(segment.period).to.be.equal(period);
    expect(segment.amount).to.be.equal(amount);
    expect(segment.priceRatio).to.be.equal(targetPriceRatio);
    expect(segment.expired).to.be.equal(false);
    expect(segment.start).to.be.equal(timestamp + 1);
    expect(segment.globalRewardsRatio).to.be.equal(globalRewardsRatio);

    const segmentPoolAllocationIndex = 0;
    const segmentAllocations = await cover.coverSegmentAllocations(coverId, segmentId, segmentPoolAllocationIndex);
    expect(segmentAllocations.poolId).to.be.equal(poolId);
    expect(segmentAllocations.coverAmountInNXM).to.be.equal(amount);
    expect(segmentAllocations.premiumInNXM).to.be.equal(expectedPremium);
  });

  it('mints NFT to owner', async function () {
    const { cover, coverNFT } = this;

    const {
      members: [coverBuyer, coverReceiver],
    } = this.accounts;

    const { amount, productId, coverAsset, period, coverId, expectedPremium } = buyCoverFixture;

    const nftBalanceBefore = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceBefore).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverReceiver.address,
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

    const nftBalanceAfter = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(coverReceiver.address);
  });

  it('allows to set a non member as owner', async function () {
    const { cover, coverNFT } = this;

    const {
      members: [coverBuyer],
      nonMembers: [nonMemberCoverReceiver],
    } = this.accounts;

    const { amount, productId, coverAsset, period, coverId, expectedPremium } = buyCoverFixture;

    const nftBalanceBefore = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceBefore).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: nonMemberCoverReceiver.address,
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

    const nftBalanceAfter = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(nonMemberCoverReceiver.address);
  });

  it('mints rewards to staking pool', async function () {
    const { cover, tokenController } = this;

    const {
      governanceContracts: [gv1],
      members: [coverBuyer, coverReceiver],
    } = this.accounts;

    const { amount, productId, coverAsset, period, poolId, expectedPremium } = buyCoverFixture;

    const globalRewardsRatio = 5000;

    await cover.connect(gv1).updateUintParameters([1], [globalRewardsRatio]);

    const stakingPoolRewardBefore = await tokenController.stakingPoolNXMBalances(poolId);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverReceiver.address,
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
      [{ poolId, coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );

    const stakingPoolRewardAfter = await tokenController.stakingPoolNXMBalances(poolId);
    // validate that rewards increased
    expect(stakingPoolRewardAfter.rewards).to.be.gt(stakingPoolRewardBefore.rewards);
  });

  it('allows to buy against multiple staking pool', async function () {
    const { cover, tokenController } = this;

    const {
      governanceContracts: [gv1],
      members: [coverBuyer, coverReceiver, stakingPoolManager],
    } = this.accounts;

    const {
      amount,
      productId,
      coverAsset,
      period,
      expectedPremium,
      capacity,
      targetPriceRatio,
      activeCover,
      coverId,
      segmentId,
    } = buyCoverFixture;

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

    // create a 3er pool
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

    // create a 4th pool
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

    // create a 5th pool
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

    const globalRewardsRatio = 5000;
    await cover.connect(gv1).updateUintParameters([1], [globalRewardsRatio]);

    const coverAmountInAsset = amount.div(5);

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(0);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool3Before = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool4Before = await tokenController.stakingPoolNXMBalances(3);
    const stakingPool5Before = await tokenController.stakingPoolNXMBalances(4);

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverReceiver.address,
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
        { poolId: 0, coverAmountInAsset },
        { poolId: 1, coverAmountInAsset },
        { poolId: 2, coverAmountInAsset },
        { poolId: 3, coverAmountInAsset },
        { poolId: 4, coverAmountInAsset },
      ],
      {
        value: expectedPremium,
      },
    );

    const stakingPool1After = await tokenController.stakingPoolNXMBalances(0);
    const stakingPool2After = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool3After = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool4After = await tokenController.stakingPoolNXMBalances(3);
    const stakingPool5After = await tokenController.stakingPoolNXMBalances(4);

    // validate that rewards increased
    expect(stakingPool1After.rewards).to.be.gt(stakingPool1Before.rewards);
    expect(stakingPool2After.rewards).to.be.gt(stakingPool2Before.rewards);
    expect(stakingPool3After.rewards).to.be.gt(stakingPool3Before.rewards);
    expect(stakingPool4After.rewards).to.be.gt(stakingPool4Before.rewards);
    expect(stakingPool5After.rewards).to.be.gt(stakingPool5Before.rewards);

    for (let i = 0; i < 5; i++) {
      const segmentAllocation = await cover.coverSegmentAllocations(coverId, segmentId, i);
      expect(segmentAllocation.poolId).to.be.equal(i);
      expect(segmentAllocation.coverAmountInNXM).to.be.equal(coverAmountInAsset);
    }
  });

  it('reverts if reentrant', async function () {
    const { cover, memberRoles } = this;

    const {
      members: [coverBuyer, coverReceiver],
    } = this.accounts;

    const ReentrantExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrantExploiter = await ReentrantExploiter.deploy();
    await memberRoles.setRole(reentrantExploiter.address, 2);

    const { amount, productId, coverAsset, period, poolId, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const commissionRatio = 500; // 5%
    const expectedBasePremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);
    const expectedCommission = expectedBasePremium.mul(commissionRatio).div(priceDenominator);
    const expectedPremium = expectedBasePremium.add(expectedCommission);

    const txData = await cover.connect(coverBuyer).populateTransaction.buyCover(
      {
        owner: coverReceiver.address,
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
      [{ poolId, coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );

    await setEtherBalance(reentrantExploiter.address, expectedBasePremium.mul(2));
    await reentrantExploiter.setFallbackParams([cover.address], [expectedBasePremium], [txData.data]);

    // The test uses the payment to the commission destination to reentrant buyCover again.
    // The nonReentrant protection will make revert that new call, making the payment to the commission address to fail.
    // The failure result of the payment is validated so the transaction reverts with
    // the message 'Cover: Sending ETH to commission destination failed.'
    // Even if we can't verify that the transaction reverts with the "ReentrancyGuard: reentrant call" message
    // if the nonReentrant guard is removed from the buyCover() method this test will fail because the following
    // transaction won't revert
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverReceiver.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio,
          commissionDestination: reentrantExploiter.address,
          ipfsData: '',
        },
        [{ poolId, coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Sending ETH to commission destination failed.');
  });
});
