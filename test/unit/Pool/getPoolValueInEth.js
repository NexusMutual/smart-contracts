const { web3, ethers, artifacts } = require('hardhat');
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

const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
const ERC20Mock = artifacts.require('ERC20Mock');

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
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;

    const otherToken = await ERC20Mock.new();
    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, otherToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );

    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    await pool.addAsset(otherToken.address, 18, parseEther('10'), parseEther('100'), 1000, false, { from: governance });
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
