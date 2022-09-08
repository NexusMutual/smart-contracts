const { web3, ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;

const {
  utils: { parseEther },
} = ethers;

const {
  nonMembers: [fundSource],
  defaultSender,
  governanceContracts: [governance],
} = require('../utils').accounts;

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const { pool, mcr, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    const daiAmount = ether('10000');
    await dai.mint(pool.address, daiAmount);

    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(ether('1')));
    const poolValue = await pool.getPoolValueInEth();
    assert.equal(poolValue.toString(), expectedPoolValue.toString());
  });

  it('shouldnt fail when sent an EOA address', async function () {
    const { pool } = this;
    const asset = '0xCAFE000000000000000000000000000000000000';
    await pool.addAsset(asset, 18, parseEther('10'), parseEther('100'), 1000, false, { from: governance });
    await pool.getPoolValueInEth();
  });

  it('includes swapValue in the calculation', async function () {
    const { pool } = this;

    const oldPoolValue = await pool.getPoolValueInEth();

    await pool.updateAddressParameters(hex('SWP_OP'), defaultSender, { from: governance });
    await pool.setSwapValue(parseEther('1'));

    const swapValue = await pool.swapValue();
    expect(swapValue.toString()).to.eq(parseEther('1').toString());

    const newPoolValue = await pool.getPoolValueInEth();

    expect(newPoolValue.toString()).to.eq(oldPoolValue.add(swapValue).toString());
  });
});
