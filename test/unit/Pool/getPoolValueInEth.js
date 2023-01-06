const { ethers } = require('hardhat');
const { expect } = require('chai');

const { toBytes8 } = require('../utils').helpers;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const { pool, mcr, chainlinkDAI, dai } = this;
    const [nonMember] = this.accounts.nonMembers;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = parseEther('394.59');
    const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await mcr.setMCR(mcrEth);
    await nonMember.sendTransaction({ to: pool.address, value: initialAssetValue });

    const daiAmount = parseEther('10000');
    await dai.mint(pool.address, daiAmount);

    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(parseEther('1')));
    const poolValue = await pool.getPoolValueInEth();
    expect(poolValue).to.equal(expectedPoolValue);
  });

  it('shouldnt fail when sent an EOA address', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const [governance] = this.accounts.governanceContracts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const otherToken = await ERC20Mock.deploy();
    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(parseEther('1'));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, otherToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);
    await pool.connect(governance).addAsset(otherToken.address, 18, parseEther('10'), parseEther('100'), 1000, false);
    await pool.getPoolValueInEth();
  });

  it('includes swapValue in the calculation', async function () {
    const { pool } = this;
    const [governance] = this.accounts.governanceContracts;
    const { defaultSender } = this.accounts;

    const oldPoolValue = await pool.getPoolValueInEth();

    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), defaultSender.address);
    await pool.setSwapValue(parseEther('1'));

    const swapValue = await pool.swapValue();
    expect(swapValue.toString()).to.eq(parseEther('1').toString());

    const newPoolValue = await pool.getPoolValueInEth();

    expect(newPoolValue).to.eq(oldPoolValue.add(swapValue));
  });
});
