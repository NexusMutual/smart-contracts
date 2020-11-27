const { assert } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');

const accounts = require('../utils').accounts;
const { PoolUintParamType, PoolAddressParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose: [generalPurpose]
} = accounts;

describe('updateUintParameters', function () {

  it('should revert when called by non governance addresses', async function () {
    const { pool1 } = this;
    const param = PoolUintParamType.minPoolEth;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(
        pool1.updateUintParameters(param, 0, { from: address }),
        'Caller is not authorized to govern',
      );
    }
  });

  it('should correctly update the uint parameters', async function () {
    const { pool1 } = this;
    const params = Object.keys(PoolUintParamType);

    const value = 42;

    for (const paramName of params) {
      const before = await pool1[paramName]();
      assert.notStrictEqual(before.toString(), value);

      const param = PoolUintParamType[paramName];
      await pool1.updateUintParameters(param, value, { from: governanceContract });

      const actual = await pool1[paramName]();
      assert.strictEqual(actual.toString(), value.toString());
    }
  });

});

describe('updateAddressParameters', function () {

  it('should revert when called by non governance addresses', async function () {
    const { pool1 } = this;
    const param = PoolAddressParamType.twapOracle;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(
        pool1.updateAddressParameters(param, generalPurpose, { from: address }),
        'Caller is not authorized to govern',
      );
    }
  });

  it('should correctly update the address parameters', async function () {
    const { pool1 } = this;
    const params = Object.keys(PoolAddressParamType);

    for (const paramName of params) {
      const before = await pool1[paramName]();
      assert.notStrictEqual(before.toString(), generalPurpose);

      const param = PoolAddressParamType[paramName];
      await pool1.updateAddressParameters(param, generalPurpose, { from: governanceContract });

      const actual = await pool1[paramName]();
      assert.strictEqual(actual.toString(), generalPurpose);
    }
  });

});
