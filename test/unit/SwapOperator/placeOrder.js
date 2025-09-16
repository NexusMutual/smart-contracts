const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { PauseTypes, SwapKind, Assets } = nexus.constants;
const { parseEther, ZeroAddress } = ethers;

describe('placeOrder', function () {
  it('reverts if caller is not the swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { alice, governor } = fixture.accounts;
    const timestamp = await time.latest();

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

    const orderUID = ethers.randomBytes(56);

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    await expect(swapOperator.connect(alice).placeOrder(order, orderUID)).to.be.revertedWithCustomError(
      swapOperator,
      'OnlyController',
    );
  });

  it('reverts when swaps are paused (PAUSE_SWAPS) or paused globally (PAUSE_GLOBAL)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const orderUID = ethers.randomBytes(56);
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

    // set swap pause
    await registry.setPauseConfig(PauseTypes.PAUSE_SWAPS);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);

    // set global pause
    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_SWAPS);
  });

  it("reverts if there's already an order in progress", async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: (await time.latest()) + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2000'),
      validTo: (await time.latest()) + 3600, // 1 hour from now
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await swapOperator.connect(swapController).placeOrder(order, orderUID);
    expect(await swapOperator.currentOrderUID()).to.be.equal(orderUID);
    expect(await swapOperator.orderInProgress()).to.be.true;

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'OrderInProgress')
      .withArgs(orderUID);
  });

  it('reverts if the order UID is invalid', async function () {
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
      validTo: timestamp + 3600, // 1 hour from now
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = ethers.randomBytes(56);
    const calculatedOrderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'OrderUidMismatch')
      .withArgs(orderUID, calculatedOrderUID);
  });

  it('reverts if the order contains unexpected values', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai, usdc } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

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

    // wrong sellToken
    const wrongSellTokenOrder = { ...order, sellToken: usdc };
    const wrongSellTokenOrderUID = await swapOperator.getUID(wrongSellTokenOrder);

    await expect(swapOperator.connect(swapController).placeOrder(wrongSellTokenOrder, wrongSellTokenOrderUID))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(weth, wrongSellTokenOrder.sellToken);

    // wrong buyToken
    const wrongBuyTokenOrder = { ...order, buyToken: usdc };
    const wrongBuyTokenOrderUID = await swapOperator.getUID(wrongBuyTokenOrder);

    await expect(swapOperator.connect(swapController).placeOrder(wrongBuyTokenOrder, wrongBuyTokenOrderUID))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(request.toAsset, wrongBuyTokenOrder.buyToken);

    // note: SwapDeadlineExceeded is tested last since we advance the time

    // MIN_VALID_TO_PERIOD = 600; // 10 minutes
    const validToTooSmallOrder = { ...order, validTo: timestamp + 10 };
    const validToTooSmallOrderUID = await swapOperator.getUID(validToTooSmallOrder);

    await expect(swapOperator.connect(swapController).placeOrder(validToTooSmallOrder, validToTooSmallOrderUID)) //
      .to.be.revertedWithCustomError(swapOperator, 'BelowMinValidTo');

    // MAX_VALID_TO_PERIOD = 31 days; // 1 month
    const validToTooLargeOrder = { ...order, validTo: timestamp + 31 * 24 * 60 * 60 + 10 };
    const validToTooLargeOrderUID = await swapOperator.getUID(validToTooLargeOrder);
    await expect(swapOperator.connect(swapController).placeOrder(validToTooLargeOrder, validToTooLargeOrderUID)) //
      .to.be.revertedWithCustomError(swapOperator, 'AboveMaxValidTo');

    // wrong receiver
    const wrongReceiverOrder = { ...order, receiver: weth }; // set weth as receiver
    const wrongReceiverOrderUID = await swapOperator.getUID(wrongReceiverOrder);
    await expect(swapOperator.connect(swapController).placeOrder(wrongReceiverOrder, wrongReceiverOrderUID)) //
      .to.be.revertedWithCustomError(swapOperator, 'InvalidReceiver')
      .withArgs(swapOperator);

    // wrong sellTokenBalance
    const badSellTokenBalanceOrder = { ...order, sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('dummy')) };
    const badSellTokenBalanceOrderUID = await swapOperator.getUID(badSellTokenBalanceOrder);
    await expect(swapOperator.connect(swapController).placeOrder(badSellTokenBalanceOrder, badSellTokenBalanceOrderUID))
      .to.be.revertedWithCustomError(swapOperator, 'UnsupportedTokenBalance')
      .withArgs('sell');

    // wrong buyTokenBalance
    const badBuyTokenBalanceOrder = { ...order, buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('dummy')) };
    const badBuyTokenBalanceOrderUID = await swapOperator.getUID(badBuyTokenBalanceOrder);
    await expect(swapOperator.connect(swapController).placeOrder(badBuyTokenBalanceOrder, badBuyTokenBalanceOrderUID))
      .to.be.revertedWithCustomError(swapOperator, 'UnsupportedTokenBalance')
      .withArgs('buy');

    // non-zero feeAmount
    const nonZeroFeeAmountOrder = { ...order, feeAmount: '1' };
    const nonZeroFeeAmountOrderUID = await swapOperator.getUID(nonZeroFeeAmountOrder);
    await expect(swapOperator.connect(swapController).placeOrder(nonZeroFeeAmountOrder, nonZeroFeeAmountOrderUID)) //
      .to.be.revertedWithCustomError(swapOperator, 'FeeNotZero');

    // correct order but expired swap request deadline
    const currentTimestamp = await time.latest();
    const orderSubmissionTimestamp = currentTimestamp + 1000;
    await time.setNextBlockTimestamp(orderSubmissionTimestamp);

    await expect(swapOperator.connect(swapController).placeOrder(order, await swapOperator.getUID(order)))
      .to.be.revertedWithCustomError(swapOperator, 'SwapDeadlineExceeded')
      .withArgs(request.deadline, orderSubmissionTimestamp);
  });

  it('reverts if sellAmount does not equal swapRequest.fromAmount (ExactInput)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('2'), // mismatch
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

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'FromAmountMismatch')
      .withArgs(request.fromAmount, order.sellAmount);
  });

  it('reverts if buyAmount is lower than swapRequest.toAmount (ExactInput)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('1500'), // too low
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'ToAmountTooLow')
      .withArgs(request.toAmount, order.buyAmount);
  });

  it('reverts if sellAmount exceeds swapRequest.fromAmount (ExactOutput)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: parseEther('2000'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: dai,
      buyToken: weth,
      receiver: swapOperator,
      sellAmount: parseEther('3000'), // exceeds
      buyAmount: parseEther('1'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'FromAmountTooHigh')
      .withArgs(request.fromAmount, order.sellAmount);
  });

  it('reverts if buyAmount does not match swapRequest.toAmount (ExactOutput)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: parseEther('2000'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: dai,
      buyToken: weth,
      receiver: swapOperator,
      sellAmount: parseEther('1500'), // within limit
      buyAmount: parseEther('2'), // mismatch
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'ToAmountMismatch')
      .withArgs(request.toAmount, order.buyAmount);
  });

  it('reverts if sellToken is enzyme vault', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: enzymeV4Vault,
      buyToken: weth,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('1'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidSwapOperationForAsset')
      .withArgs(enzymeV4Vault);
  });

  it('reverts if buyToken is enzyme vault', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: weth,
      buyToken: enzymeV4Vault,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('1'),
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidSwapOperationForAsset')
      .withArgs(enzymeV4Vault);
  });

  it('places an ETH to ERC20 order', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, weth, dai, cowSettlement, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // eth balances
    const poolEthBalanceBefore = await ethers.provider.getBalance(pool);
    const wethContractEthBalanceBefore = await ethers.provider.getBalance(weth);
    const swapOperatorEthBalanceBefore = await ethers.provider.getBalance(swapOperator);

    // weth balances
    const poolWethBalanceBefore = await weth.balanceOf(pool);
    const swapOperatorWethBalanceBefore = await weth.balanceOf(swapOperator);

    // dai balances
    const poolDaiBalanceBefore = await dai.balanceOf(pool);
    const swapOperatorDaiBalanceBefore = await dai.balanceOf(swapOperator);

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
    const tx = await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // check the effects
    await expect(tx).to.emit(pool, 'TransferAssetToSwapOperatorCalled').withArgs(Assets.ETH, request.fromAmount);

    await expect(tx)
      .to.emit(swapOperator, 'OrderPlaced')
      .withArgs([
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
      ]);

    // eth balances
    const poolEthBalanceAfter = await ethers.provider.getBalance(pool);
    const wethContractEthBalanceAfter = await ethers.provider.getBalance(weth);
    const swapOperatorEthBalanceAfter = await ethers.provider.getBalance(swapOperator);

    // weth balances
    const poolWethBalanceAfter = await weth.balanceOf(pool);
    const swapOperatorWethBalanceAfter = await weth.balanceOf(swapOperator);

    // dai balances
    const poolDaiBalanceAfter = await dai.balanceOf(pool);
    const swapOperatorDaiBalanceAfter = await dai.balanceOf(swapOperator);

    expect(poolEthBalanceAfter).to.be.equal(poolEthBalanceBefore - request.fromAmount);
    expect(wethContractEthBalanceAfter).to.be.equal(wethContractEthBalanceBefore + request.fromAmount);
    expect(swapOperatorEthBalanceAfter).to.be.equal(swapOperatorEthBalanceBefore);

    expect(poolWethBalanceAfter).to.be.equal(poolWethBalanceBefore);
    expect(swapOperatorWethBalanceAfter).to.be.equal(swapOperatorWethBalanceBefore + request.fromAmount);

    expect(poolDaiBalanceAfter).to.be.equal(poolDaiBalanceBefore);
    expect(swapOperatorDaiBalanceAfter).to.be.equal(swapOperatorDaiBalanceBefore);

    expect(await swapOperator.swapRequest()).to.be.deep.equal([
      0n, // fromAmount
      0n, // toAmount
      ZeroAddress, // fromAsset
      ZeroAddress, // toAsset
      SwapKind.ExactInput, // swapKind
      0n, // deadline
    ]);

    expect(await cowSettlement.presignatures(orderUID)).to.be.equal(true);
    expect(await swapOperator.currentOrderUID()).to.be.equal(orderUID);
    expect(await swapOperator.orderInProgress()).to.be.true;

    const allowance = await weth.allowance(swapOperator, cowVaultRelayer);
    expect(allowance).to.be.equal(order.sellAmount);
  });

  it('places an ERC20 to ETH order', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, weth, dai, cowSettlement, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: parseEther('2000'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // eth balances
    const poolEthBalanceBefore = await ethers.provider.getBalance(pool);
    const wethContractEthBalanceBefore = await ethers.provider.getBalance(weth);
    const swapOperatorEthBalanceBefore = await ethers.provider.getBalance(swapOperator);

    // weth balances
    const poolWethBalanceBefore = await weth.balanceOf(pool);
    const swapOperatorWethBalanceBefore = await weth.balanceOf(swapOperator);

    // dai balances
    const poolDaiBalanceBefore = await dai.balanceOf(pool);
    const swapOperatorDaiBalanceBefore = await dai.balanceOf(swapOperator);

    const order = {
      sellToken: dai,
      buyToken: weth,
      receiver: swapOperator,
      sellAmount: parseEther('2000'),
      buyAmount: parseEther('1'),
      validTo: timestamp + 3600, // 1 hour from now
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('sell')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);
    const tx = await swapOperator.connect(swapController).placeOrder(order, orderUID);

    // check the effects
    await expect(tx).to.emit(pool, 'TransferAssetToSwapOperatorCalled').withArgs(dai, request.fromAmount);

    await expect(tx)
      .to.emit(swapOperator, 'OrderPlaced')
      .withArgs([
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
      ]);

    // eth balances
    const poolEthBalanceAfter = await ethers.provider.getBalance(pool);
    const wethContractEthBalanceAfter = await ethers.provider.getBalance(weth);
    const swapOperatorEthBalanceAfter = await ethers.provider.getBalance(swapOperator);

    // weth balances
    const poolWethBalanceAfter = await weth.balanceOf(pool);
    const swapOperatorWethBalanceAfter = await weth.balanceOf(swapOperator);

    // dai balances
    const poolDaiBalanceAfter = await dai.balanceOf(pool);
    const swapOperatorDaiBalanceAfter = await dai.balanceOf(swapOperator);

    // initial allowances should be zero
    expect(await weth.allowance(swapOperator, cowVaultRelayer)).to.be.equal(0);
    expect(await dai.allowance(swapOperator, cowVaultRelayer)).to.be.equal(request.fromAmount);

    expect(poolEthBalanceAfter).to.be.equal(poolEthBalanceBefore);
    expect(wethContractEthBalanceAfter).to.be.equal(wethContractEthBalanceBefore);
    expect(swapOperatorEthBalanceAfter).to.be.equal(swapOperatorEthBalanceBefore);

    expect(poolWethBalanceAfter).to.be.equal(poolWethBalanceBefore);
    expect(swapOperatorWethBalanceAfter).to.be.equal(swapOperatorWethBalanceBefore);

    expect(poolDaiBalanceAfter).to.be.equal(poolDaiBalanceBefore - request.fromAmount);
    expect(swapOperatorDaiBalanceAfter).to.be.equal(swapOperatorDaiBalanceBefore + request.fromAmount);

    expect(await swapOperator.swapRequest()).to.be.deep.equal([
      0n, // fromAmount
      0n, // toAmount
      ZeroAddress, // fromAsset
      ZeroAddress, // toAsset
      SwapKind.ExactInput, // swapKind
      0n, // deadline
    ]);

    expect(await cowSettlement.presignatures(orderUID)).to.be.equal(true);
    expect(await swapOperator.currentOrderUID()).to.be.equal(orderUID);
    expect(await swapOperator.orderInProgress()).to.be.true;

    // final allowances
    expect(await dai.allowance(swapOperator, cowVaultRelayer)).to.be.equal(request.fromAmount);
    expect(await weth.allowance(swapOperator, cowVaultRelayer)).to.be.equal(0);
  });

  it('places an ERC20 to ERC20 order', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, dai, usdc, cowSettlement, cowVaultRelayer } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: usdc,
      fromAmount: parseEther('2000'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // balances before
    const poolDaiBalanceBefore = await dai.balanceOf(pool);
    const swapOperatorDaiBalanceBefore = await dai.balanceOf(swapOperator);
    const poolUsdcBalanceBefore = await usdc.balanceOf(pool);
    const swapOperatorUsdcBalanceBefore = await usdc.balanceOf(swapOperator);

    const order = {
      sellToken: dai,
      buyToken: usdc,
      receiver: swapOperator,
      sellAmount: parseEther('2000'),
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
    const tx = await swapOperator.connect(swapController).placeOrder(order, orderUID);

    await expect(tx).to.emit(pool, 'TransferAssetToSwapOperatorCalled').withArgs(dai, request.fromAmount);

    await expect(tx)
      .to.emit(swapOperator, 'OrderPlaced')
      .withArgs([
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
      ]);

    // balances after
    const poolDaiBalanceAfter = await dai.balanceOf(pool);
    const swapOperatorDaiBalanceAfter = await dai.balanceOf(swapOperator);
    const poolUsdcBalanceAfter = await usdc.balanceOf(pool);
    const swapOperatorUsdcBalanceAfter = await usdc.balanceOf(swapOperator);

    expect(poolDaiBalanceAfter).to.be.equal(poolDaiBalanceBefore - request.fromAmount);
    expect(swapOperatorDaiBalanceAfter).to.be.equal(swapOperatorDaiBalanceBefore + request.fromAmount);

    expect(poolUsdcBalanceAfter).to.be.equal(poolUsdcBalanceBefore);
    expect(swapOperatorUsdcBalanceAfter).to.be.equal(swapOperatorUsdcBalanceBefore);

    expect(await swapOperator.swapRequest()).to.be.deep.equal([
      0n, // fromAmount
      0n, // toAmount
      ZeroAddress, // fromAsset
      ZeroAddress, // toAsset
      SwapKind.ExactInput, // swapKind
      0n, // deadline
    ]);

    expect(await cowSettlement.presignatures(orderUID)).to.be.equal(true);
    expect(await swapOperator.currentOrderUID()).to.be.equal(orderUID);
    expect(await swapOperator.orderInProgress()).to.be.true;

    // final allowances
    expect(await dai.allowance(swapOperator, cowVaultRelayer)).to.be.equal(request.fromAmount);
    expect(await usdc.allowance(swapOperator, cowVaultRelayer)).to.be.equal(0);
  });

  // todo: seems to be a duplicated test in attempt to hit 100% coverage
  //       for some reason it doesn't report that line as covered anyway
  it('reverts when SwapKind is ExactOutput and buyAmount != swapRequest.toAmount', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2000'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const order = {
      sellToken: weth,
      buyToken: dai,
      receiver: swapOperator,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('2001'), // not equal to request.toAmount
      validTo: timestamp + 3600,
      appData: ethers.ZeroHash,
      feeAmount: 0,
      kind: ethers.keccak256(ethers.toUtf8Bytes('buy')),
      partiallyFillable: false,
      sellTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
      buyTokenBalance: ethers.keccak256(ethers.toUtf8Bytes('erc20')),
    };

    const orderUID = await swapOperator.getUID(order);

    await expect(swapOperator.connect(swapController).placeOrder(order, orderUID))
      .to.be.revertedWithCustomError(swapOperator, 'ToAmountMismatch')
      .withArgs(request.toAmount, order.buyAmount);
  });
});
