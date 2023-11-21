const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { PoolAsset } = require('../../../lib/constants');
const { setEtherBalance } = require('../utils').evm;
const setup = require('./setup');

const { parseEther } = ethers.utils;

describe('sendPayout', function () {
  it('transfers ERC20 payout to destination', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai } = fixture;
    const {
      internalContracts: [internal],
      generalPurpose: [destination],
    } = fixture.accounts;

    const payoutAmount = parseEther('1000');
    const depositAmount = parseEther('1');

    const tokenAmount = payoutAmount.mul(2);
    await dai.mint(pool.address, tokenAmount);

    const poolEthBalanceBefore = parseEther('1000');
    await setEtherBalance(pool.address, poolEthBalanceBefore);

    await pool.connect(internal).sendPayout(PoolAsset.DAI, destination.address, payoutAmount, depositAmount);
    const destinationBalance = await dai.balanceOf(destination.address);
    expect(destinationBalance).to.be.equal(payoutAmount);

    const poolTokenBalanceAfter = await dai.balanceOf(pool.address);
    expect(poolTokenBalanceAfter).to.be.equal(tokenAmount.sub(payoutAmount));

    const poolEthBalanceAfter = await ethers.provider.getBalance(pool.address);
    expect(poolEthBalanceAfter).to.be.equal(poolEthBalanceBefore.sub(depositAmount));
  });

  it('transfers ETH payout to destination with a zero deposit', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      internalContracts: [internal],
      nonMembers: [destination],
    } = fixture.accounts;

    const ethAmount = parseEther('10000');
    const amountToTransfer = ethAmount.div(2);
    await setEtherBalance(pool.address, ethAmount);

    const destinationBalancePrePayout = await ethers.provider.getBalance(destination.address);
    await pool.connect(internal).sendPayout(PoolAsset.ETH, destination.address, amountToTransfer, 0);
    const destinationBalance = await ethers.provider.getBalance(destination.address);
    expect(destinationBalance.sub(destinationBalancePrePayout)).to.be.equal(amountToTransfer);

    const poolBalance = await ethers.provider.getBalance(pool.address);
    expect(poolBalance).to.be.equal(ethAmount.sub(amountToTransfer));
  });

  it('transfers deposit to destination with a zero payout', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      internalContracts: [internal],
      nonMembers: [destination],
    } = fixture.accounts;

    const ethAmount = parseEther('10000');
    const amountToTransfer = ethAmount.div(2);
    await setEtherBalance(pool.address, ethAmount);

    const destinationBalancePrePayout = await ethers.provider.getBalance(destination.address);
    await pool.connect(internal).sendPayout(PoolAsset.ETH, destination.address, 0, amountToTransfer);
    const destinationBalance = await ethers.provider.getBalance(destination.address);
    expect(destinationBalance.sub(destinationBalancePrePayout)).to.be.equal(amountToTransfer);

    const poolBalance = await ethers.provider.getBalance(pool.address);
    expect(poolBalance).to.be.equal(ethAmount.sub(amountToTransfer));
  });

  it('transfers payout and deposit to destination', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      internalContracts: [internal],
      nonMembers: [destination],
    } = fixture.accounts;

    const assets = await pool.getAssets();
    const ethAmount = parseEther('10000');
    const amountToTransfer = ethAmount.div(2);
    const depositAmount = ethAmount.div(4);
    await setEtherBalance(pool.address, ethAmount);

    const destinationBalancePrePayout = await ethers.provider.getBalance(destination.address);
    const sendPayoutPromise = pool
      .connect(internal)
      .sendPayout(PoolAsset.ETH, destination.address, amountToTransfer, depositAmount);

    await expect(sendPayoutPromise)
      .to.emit(pool, 'DepositReturned')
      .withArgs(destination.address, depositAmount)
      .to.emit(pool, 'Payout')
      .withArgs(destination.address, assets[PoolAsset.ETH].assetAddress, amountToTransfer);

    const destinationBalance = await ethers.provider.getBalance(destination.address);
    const expectedTransferAmount = amountToTransfer.add(depositAmount);
    expect(destinationBalance.sub(destinationBalancePrePayout)).to.be.equal(expectedTransferAmount);

    const poolBalance = await ethers.provider.getBalance(pool.address);
    expect(poolBalance).to.be.equal(ethAmount.sub(expectedTransferAmount));
  });

  it('should revert on reentrancy', async function () {
    const fixture = await loadFixture(setup);
    const { pool, master } = fixture;

    const ethAmount = parseEther('10000');
    const amountToTransfer = ethAmount.div(4);
    const depositAmount = ethAmount.div(4);
    await setEtherBalance(pool.address, ethAmount);

    // set up reentrancyExploiter
    const ReentrancyExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrancyExploiter = await ReentrancyExploiter.deploy();
    const { data: sendPayoutData } = await pool.populateTransaction.sendPayout(
      PoolAsset.ETH,
      reentrancyExploiter.address,
      amountToTransfer,
      depositAmount,
    );

    // bypass onlyInternal modifier
    await master.enrollInternal(reentrancyExploiter.address);

    // this test guards against reentrancy as it will fail on a successful reentrancy attack (there will be no revert)
    const reentrancyAttackPromise = reentrancyExploiter.execute(pool.address, 0, sendPayoutData);
    await expect(reentrancyAttackPromise).to.be.revertedWith('Pool: ETH transfer failed');
  });

  it('should revert if ETH payout transfer failed', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const [internal] = fixture.accounts.internalContracts;

    const EtherRejecterMock = await ethers.getContractFactory('EtherRejecterMock');
    const { address } = await EtherRejecterMock.deploy();

    const amountToTransfer = parseEther('10000');
    const depositAmount = parseEther('1');

    const sendPayout = pool.connect(internal).sendPayout(PoolAsset.ETH, address, amountToTransfer, depositAmount);
    await expect(sendPayout).to.be.revertedWith('Pool: ETH transfer failed');
  });

  it('should revert if ETH deposit transfer failed', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai } = fixture;
    const [internal] = fixture.accounts.internalContracts;

    const PoolEtherRejecterMock = await ethers.getContractFactory('PoolEtherRejecterMock');
    const { address } = await PoolEtherRejecterMock.deploy();

    const amountToTransfer = parseEther('10000');
    const depositAmount = parseEther('1');

    await dai.mint(pool.address, amountToTransfer);

    const sendPayout = pool.connect(internal).sendPayout(PoolAsset.DAI, address, amountToTransfer, depositAmount);
    await expect(sendPayout).to.be.revertedWith('Pool: ETH transfer failed');
  });
});
