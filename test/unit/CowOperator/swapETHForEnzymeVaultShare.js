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
});
