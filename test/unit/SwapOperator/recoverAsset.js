const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance, setCode, setStorageAt } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ETH } = nexus.constants.Assets;
const { PauseTypes } = nexus.constants;

const { parseEther } = ethers;

describe('recoverAsset', function () {
  it('recovers enzyme vault shares by sending them to the pool', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, enzymeV4Vault, pool } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    const amountInPool = parseEther('2000');
    await enzymeV4Vault.mint(pool, amountInPool);

    const amountInSwapOperator = parseEther('10');
    await enzymeV4Vault.mint(swapOperator, amountInSwapOperator);

    await swapOperator.connect(swapController).recoverAsset(enzymeV4Vault, receiver);

    const swapOperatorBalanceAfter = await enzymeV4Vault.balanceOf(swapOperator);
    const poolBalanceAfter = await enzymeV4Vault.balanceOf(pool);

    expect(swapOperatorBalanceAfter).to.be.equal(0n);
    expect(poolBalanceAfter).to.be.equal(amountInPool + amountInSwapOperator);
  });

  it('recovers arbitrary unknown asset by sending it to the receiver', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const arbitraryAsset = await ERC20Mock.deploy();

    const amountInSwapOperator = parseEther('10');
    await arbitraryAsset.mint(swapOperator, amountInSwapOperator);

    await swapOperator.connect(swapController).recoverAsset(arbitraryAsset, receiver);
    const balanceAfter = await arbitraryAsset.balanceOf(receiver);

    expect(balanceAfter).to.be.equal(amountInSwapOperator);
  });

  it('recovers abandoned asset by sending it to the receiver', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai, pool } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    const amountInSwapOperator = parseEther('10');
    await dai.mint(swapOperator, amountInSwapOperator);

    // mark as abandoned
    await pool.abandonAsset(dai);

    await swapOperator.connect(swapController).recoverAsset(dai, receiver);
    const balanceAfter = await dai.balanceOf(receiver);

    expect(balanceAfter).to.be.equal(amountInSwapOperator);
  });

  it('reverts if the caller is not the swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai } = fixture.contracts;
    const { alice } = fixture.accounts;

    const amountInSwapOperator = parseEther('10');
    await dai.mint(swapOperator, amountInSwapOperator);

    await expect(swapOperator.connect(alice).recoverAsset(dai, alice)) // alice is unauthorized
      .to.be.revertedWithCustomError(swapOperator, 'OnlyController');
  });

  it('reverts if the swaps are paused', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    await registry.setPauseConfig(PauseTypes.PAUSE_SWAPS);

    await expect(swapOperator.connect(swapController).recoverAsset(ETH, receiver)) // recover while swaps are paused
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);
  });

  it('reverts if the global pause is set', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, registry } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    await registry.setPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(swapOperator.connect(swapController).recoverAsset(ETH, receiver)) // recover while global pause is set
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_SWAPS);
  });

  it('reverts if the ETH transfer to pool fails', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool } = fixture.contracts;
    const { alice: receiver, swapController, defaultSender } = fixture.accounts;
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    const amountInSwapOperator = parseEther('10');
    await defaultSender.sendTransaction({ to: swapOperator, value: amountInSwapOperator });

    // replace the Pool contract with EthRejecter bytecode
    const ethRejecter = await ethers.deployContract('EtherRejecterMock');
    const ethRejecterBytecode = await ethers.provider.getCode(ethRejecter);
    await setCode(pool.target, ethRejecterBytecode);

    await expect(swapOperator.connect(swapController).recoverAsset(ETH, receiver)) // should fail
      .to.be.revertedWithCustomError(swapOperator, 'TransferFailed')
      .withArgs(pool, amountInSwapOperator, ETH);
  });

  it('recovers ETH by sending it to the pool', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    const amountInPool = parseEther('2000');
    await setBalance(pool.target, amountInPool);

    const amountInSwapOperator = parseEther('10');
    await setBalance(swapOperator.target, amountInSwapOperator);

    await swapOperator.connect(swapController).recoverAsset(ETH, receiver);

    const swapOperatorBalanceAfter = await ethers.provider.getBalance(swapOperator);
    const poolBalanceAfter = await ethers.provider.getBalance(pool);

    expect(swapOperatorBalanceAfter).to.be.equal(0n);
    expect(poolBalanceAfter).to.be.equal(amountInPool + amountInSwapOperator);
  });

  it('recovers wETH by unwrapping it and sending it to the pool', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool, weth } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    // initial eth
    const initialPoolBalance = await ethers.provider.getBalance(pool);

    // initial weth
    const initialPoolWethBalance = await weth.balanceOf(pool);
    const initialSwapOperatorWethBalance = await weth.balanceOf(swapOperator);

    // mint some WETH amounts
    const wethAddedToSwapOperator = parseEther('10');
    await weth.deposit({ value: wethAddedToSwapOperator });
    await weth.transfer(swapOperator, wethAddedToSwapOperator);

    // drop some ETH
    const ethAmountInSwapOperator = parseEther('20');
    await setBalance(swapOperator.target, ethAmountInSwapOperator);

    // recover
    await swapOperator.connect(swapController).recoverAsset(weth, receiver);

    // weth checks
    expect(await weth.balanceOf(swapOperator)).to.be.equal(0n);
    expect(await weth.balanceOf(pool)).to.be.equal(initialPoolWethBalance); // no extra weth sent to the pool

    // eth checks
    expect(await ethers.provider.getBalance(swapOperator)).to.be.equal(0n); // no eth left behind
    expect(await ethers.provider.getBalance(pool)).to.be.equal(
      initialPoolBalance + initialSwapOperatorWethBalance + wethAddedToSwapOperator + ethAmountInSwapOperator,
    );
  });

  it('reverts if ETH balance is 0', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    expect(await ethers.provider.getBalance(swapOperator)).to.be.equal(0n);

    await expect(swapOperator.connect(swapController).recoverAsset(ETH, receiver)) // recover zero balance
      .to.be.revertedWithCustomError(swapOperator, 'ZeroBalance');
  });

  it('reverts if wETH balance is 0', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, weth } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    expect(await weth.balanceOf(swapOperator)).to.be.equal(0n);

    await expect(swapOperator.connect(swapController).recoverAsset(weth, receiver)) // recover zero balance
      .to.be.revertedWithCustomError(swapOperator, 'ZeroBalance');
  });

  it('reverts if the token balance is 0', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    expect(await dai.balanceOf(swapOperator)).to.be.equal(0n);

    await expect(swapOperator.connect(swapController).recoverAsset(dai, receiver)) // recover zero balance
      .to.be.revertedWithCustomError(swapOperator, 'ZeroBalance');
  });

  it('reverts if the token balance is 0', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, dai } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    expect(await dai.balanceOf(swapOperator)).to.be.equal(0n);

    await expect(swapOperator.connect(swapController).recoverAsset(dai, receiver)) // recover zero balance
      .to.be.revertedWithCustomError(swapOperator, 'ZeroBalance');
  });

  it('reverts if there is an order in progress', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;

    // store `ABC` under slot 6 (currentOrderUID)
    // 0x414243 is the hex encoding of "ABC", 0x06 is the length * 2
    const value = '0x4142430000000000000000000000000000000000000000000000000000000006';
    await setStorageAt(swapOperator.target, '0x06', value);

    // check the storage is correct set
    expect(await swapOperator.currentOrderUID()).to.be.equal('0x414243');

    await expect(swapOperator.connect(swapController).recoverAsset(ETH, receiver)) // recover while order is in progress
      .to.be.revertedWithCustomError(swapOperator, 'OrderInProgress')
      .withArgs('0x414243');
  });
});
