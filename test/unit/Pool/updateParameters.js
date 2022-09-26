const { assert } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { artifacts } = require('hardhat');

const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;
const { PoolUintParamType, PoolAddressParamType } = require('../utils').constants;

const PriceFeedOracle = artifacts.require('PriceFeedOracle');

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose: [generalPurpose],
} = accounts;

describe('updateUintParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { pool } = this;
    const param = PoolUintParamType.minPoolEth;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(pool.updateUintParameters(param, 0, { from: address }), 'Caller is not authorized to govern');
    }
  });

  it('should revert when called with a PRC_FEED oracle parameter that lacks an investment asset', async function () {
    const { pool, dai, chainlinkDAI } = this;

    const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkDAI.address], [18]);

    await expectRevert(
      pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governanceContract }),
      'Pool: Oracle lacks asset',
    );
  });

  it('should revert when called with a PRC_FEED oracle parameter that lacks a cover asset', async function () {
    const { pool, chainlinkSteth, stETH } = this;

    const priceFeedOracle = await PriceFeedOracle.new([stETH.address], [chainlinkSteth.address], [18]);

    await expectRevert(
      pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governanceContract }),
      'Pool: Oracle lacks asset',
    );
  });

  it('should correctly update the uint parameters', async function () {
    const { pool } = this;
    const params = Object.keys(PoolUintParamType);

    const value = 42;

    for (const paramName of params) {
      const before = await pool[paramName]();
      assert.notStrictEqual(before.toString(), value);

      const param = PoolUintParamType[paramName];
      await pool.updateUintParameters(param, value, { from: governanceContract });

      const actual = await pool[paramName]();
      assert.strictEqual(actual.toString(), value.toString());
    }
  });
});

describe('updateAddressParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { pool } = this;
    const param = PoolAddressParamType.priceFeedOracle;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(
        pool.updateAddressParameters(param, generalPurpose, { from: address }),
        'Caller is not authorized to govern',
      );
    }
  });

  it('should correctly update the address parameters', async function () {
    const { pool } = this;
    const params = Object.keys(PoolAddressParamType);

    for (const paramName of params) {
      const before = await pool[paramName]();
      assert.notStrictEqual(before.toString(), generalPurpose);

      const param = PoolAddressParamType[paramName];
      await pool.updateAddressParameters(param, generalPurpose, { from: governanceContract });

      const actual = await pool[paramName]();
      assert.strictEqual(actual.toString(), generalPurpose);
    }
  });
});
