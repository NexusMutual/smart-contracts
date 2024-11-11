const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { AggregatorType, Assets } = require('../utils').constants;
const { toBytes8 } = require('../utils').helpers;

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

describe('upgradeCapitalPool', function () {
  it('moves pool funds to new pool', async function () {
    const fixture = await loadFixture(setup);
    const { pool, master, dai, stETH, enzymeVault, token, st, chainlinkEthUsdAsset } = fixture;
    const { chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault } = fixture;
    const [governance] = fixture.accounts.governanceContracts;
    const { defaultSender } = fixture.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const Pool = await ethers.getContractFactory('Pool');

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(parseEther('1'));

    const coverToken = await ERC20Mock.deploy();
    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, enzymeVault.address, coverToken.address, Assets.ETH],
      [
        chainlinkDAI.address,
        chainlinkSteth.address,
        chainlinkEnzymeVault.address,
        chainlinkNewAsset.address,
        chainlinkEthUsdAsset.address,
      ],
      [AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.USD],
      [18, 18, 18, 18, 18],
      st.address,
    );
    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    const ethAmount = parseEther('10000');
    const tokenAmount = parseEther('100000');
    await governance.sendTransaction({ value: ethAmount, to: pool.address });

    await pool.connect(governance).addAsset(coverToken.address, true, '0', '0', 100);
    const tokens = [dai, stETH, enzymeVault, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.deploy(
      defaultSender.address,
      priceFeedOracle.address,
      AddressZero, // we do not test swaps here
      token.address,
      pool.address,
    );

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      expect(oldPoolBalance).to.equal(0);
      expect(newPoolBalance).to.equal(tokenAmount);
    }

    const oldPoolBalance = await ethers.provider.getBalance(pool.address);
    const newPoolBalance = await ethers.provider.getBalance(newPool.address);
    expect(oldPoolBalance).to.equal(0);
    expect(newPoolBalance).to.equal(ethAmount);
  });

  it('abandons marked assets on pool upgrade', async function () {
    const fixture = await loadFixture(setup);
    const { pool, master, dai, stETH, enzymeVault, token, chainlinkEthUsdAsset } = fixture;
    const { chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault } = fixture;
    const [governance] = fixture.accounts.governanceContracts;
    const { defaultSender } = fixture.accounts;

    const ethAmount = parseEther('10000');
    const tokenAmount = parseEther('100000');
    await governance.sendTransaction({ value: ethAmount, to: pool.address });

    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ERC20NonRevertingMock = await ethers.getContractFactory('ERC20NonRevertingMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const Pool = await ethers.getContractFactory('Pool');

    const coverToken = await ERC20Mock.deploy();
    const nonRevertingERC20 = await ERC20NonRevertingMock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(parseEther('1'));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, enzymeVault.address, coverToken.address, nonRevertingERC20.address, Assets.ETH],
      [
        chainlinkDAI.address,
        chainlinkSteth.address,
        chainlinkEnzymeVault.address,
        chainlinkNewAsset.address,
        chainlinkNewAsset.address,
        chainlinkEthUsdAsset.address,
      ],
      [
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.USD,
      ],
      [18, 18, 18, 18, 18, 18],
      defaultSender.address,
    );
    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    await pool.connect(governance).addAsset(coverToken.address, true, '0', '0', 100);

    await pool.connect(governance).addAsset(nonRevertingERC20.address, true, '0', '0', 100);

    const tokens = [dai, stETH, enzymeVault, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.deploy(
      defaultSender.address,
      priceFeedOracle.address,
      AddressZero, // we do not test swaps here
      token.address,
      pool.address,
    );

    await stETH.blacklistSender(pool.address);

    await expect(master.upgradeCapitalPool(pool.address, newPool.address)).to.be.revertedWith(
      'ERC20Mock: sender is blacklisted',
    );

    await pool.connect(governance).setAssetDetails(5, false, true); // nonRevertinggERC20
    await pool.connect(governance).setAssetDetails(2, false, true); // stEth

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      if (token.address === stETH.address) {
        // stETH is blacklisted and abandoned
        expect(oldPoolBalance).to.be.equal(tokenAmount);
        expect(newPoolBalance).to.be.equal(0);
      } else {
        expect(oldPoolBalance).to.be.equal(0);
        expect(newPoolBalance).to.be.equal(tokenAmount);
      }
    }

    const oldPoolBalance = await ethers.provider.getBalance(pool.address);
    const newPoolBalance = await ethers.provider.getBalance(newPool.address);
    expect(oldPoolBalance).to.be.equal(0);
    expect(newPoolBalance).to.be.equal(ethAmount);
  });

  it('should revert if ETH transfer failed', async function () {
    const fixture = await loadFixture(setup);
    const { pool, master } = fixture;

    const PoolEtherRejecterMock = await ethers.getContractFactory('PoolEtherRejecterMock');
    const poolEtherRejecterMock = await PoolEtherRejecterMock.deploy();

    const upgradeCapitalPoolPromise = master.upgradeCapitalPool(pool.address, poolEtherRejecterMock.address);
    await expect(upgradeCapitalPoolPromise).to.be.revertedWith('Pool: Transfer failed');
  });
});
