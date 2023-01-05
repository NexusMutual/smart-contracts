const { ethers } = require('hardhat');
const { expect } = require('chai');
const { hex } = require('../utils').helpers;
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const { pool, mcr, chainlinkDAI, dai } = this;
    const {
      nonMembers: [nonMember],
    } = this.accounts;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = BigNumber.from((394.59 * 1e18).toString());
    const daiToEthRate = BigNumber.from(10).pow(BigNumber.from(36)).div(ethToDaiRate);
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
    const {
      governanceContracts: [governance],
    } = this.accounts;

    const [ERC20Mock, ChainlinkAggregatorMock, PriceFeedOracle] = await Promise.all([
      ethers.getContractFactory('ERC20Mock'),
      ethers.getContractFactory('ChainlinkAggregatorMock'),
      ethers.getContractFactory('PriceFeedOracle'),
    ]);

    const otherToken = await ERC20Mock.deploy();
    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(BigNumber.from((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, otherToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address);

    await pool.connect(governance).addAsset(otherToken.address, 18, parseEther('10'), parseEther('100'), 1000, false);
    await pool.getPoolValueInEth();
  });

  it('includes swapValue in the calculation', async function () {
    const { pool } = this;
    const {
      defaultSender,
      governanceContracts: [governance],
    } = this.accounts;

    const oldPoolValue = await pool.getPoolValueInEth();

    await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), defaultSender.address);
    await pool.setSwapValue(parseEther('1'));

    const swapValue = await pool.swapValue();
    expect(swapValue.toString()).to.eq(parseEther('1').toString());

    const newPoolValue = await pool.getPoolValueInEth();

    expect(newPoolValue).to.eq(oldPoolValue.add(swapValue));
  });
});
