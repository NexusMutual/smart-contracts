const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

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

  it('recovers ETH by sending it to the pool', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator, pool } = fixture.contracts;
    const { alice: receiver, swapController } = fixture.accounts;
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    const amountInPool = parseEther('2000');
    await fixture.accounts.defaultSender.sendTransaction({ to: swapOperator, value: amountInPool });

    const amountInSwapOperator = parseEther('10');
    await fixture.accounts.defaultSender.sendTransaction({ to: swapOperator, value: amountInSwapOperator });

    await swapOperator.connect(swapController).recoverAsset(ETH, receiver);

    const swapOperatorBalanceAfter = await ethers.provider.getBalance(swapOperator);
    const poolBalanceAfter = await ethers.provider.getBalance(pool);

    expect(swapOperatorBalanceAfter).to.be.equal(0n);
    expect(poolBalanceAfter).to.be.equal(amountInPool + amountInSwapOperator);
  });
});
