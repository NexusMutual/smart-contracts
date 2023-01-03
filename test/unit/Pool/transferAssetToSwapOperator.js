const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { hex } = require('../utils').helpers;

describe('transferAssetToSwapOperator', function () {
  before(async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    // import factories using ethers and Promise.all()
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

    await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address);

    this.otherToken = otherToken;
  });

  it('transfers added ERC20 asset to swap operator', async function () {
    const { pool, otherToken } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [arbitraryCaller],
    } = this.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, true);
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    const tempSwapOperator = arbitraryCaller;
    await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), tempSwapOperator.address);

    await pool.connect(tempSwapOperator).transferAssetToSwapOperator(otherToken.address, amountToTransfer);
    const destinationBalance = await otherToken.balanceOf(tempSwapOperator.address);
    expect(destinationBalance).to.eq(amountToTransfer);

    const poolBalance = await otherToken.balanceOf(pool.address);
    expect(poolBalance).to.eq(tokenAmount.sub(amountToTransfer));
  });

  it('revers if not called by swap operator', async function () {
    const { pool, otherToken } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [arbitraryCaller],
    } = this.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, true);
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await expect(
      pool.connect(arbitraryCaller).transferAssetToSwapOperator(otherToken.address, amountToTransfer),
    ).to.be.revertedWith('Pool: Not swapOperator');
  });
});
