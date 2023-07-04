const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { ETH } = require('../../../lib/constants').Assets;
const {
  utils: { parseEther },
} = ethers;

describe('swapEnzymeVaultShareForETH', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('should revert when called while the system is paused', async function () {
    const { pool, master, enzymeV4Vault, swapOperator } = fixture.contracts;
    const governance = fixture.accounts.governanceAccounts[0];

    await enzymeV4Vault.mint(pool.address, parseEther('2000'));
    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
    );

    await master.pause();

    await expect(swapOperator.swapEnzymeVaultShareForETH('0', '0')).to.be.revertedWith('System is paused');
  });

  it('should revert when called by an address that is not swap controller', async function () {
    const { swapOperator } = fixture.contracts;

    const nobody = fixture.accounts.nonMembers[0];

    await expect(swapOperator.connect(nobody).swapEnzymeVaultShareForETH('0', '0')).to.be.revertedWith(
      'SwapOp: only controller can execute',
    );
  });

  it('should revert when asset is not enabled', async function () {
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;
    const governance = fixture.accounts.governanceAccounts[0];

    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('0'), // asset minimum
      parseEther('0'), // asset maximum
      '100', // 1% max slippage
    );

    await expect(swapOperator.swapEnzymeVaultShareForETH(parseEther('1'), '0')).to.be.revertedWith(
      'SwapOp: asset is not enabled',
    );
  });

  it('should revert if Enzyme does not sent enough shares back', async function () {
    const { swapOperator, enzymeV4Comptroller, pool, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
    );

    const amountInPool = parseEther('2000');
    await enzymeV4Vault.mint(pool.address, amountInPool);

    const amountIn = parseEther('1000');

    // enzyme lowers the rate.
    await enzymeV4Comptroller.setETHToVaultSharesRate('20000');
    await expect(swapOperator.swapEnzymeVaultShareForETH(amountIn, amountIn)).to.be.revertedWith(
      'SwapOp: amountOut < amountOutMin',
    );
  });

  it('should revert if tokenBalanceAfter <  min', async function () {
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
    );

    const amountInPool = parseEther('2000');
    await enzymeV4Vault.mint(pool.address, amountInPool);

    const amountIn = parseEther('1950');
    await expect(swapOperator.swapEnzymeVaultShareForETH(amountIn, amountIn)).to.be.revertedWith(
      'SwapOp: tokenBalanceAfter < min',
    );
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
    );
    const amountInPool = parseEther('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    const etherBefore = await ethers.provider.getBalance(pool.address);
    const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

    // amounts in/out of the trade
    const sharesIn = parseEther('1500');
    const minTokenOut = sharesIn.sub(1);
    const swapTx = await swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn);

    const etherAfter = await ethers.provider.getBalance(pool.address);
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherReceived = etherAfter.sub(etherBefore);
    const tokensSent = tokensBefore.sub(tokensAfter);

    await expect(swapTx).to.emit(swapOperator, 'Swapped').withArgs(enzymeV4Vault.address, ETH, sharesIn, tokensSent);

    expect(etherReceived).to.be.equal(sharesIn);
    expect(tokensSent).to.be.greaterThanOrEqual(minTokenOut);
  });

  it('reverts if another balanceBefore <= max', async function () {
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
    );

    const amountInPool = parseEther('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // amounts in/out of the trade
    const sharesIn = parseEther('400');

    await expect(swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn)).to.be.revertedWith(
      'SwapOp: balanceBefore <= max',
    );
  });
});
