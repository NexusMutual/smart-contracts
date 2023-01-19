const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { toBytes8 } = require('../utils').helpers;

describe('transferAssetToSwapOperator', function () {
  before(async function () {
    const { pool, dai, stETH, enzymeVault } = this;
    const { chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault } = this;
    const [governance] = this.accounts.governanceContracts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const otherToken = await ERC20Mock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(BigNumber.from((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, enzymeVault.address, otherToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkEnzymeVault.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    this.otherToken = otherToken;
  });

  it('transfers added ERC20 asset to swap operator', async function () {
    const { pool, otherToken } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [arbitraryCaller],
    } = this.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherToken.address, true, '0', '0', 100 /* 1% */);
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    const tempSwapOperator = arbitraryCaller;
    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), tempSwapOperator.address);

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
    await pool.connect(governance).addAsset(otherToken.address, true, '0', '0', 100 /* 1% */);
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await expect(
      pool.connect(arbitraryCaller).transferAssetToSwapOperator(otherToken.address, amountToTransfer),
    ).to.be.revertedWith('Pool: Not swapOperator');
  });
});
