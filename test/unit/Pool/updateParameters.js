const { expect } = require('chai');
const { ethers } = require('hardhat');
const { hex } = require('../utils').helpers;
const { PoolUintParamType, PoolAddressParamType } = require('../utils').constants;

describe('updateUintParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { pool } = this;
    const {
      nonMembers: [nonMember],
      members: [member],
      advisoryBoardMembers: [advisoryBoardMember],
      internalContracts: [internalContract],
    } = this.accounts;
    const param = PoolUintParamType.minPoolEth;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expect(pool.connect(address).updateUintParameters(param, 0)).to.be.revertedWith(
        'Caller is not authorized to govern',
      );
    }
  });
});

describe('updateAddressParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const {
      nonMembers: [nonMember],
      members: [member],
      advisoryBoardMembers: [advisoryBoardMember],
      internalContracts: [internalContract],
      generalPurpose: [generalPurpose],
    } = this.accounts;
    const { pool } = this;
    const param = PoolAddressParamType.priceFeedOracle;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expect(pool.connect(address).updateAddressParameters(param, generalPurpose.address)).to.be.revertedWith(
        'Caller is not authorized to govern',
      );
    }
  });

  it('should revert when called with a PRC_FEED oracle parameter that lacks an investment asset', async function () {
    const { pool, dai, chainlinkDAI } = this;
    const {
      governanceContracts: [governanceContract],
    } = this.accounts;

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const priceFeedOracle = await PriceFeedOracle.deploy([dai.address], [chainlinkDAI.address], [18]);

    await expect(
      pool
        .connect(governanceContract)
        .updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address),
    ).to.be.revertedWith('Pool: Oracle lacks asset');
  });

  it('should revert when called with a PRC_FEED oracle parameter that lacks a cover asset', async function () {
    const { pool, chainlinkSteth, stETH } = this;
    const {
      governanceContracts: [governanceContract],
    } = this.accounts;

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const priceFeedOracle = await PriceFeedOracle.deploy([stETH.address], [chainlinkSteth.address], [18]);

    await expect(
      pool
        .connect(governanceContract)
        .updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address),
    ).to.be.revertedWith('Pool: Oracle lacks asset');
  });

  it('should correctly update the address parameters', async function () {
    const { pool } = this;
    const {
      governanceContracts: [governanceContract],
      generalPurpose: [generalPurpose],
    } = this.accounts;
    const params = Object.keys(PoolAddressParamType).filter(param => param !== 'priceFeedOracle');

    for (const paramName of params) {
      const before = await pool[paramName]();
      expect(before.toString()).to.not.equal(generalPurpose.address);

      const param = PoolAddressParamType[paramName];
      await pool.connect(governanceContract).updateAddressParameters(param, generalPurpose.address);

      const actual = await pool[paramName]();
      expect(actual.toString()).to.equal(generalPurpose.address);
    }
  });

  it('should correctly update the PRC_FEED parameter', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
      governanceContracts: [governanceContract],
    } = this.accounts;

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const newPriceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address],
      [chainlinkDAI.address, chainlinkSteth.address],
      [18, 18],
    );

    await pool
      .connect(governanceContract)
      .updateAddressParameters(PoolAddressParamType.priceFeedOracle, newPriceFeedOracle.address);

    const storedAddress = await pool.priceFeedOracle();

    expect(storedAddress).to.equal(newPriceFeedOracle.address);
  });
});
