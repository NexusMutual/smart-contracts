const { assert } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');

const accounts = require('../utils').accounts;
const { MCRUintParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose: [generalPurpose],
} = accounts;

describe.skip('updateUintParameters', function () {

  it('should revert when called by non governance addresses', async function () {
    const { pool } = this;
    const param = MCRUintParamType.dynamicMincapThresholdx100;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(
        pool.updateUintParameters(param, 0, { from: address }),
        'Caller is not authorized to govern',
      );
    }
  });

  it('should correctly update the uint parameters', async function () {
    const { mcr } = this;
    const params = Object.keys(MCRUintParamType);

    const value = 42;

    for (const paramName of params) {
      const before = await mcr[paramName]();
      assert.notStrictEqual(before.toString(), value);

      const param = MCRUintParamType[paramName];
      await mcr.updateUintParameters(param, value, { from: governanceContract });

      const actual = await mcr[paramName]();
      assert.strictEqual(actual.toString(), value.toString());
    }
  });

});
