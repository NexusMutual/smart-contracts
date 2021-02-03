const { ether } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;
const { expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { toBN } = web3.utils;
const { assert } = require('chai');

const { defaultSender, internalContracts: [internal], generalPurpose: [destination, arbitraryCaller] } = require('../utils').accounts;

const Pool = artifacts.require('Pool');
const SwapAgent = artifacts.require('SwapAgent');
const ERC20Mock = artifacts.require('ERC20Mock');

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

describe('sendClaimPayout', function () {

  it('transfers ERC20 payout to destination', async function () {
    const { pool, dai } = this;

    const tokenAmount = ether('100000');
    await dai.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.divn(2);

    await pool.sendClaimPayout(
      dai.address, destination, amountToTransfer,
      { from: internal }
    );
    const destinationBalance = await dai.balanceOf(destination);
    assert.equal(destinationBalance.toString(), amountToTransfer.toString());

    const poolBalance = await dai.balanceOf(pool.address);
    assert.equal(poolBalance.toString(), tokenAmount.sub(amountToTransfer).toString());
  });

  it('transfers ETH payout to destination', async function () {
    const { pool } = this;

    const ethAmount = ether('10000');
    await pool.sendTransaction({ value: ethAmount });

    const amountToTransfer = ethAmount.divn(2);

    const destinationBalancePrePayout = toBN(await web3.eth.getBalance(destination));
    await pool.sendClaimPayout(
      ETH, destination, amountToTransfer,
      { from: internal }
    );
    const destinationBalance = toBN(await web3.eth.getBalance(destination));
    assert.equal(destinationBalance.sub(destinationBalancePrePayout).toString(), amountToTransfer.toString());

    const poolBalance = toBN(await web3.eth.getBalance(pool.address));
    assert.equal(poolBalance.toString(), ethAmount.sub(amountToTransfer).toString());
  });
});
