const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { createStakingPool, assertCoverFields } = require('./helpers');
const setup = require('./setup');
const { setEtherBalance } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const gracePeriod = 120 * 24 * 3600; // 120 days
const NXM_ASSET_ID = 255;

const buyCoverFixture = {
  productId: 0,
  coverAsset: 0, // ETH
  poolId: 1,
  segmentId: 0,
  period: 3600 * 24 * 30, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260,
  priceDenominator: BigNumber.from(10000),
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  expectedPremium: parseEther('1000').mul(260).div(10000), // amount * targetPriceRatio / priceDenominator
};

const poolAllocationRequest = [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }];

async function buyCoverSetup() {
  const fixture = await setup();
  const { cover } = fixture;
  const [stakingPoolManager] = fixture.accounts.members;

  await createStakingPool(
    cover,
    buyCoverFixture.productId,
    buyCoverFixture.capacity,
    buyCoverFixture.targetPriceRatio,
    buyCoverFixture.activeCover,
    stakingPoolManager,
    buyCoverFixture.targetPriceRatio,
  );
  return fixture;
}

describe('buyCover', function () {
  it('should purchase new cover using 1 staking pool', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    // no eth should be left in the cover contract
    expect(await ethers.provider.getBalance(cover.address)).to.be.equal(0);
    const premium = expectedPremium.mul(period).div(daysToSeconds(365));
    expect(await ethers.provider.getBalance(pool.address)).to.equal(poolEthBalanceBefore.add(premium));
    const coverId = await cover.coverDataCount();

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      gracePeriod,
    });
  });

  it('should purchase new cover with fixed price using 1 staking pool', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, targetPriceRatio, coverAsset, period, expectedPremium } = buyCoverFixture;

    const productId = 1;
    const stakingPoolId = poolAllocationRequest[0].poolId;
    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(stakingPoolId));
    await stakingPool.setPrice(productId, targetPriceRatio);

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    // no eth should be left in the cover contract
    expect(await ethers.provider.getBalance(cover.address)).to.be.equal(0);
    const premium = expectedPremium.mul(period).div(daysToSeconds(365));
    expect(await ethers.provider.getBalance(pool.address)).to.equal(poolEthBalanceBefore.add(premium));
    const coverId = await cover.coverDataCount();

    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriod,
    });
  });

  it('should purchase new cover using 2 staking pools', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, pool } = fixture;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;
    const { amount, targetPriceRatio, productId, coverAsset, period, expectedPremium, capacity, activeCover } =
      buyCoverFixture;

    // create a 2nd pool
    await createStakingPool(
      cover,
      productId,
      capacity,
      targetPriceRatio,
      activeCover,
      stakingPoolManager,
      targetPriceRatio,
    );

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
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
      [
        { poolId: 2, coverAmountInAsset: amount.div(2) },
        { poolId: 1, coverAmountInAsset: amount.div(2) },
      ],
      { value: expectedPremium },
    );

    const expectedPremiumPerPool = expectedPremium.div(2).mul(period).div(daysToSeconds(365));
    expect(await ethers.provider.getBalance(pool.address)).to.equal(expectedPremiumPerPool.mul(2));

    const coverId = await cover.coverDataCount();
    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriod,
    });
  });

  it('should purchase new cover using NXM with commission', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, nxm, tokenController, pool } = fixture;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;
    const { amount, targetPriceRatio, productId, coverAsset, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedPremiumWithCommission = expectedPremium
      .mul(priceDenominator)
      .div(priceDenominator.sub(commissionRatio));
    const expectedCommission = expectedPremiumWithCommission.sub(expectedPremium);

    await nxm.mint(coverBuyer.address, parseEther('100000'));
    await nxm.connect(coverBuyer).approve(tokenController.address, parseEther('100000'));

    const nxmBalanceBefore = await nxm.balanceOf(coverBuyer.address);
    const commissionNxmBalanceBefore = await nxm.balanceOf(stakingPoolManager.address);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission,
          paymentAsset: NXM_ASSET_ID,
          payWithNXM: true,
          commissionRatio,
          commissionDestination: stakingPoolManager.address,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    )
      .to.emit(nxm, 'Transfer')
      .withArgs(coverBuyer.address, AddressZero, expectedPremium);

    const nxmBalanceAfter = await nxm.balanceOf(coverBuyer.address);
    const commissionNxmBalanceAfter = await nxm.balanceOf(stakingPoolManager.address);

    const difference = nxmBalanceBefore.sub(nxmBalanceAfter);
    expect(difference).to.be.equal(expectedPremiumWithCommission);

    // nxm is burned
    expect(await nxm.balanceOf(pool.address)).to.be.equal(0);

    const commissionDifference = commissionNxmBalanceAfter.sub(commissionNxmBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = await cover.coverDataCount();
    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriod,
    });
  });

  it('should purchase new cover using DAI with commission', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, dai, pool } = fixture;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = fixture.accounts;

    const coverAsset = 1; // DAI

    const { amount, targetPriceRatio, productId, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedPremiumWithCommission = expectedPremium
      .mul(priceDenominator)
      .div(priceDenominator.sub(commissionRatio));
    const expectedCommission = expectedPremiumWithCommission.sub(expectedPremium);

    await dai.mint(coverBuyer.address, parseEther('100000'));
    await dai.connect(coverBuyer).approve(cover.address, parseEther('100000'));

    const daiBalanceBefore = await dai.balanceOf(coverBuyer.address);
    const commissionDaiBalanceBefore = await dai.balanceOf(commissionReceiver.address);
    expect(await dai.balanceOf(pool.address)).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremiumWithCommission,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: commissionReceiver.address,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: '0' },
    );

    expect(await dai.balanceOf(pool.address)).to.equal(expectedPremium);

    const daiBalanceAfter = await dai.balanceOf(coverBuyer.address);
    const commissionDaiBalanceAfter = await dai.balanceOf(commissionReceiver.address);

    const difference = daiBalanceBefore.sub(daiBalanceAfter);
    expect(difference).to.be.equal(expectedPremiumWithCommission);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = await cover.coverDataCount();
    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriod,
    });
  });

  it('should purchase new cover using USDC with commission', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, usdc, pool } = fixture;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = fixture.accounts;

    const coverAsset = 2; // USDC
    const { amount, targetPriceRatio, productId, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedPremiumWithCommission = expectedPremium
      .mul(priceDenominator)
      .div(priceDenominator.sub(commissionRatio));
    const expectedCommission = expectedPremiumWithCommission.sub(expectedPremium);

    await usdc.mint(coverBuyer.address, parseEther('100000'));

    await usdc.connect(coverBuyer).approve(cover.address, parseEther('100000'));

    const usdcBalanceBefore = await usdc.balanceOf(coverBuyer.address);
    const commissionUsdcBalanceBefore = await usdc.balanceOf(commissionReceiver.address);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission,
          paymentAsset: coverAsset,
          payWithNXM: false,
          commissionRatio,
          commissionDestination: commissionReceiver.address,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    )
      .to.emit(usdc, 'Transfer') // Verify usdc is transferred to pool
      .withArgs(coverBuyer.address, pool.address, expectedPremium);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const commissionUsdcBalanceAfter = await usdc.balanceOf(commissionReceiver.address);

    const actualPremiumWithCommission = usdcBalanceBefore.sub(usdcBalanceAfter);
    expect(actualPremiumWithCommission).to.be.equal(expectedPremiumWithCommission);

    const actualCommission = commissionUsdcBalanceAfter.sub(commissionUsdcBalanceBefore);
    expect(actualCommission).to.be.equal(expectedCommission);

    const coverId = await cover.coverDataCount();
    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      targetPriceRatio,
      gracePeriod,
    });
  });

  it('should revert for unavailable product', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const productId = 1337;
    const { amount, coverAsset, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'ProductDoesntExist');
  });

  it('should revert if cover asset does not exist', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const coverAsset = 10; // inexistent asset id
    const { amount, productId, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWith('Pool: Invalid asset id');
  });

  it('should revert for unsupported cover asset', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, Assets } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const coverAsset = Assets.USDC; // inexistent asset id
    const { amount, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId: 2,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('should revert for period too short', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const period = 3600 * 24 * 27; // 27 days

    const { amount, productId, coverAsset } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooShort');
  });

  it('should revert for period too long', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const period = 3600 * 24 * 366;
    const { amount, productId, coverAsset } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooLong');
  });

  it('should revert for commission rate too high', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: '3001',
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CommissionRateTooHigh');
  });

  it('should revert when cover amount is 0', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const amount = 0;
    const { productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
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
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAmountIsZero');
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, master } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await master.setEmergencyPause(true);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
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
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWith('System is paused');
  });

  it('reverts if caller is not member', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;

    const {
      nonMembers: [nonMember],
    } = fixture.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(nonMember).buyCover(
        {
          coverId: 0,
          owner: nonMember.address,
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
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it('reverts if owner is address zero', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: AddressZero,
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
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWith('INVALID_RECIPIENT');
  });

  it('reverts if payment asset does not exist', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const paymentAsset = 10; // not ETH nor DAI nor USDC
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'InvalidPaymentAsset');
  });

  it('reverts when payment asset is not a cover asset', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // mark asset as not a cover asset
    await pool.setIsCoverAsset(coverAsset, false);

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('reverts when payment asset is not a cover asset', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // mark asset as not a cover asset
    await pool.setIsCoverAsset(coverAsset, false);

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('reverts when payment asset is abandoned', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // mark asset as not a cover asset
    await pool.setIsAbandoned(coverAsset, true);

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: '0',
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedPremiumWithCommission = expectedPremium
      .mul(priceDenominator)
      .div(priceDenominator.sub(commissionRatio));

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission.sub(1),
          paymentAsset: coverAsset,
          commissionRatio,
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: expectedPremiumWithCommission },
      ),
    ).to.be.revertedWithCustomError(cover, 'PriceExceedsMaxPremiumInAsset');

    const balanceBefore = await ethers.provider.getBalance(await coverBuyer.getAddress());

    const tx = await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremiumWithCommission,
        paymentAsset: coverAsset,
        commissionRatio,
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremiumWithCommission },
    );
    const { gasUsed, effectiveGasPrice } = await tx.wait();
    const balanceAfter = await ethers.provider.getBalance(await coverBuyer.getAddress());
    expect(balanceBefore.sub(balanceAfter).sub(gasUsed.mul(effectiveGasPrice))).to.be.equal(
      expectedPremiumWithCommission,
    );
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset when buying with NXM', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, nxm, tokenController } = fixture;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;
    const { amount, targetPriceRatio, productId, coverAsset, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = '500'; // 5%

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedPremiumWithCommission = expectedPremium
      .mul(priceDenominator)
      .div(priceDenominator.sub(commissionRatio));

    await nxm.mint(coverBuyer.address, parseEther('100000'));
    await nxm.connect(coverBuyer).approve(tokenController.address, parseEther('100000'));

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission.sub(1),
          paymentAsset: NXM_ASSET_ID,
          commissionRatio,
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'PriceExceedsMaxPremiumInAsset');

    const nxmBalanceBefore = await nxm.balanceOf(coverBuyer.address);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission,
          paymentAsset: NXM_ASSET_ID,
          payWithNXM: true,
          commissionRatio,
          commissionDestination: stakingPoolManager.address,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    )
      .to.emit(nxm, 'Transfer')
      .withArgs(coverBuyer.address, AddressZero, expectedPremium);

    const nxmBalanceAfter = await nxm.balanceOf(coverBuyer.address);

    const difference = nxmBalanceBefore.sub(nxmBalanceAfter);
    expect(difference).to.be.equal(expectedPremiumWithCommission);
  });

  it('reverts if empty array of allocationRequests', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
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
        [],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('reverts if allocationRequest coverAmountInAsset is 0', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
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
        [{ poolId: 1, coverAmountInAsset: 0 }],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('retrieves ERC20 payment from caller and transfers it to the Pool', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, dai, pool } = fixture;

    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;

    const coverAsset = 1; // DAI
    const { amount, productId, period, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    await dai.mint(coverBuyer.address, parseEther('100000'));
    await dai.connect(coverBuyer).approve(cover.address, parseEther('100000'));

    const userDaiBalanceBefore = await dai.balanceOf(coverBuyer.address);
    const poolDaiBalanceBefore = await dai.balanceOf(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
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
      poolAllocationRequest,
      { value: '0' },
    );

    const userDaiBalanceAfter = await dai.balanceOf(coverBuyer.address);
    expect(userDaiBalanceAfter).to.be.equal(userDaiBalanceBefore.sub(expectedPremium));

    const poolDaiBalanceAfter = await dai.balanceOf(pool.address);
    expect(poolDaiBalanceAfter).to.be.equal(poolDaiBalanceBefore.add(expectedPremium));
  });

  it('store cover and segment data', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, poolId, segmentId } =
      buyCoverFixture;
    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const globalRewardsRatio = await cover.globalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverId = await cover.coverDataCount();
    const storedCoverData = await cover.coverData(coverId);
    expect(storedCoverData.productId).to.be.equal(productId);
    expect(storedCoverData.coverAsset).to.be.equal(coverAsset);
    expect(storedCoverData.amountPaidOut).to.be.equal(0);

    const coverSegmentsCount = await cover.coverSegmentsCount(coverId);
    expect(coverSegmentsCount).to.be.equal(1);

    const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);
    expect(segment.gracePeriod).to.be.equal(gracePeriod);
    expect(segment.period).to.be.equal(period);
    expect(segment.amount).to.be.equal(amount);
    expect(segment.start).to.be.equal(timestamp);
    expect(segment.globalRewardsRatio).to.be.equal(globalRewardsRatio);

    const segmentPoolAllocationIndex = 0;
    const segmentAllocations = await cover.coverSegmentAllocations(coverId, segmentId, segmentPoolAllocationIndex);
    expect(segmentAllocations.poolId).to.be.equal(poolId);
    expect(segmentAllocations.coverAmountInNXM).to.be.equal(amount);
  });

  it('mints NFT to owner', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, coverNFT } = fixture;

    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const nftBalanceBefore = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceBefore).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverReceiver.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const nftBalanceAfter = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const coverId = await cover.coverDataCount();
    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(coverReceiver.address);
  });

  it('allows to set a non member as owner', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, coverNFT } = fixture;

    const {
      members: [coverBuyer],
      nonMembers: [nonMemberCoverReceiver],
    } = fixture.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const nftBalanceBefore = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceBefore).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: nonMemberCoverReceiver.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const nftBalanceAfter = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const coverId = await cover.coverDataCount();
    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(nonMemberCoverReceiver.address);
  });

  it('reverts if reentrant', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, memberRoles } = fixture;

    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;

    const ReentrantExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrantExploiter = await ReentrantExploiter.deploy();
    await memberRoles.setRole(reentrantExploiter.address, 2);

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const commissionRatio = 500; // 5%
    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedPremiumWithCommission = expectedPremium
      .mul(priceDenominator)
      .div(priceDenominator.sub(commissionRatio));

    const txData = await cover.connect(coverBuyer).populateTransaction.buyCover(
      {
        coverId: 0,
        owner: coverReceiver.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremiumWithCommission,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremiumWithCommission },
    );

    await setEtherBalance(reentrantExploiter.address, expectedPremium.mul(2));
    await reentrantExploiter.setFallbackParams([cover.address], [expectedPremium], [txData.data]);

    // The test uses the payment to the commission destination to trigger reentrancy for the buyCover call.
    // The nonReentrant protection will make the new call revert, making the payment to the commission address to fail.
    // The expected revert message is 'Cover: Sending ETH to commission destination failed.'
    // because the commission payment fails thanks to the nonReentrant guard.
    // Even if we can't verify that the transaction reverts with the "ReentrancyGuard: reentrant call" message
    // if the nonReentrant guard is removed from the buyCover() method this test will fail because the following
    // transaction won't revert
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverReceiver.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission,
          paymentAsset: coverAsset,
          commissionRatio,
          commissionDestination: reentrantExploiter.address,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: expectedPremiumWithCommission },
      ),
    ).to.be.revertedWithCustomError(cover, 'SendingEthToCommissionDestinationFailed');
  });

  it('correctly store cover, segment and allocation data', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover } = fixture;

    const {
      members: [coverBuyer1, coverBuyer2],
    } = fixture.accounts;

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, poolId, segmentId } =
      buyCoverFixture;

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    await cover.connect(coverBuyer1).buyCover(
      {
        coverId: 0,
        owner: coverBuyer1.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    await cover.connect(coverBuyer2).buyCover(
      {
        coverId: 0,
        owner: coverBuyer2.address,
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
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const globalRewardsRatio = await cover.globalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    // Validate data for second cover
    const coverId = await cover.coverDataCount();
    const storedCoverData = await cover.coverData(coverId);
    expect(storedCoverData.productId).to.be.equal(productId);
    expect(storedCoverData.coverAsset).to.be.equal(coverAsset);
    expect(storedCoverData.amountPaidOut).to.be.equal(0);

    const coverSegmentsCount = await cover.coverSegmentsCount(coverId);
    expect(coverSegmentsCount).to.be.equal(1);

    const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);
    expect(segment.gracePeriod).to.be.equal(gracePeriod);
    expect(segment.period).to.be.equal(period);
    expect(segment.amount).to.be.equal(amount);
    expect(segment.start).to.be.equal(timestamp);
    expect(segment.globalRewardsRatio).to.be.equal(globalRewardsRatio);

    const segmentPoolAllocationIndex = 0;
    const segmentAllocations = await cover.coverSegmentAllocations(coverId, segmentId, segmentPoolAllocationIndex);
    expect(segmentAllocations.poolId).to.be.equal(poolId);
    expect(segmentAllocations.coverAmountInNXM).to.be.equal(amount);
  });
});
