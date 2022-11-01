const { ether } = require('@openzeppelin/test-helpers');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { web3, artifacts } = require('hardhat');

const {
  governanceContracts: [governance],
  generalPurpose: [arbitraryCaller],
} = require('../utils').accounts;
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;

const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
const ERC20Mock = artifacts.require('ERC20Mock');

describe('transferAssetToSwapOperator', function () {
  before(async function () {
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

    this.otherToken = otherToken;
  });

  it('transfers added ERC20 asset to swap operator', async function () {
    const { pool, otherToken } = this;

    const tokenAmount = ether('100000');
    await pool.addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, true, {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.divn(2);

    const tempSwapOperator = arbitraryCaller;
    await pool.updateAddressParameters(hex('SWP_OP'), tempSwapOperator, { from: governance });

    await pool.transferAssetToSwapOperator(otherToken.address, amountToTransfer, { from: tempSwapOperator });
    const destinationBalance = await otherToken.balanceOf(tempSwapOperator);
    assert.equal(destinationBalance.toString(), amountToTransfer.toString());

    const poolBalance = await otherToken.balanceOf(pool.address);
    assert.equal(poolBalance.toString(), tokenAmount.sub(amountToTransfer).toString());
  });

  it('revers if not called by swap operator', async function () {
    const { pool, otherToken } = this;

    const tokenAmount = ether('100000');
    await pool.addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, true, {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.divn(2);

    await expectRevert(
      pool.transferAssetToSwapOperator(otherToken.address, amountToTransfer, { from: arbitraryCaller }),
      'Pool: Not swapOperator',
    );
  });
});
