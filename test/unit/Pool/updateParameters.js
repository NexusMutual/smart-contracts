const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { toBytes8 } = require('../utils').helpers;
const { PoolUintParamType, PoolAddressParamType } = require('../utils').constants;

describe('updateUintParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      nonMembers: [nonMember],
      members: [member],
      advisoryBoardMembers: [advisoryBoardMember],
      internalContracts: [internalContract],
    } = fixture.accounts;
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
    const fixture = await loadFixture(setup);
    const {
      nonMembers: [nonMember],
      members: [member],
      advisoryBoardMembers: [advisoryBoardMember],
      internalContracts: [internalContract],
      generalPurpose: [generalPurpose],
    } = fixture.accounts;
    const { pool } = fixture;
    const param = PoolAddressParamType.priceFeedOracle;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expect(pool.connect(address).updateAddressParameters(param, generalPurpose.address)).to.be.revertedWith(
        'Caller is not authorized to govern',
      );
    }
  });

  it('should revert when called with a PRC_FEED oracle parameter that lacks an investment asset', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai, chainlinkDAI, st } = fixture;
    const {
      governanceContracts: [governanceContract],
    } = fixture.accounts;

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const priceFeedOracle = await PriceFeedOracle.deploy([dai.address], [chainlinkDAI.address], [18], st.address);

    await expect(
      pool.connect(governanceContract).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address),
    ).to.be.revertedWith('Pool: PriceFeedOracle lacks aggregator for asset');
  });

  it('should revert when called with a PRC_FEED oracle parameter that lacks a cover asset', async function () {
    const fixture = await loadFixture(setup);
    const { pool, chainlinkSteth, stETH } = fixture;
    const {
      governanceContracts: [governanceContract],
      defaultSender,
    } = fixture.accounts;

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const priceFeedOracle = await PriceFeedOracle.deploy(
      [stETH.address],
      [chainlinkSteth.address],
      [18],
      defaultSender.address,
    );

    await expect(
      pool.connect(governanceContract).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address),
    ).to.be.revertedWith('Pool: PriceFeedOracle lacks aggregator for asset');
  });

  it('should correctly update the address parameters', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governanceContract],
      generalPurpose: [generalPurpose],
    } = fixture.accounts;
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
    const fixture = await loadFixture(setup);
    const { pool, dai, stETH, enzymeVault, chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault, st } = fixture;
    const [governanceContract] = fixture.accounts.governanceContracts;

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const newPriceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, enzymeVault.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkEnzymeVault.address],
      [18, 18, 18],
      st.address,
    );

    await pool
      .connect(governanceContract)
      .updateAddressParameters(PoolAddressParamType.priceFeedOracle, newPriceFeedOracle.address);

    const storedAddress = await pool.priceFeedOracle();

    expect(storedAddress).to.equal(newPriceFeedOracle.address);
  });

  it('should revert if parameter is unknown', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governanceContract],
      generalPurpose: [generalPurpose],
    } = fixture.accounts;

    const unknownParam = toBytes8('UNKNOWN');
    const promise = pool.connect(governanceContract).updateAddressParameters(unknownParam, generalPurpose.address);
    await expect(promise).to.be.revertedWith('Pool: Unknown parameter');
  });
});
