const { expect } = require('chai');
const { ethers } = require('hardhat');

const { setEtherBalance } = require('../../utils/evm');
const { createStakingPool, assertCoverFields } = require('./helpers');
const { daysToSeconds } = require('../../utils').helpers;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const gracePeriod = 120 * 24 * 3600; // 120 days
const NXM_ASSET_ID = 255;

const buyCoverFixture = {
  productId: 0,
  coverAsset: 0, // ETH
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

const poolAllocationRequest = [{ poolId: '0', coverAmountInAsset: buyCoverFixture.amount, allocationId: MaxUint256 }];

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
    const { cover, pool } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.address);
    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
    const coverId = (await cover.coverDataCount()).sub(1);
    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount,
      gracePeriod,
    });
  });

  it('should purchase new cover with fixed price using 1 staking pool', async function () {
    const { cover, pool } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, targetPriceRatio, coverAsset, period, expectedPremium } = buyCoverFixture;

    const productId = 1;
    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(0));
    await stakingPool.setPrice(productId, targetPriceRatio);

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
    const coverId = (await cover.coverDataCount()).sub(1);

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
    const { cover, pool } = this;
    const [coverBuyer, stakingPoolManager] = this.accounts.members;
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
      stakingPoolManager,
      targetPriceRatio,
    );

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
        { poolId: '1', coverAmountInAsset: amount.div(2), allocationId: MaxUint256 },
        { poolId: '0', coverAmountInAsset: amount.div(2), allocationId: MaxUint256 },
      ],
      { value: expectedPremium },
    );

    const expectedPremiumPerPool = expectedPremium.div(2).mul(period).div(daysToSeconds(365));
    expect(await ethers.provider.getBalance(pool.address)).to.equal(expectedPremiumPerPool.mul(2));

    const coverId = (await cover.coverDataCount()).sub(1);
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
    const { cover, nxm, tokenController, pool } = this;
    const [coverBuyer, stakingPoolManager] = this.accounts.members;
    const { amount, targetPriceRatio, productId, coverAsset, period, priceDenominator } = buyCoverFixture;
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

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
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
      .withArgs(coverBuyer.address, AddressZero, expectedBasePremium);

    const nxmBalanceAfter = await nxm.balanceOf(coverBuyer.address);
    const commissionNxmBalanceAfter = await nxm.balanceOf(stakingPoolManager.address);

    const difference = nxmBalanceBefore.sub(nxmBalanceAfter);
    expect(difference).to.be.equal(expectedPremium);

    // nxm is burned
    expect(await nxm.balanceOf(pool.address)).to.be.equal(0);

    const commissionDifference = commissionNxmBalanceAfter.sub(commissionNxmBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = (await cover.coverDataCount()).sub(1);
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
    const { cover, dai, pool } = this;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = this.accounts;

    const coverAsset = 1; // DAI

    const { amount, targetPriceRatio, productId, period, priceDenominator } = buyCoverFixture;
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
    expect(await dai.balanceOf(pool.address)).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      poolAllocationRequest,
      {
        value: '0',
      },
    );

    expect(await dai.balanceOf(pool.address)).to.equal(expectedBasePremium);

    const daiBalanceAfter = await dai.balanceOf(coverBuyer.address);
    const commissionDaiBalanceAfter = await dai.balanceOf(commissionReceiver.address);

    const difference = daiBalanceBefore.sub(daiBalanceAfter);
    expect(difference).to.be.equal(expectedPremium);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = (await cover.coverDataCount()).sub(1);
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
    const { cover, usdc, pool } = this;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = this.accounts;

    const coverAsset = 2; // USDC
    const { amount, targetPriceRatio, productId, period, priceDenominator } = buyCoverFixture;
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

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        poolAllocationRequest,
        {
          value: '0',
        },
      ),
    )
      .to.emit(usdc, 'Transfer') // Verify usdc is transferred to pool
      .withArgs(coverBuyer.address, pool.address, expectedBasePremium);

    const daiBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const commissionDaiBalanceAfter = await usdc.balanceOf(commissionReceiver.address);

    const difference = daiBalanceBefore.sub(daiBalanceAfter);
    expect(difference).to.be.equal(expectedPremium);

    const commissionDifference = commissionDaiBalanceAfter.sub(commissionDaiBalanceBefore);
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = (await cover.coverDataCount()).sub(1);
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
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const productId = 1337;
    const { amount, coverAsset, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Product not found');
  });

  it('should revert for unsupported payout asset', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const coverAsset = 10; // not ETH nor DAI nor USDC
    const { amount, productId, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Payout asset is not supported');
  });

  it('should revert for period too short', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const period = 3600 * 24 * 27; // 27 days

    const { amount, productId, coverAsset } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Cover period is too short');
  });

  it('should revert for period too long', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const period = 3600 * 24 * 366;
    const { amount, productId, coverAsset } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Cover period is too long');
  });

  it('should revert for commission rate too high', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
          coverId: MaxUint256,
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
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: amount = 0');
  });

  // TODO: The logic has been moved in StakingPool.sol and this test will have to be moved as well.
  it.skip('should revert when the allocated cover amount is less than the expected cover amount', async function () {
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
          coverId: MaxUint256,
          owner: coverBuyer1.address,
          productId,
          coverAsset,
          amount: tooLargeExpectedAmount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: The selected pools ran out of capacity');
  });

  it('reverts if system is paused', async function () {
    const { cover, master } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await master.setEmergencyPause(true);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
          coverId: MaxUint256,
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
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it('reverts if owner is address zero', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('INVALID_RECIPIENT');
  });

  it('reverts if not supported payment asset', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const paymentAsset = 10; // not ETH nor DAI nor USDC
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: '0',
        },
      ),
    ).to.be.reverted;
  });

  it('reverts if deprecated payment asset', async function () {
    const { cover, pool } = this;
    const [coverBuyer] = this.accounts.members;
    const paymentAsset = 1; // DAI
    const { amount, productId, coverAsset, period } = buyCoverFixture;

    // Deprecate DAI
    const daiCoverAssetBitmap = 0b10;
    await pool.setDeprecatedCoverAssetsBitmap(daiCoverAssetBitmap);

    // reverts without a reason
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: '0',
        },
      ),
    ).to.be.revertedWith('Cover: Payment asset deprecated');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
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
          coverId: MaxUint256,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        poolAllocationRequest,
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Price exceeds maxPremiumInAsset');
  });

  it('reverts if empty array of allocationRequests', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Insufficient cover amount allocated');
  });

  it('reverts if allocationRequest coverAmountInAsset is 0', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: MaxUint256,
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
        [{ poolId: '0', coverAmountInAsset: 0, allocationId: MaxUint256 }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Insufficient cover amount allocated');
  });

  it('retrieves ERC20 payment from caller and transfers it to the Pool', async function () {
    const { cover, dai, pool } = this;

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

    const userDaiBalanceBefore = await dai.balanceOf(coverBuyer.address);
    const poolDaiBalanceBefore = await dai.balanceOf(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: '0',
      },
    );

    const userDaiBalanceAfter = await dai.balanceOf(coverBuyer.address);
    expect(userDaiBalanceAfter).to.be.equal(userDaiBalanceBefore.sub(expectedPremium));

    const poolDaiBalanceAfter = await dai.balanceOf(pool.address);
    expect(poolDaiBalanceAfter).to.be.equal(poolDaiBalanceBefore.add(expectedPremium));
  });

  it('store cover and segment data', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;
    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, poolId, segmentId } =
      buyCoverFixture;
    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    const globalRewardsRatio = await cover.globalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverId = (await cover.coverDataCount()).sub(1);
    const storedCoverData = await cover.coverData(coverId);
    expect(storedCoverData.productId).to.be.equal(productId);
    expect(storedCoverData.coverAsset).to.be.equal(coverAsset);
    expect(storedCoverData.amountPaidOut).to.be.equal(0);

    const coverSegmentsCount = await cover.coverSegmentsCount(coverId);
    expect(coverSegmentsCount).to.be.equal(1);

    const segment = await cover.coverSegments(coverId, segmentId);
    expect(segment.gracePeriod).to.be.equal(gracePeriod);
    expect(segment.period).to.be.equal(period);
    expect(segment.amount).to.be.equal(amount);
    expect(segment.start).to.be.equal(timestamp + 1);
    expect(segment.globalRewardsRatio).to.be.equal(globalRewardsRatio);

    const segmentPoolAllocationIndex = 0;
    const segmentAllocations = await cover.coverSegmentAllocations(coverId, segmentId, segmentPoolAllocationIndex);
    expect(segmentAllocations.poolId).to.be.equal(poolId);
    expect(segmentAllocations.coverAmountInNXM).to.be.equal(amount);
  });

  it('mints NFT to owner', async function () {
    const { cover, coverNFT } = this;

    const {
      members: [coverBuyer, coverReceiver],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const nftBalanceBefore = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceBefore).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    const nftBalanceAfter = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const coverId = (await cover.coverDataCount()).sub(1);
    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(coverReceiver.address);
  });

  it('allows to set a non member as owner', async function () {
    const { cover, coverNFT } = this;

    const {
      members: [coverBuyer],
      nonMembers: [nonMemberCoverReceiver],
    } = this.accounts;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const nftBalanceBefore = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceBefore).to.be.equal(0);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    const nftBalanceAfter = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const coverId = (await cover.coverDataCount()).sub(1);
    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(nonMemberCoverReceiver.address);
  });

  // TODO: To be reenabled after rewards minting is reintroduced either in the
  //  Cover contract, or in the StakingPool contract
  it.skip('mints rewards to staking pool', async function () {
    const { cover, tokenController } = this;

    const {
      governanceContracts: [gv1],
      members: [coverBuyer, coverReceiver],
    } = this.accounts;

    const { amount, productId, coverAsset, period, poolId, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const globalRewardsRatio = 5000;
    const rewardDenominator = 10000;

    await cover.connect(gv1).updateUintParameters([1], [globalRewardsRatio]);

    const stakingPoolRewardBefore = await tokenController.stakingPoolNXMBalances(poolId);

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedReward = expectedPremium.mul(globalRewardsRatio).div(rewardDenominator);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    const stakingPoolRewardAfter = await tokenController.stakingPoolNXMBalances(poolId);
    // validate that rewards increased
    expect(stakingPoolRewardAfter.rewards).to.be.equal(stakingPoolRewardBefore.rewards.add(expectedReward));
  });

  // TODO: To be reenabled after rewards minting is reintroduced either in the Cover contract,
  //  or in the StakingPool contract
  it.skip('allows to buy against multiple staking pool', async function () {
    const { cover, tokenController } = this;

    const {
      governanceContracts: [gv1],
      members: [coverBuyer, coverReceiver, stakingPoolManager],
    } = this.accounts;

    const { productId, coverAsset, period, capacity, targetPriceRatio, activeCover, segmentId, priceDenominator } =
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

    // create a 3rd pool
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
    const rewardDenominator = 10000;

    await cover.connect(gv1).updateUintParameters([1], [globalRewardsRatio]);

    const amount = parseEther('900');
    const coverAmountAllocationPerPool = amount.div(3);

    const expectedPremiumPerPool = coverAmountAllocationPerPool
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    const expectedRewardPerPool = expectedPremiumPerPool.mul(globalRewardsRatio).div(rewardDenominator);
    const expectedPremium = expectedPremiumPerPool.mul(3);

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(0);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool3Before = await tokenController.stakingPoolNXMBalances(2);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      [
        { poolId: 0, coverAmountInAsset: coverAmountAllocationPerPool, allocationId: MaxUint256 },
        { poolId: 1, coverAmountInAsset: coverAmountAllocationPerPool, allocationId: MaxUint256 },
        { poolId: 2, coverAmountInAsset: coverAmountAllocationPerPool, allocationId: MaxUint256 },
      ],
      {
        value: expectedPremium,
      },
    );

    const stakingPool1After = await tokenController.stakingPoolNXMBalances(0);
    const stakingPool2After = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool3After = await tokenController.stakingPoolNXMBalances(2);

    // validate that rewards increased
    expect(stakingPool1After.rewards).to.be.equal(stakingPool1Before.rewards.add(expectedRewardPerPool));
    expect(stakingPool2After.rewards).to.be.equal(stakingPool2Before.rewards.add(expectedRewardPerPool));
    expect(stakingPool3After.rewards).to.be.equal(stakingPool3Before.rewards.add(expectedRewardPerPool));

    const coverId = (await cover.coverDataCount()).sub(1);

    for (let i = 0; i < 3; i++) {
      const segmentAllocation = await cover.coverSegmentAllocations(coverId, segmentId, i);
      expect(segmentAllocation.poolId).to.be.equal(i);
      expect(segmentAllocation.coverAmountInNXM).to.be.equal(coverAmountAllocationPerPool);
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

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator } = buyCoverFixture;

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
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    await setEtherBalance(reentrantExploiter.address, expectedBasePremium.mul(2));
    await reentrantExploiter.setFallbackParams([cover.address], [expectedBasePremium], [txData.data]);

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
          coverId: MaxUint256,
          owner: coverReceiver.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio,
          commissionDestination: reentrantExploiter.address,
          ipfsData: '',
        },
        poolAllocationRequest,
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Sending ETH to commission destination failed.');
  });

  it('correctly store cover, segment and allocation data', async function () {
    const { cover } = this;

    const {
      members: [coverBuyer1, coverBuyer2],
    } = this.accounts;

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, poolId, segmentId } =
      buyCoverFixture;

    const expectedPremium = amount
      .mul(targetPriceRatio)
      .div(priceDenominator)
      .mul(period)
      .div(3600 * 24 * 365);

    await cover.connect(coverBuyer1).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    await cover.connect(coverBuyer2).buyCover(
      {
        coverId: MaxUint256,
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
      {
        value: expectedPremium,
      },
    );

    const globalRewardsRatio = await cover.globalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    // Validate data for second cover
    const coverId = (await cover.coverDataCount()).sub(1);
    const storedCoverData = await cover.coverData(coverId);
    expect(storedCoverData.productId).to.be.equal(productId);
    expect(storedCoverData.coverAsset).to.be.equal(coverAsset);
    expect(storedCoverData.amountPaidOut).to.be.equal(0);

    const coverSegmentsCount = await cover.coverSegmentsCount(coverId);
    expect(coverSegmentsCount).to.be.equal(1);

    const segment = await cover.coverSegments(coverId, segmentId);
    expect(segment.gracePeriod).to.be.equal(gracePeriod);
    expect(segment.period).to.be.equal(period);
    expect(segment.amount).to.be.equal(amount);
    expect(segment.start).to.be.equal(timestamp + 1);
    expect(segment.globalRewardsRatio).to.be.equal(globalRewardsRatio);

    const segmentPoolAllocationIndex = 0;
    const segmentAllocations = await cover.coverSegmentAllocations(coverId, segmentId, segmentPoolAllocationIndex);
    expect(segmentAllocations.poolId).to.be.equal(poolId);
    expect(segmentAllocations.coverAmountInNXM).to.be.equal(amount);
  });
});
