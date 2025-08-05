const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

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
});
