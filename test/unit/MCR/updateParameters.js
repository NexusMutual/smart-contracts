const { assert } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { MCRUintParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

describe('updateUintParameters', function () {

  it('should revert when called by non governance addresses', async function () {
    const { mcr } = this;
    const param = MCRUintParamType.mcrFloorIncrementThreshold;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert.unspecified(
        mcr.updateUintParameters(param, 0, { from: address }),
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

  it('should revert on unknown parameter code', async function () {
    const { mcr } = this;
    await expectRevert(
      mcr.updateUintParameters(hex('RAND'), '123', { from: governanceContract }),
      'Invalid param code',
    );
  });
});
