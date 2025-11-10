const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

const { parseEther, ZeroAddress, MaxUint256 } = ethers;
const { calculatePremium, calculateRewards } = nexus.protocol;
const { PoolAsset } = nexus.constants;

async function signLimitOrder(contractAddress, params, signer) {
  const { chainId } = await ethers.provider.getNetwork();

  const domain = {
    name: 'NexusMutualLimitOrders',
    version: '1.0.0',
    chainId,
    verifyingContract: contractAddress,
  };

  const types = {
    ExecuteOrder: [
      { name: 'orderDetails', type: 'OrderDetails' },
      { name: 'executionDetails', type: 'ExecutionDetails' },
    ],
    OrderDetails: [
      { name: 'coverId', type: 'uint256' },
      { name: 'productId', type: 'uint24' },
      { name: 'amount', type: 'uint96' },
      { name: 'period', type: 'uint32' },
      { name: 'paymentAsset', type: 'uint8' },
      { name: 'coverAsset', type: 'uint8' },
      { name: 'owner', type: 'address' },
      { name: 'ipfsData', type: 'string' },
      { name: 'commissionRatio', type: 'uint16' },
      { name: 'commissionDestination', type: 'address' },
    ],
    ExecutionDetails: [
      { name: 'buyer', type: 'address' },
      { name: 'notExecutableBefore', type: 'uint256' },
      { name: 'executableUntil', type: 'uint256' },
      { name: 'renewableUntil', type: 'uint256' },
      { name: 'renewablePeriodBeforeExpiration', type: 'uint256' },
      { name: 'maxPremiumInAsset', type: 'uint256' },
    ],
  };

  const digest = ethers.TypedDataEncoder.hash(domain, types, params);
  const signature = await signer.signTypedData(domain, types, params);

  return { digest, signature };
}

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const orderDetailsFixture = {
  coverId: 0,
  productId: stakedProductParamTemplate.productId,
  amount: parseEther('1'),
  period: 30 * 24 * 60 * 60,
  paymentAsset: 0,
  coverAsset: 0,
  owner: ZeroAddress,
  ipfsData: 'ipfs data',
  commissionRatio: 0,
  commissionDestination: ZeroAddress,
};

const executionDetailsFixture = {
  renewableUntil: 0,
  renewablePeriodBeforeExpiration: 3 * 24 * 60 * 60,
  maxPremiumInAsset: MaxUint256,
};

describe('LimitOrders - executeOrder', function () {
  it('should purchase new cover for a order creator with USDC', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, stakingProducts, pool, limitOrders, usdc, coverNFT } = fixture.contracts;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const [coverBuyer] = fixture.accounts.nonMembers;
    const orderSettler = fixture.accounts.defaultSender;
    const { period } = orderDetailsFixture;

    // mint USDC to cover buyer
    const usdcAmount = ethers.parseUnits('1000000', 6);
    await usdc.mint(coverBuyer.address, usdcAmount);

    const productId = 1;
    const coverAmount = ethers.parseUnits('100000', 6); // 100K USDC
    const usdcRate = await pool.getInternalTokenPriceInAsset(PoolAsset.USDC);
    const product = await stakingProducts.getProduct(1, productId);

    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      coverAmount,
      usdcRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
      PoolAsset.USDC,
    );

    const solverFee = ethers.parseUnits('10', 6);
    await usdc.connect(coverBuyer).approve(limitOrders.target, premium + solverFee);

    // Use USDC balances since we're using USDC payment method
    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeUSDC = await usdc.balanceOf(pool.target);

    const buyerBalanceBefore = await usdc.balanceOf(coverBuyer.address);
    const solverBalanceBefore = await usdc.balanceOf(orderSettler.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);
    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium + solverFee,
      buyer: coverBuyer.address,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      amount: coverAmount,
      paymentAsset: PoolAsset.USDC,
      coverAsset: PoolAsset.USDC,
      owner: coverBuyer.address,
    };

    const { signature, digest } = await signLimitOrder(
      limitOrders.target,
      { orderDetails, executionDetails },
      coverBuyer,
    );

    const tx = await limitOrders
      .connect(orderSettler)
      .executeOrder(
        { ...orderDetails, maxPremiumInAsset: premium },
        [{ poolId: 1, coverAmountInAsset: coverAmount }],
        executionDetails,
        signature,
        { fee: solverFee, feeDestination: orderSettler.address },
      );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, coverId, digest);

    const buyerBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const solverBalanceAfter = await usdc.balanceOf(orderSettler.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore + 1n);
    expect(buyerBalanceAfter).to.be.equal(buyerBalanceBefore - premium - solverFee);
    expect(solverBalanceAfter).to.be.equal(solverBalanceBefore + solverFee);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterUSDC = await usdc.balanceOf(pool.target);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const rewards = calculateRewards(premiumInNxm, timestamp, period);

    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterUSDC).to.be.equal(poolBeforeUSDC + premium);
  });

  it('should purchase new cover for a order creator with WETH', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, stakingProducts, pool, limitOrders, weth, coverNFT } = fixture.contracts;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const [coverBuyer] = fixture.accounts.nonMembers;
    const orderSettler = fixture.accounts.defaultSender;
    const { period, amount } = orderDetailsFixture;

    // convert ETH to WETH
    await weth.connect(coverBuyer).deposit({ value: parseEther('1') });
    await weth.connect(coverBuyer).approve(limitOrders.target, parseEther('1'));

    const productId = 0;
    const product = await stakingProducts.getProduct(1, productId);
    const ethRate = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);

    // calculate premium
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
      PoolAsset.ETH,
    );

    // get balances before
    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.target);

    const buyerWethBalanceBefore = await weth.balanceOf(coverBuyer.address);
    const solverWethBalanceBefore = await weth.balanceOf(orderSettler.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    const amountOver = parseEther('0.1');
    const solverFee = parseEther('0.001');
    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium + solverFee + amountOver,
      buyer: coverBuyer.address,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      paymentAsset: PoolAsset.ETH,
      coverAsset: PoolAsset.ETH,
      owner: coverBuyer.address,
    };

    const settlementDetails = {
      fee: solverFee,
      feeDestination: orderSettler.address,
    };

    const { signature, digest } = await signLimitOrder(
      limitOrders.target,
      { orderDetails, executionDetails },
      coverBuyer,
    );

    // execute order
    const tx = await limitOrders
      .connect(orderSettler)
      .executeOrder(
        { ...orderDetails, maxPremiumInAsset: premium + amountOver },
        [{ poolId: 1, coverAmountInAsset: amount }],
        executionDetails,
        signature,
        settlementDetails,
      );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, coverId, digest);

    // after balances
    const { timestamp } = await ethers.provider.getBlock('latest');
    const buyerWethBalanceAfter = await weth.balanceOf(coverBuyer.address);
    const solverWethBalanceAfter = await weth.balanceOf(orderSettler.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    // amountOver should have been refunded
    expect(buyerWethBalanceAfter).to.be.equal(buyerWethBalanceBefore - premium - solverFee);
    expect(solverWethBalanceAfter).to.be.equal(solverWethBalanceBefore + solverFee);
    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore + 1n);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.target);

    const rewards = calculateRewards(premiumInNxm, timestamp, period);

    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterETH).to.be.equal(poolEthBalanceBefore + premium);
  });

  it('should purchase new cover for a order creator with NXM', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, stakingProducts, pool, limitOrders, token: nxm, coverNFT } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const orderSettler = fixture.accounts.defaultSender;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const { period, amount } = orderDetailsFixture;

    // approve NXM to LimitOrders
    await nxm.connect(coverBuyer).approve(limitOrders.target, parseEther('2500'));

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');

    const productId = 0;
    const product = await stakingProducts.getProduct(1, productId);
    const ethRate = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);

    // calculate premium
    const { premiumInNxm: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
      PoolAsset.NXM,
    );

    // before balances
    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const nxmBalanceBefore = await nxm.balanceOf(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
      buyer: coverBuyer.address,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      paymentAsset: PoolAsset.NXM,
      owner: coverBuyer.address,
    };

    const { signature, digest } = await signLimitOrder(
      limitOrders.target,
      { orderDetails, executionDetails },
      coverBuyer,
    );

    // execute order
    const tx = await limitOrders
      .connect(orderSettler)
      .executeOrder(
        { ...orderDetails, maxPremiumInAsset: premium },
        [{ poolId: 1, coverAmountInAsset: amount }],
        executionDetails,
        signature,
        { fee: 0, feeDestination: orderSettler.address },
      );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, coverId, digest);

    // after balances
    const balanceAfterNXM = await nxm.balanceOf(coverBuyer.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore + 1n);
    expect(balanceAfterNXM).to.be.equal(nxmBalanceBefore - premium);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const rewards = calculateRewards(premium, timestamp, period);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards + rewards);
  });
});
