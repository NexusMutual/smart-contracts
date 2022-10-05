const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@cowprotocol/contracts');
const { setEtherBalance, setNextBlockTime, revertToSnapshot, takeSnapshot } = require('../../utils/evm');
const { time } = require('@openzeppelin/test-helpers');
const _ = require('lodash');

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes },
} = ethers;

describe.only('swapETHForEnzymeVaultShare', function () {
  it('should revert when called while the system is paused', async function () {
    const { master, swapOperator, enzymeV4Vault, pool } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    const amountInPool = parseEther('2000');
    await enzymeV4Vault.mint(pool.address, amountInPool);

    await master.pause();

    await expect(swapOperator.swapEnzymeVaultShareForETH('0', '0')).to.be.revertedWith('System is paused');
  });

  it('should revert when called by an address that is not swap controller', async function () {
    const { swapOperator } = this.contracts;

    const nobody = this.accounts.nonMembers[0];

    await expect(swapOperator.connect(nobody).swapEnzymeVaultShareForETH('0', '0')).to.be.revertedWith(
      'SwapOp: only controller can execute',
    );
  });

  it('should revert when asset is not enabled', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('0'), // asset minimum
      parseEther('0'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );
    const etherIn = parseEther('1');

    await expect(swapOperator.swapEnzymeVaultShareForETH(etherIn, '0')).to.be.revertedWith(
      'SwapOperator: asset is not enabled',
    );
  });

  /*

  it('should revert if Enzyme does not sent enough shares back', async function () {
    const { swapOperator, enzymeV4Comptroller, pool, enzymeV4Vault } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    const amountIn = ether('1000');

    // enzyme lowers the rate.
    await enzymeV4Comptroller.setETHToVaultSharesRate('20000');
    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH(amountIn, amountIn),
      'SwapOperator: amountOut < amountOutMin',
    );
  });

  it('should revert if tokenBalanceAfter <  min', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    const minAmount = ether('100');
    const maxAmount = ether('1000');
    await pool.setAssetDetails(
      enzymeV4Vault.address,
      minAmount, // asset minimum
      maxAmount, // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherIn = ether('1950');
    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH(etherIn, etherIn),
      'SwapOperator: tokenBalanceAfter < min',
    );
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

    // amounts in/out of the trade
    const sharesIn = ether('1500');
    const minTokenOut = sharesIn.subn(1);
    const swapTx = await swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherReceived = etherAfter.sub(etherBefore);
    const tokensSent = tokensBefore.sub(tokensAfter);

    assert.strictEqual(etherReceived.toString(), sharesIn.toString());
    assert(tokensSent.gte(minTokenOut), 'tokensReceived < minTokenOut');

    expectEvent(swapTx, 'Swapped', {
      fromAsset: enzymeV4Vault.address,
      toAsset: ETH,
      amountIn: sharesIn,
      amountOut: tokensSent,
    });
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

    // amounts in/out of the trade
    const sharesIn = ether('1500');
    const minTokenOut = sharesIn.subn(1);
    const swapTx = await swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherReceived = etherAfter.sub(etherBefore);
    const tokensSent = tokensBefore.sub(tokensAfter);

    assert.strictEqual(etherReceived.toString(), sharesIn.toString());
    assert(tokensSent.gte(minTokenOut), 'tokensReceived < minTokenOut');

    expectEvent(swapTx, 'Swapped', {
      fromAsset: enzymeV4Vault.address,
      toAsset: ETH,
      amountIn: sharesIn,
      amountOut: tokensSent,
    });
  });

  it('reverts if another swap is attempted too fast', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    // amounts in/out of the trade
    const sharesIn = ether('400');
    await swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn);

    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn),
      'SwapOperator: too fast',
    );
  });

   */
});
