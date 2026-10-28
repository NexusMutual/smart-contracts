const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { Assets, SwapKind, PauseTypes } = nexus.constants;
const { parseEther } = ethers;

describe('swapEnzymeVaultShareForAsset', function () {
  it('reverts if caller is not the swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { alice } = fixture.accounts;

    await expect(swapOperator.connect(alice).swapEnzymeVaultShareForAsset(0, 0)) //
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
    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
    )
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);

    // pause globally
    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);
    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
    )
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

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(0, 0))
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

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
    )
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(dai, enzymeV4Vault);
  });

  it('reverts when there is no swap request', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Vault } = fixture.contracts;
    const { swapController } = fixture.accounts;

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(parseEther('1'), parseEther('1')))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(ethers.ZeroAddress, enzymeV4Vault);
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
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
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
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
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

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(incorrectFromAmount, request.toAmount),
    )
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
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, insufficientToAmount),
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
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
    ).to.be.revertedWithCustomError(swapOperator, 'InvalidDenominationAsset');
  });

  it('reverts when denomination asset != WETH even if toAsset is a non-WETH asset', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Comptroller, enzymeV4Vault, weEth, usdc } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: weEth,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);
    await enzymeV4Comptroller.setDenominationAsset(usdc);

    await expect(
      swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(request.fromAmount, request.toAmount),
    )
      .to.be.revertedWithCustomError(swapOperator, 'InvalidDenominationAsset')
      .withArgs(await swapOperator.weth(), usdc);
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

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin))
      .to.be.revertedWithCustomError(swapOperator, 'SwappedToAmountTooLow')
      .withArgs(toAmountMin, amountToPush);
  });

  it('reverts when Enzyme returns insufficient weETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Comptroller, enzymeV4Vault, weEth } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('0.9');

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: weEth,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, fromAmount);
    await swapOperator.connect(governor).requestAssetSwap(request);

    const amountToPush = toAmountMin - 1n;
    await enzymeV4Comptroller.setRedeemMockAmounts(fromAmount, amountToPush);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin))
      .to.be.revertedWithCustomError(swapOperator, 'SwappedToAmountTooLow')
      .withArgs(toAmountMin, amountToPush);
  });

  it('reverts when Enzyme pays out in a different asset than requested', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Comptroller, enzymeV4Vault, weEth, weth } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('0.9');

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: weEth,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, fromAmount);
    await swapOperator.connect(governor).requestAssetSwap(request);

    // weETH is requested but Enzyme pays out weth
    await enzymeV4Comptroller.setRedeemMockAmounts(fromAmount, toAmountMin);
    await enzymeV4Comptroller.setPayoutAssetOverride(weth);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin))
      .to.be.revertedWithCustomError(swapOperator, 'SwappedToAmountTooLow')
      .withArgs(toAmountMin, 0);
  });

  it('does not count the requested asset already held by SwapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, enzymeV4Comptroller, enzymeV4Vault, weEth } = fixture.contracts;
    const { governor, swapController } = fixture.accounts;
    const timestamp = await time.latest();

    const fromAmount = parseEther('1');
    const toAmountMin = parseEther('0.9');

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: weEth,
      fromAmount,
      toAmount: toAmountMin,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, fromAmount);
    await swapOperator.connect(governor).requestAssetSwap(request);

    // Enzyme pays out nothing, but SwapOperator already holds enough weETH to satisfy toAmountMin
    await enzymeV4Comptroller.setRedeemMockAmounts(fromAmount, 0);
    await weEth.mint(swapOperator, toAmountMin);

    // only the balance change counts, so the pre-existing weETH does not satisfy toAmountMin
    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin))
      .to.be.revertedWithCustomError(swapOperator, 'SwappedToAmountTooLow')
      .withArgs(toAmountMin, 0);
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

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin))
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

    const tx = swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(sharesIn, minEthOut);

    await expect(tx).to.emit(enzymeV4Comptroller, 'RedeemCalledWith').withArgs(swapOperator, sharesIn, [weth], [10000]);
    await expect(tx)
      .to.emit(swapOperator, 'Swapped')
      .withArgs(enzymeV4Vault, Assets.ETH, sharesIn, minEthOut + excessEth);

    const ethAfter = await ethers.provider.getBalance(pool);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(ethAfter).to.equal(ethBefore + minEthOut + excessEth);
    expect(sharesAfter).to.be.equal(sharesBefore - sharesIn);

    // nothing left in the swap operator
    expect(await ethers.provider.getBalance(swapOperator)).to.equal(0);
    expect(await weth.balanceOf(swapOperator)).to.equal(0);
    expect(await enzymeV4Vault.balanceOf(swapOperator)).to.equal(0);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.amount).to.equal(0);
  });

  it('redeems correct amounts of Enzyme vault shares for weETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller, enzymeV4Vault, weEth, weth } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;

    const sharesIn = parseEther('12');
    const minWeEthOut = parseEther('9.9');
    const excessWeEth = parseEther('0.1');
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: weEth,
      fromAmount: sharesIn,
      toAmount: minWeEthOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, sharesIn);
    await swapOperator.connect(governor).requestAssetSwap(request);

    const ethBefore = await ethers.provider.getBalance(pool);
    const weEthBefore = await weEth.balanceOf(pool);
    const sharesBefore = await enzymeV4Vault.balanceOf(pool);

    await enzymeV4Comptroller.setRedeemMockAmounts(sharesIn, minWeEthOut + excessWeEth);

    const tx = swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(sharesIn, minWeEthOut);

    await expect(tx)
      .to.emit(enzymeV4Comptroller, 'RedeemCalledWith')
      .withArgs(swapOperator, sharesIn, [weEth], [10000]);
    await expect(tx)
      .to.emit(swapOperator, 'Swapped')
      .withArgs(enzymeV4Vault, weEth, sharesIn, minWeEthOut + excessWeEth);

    const ethAfter = await ethers.provider.getBalance(pool);
    const weEthAfter = await weEth.balanceOf(pool);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(weEthAfter).to.equal(weEthBefore + minWeEthOut + excessWeEth);
    expect(sharesAfter).to.be.equal(sharesBefore - sharesIn);
    expect(ethAfter).to.equal(ethBefore); // no eth movement on a weETH payout

    // nothing left in the swap operator
    expect(await weEth.balanceOf(swapOperator)).to.equal(0);
    expect(await weth.balanceOf(swapOperator)).to.equal(0);
    expect(await ethers.provider.getBalance(swapOperator)).to.equal(0);
    expect(await enzymeV4Vault.balanceOf(swapOperator)).to.equal(0);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.amount).to.equal(0);
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

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(sharesIn, minEthOut))
      .to.emit(enzymeV4Comptroller, 'RedeemCalledWith')
      .withArgs(swapOperator, sharesIn, [weth], [10000]);

    const ethAfter = await ethers.provider.getBalance(pool);
    const sharesAfter = await enzymeV4Vault.balanceOf(pool);

    expect(ethAfter).to.equal(ethBefore + minEthOut + excessEth);
    expect(sharesAfter).to.be.equal(sharesBefore - sharesBurned);
    expect(await enzymeV4Vault.balanceOf(swapOperator)).to.equal(0);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.amount).to.equal(0);
  });

  it('returns unburned shares to the pool on partial redeem for weETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller, enzymeV4Vault, weEth } = fixture.contracts;
    const { swapController, governor } = fixture.accounts;

    const sharesIn = parseEther('12');
    const sharesBurned = parseEther('11');
    const minWeEthOut = parseEther('9.9');
    const timestamp = await time.latest();

    const request = {
      fromAsset: enzymeV4Vault,
      toAsset: weEth,
      fromAmount: sharesIn,
      toAmount: minWeEthOut,
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await enzymeV4Vault.mint(pool, sharesIn);
    await swapOperator.connect(governor).requestAssetSwap(request);

    const weEthBefore = await weEth.balanceOf(pool);
    const sharesBefore = await enzymeV4Vault.balanceOf(pool);

    await enzymeV4Comptroller.setRedeemMockAmounts(sharesBurned, minWeEthOut);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(sharesIn, minWeEthOut))
      .to.emit(swapOperator, 'Swapped')
      .withArgs(enzymeV4Vault, weEth, sharesBurned, minWeEthOut);

    expect(await weEth.balanceOf(pool)).to.equal(weEthBefore + minWeEthOut);
    expect(await enzymeV4Vault.balanceOf(pool)).to.be.equal(sharesBefore - sharesBurned);
    expect(await enzymeV4Vault.balanceOf(swapOperator)).to.equal(0);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.amount).to.equal(0);
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
    await swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(sharesIn, ethOut);

    await expect(swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(sharesIn, ethOut))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidAsset')
      .withArgs(ethers.ZeroAddress, enzymeV4Vault);
  });
});
