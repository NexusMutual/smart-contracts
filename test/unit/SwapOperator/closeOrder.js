const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setCode, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { SwapKind, Assets, PauseTypes } = nexus.constants;
const { parseEther } = ethers;

describe('closeOrder', function () {
  it('reverts if caller is not the swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { alice, governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600, // 1 hour from now
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await expect(swapOperator.connect(alice).closeOrder(order)) //
      .to.be.revertedWithCustomError(swapOperator, 'OnlyController');
  });

  it('reverts when swaps are paused (PAUSE_SWAPS) or paused globally (PAUSE_GLOBAL)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, registry } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await registry.setPauseConfig(PauseTypes.PAUSE_SWAPS);
    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);

    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);
    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_SWAPS);
  });

  it('reverts with NoOrderToClose when currentOrderUID is empty', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    expect(await swapOperator.currentOrderUID()).to.equal('0x');
    expect(await swapOperator.orderInProgress()).to.equal(false);

    await expect(swapOperator.connect(swapController).closeOrder(order)) //
      .to.be.revertedWithCustomError(swapOperator, 'NoOrderToClose');
  });

  it('reverts with OrderUidMismatch when order fields do not match', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    const wrongSellTokenOrder = { ...order, sellToken: dai };
    const wrongUID = await swapOperator.getUID(wrongSellTokenOrder);

    await expect(swapOperator.connect(swapController).closeOrder(wrongSellTokenOrder))
      .to.be.revertedWithCustomError(swapOperator, 'OrderUidMismatch')
      .withArgs(orderUID, wrongUID);
  });

  it('reverts with NoOrderToClose on second call after successful close', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await expect(swapOperator.connect(swapController).closeOrder(order)).to.not.be.reverted;
    expect(await swapOperator.currentOrderUID()).to.equal('0x');
    expect(await swapOperator.orderInProgress()).to.equal(false);

    await expect(swapOperator.connect(swapController).closeOrder(order)) // second close should fail
      .to.be.revertedWithCustomError(swapOperator, 'NoOrderToClose');
  });

  it('sets presignature to false on closeOrder', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, cowSettlement } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);
    expect(await cowSettlement.presignatures(orderUID)).to.equal(true);

    await swapOperator.connect(swapController).closeOrder(order);
    expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
  });

  it('calls invalidateOrder on cowSettlement', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, cowSettlement } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.emit(cowSettlement, 'InvalidateOrderCalledWith')
      .withArgs(orderUID);
  });

  it('zeroes allowance on sellToken to VaultRelayer', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await swapOperator.connect(swapController).placeOrder(order, orderUID);
    expect(await weth.allowance(swapOperator, cowVaultRelayer)).to.equal(order.sellAmount);
    expect(await dai.allowance(swapOperator, cowVaultRelayer)).to.equal(0);

    await swapOperator.connect(swapController).closeOrder(order);
    expect(await weth.allowance(swapOperator, cowVaultRelayer)).to.equal(0);
    expect(await dai.allowance(swapOperator, cowVaultRelayer)).to.equal(0);
  });

  it('clears currentOrderUID to empty bytes', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await swapOperator.connect(swapController).placeOrder(order, orderUID);
    expect(await swapOperator.currentOrderUID()).to.equal(orderUID);
    expect(await swapOperator.orderInProgress()).to.equal(true);

    await swapOperator.connect(swapController).closeOrder(order);
    expect(await swapOperator.currentOrderUID()).to.equal('0x');
    expect(await swapOperator.orderInProgress()).to.equal(false);
  });

  it('clears pool.assetInSwapOperator state for ETH to ERC20 swaps', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.emit(pool, 'ClearSwapAssetAmountCalled')
      .withArgs(Assets.ETH);
  });

  it('clears pool.assetInSwapOperator state for ERC20 to ETH swaps', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: dai,
      buyToken: weth,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.emit(pool, 'ClearSwapAssetAmountCalled')
      .withArgs(dai);
  });

  it('withdraws WETH balance to ETH and sends to Pool when the order is not filled', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // initial balances
    const poolEthBefore = await ethers.provider.getBalance(pool);
    const operatorWethBefore = await weth.balanceOf(swapOperator);
    expect(operatorWethBefore).to.equal(order.sellAmount);

    await swapOperator.connect(swapController).closeOrder(order);

    // final balances
    const poolEthAfter = await ethers.provider.getBalance(pool);
    const operatorWethAfter = await weth.balanceOf(swapOperator);

    expect(operatorWethAfter).to.equal(0);
    expect(poolEthAfter).to.equal(poolEthBefore + order.sellAmount);
  });

  it('returns remaining assets to Pool when the order is partially filled', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool, cowSettlement, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: true,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const poolEthBefore = await ethers.provider.getBalance(pool);
    const poolDaiBefore = await dai.balanceOf(pool);
    const operatorEthBefore = await ethers.provider.getBalance(swapOperator);
    const operatorWethBefore = await weth.balanceOf(swapOperator);
    const operatorDaiBefore = await dai.balanceOf(swapOperator);

    expect(operatorWethBefore).to.equal(0);
    expect(operatorDaiBefore).to.equal(0);
    expect(operatorEthBefore).to.equal(0);

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // partially fill the order and close it
    const soldAmount = parseEther('0.5');
    const boughtAmount = parseEther('1000');
    await dai.mint(cowVaultRelayer, boughtAmount);
    await cowSettlement.fill(order, orderUID, soldAmount, 0 /* fee */, boughtAmount);
    await swapOperator.connect(swapController).closeOrder(order);

    const poolEthAfter = await ethers.provider.getBalance(pool);
    const poolDaiAfter = await dai.balanceOf(pool);
    const operatorEthAfter = await ethers.provider.getBalance(swapOperator);
    const operatorWethAfter = await weth.balanceOf(swapOperator);
    const operatorDaiAfter = await dai.balanceOf(swapOperator);

    expect(poolEthAfter).to.equal(poolEthBefore - soldAmount);
    expect(poolDaiAfter).to.equal(poolDaiBefore + boughtAmount);
    expect(operatorWethAfter).to.equal(0);
    expect(operatorDaiAfter).to.equal(0);
    expect(operatorEthAfter).to.equal(0);
  });

  it('returns remaining assets to Pool when the order is completely filled', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool, cowSettlement, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    const poolEthBefore = await ethers.provider.getBalance(pool);
    const poolDaiBefore = await dai.balanceOf(pool);
    const operatorEthBefore = await ethers.provider.getBalance(swapOperator);
    const operatorWethBefore = await weth.balanceOf(swapOperator);
    const operatorDaiBefore = await dai.balanceOf(swapOperator);

    expect(operatorEthBefore).to.equal(0);
    expect(operatorWethBefore).to.equal(0);
    expect(operatorDaiBefore).to.equal(0);

    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // completely fill the order and close it
    const boughtAmount = order.buyAmount + parseEther('100'); // 100 extra dai
    await dai.mint(cowVaultRelayer, boughtAmount);
    await cowSettlement.fill(order, orderUID, order.sellAmount, 0 /* fee */, boughtAmount);
    await swapOperator.connect(swapController).closeOrder(order);

    const poolEthAfter = await ethers.provider.getBalance(pool);
    const poolDaiAfter = await dai.balanceOf(pool);
    const operatorEthAfter = await ethers.provider.getBalance(swapOperator);
    const operatorWethAfter = await weth.balanceOf(swapOperator);
    const operatorDaiAfter = await dai.balanceOf(swapOperator);

    expect(poolEthAfter).to.equal(poolEthBefore - order.sellAmount);
    expect(poolDaiAfter).to.equal(poolDaiBefore + boughtAmount);
    expect(operatorEthAfter).to.equal(0);
    expect(operatorWethAfter).to.equal(0);
    expect(operatorDaiAfter).to.equal(0);
  });

  it('returns WETH balance to Pool as ETH including any dust', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // add some dust WETH to the swap operator
    const dustAmount = parseEther('0.123');
    await weth.deposit({ value: dustAmount });
    await weth.transfer(swapOperator, dustAmount);

    const poolEthBefore = await ethers.provider.getBalance(pool);
    const operatorWethBefore = await weth.balanceOf(swapOperator);
    expect(operatorWethBefore).to.equal(order.sellAmount + dustAmount);

    await swapOperator.connect(swapController).closeOrder(order);

    const poolEthAfter = await ethers.provider.getBalance(pool);
    const operatorWethAfter = await weth.balanceOf(swapOperator);

    expect(operatorWethAfter).to.equal(0);
    expect(poolEthAfter).to.equal(poolEthBefore + order.sellAmount + dustAmount);
  });

  it('reverts if the pool rejects ETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, pool } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // deploying with an empty array because we only care about the contract bytecode
    const poolRejectingEth = await ethers.deployContract('SOMockPoolRejectingEth', [[]]);
    const bytecode = await ethers.provider.getCode(poolRejectingEth);
    await setCode(pool.target, bytecode);

    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.be.revertedWithCustomError(swapOperator, 'TransferFailed')
      .withArgs(pool, order.sellAmount, Assets.ETH);
  });

  it('emits an event with the correct swapped amounts', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, cowSettlement, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    await swapOperator.connect(governor).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    });

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: true,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // partially fill the order and close it
    const soldAmount = parseEther('0.5');
    const boughtAmount = parseEther('1000');
    await dai.mint(cowVaultRelayer, boughtAmount);
    await cowSettlement.fill(order, orderUID, soldAmount, 0 /* fee */, boughtAmount);

    const orderAsArray = [
      order.sellToken,
      order.buyToken,
      order.receiver,
      order.sellAmount,
      order.buyAmount,
      order.validTo,
      order.appData,
      order.feeAmount,
      order.kind,
      order.partiallyFillable,
      order.sellTokenBalance,
      order.buyTokenBalance,
    ];

    await expect(swapOperator.connect(swapController).closeOrder(order))
      .to.emit(swapOperator, 'OrderClosed')
      .withArgs(orderAsArray, soldAmount);
  });
});
