const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const {
  loadFixture,
  time,
  impersonateAccount,
  setNextBlockBaseFeePerGas,
} = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { Assets, SwapKind, PauseTypes } = nexus.constants;
const { parseEther } = ethers;

describe('swapETHForEnzymeVaultShare', function () {
  it('reverts if caller is not the swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { alice } = fixture.accounts;
    await expect(swapOperator.connect(alice).swapETHForEnzymeVaultShare(0, 0)) //
      .to.be.revertedWithCustomError(swapOperator, 'OnlyController');
  });

  it('reverts when swaps are paused (PAUSE_SWAPS or PAUSE_GLOBAL)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // pause swaps only
    await registry.setPauseConfig(PauseTypes.PAUSE_SWAPS);
    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);

    // pause globally
    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);
    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_SWAPS);
  });

  it("reverts if there's already an order in progress", async function () {
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

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'OrderInProgress')
      .withArgs(orderUID);
  });

  it('reverts when swapRequest.fromAsset is not ETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, weth } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(dai, weth);
  });

  it('reverts when swapRequest.toAsset is not the Enzyme vault', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(dai, fixture.contracts.enzymeV4Vault);
  });

  it('reverts when the deadline has expired', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 10,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);
    await time.increase(11);

    const { fromAmount, toAmount } = request;
    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, toAmount)) //
      .to.be.revertedWithCustomError(swapOperator, 'SwapDeadlineExceeded');
  });

  it('reverts when swapKind is not ExactInput', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const { fromAmount, toAmount } = request;
    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, toAmount)) //
      .to.be.revertedWithCustomError(swapOperator, 'InvalidSwapKind');
  });

  it('reverts when fromAmount is incorrect', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const { fromAmount, toAmount } = request;
    const incorrectFromAmount = request.fromAmount + 1n;

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(incorrectFromAmount, toAmount)) //
      .to.be.revertedWithCustomError(swapOperator, 'FromAmountMismatch')
      .withArgs(fromAmount, incorrectFromAmount);
  });

  it('reverts when toAmountMin < swapRequest.toAmount', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;

    const timestamp = await time.latest();
    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('10'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };
    await swapOperator.connect(governor).requestAssetSwap(request);

    const { fromAmount, toAmount } = request;
    const insufficientToAmount = toAmount - 1n;
    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, insufficientToAmount))
      .to.be.revertedWithCustomError(swapOperator, 'ToAmountTooLow')
      .withArgs(toAmount, insufficientToAmount);
  });

  it('reverts when denomination asset != WETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller, usdc } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // replace denomination asset with usdc
    await enzymeV4Comptroller.setDenominationAsset(usdc);

    const { fromAmount, toAmount } = request;
    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, toAmount)) //
      .to.be.revertedWithCustomError(swapOperator, 'InvalidDenominationAsset');
  });

  it('reverts when Enzyme returns insufficient shares', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('1');

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const sharesToMint = request.toAmount - 1n;
    const amountToPull = request.fromAmount;
    await enzymeV4Comptroller.setDepositMockAmounts(sharesToMint, amountToPull);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, toAmountMin)) //
      .to.be.revertedWithCustomError(swapOperator, 'SwappedToAmountTooLow')
      .withArgs(toAmountMin, sharesToMint);
  });

  it('reverts when spent is unexpectedly high', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller, weth } = fixture.contracts;
    const { defaultSender, governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('1');

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const sharesToMint = request.toAmount;
    const amountToPull = request.fromAmount;
    await enzymeV4Comptroller.setDepositMockAmounts(sharesToMint, amountToPull);

    // mint extra WETH to SwapOperator so we can spend more than expected
    const extraWeth = parseEther('10');
    await weth.connect(defaultSender).deposit({ value: extraWeth });
    await weth.transfer(swapOperator.target, extraWeth);

    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    const spender = await enzymeV4Comptroller.extraSpender();
    await setNextBlockBaseFeePerGas(0);
    await weth.connect(swapOperatorSigner).approve(spender, extraWeth, { maxPriorityFeePerGas: 0 });

    const extraExpense = 1n;
    await enzymeV4Comptroller.setExtraExpenseAmount(extraExpense);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, toAmountMin)) //
      .to.be.revertedWithCustomError(swapOperator, 'SwappedFromAmountTooHigh')
      .withArgs(fromAmount, fromAmount + extraExpense);
  });

  it('reverts when Enzyme attempts to spend more WETH than approved', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('100');

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // pull more than approved
    const weth = request.fromAmount + 1n;
    const shares = request.toAmount;
    await enzymeV4Comptroller.setDepositMockAmounts(shares, weth);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(fromAmount, toAmountMin)) //
      .to.be.revertedWith('ERC20: insufficient allowance');
  });

  it('swaps correct amounts of ETH for Enzyme vault shares', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller, enzymeV4Vault } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;

    const amountIn = parseEther('10');
    const minSharesOut = parseEther('9.9');
    const excessShares = parseEther('0.1');
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: amountIn,
      toAmount: minSharesOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const ethBefore = await ethers.provider.getBalance(pool.target);
    const sharesBefore = await enzymeV4Vault.balanceOf(pool);

    await enzymeV4Comptroller.setDepositMockAmounts(minSharesOut + excessShares, amountIn);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(amountIn, minSharesOut))
      .to.emit(enzymeV4Comptroller, 'BuyCalledWith')
      .withArgs(amountIn, minSharesOut);

    const ethAfter = await ethers.provider.getBalance(pool.target);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(ethAfter).to.equal(ethBefore - amountIn);
    expect(sharesAfter).to.be.equal(sharesBefore + minSharesOut + excessShares);
  });

  it('returns unspent eth to the pool on partial spend and extra returned shares', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller, enzymeV4Vault } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;

    const amountIn = parseEther('10');
    const amountInPartial = parseEther('9');
    const minSharesOut = parseEther('9.9');
    const excessShares = parseEther('0.1');
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: amountIn,
      toAmount: minSharesOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const ethBefore = await ethers.provider.getBalance(pool.target);
    const sharesBefore = await enzymeV4Vault.balanceOf(pool);

    await enzymeV4Comptroller.setDepositMockAmounts(minSharesOut + excessShares, amountInPartial);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(amountIn, minSharesOut))
      .to.emit(enzymeV4Comptroller, 'BuyCalledWith')
      .withArgs(amountIn, minSharesOut);

    const ethAfter = await ethers.provider.getBalance(pool.target);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(ethAfter).to.equal(ethBefore - amountInPartial);
    expect(sharesAfter).to.be.equal(sharesBefore + minSharesOut + excessShares);
  });

  it('reverts when called again without a new swap request', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller, weth } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;
    const timestamp = await time.latest();

    const amountIn = parseEther('10');
    const sharesOut = parseEther('1');

    const request = {
      fromAsset: Assets.ETH,
      toAsset: fixture.contracts.enzymeV4Vault,
      fromAmount: amountIn,
      toAmount: sharesOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);
    await enzymeV4Comptroller.setDepositMockAmounts(sharesOut, amountIn);

    await swapOperator.connect(swapController).swapETHForEnzymeVaultShare(amountIn, sharesOut);

    await expect(swapOperator.connect(swapController).swapETHForEnzymeVaultShare(amountIn, sharesOut))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(ethers.ZeroAddress, weth.target);
  });
});
