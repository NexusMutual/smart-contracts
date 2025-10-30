const { expect } = require('chai');
const { ethers, nexus } = require('hardhat');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther, MaxUint256, ZeroAddress } = ethers;
const { PoolAsset, PauseTypes } = nexus.constants;

const gracePeriod = 120 * 24 * 3600; // 120 days
const NXM_ASSET_ID = 255;

const buyCoverFixture = {
  productId: 0n,
  coverAsset: 0n, // ETH
  poolId: 1n,
  segmentId: 0n,
  period: 3600n * 24n * 30n, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260n,
  priceDenominator: 10000n,
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  expectedPremium: (parseEther('1000') * 260n) / 10000n, // amount * targetPriceRatio / priceDenominator
};

const poolAllocationRequest = [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }];

describe('buyCover', function () {
  const amount = parseEther('1000');
  const targetPriceRatio = 260n;
  const priceDenominator = 10000n;
  const capacityFactor = 10000;
  const defaultIpfsData = 'QmRmkky7qQBjCAU3gFUqfy3NXD6CPq8YVLPM7GHXBz7b5P';

  // Cover.PoolAllocationRequest
  const poolAllocationRequestTemplate = {
    poolId: 1,
    coverAmountInAsset: amount,
  };

  // Cover.BuyCoverParams
  const buyCoverTemplate = {
    owner: ZeroAddress,
    coverId: 0,
    productId: 0,
    coverAsset: 0,
    amount,
    period: 50 * 24 * 60 * 60,
    maxPremiumInAsset: parseEther('100'),
    paymentAsset: 0,
    commissionRatio: parseEther('0'),
    commissionDestination: '0x0000000000000000000000000000000000000000',
    ipfsData: defaultIpfsData,
  };

  // Cover.Product
  const productTemplate = {
    productType: 0,
    minPrice: 0,
    __gap: 0,
    coverAssets: parseInt('11', 2), // ETH/USDC
    initialPriceRatio: 1000, // 10%
    capacityReductionRatio: capacityFactor, // 100%
    isDeprecated: false,
    useFixedPrice: false,
  };

  // Cover.ProductParams
  const productParamsTemplate = {
    productName: 'xyz',
    productId: MaxUint256,
    ipfsMetadata: defaultIpfsData,
    product: { ...productTemplate },
    allowedPools: [],
  };

  it('should purchase new cover using 1 staking pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.target);

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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    // no eth should be left in the cover contract
    expect(await ethers.provider.getBalance(cover)).to.be.equal(0);
    const premium = (expectedPremium * period) / (365n * 24n * 60n * 60n);
    expect(await ethers.provider.getBalance(pool)).to.equal(poolEthBalanceBefore + premium);
    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('emits CoverBought event', async function () {
    const fixture = await loadFixture(setup);
    const { cover, registry } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const memberId = await registry.getMemberId(coverBuyer.address);

    const tx = await cover.connect(coverBuyer).buyCover(
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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const coverId = await cover.getCoverDataCount();
    await expect(tx).to.emit(cover, 'CoverBought').withArgs(coverId, coverId, memberId, productId);
  });

  it('stores the ipfs data', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;
    const ipfsData = 'test data';

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
        commissionDestination: ZeroAddress,
        ipfsData,
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const coverId = await cover.getCoverDataCount();
    const coverMetadata = await cover.getCoverMetadata(coverId);
    expect(coverMetadata).to.equal(ipfsData);
  });

  it('should purchase new cover with fixed price using 1 staking pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool, stakingProducts } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { amount, targetPriceRatio, coverAsset, period, expectedPremium } = buyCoverFixture;

    const productId = 1;
    const stakingPoolId = poolAllocationRequest[0].poolId;
    const stakingPool = await ethers.getContractAt(
      'COMockStakingPool',
      await stakingProducts.stakingPool(stakingPoolId),
    );
    await stakingPool.setPrice(productId, targetPriceRatio);

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.target);

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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    // no eth should be left in the cover contract
    expect(await ethers.provider.getBalance(cover)).to.be.equal(0);
    const premium = (expectedPremium * period) / (365n * 24n * 60n * 60n);
    expect(await ethers.provider.getBalance(pool)).to.equal(poolEthBalanceBefore + premium);
    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should purchase new cover using 2 staking pools', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [
        { poolId: 2n, coverAmountInAsset: amount / 2n },
        { poolId: 1n, coverAmountInAsset: amount / 2n },
      ],
      { value: expectedPremium },
    );

    const expectedPremiumPerPool = ((expectedPremium / 2n) * period) / (365n * 24n * 60n * 60n);
    expect(await ethers.provider.getBalance(pool.target)).to.equal(expectedPremiumPerPool * 2n);

    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should purchase new cover using NXM with commission', async function () {
    const fixture = await loadFixture(setup);
    const { cover, nxm, tokenController, pool } = fixture;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;
    const { amount, targetPriceRatio, productId, coverAsset, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = 500n; // 5%

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    const expectedPremiumWithCommission = (expectedPremium * priceDenominator) / (priceDenominator - commissionRatio);
    const expectedCommission = expectedPremiumWithCommission - expectedPremium;

    await nxm.mint(coverBuyer.address, parseEther('100000'));
    await nxm.connect(coverBuyer).approve(tokenController, parseEther('100000'));

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
      .withArgs(coverBuyer.address, ZeroAddress, expectedPremium);

    const nxmBalanceAfter = await nxm.balanceOf(coverBuyer.address);
    const commissionNxmBalanceAfter = await nxm.balanceOf(stakingPoolManager.address);

    const difference = nxmBalanceBefore - nxmBalanceAfter;
    expect(difference).to.be.equal(expectedPremiumWithCommission);

    // nxm is burned
    expect(await nxm.balanceOf(pool.target)).to.be.equal(0);

    const commissionDifference = commissionNxmBalanceAfter - commissionNxmBalanceBefore;
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should purchase new cover using DAI with commission', async function () {
    const fixture = await loadFixture(setup);
    const { cover, usdc, pool } = fixture;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = fixture.accounts;

    const coverAsset = 1; // DAI

    const { amount, targetPriceRatio, productId, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = 500n; // 5%

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    const expectedPremiumWithCommission = (expectedPremium * priceDenominator) / (priceDenominator - commissionRatio);
    const expectedCommission = expectedPremiumWithCommission - expectedPremium;

    await usdc.mint(coverBuyer.address, parseEther('100000'));
    await usdc.connect(coverBuyer).approve(cover, parseEther('100000'));

    const usdcBalanceBefore = await usdc.balanceOf(coverBuyer.address);
    const commissionUsdcBalanceBefore = await usdc.balanceOf(commissionReceiver.address);
    expect(await usdc.balanceOf(pool.target)).to.be.equal(0);

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

    expect(await usdc.balanceOf(pool.target)).to.equal(expectedPremium);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const commissionUsdcBalanceAfter = await usdc.balanceOf(commissionReceiver.address);

    const difference = usdcBalanceBefore - usdcBalanceAfter;
    expect(difference).to.be.equal(expectedPremiumWithCommission);

    const commissionDifference = commissionUsdcBalanceAfter - commissionUsdcBalanceBefore;
    expect(commissionDifference).to.be.equal(expectedCommission);

    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should purchase new cover using USDC with commission', async function () {
    const fixture = await loadFixture(setup);
    const { cover, usdc, pool } = fixture;

    const {
      members: [coverBuyer],
      generalPurpose: [commissionReceiver],
    } = fixture.accounts;

    const coverAsset = 1; // USDC
    const { amount, targetPriceRatio, productId, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = 500n; // 5%

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    const expectedPremiumWithCommission = (expectedPremium * priceDenominator) / (priceDenominator - commissionRatio);
    const expectedCommission = expectedPremiumWithCommission - expectedPremium;

    await usdc.mint(coverBuyer.address, parseEther('100000'));

    await usdc.connect(coverBuyer).approve(cover, parseEther('100000'));

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
      .withArgs(coverBuyer.address, pool.target, expectedPremium);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const commissionUsdcBalanceAfter = await usdc.balanceOf(commissionReceiver.address);

    const actualPremiumWithCommission = usdcBalanceBefore - usdcBalanceAfter;
    expect(actualPremiumWithCommission).to.be.equal(expectedPremiumWithCommission);

    const actualCommission = commissionUsdcBalanceAfter - commissionUsdcBalanceBefore;
    expect(actualCommission).to.be.equal(expectedCommission);

    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should revert for unavailable product', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'ProductNotFound');
  });

  it('should revert if cover asset does not exist', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWith('Pool: Invalid asset id');
  });

  it('should revert for unsupported cover asset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const coverAsset = PoolAsset.cbBTC; // inexistent asset id
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('should revert for period too short', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooShort');
  });

  it('should revert for period too long', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooLong');
  });

  it('should revert for commission rate too high', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CommissionRateTooHigh');
  });

  it('should revert when cover amount is 0', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAmountIsZero');
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { cover, registry } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    const buyCoverParams = {
      coverId: 0,
      owner: coverBuyer.address,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: ZeroAddress,
      ipfsData: '',
    };

    await registry.confirmPauseConfig(PauseTypes.PAUSE_COVER);

    await expect(cover.connect(coverBuyer).buyCover(buyCoverParams, poolAllocationRequest))
      .to.be.revertedWithCustomError(cover, 'Paused')
      .withArgs(PauseTypes.PAUSE_COVER, PauseTypes.PAUSE_COVER);

    await registry.confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(cover.connect(coverBuyer).buyCover(buyCoverParams, poolAllocationRequest))
      .to.be.revertedWithCustomError(cover, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_COVER);
  });

  it('reverts if caller is not member', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'OnlyMember');
  });

  it('reverts if owner is address zero', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: ZeroAddress,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: expectedPremium },
      ),
    ).to.be.revertedWith('INVALID_RECIPIENT');
  });

  it('reverts if payment asset does not exist', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'InvalidPaymentAsset');
  });

  it('reverts when payment asset is not a cover asset', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('reverts when payment asset is not a cover asset', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('reverts when payment asset is abandoned', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: '0' },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetNotSupported');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator } = buyCoverFixture;
    const commissionRatio = 500n; // 5%

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    const expectedPremiumWithCommission = (expectedPremium * priceDenominator) / (priceDenominator - commissionRatio);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission - 1n,
          paymentAsset: coverAsset,
          commissionRatio,
          commissionDestination: ZeroAddress,
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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremiumWithCommission },
    );
    const { gasUsed, gasPrice } = await tx.wait();
    const balanceAfter = await ethers.provider.getBalance(await coverBuyer.getAddress());
    expect(balanceBefore - balanceAfter - gasUsed * gasPrice).to.be.equal(expectedPremiumWithCommission);
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset when buying with NXM', async function () {
    const fixture = await loadFixture(setup);
    const { cover, nxm, tokenController } = fixture;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;
    const { amount, targetPriceRatio, productId, coverAsset, period, priceDenominator } = buyCoverFixture;
    const commissionRatio = 500n; // 5%

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    const expectedPremiumWithCommission = (expectedPremium * priceDenominator) / (priceDenominator - commissionRatio);

    await nxm.mint(coverBuyer.address, parseEther('100000'));
    await nxm.connect(coverBuyer).approve(tokenController.target, parseEther('100000'));

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremiumWithCommission - 1n,
          paymentAsset: NXM_ASSET_ID,
          commissionRatio,
          commissionDestination: ZeroAddress,
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
      .withArgs(coverBuyer.address, ZeroAddress, expectedPremium);

    const nxmBalanceAfter = await nxm.balanceOf(coverBuyer.address);

    const difference = nxmBalanceBefore - nxmBalanceAfter;
    expect(difference).to.be.equal(expectedPremiumWithCommission);
  });

  it('reverts if empty array of allocationRequests', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('reverts if allocationRequest coverAmountInAsset is 0', async function () {
    const fixture = await loadFixture(setup);
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: 0 }],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('retrieves ERC20 payment from caller and transfers it to the Pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, usdc, pool } = fixture;

    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;

    const coverAsset = 1; // USDC
    const { amount, productId, period, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    await usdc.mint(coverBuyer.address, parseEther('100000'));
    await usdc.connect(coverBuyer).approve(cover, parseEther('100000'));

    const userUsdcBalanceBefore = await usdc.balanceOf(coverBuyer.address);
    const poolUsdcBalanceBefore = await usdc.balanceOf(pool);

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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: '0' },
    );

    const userUsdcBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    expect(userUsdcBalanceAfter).to.be.equal(userUsdcBalanceBefore - expectedPremium);

    const poolUsdcBalanceAfter = await usdc.balanceOf(pool.target);
    expect(poolUsdcBalanceAfter).to.be.equal(poolUsdcBalanceBefore + expectedPremium);
  });

  it('store cover data and pool allocations', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, poolId } = buyCoverFixture;
    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const globalRewardsRatio = await cover.getGlobalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);

    expect(storedCoverData.start).to.be.equal(timestamp);
    expect(storedCoverData.rewardsRatio).to.be.equal(globalRewardsRatio);

    const poolAllocations = await cover.getPoolAllocations(coverId);
    expect(poolAllocations.length).to.be.equal(1);
    expect(poolAllocations[0].poolId).to.be.equal(poolId);
    expect(poolAllocations[0].coverAmountInNXM).to.be.equal(amount);
  });

  it('mints NFT to owner', async function () {
    const fixture = await loadFixture(setup);
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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const nftBalanceAfter = await coverNFT.balanceOf(coverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const coverId = await cover.getCoverDataCount();
    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(coverReceiver.address);
  });

  it('allows to set a non member as owner', async function () {
    const fixture = await loadFixture(setup);
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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const nftBalanceAfter = await coverNFT.balanceOf(nonMemberCoverReceiver.address);
    expect(nftBalanceAfter).to.be.equal(1);

    const coverId = await cover.getCoverDataCount();
    const ownerOfCoverId = await coverNFT.ownerOf(coverId);
    expect(ownerOfCoverId).to.be.equal(nonMemberCoverReceiver.address);
  });

  it('reverts if reentrant', async function () {
    const fixture = await loadFixture(setup);
    const { cover, memberRoles } = fixture;

    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;

    const ReentrantExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrantExploiter = await ReentrantExploiter.deploy();
    await memberRoles.setRole(reentrantExploiter.target, 2);

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator } = buyCoverFixture;

    const commissionRatio = 500n; // 5%
    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

    const expectedPremiumWithCommission = (expectedPremium * priceDenominator) / (priceDenominator - commissionRatio);

    const txData = await cover.connect(coverBuyer).buyCover.populateTransaction(
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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremiumWithCommission },
    );

    await setBalance(reentrantExploiter.target, expectedPremium * 2n);
    await reentrantExploiter.setReentrancyParams(cover, expectedPremium, txData.data);

    // The test uses the payment to the commission destination to trigger reentrancy for the buyCover call.
    // The nonReentrant protection will make the new call revert, making the payment to the commission address to fail.
    // The expected custom error is 'ETHTransferFailed'
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
          commissionDestination: reentrantExploiter,
          ipfsData: '',
        },
        poolAllocationRequest,
        { value: expectedPremiumWithCommission },
      ),
    ).to.be.revertedWithCustomError(cover, 'ETHTransferFailed');
  });

  it('correctly store cover and allocation data for the second cover buyer', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const {
      members: [coverBuyer1, coverBuyer2],
    } = fixture.accounts;

    const { amount, productId, coverAsset, period, targetPriceRatio, priceDenominator, poolId } = buyCoverFixture;

    const expectedPremium = (((amount * targetPriceRatio) / priceDenominator) * period) / (3600n * 24n * 365n);

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
        commissionDestination: ZeroAddress,
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
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const globalRewardsRatio = await cover.getGlobalRewardsRatio();
    const { timestamp } = await ethers.provider.getBlock('latest');

    // Validate data for second cover
    const coverId = await cover.getCoverDataCount();
    const storedCoverData = await cover.getCoverData(coverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);

    expect(storedCoverData.start).to.be.equal(timestamp);
    expect(storedCoverData.rewardsRatio).to.be.equal(globalRewardsRatio);

    const poolAllocations = await cover.getPoolAllocations(coverId);
    expect(poolAllocations.length).to.be.equal(1);
    expect(poolAllocations[0].poolId).to.be.equal(poolId);
    expect(poolAllocations[0].coverAmountInNXM).to.be.equal(amount);
  });

  it('should fail to buy cover for deprecated product', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverProducts } = fixture;
    const {
      members: [coverBuyer],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = fixture.accounts;

    const productId = 1;

    const productParams = {
      ...productParamsTemplate,
    };
    // Add new product
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    // deprecate product
    const isDeprecated = true;
    const product = { ...productParams.product, isDeprecated };
    const deprecateProductParams = { ...productParamsTemplate, productId, product };
    await coverProducts.connect(advisoryBoardMember0).setProducts([deprecateProductParams]);

    // buy cover
    const owner = coverBuyer.address;
    const expectedPremium = (amount * targetPriceRatio) / priceDenominator;
    const buyCoverParams = { ...buyCoverTemplate, owner, expectedPremium, productId };
    await expect(
      cover.connect(coverBuyer).buyCover(buyCoverParams, [poolAllocationRequestTemplate], {
        value: expectedPremium,
      }),
    ).to.be.revertedWithCustomError(cover, 'ProductDeprecated');
  });

  it('should be able to buy cover on a previously deprecated product', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverProducts } = fixture;
    const {
      members: [coverBuyer],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = fixture.accounts;

    const productId = 1;

    const productParams = {
      ...productParamsTemplate,
    };
    // Add new product
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    // deprecate product
    const isDeprecated = true;
    const product = { ...productParams.product, isDeprecated };
    const deprecateProductParams = { ...productParamsTemplate, productId, product };
    await coverProducts.connect(advisoryBoardMember0).setProducts([deprecateProductParams]);

    {
      // re-enable product
      const isDeprecated = false;
      const product = { ...productParams.product, isDeprecated };
      const restoreProductParams = { ...deprecateProductParams, product };
      await coverProducts.connect(advisoryBoardMember0).setProducts([restoreProductParams]);
    }

    // buy cover
    const owner = coverBuyer.address;
    const expectedPremium = (amount * targetPriceRatio) / priceDenominator;
    const buyCoverParams = { ...buyCoverTemplate, owner, expectedPremium, productId };
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [poolAllocationRequestTemplate], { value: expectedPremium });
  });

  // TODO: move to editCover
  it('should fail to edit cover for deprecated product', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverProducts } = fixture;
    const {
      members: [coverBuyer],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = fixture.accounts;

    const productId = 1;

    const productParams = {
      ...productParamsTemplate,
    };
    // Add new product
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    // buy cover
    const owner = coverBuyer.address;
    const expectedPremium = (amount * targetPriceRatio) / priceDenominator;
    const buyCoverParams = { ...buyCoverTemplate, owner, expectedPremium, productId };
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [poolAllocationRequestTemplate], { value: expectedPremium });

    // deprecate product
    const isDeprecated = true;
    const product = { ...productParams.product, isDeprecated };
    const deprecateProductParams = { ...productParamsTemplate, productId, product };
    await coverProducts.connect(advisoryBoardMember0).setProducts([deprecateProductParams]);

    const coverId = await cover.getCoverDataCount();
    const editCoverParams = { ...buyCoverParams, coverId };

    // edit cover
    await expect(
      cover.connect(coverBuyer).buyCover(editCoverParams, [poolAllocationRequestTemplate], { value: expectedPremium }),
    ).to.be.revertedWithCustomError(cover, 'ProductDeprecated');
  });
});
