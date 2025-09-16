const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ContractIndexes, PauseTypes, SwapKind, Assets } = nexus.constants;
const { parseEther, parseUnits } = ethers;

describe('requestAssetSwap', function () {
  it('reverts if the caller is not the governor', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai } = fixture.contracts;
    const { alice } = fixture.accounts;

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(alice).requestAssetSwap(request))
      .to.be.revertedWithCustomError(swapOperator, 'Unauthorized')
      .withArgs(alice, 0, ContractIndexes.C_GOVERNOR);
  });

  it('reverts if the swaps are paused', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry, dai } = fixture.contracts;
    const { governor } = fixture.accounts;
    const timestamp = await time.latest();

    await registry.setPauseConfig(PauseTypes.PAUSE_SWAPS);

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(request))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);
  });

  it('reverts if the global pause is set', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry, dai } = fixture.contracts;
    const { governor } = fixture.accounts;
    const timestamp = await time.latest();

    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(request))
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_SWAPS);
  });

  it('reverts if one of the assets is abandoned', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, dai } = fixture.contracts;
    const { governor } = fixture.accounts;
    const timestamp = await time.latest();

    await pool.abandonAsset(dai);

    const daiToEthRequest = {
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(daiToEthRequest))
      .to.be.revertedWithCustomError(swapOperator, 'UnsupportedAsset')
      .withArgs(dai);

    const ethToDaiRequest = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(ethToDaiRequest))
      .to.be.revertedWithCustomError(swapOperator, 'UnsupportedAsset')
      .withArgs(dai);
  });

  it('reverts if one of the assets is not supported by the pool', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { governor } = fixture.accounts;
    const timestamp = await time.latest();
    const unsupportedAsset = await ethers.deployContract('ERC20Mock');

    const unsupportedToEthRequest = {
      fromAsset: unsupportedAsset,
      toAsset: Assets.ETH,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(unsupportedToEthRequest))
      .to.be.revertedWithCustomError(swapOperator, 'UnsupportedAsset')
      .withArgs(unsupportedAsset);

    const ethToUnsupportedRequest = {
      fromAsset: Assets.ETH,
      toAsset: unsupportedAsset,
      fromAmount: 1000,
      toAmount: 1000,
      deadline: timestamp + 1000,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(ethToUnsupportedRequest))
      .to.be.revertedWithCustomError(swapOperator, 'UnsupportedAsset')
      .withArgs(unsupportedAsset);
  });

  it('reverts if the deadline is in the past or equals to current timestamp', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai } = fixture.contracts;
    const { governor } = fixture.accounts;

    const currentTimestamp = await time.latest();
    const pastTimestamp = currentTimestamp - 1;

    const firstAttemptTimestamp = currentTimestamp + 1;
    const secondAttemptTimestamp = firstAttemptTimestamp + 10;

    await time.setNextBlockTimestamp(firstAttemptTimestamp);

    const expiredRequest = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1000'),
      deadline: pastTimestamp,
      swapKind: SwapKind.ExactInput,
    };
    const expiringRequest = { ...expiredRequest, deadline: secondAttemptTimestamp };

    await expect(swapOperator.connect(governor).requestAssetSwap(expiredRequest))
      .to.be.revertedWithCustomError(swapOperator, 'SwapDeadlineExceeded')
      .withArgs(pastTimestamp, firstAttemptTimestamp);

    await time.setNextBlockTimestamp(secondAttemptTimestamp);

    await expect(swapOperator.connect(governor).requestAssetSwap(expiringRequest))
      .to.be.revertedWithCustomError(swapOperator, 'SwapDeadlineExceeded')
      .withArgs(secondAttemptTimestamp, secondAttemptTimestamp);
  });

  it('successfully creates a swap request with valid parameters', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, usdc } = fixture.contracts;
    const { governor } = fixture.accounts;

    const timestamp = await time.latest();

    const request = {
      fromAsset: dai,
      toAsset: usdc,
      fromAmount: parseEther('1000'),
      toAmount: parseUnits('1000', 6),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);
    const storedRequest = await swapOperator.swapRequest();

    expect(storedRequest.fromAsset).to.equal(dai);
    expect(storedRequest.toAsset).to.equal(usdc);
    expect(storedRequest.fromAmount).to.equal(request.fromAmount);
    expect(storedRequest.toAmount).to.equal(request.toAmount);
    expect(storedRequest.deadline).to.equal(request.deadline);
    expect(storedRequest.swapKind).to.equal(SwapKind.ExactInput);
  });

  it('stores WETH address when fromAsset is ETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, weth } = fixture.contracts;
    const { governor } = fixture.accounts;

    const request = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1000'),
      deadline: (await time.latest()) + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const storedRequest = await swapOperator.swapRequest();
    expect(storedRequest.fromAsset).to.equal(weth);
    expect(storedRequest.toAsset).to.equal(dai);
  });

  it('stores WETH address when toAsset is ETH', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, weth } = fixture.contracts;
    const { governor } = fixture.accounts;

    const request = {
      fromAsset: dai,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1000'),
      toAmount: parseEther('1'),
      deadline: (await time.latest()) + 3600,
      swapKind: SwapKind.ExactOutput,
    };

    await swapOperator.connect(governor).requestAssetSwap(request);

    const storedRequest = await swapOperator.swapRequest();
    expect(storedRequest.fromAsset).to.equal(dai);
    expect(storedRequest.toAsset).to.equal(weth);
  });

  it('reverts when the assets are the same', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { governor } = fixture.accounts;
    const timestamp = await time.latest();

    const request = {
      fromAsset: Assets.ETH,
      toAsset: Assets.ETH,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(request))
      .to.be.revertedWithCustomError(swapOperator, 'SameAssetSwapRequest')
      .withArgs(Assets.ETH);
  });

  it('successfully overwrites an existing swap request', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, usdc } = fixture.contracts;
    const { governor } = fixture.accounts;
    const timestamp = await time.latest();

    const firstRequest = {
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: parseEther('1'),
      toAmount: parseEther('1000'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    };

    await swapOperator.connect(governor).requestAssetSwap(firstRequest);

    const secondRequest = {
      fromAsset: dai,
      toAsset: usdc,
      fromAmount: parseEther('500'),
      toAmount: parseUnits('500', 6),
      deadline: timestamp + 7200,
      swapKind: SwapKind.ExactOutput,
    };

    await expect(swapOperator.connect(governor).requestAssetSwap(secondRequest))
      .to.emit(swapOperator, 'SwapRequestCreated')
      .withArgs(
        secondRequest.fromAsset,
        secondRequest.toAsset,
        secondRequest.fromAmount,
        secondRequest.toAmount,
        secondRequest.swapKind,
        secondRequest.deadline,
      );

    const storedRequest = await swapOperator.swapRequest();

    expect(storedRequest.fromAsset).to.equal(secondRequest.fromAsset);
    expect(storedRequest.toAsset).to.equal(secondRequest.toAsset);
    expect(storedRequest.fromAmount).to.equal(secondRequest.fromAmount);
    expect(storedRequest.toAmount).to.equal(secondRequest.toAmount);
    expect(storedRequest.swapKind).to.equal(secondRequest.swapKind);
  });
});
