const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { Assets, SwapKind, PauseTypes } = nexus.constants;
const { parseEther } = ethers;

describe('swapEnzymeVaultShareForETH', function () {
  it('reverts if caller is not the swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { alice } = fixture.accounts;

    await expect(swapOperator.connect(alice).swapEnzymeVaultShareForETH(0, 0)) //
      .to.be.revertedWithCustomError(swapOperator, 'OnlyController');
  });

  it('reverts when swaps are paused (PAUSE_SWAPS or PAUSE_GLOBAL)', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // pause swaps only
    await registry.setPauseConfig(PauseTypes.PAUSE_SWAPS);
    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);

    // pause globally
    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);
    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount))
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
      sellAmount: request.fromAmount,
      buyAmount: request.toAmount,
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

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(0, 0))
      .to.be.revertedWithCustomError(swapOperator, 'OrderInProgress')
      .withArgs(orderUID);
  });

  it('reverts when swapRequest.fromAsset is not the Enzyme vault', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(dai, enzymeV4Vault);
  });

  it('reverts when swapRequest.toAsset is not WETH/ETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, enzymeV4Vault, weth } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(dai, weth);
  });

  it('reverts when the deadline has expired', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 10,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, request.fromAmount);

    await swapOperator.connect(governor).requestAssetSwap(request);
    await time.increase(11);

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount),
    ).to.be.revertedWithCustomError(swapOperator, 'SwapDeadlineExceeded');
  });

  it('reverts when swapKind is not ExactInput', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount),
    ).to.be.revertedWithCustomError(swapOperator, 'InvalidSwapKind');
  });

  it('reverts when fromAmount is incorrect', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('2'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const incorrectFromAmount = request.fromAmount + 1n;

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(incorrectFromAmount, request.toAmount))
      .to.be.revertedWithCustomError(swapOperator, 'FromAmountMismatch')
      .withArgs(request.fromAmount, incorrectFromAmount);
  });

  it('reverts when toAmountMin < swapRequest.toAmount', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;

    const timestamp = await time.latest();
    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('10'),
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const insufficientToAmount = request.toAmount - 1n;

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, insufficientToAmount),
    )
      .to.be.revertedWithCustomError(swapOperator, 'ToAmountTooLow')
      .withArgs(request.toAmount, insufficientToAmount);
  });

  it('reverts when denomination asset != WETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller, enzymeV4Vault, usdc } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    // replace denomination asset with usdc
    await enzymeV4Comptroller.setDenominationAsset(usdc);

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForETH(request.fromAmount, request.toAmount),
    ).to.be.revertedWithCustomError(swapOperator, 'InvalidDenominationAsset');
  });

  it('reverts when Enzyme returns insufficient ETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Comptroller, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('1');

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, fromAmount);
    await swapOperator.connect(governor).requestAssetSwap(request);

    const sharesToBurn = fromAmount;
    const amountToPush = toAmountMin - 1n; // insufficient ETH out
    await enzymeV4Comptroller.setRedeemMockAmounts(sharesToBurn, amountToPush);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(fromAmount, toAmountMin))
      .to.be.revertedWithCustomError(swapOperator, 'SwappedToAmountTooLow')
      .withArgs(toAmountMin, amountToPush);
  });

  it('reverts when spent (shares burned) is unexpectedly high', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Comptroller, enzymeV4Vault } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('1');

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    // mint requested shares to pool and extra shares directly to swap operator to simulate overspend
    await enzymeV4Vault.mint(pool, request.fromAmount);
    const extraShares = 1n;
    await enzymeV4Vault.mint(swapOperator, extraShares);

    await swapOperator.connect(governor).requestAssetSwap(request);

    const sharesToBurn = request.fromAmount + extraShares; // burn more than requested
    const amountToPush = request.toAmount; // meets min out
    await enzymeV4Comptroller.setRedeemMockAmounts(sharesToBurn, amountToPush);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(fromAmount, toAmountMin))
      .to.be.revertedWithCustomError(swapOperator, 'SwappedFromAmountTooHigh')
      .withArgs(fromAmount, sharesToBurn);
  });

  it('redeems correct amounts of Enzyme vault shares for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller, enzymeV4Vault, weth } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;

    const sharesIn = parseEther('10');
    const minEthOut = parseEther('9.9');
    const excessEth = parseEther('0.1');
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: sharesIn,
      toAmount: minEthOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, sharesIn);
    await swapOperator.connect(governor).requestAssetSwap(request);

    const ethBefore = await ethers.provider.getBalance(pool);
    const sharesBefore = await enzymeV4Vault.balanceOf(pool);

    await enzymeV4Comptroller.setRedeemMockAmounts(sharesIn, minEthOut + excessEth);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(sharesIn, minEthOut))
      .to.emit(enzymeV4Comptroller, 'RedeemCalledWith')
      .withArgs(swapOperator, sharesIn, [weth], [10000]);

    const ethAfter = await ethers.provider.getBalance(pool);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(ethAfter).to.equal(ethBefore + minEthOut + excessEth);
    expect(sharesAfter).to.be.equal(sharesBefore - sharesIn);
  });

  it('returns unburned shares to the pool on partial redeem and extra returned ETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller, enzymeV4Vault, weth } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;

    const sharesIn = parseEther('10');
    const sharesBurned = parseEther('9');
    const minEthOut = parseEther('9.9');
    const excessEth = parseEther('0.1');
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: sharesIn,
      toAmount: minEthOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, sharesIn);

    await swapOperator.connect(governor).requestAssetSwap(request);

    const ethBefore = await ethers.provider.getBalance(pool);
    const sharesBefore = await enzymeV4Vault.balanceOf(pool);

    await enzymeV4Comptroller.setRedeemMockAmounts(sharesBurned, minEthOut + excessEth);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(sharesIn, minEthOut))
      .to.emit(enzymeV4Comptroller, 'RedeemCalledWith')
      .withArgs(swapOperator, sharesIn, [weth], [10000]);

    const ethAfter = await ethers.provider.getBalance(pool);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(ethAfter).to.equal(ethBefore + minEthOut + excessEth);
    expect(sharesAfter).to.be.equal(sharesBefore - sharesBurned);
  });

  it('reverts when called again without a new swap request', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Comptroller, enzymeV4Vault } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;
    const timestamp = await time.latest();

    const sharesIn = parseEther('10');
    const ethOut = parseEther('1');

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: Assets.ETH,
      fromAmount: sharesIn,
      toAmount: ethOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);
    await enzymeV4Comptroller.setRedeemMockAmounts(sharesIn, ethOut);

    await enzymeV4Vault.mint(pool, sharesIn);
    await swapOperator.connect(swapController).swapEnzymeVaultShareForETH(sharesIn, ethOut);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForETH(sharesIn, ethOut))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(ethers.ZeroAddress, enzymeV4Vault);
  });
});
