const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const { hex } = require('../utils').helpers;

const { defaultSender, governanceContracts: [governance], nonMembers: [fundSource] } = require('../utils').accounts;

const Pool = artifacts.require('Pool');
const SwapAgent = artifacts.require('SwapAgent');
const ERC20Mock = artifacts.require('ERC20Mock');
const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const { pool, poolData, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    const daiAmount = ether('10000');
    await dai.mint(pool.address, daiAmount);

    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(ether('1')));
    const poolValue = await pool.getPoolValueInEth();
    assert.equal(poolValue.toString(), expectedPoolValue.toString());
  });

  it('gets total value of ETH, DAI and extra asset in the pool', async function () {
    const { pool, poolData, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    const otherTokenToEthRate = daiToEthRate.muln(3);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    const daiAmount = ether('10000');
    await dai.mint(pool.address, daiAmount);

    const otherToken = await ERC20Mock.new();

    await pool.addAsset(otherToken.address, '0', '0', ether('0.01'), {
      from: governance
    });

    const otherTokenAmount = ether('20000');
    await otherToken.mint(pool.address, otherTokenAmount);

    const chainlinkOtherToken = await P1MockChainlinkAggregator.new();
    await chainlinkOtherToken.setLatestAnswer(otherTokenToEthRate);
    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, otherToken.address],
      [chainlinkDAI.address, chainlinkOtherToken.address],
      dai.address
    );

    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    const expectedPoolValue = initialAssetValue
      .add(daiAmount.mul(daiToEthRate).div(ether('1')))
      .add(otherTokenAmount.mul(otherTokenToEthRate).div(ether('1')));
    const poolValue = await pool.getPoolValueInEth();
    assert.equal(poolValue.toString(), expectedPoolValue.toString());
  });
});
