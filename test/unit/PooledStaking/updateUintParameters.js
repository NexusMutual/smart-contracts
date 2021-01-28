const { assert } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');

const accounts = require('../utils').accounts;
const { StakingUintParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

describe('updateUintParameters', function () {

  it('should revert when called by non governance addresses', async function () {

    const { staking } = this;
    const param = StakingUintParamType.MIN_STAKE;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(
        staking.updateUintParameters(param, 0, { from: address }),
        'Caller is not authorized to govern',
      );
    }

  });

  it('should correctly update the parameters', async function () {
    const { staking } = this;
    const params = Object.keys(StakingUintParamType);

    // chosen by fair dice roll
    // guaranteed to be random
    const value = '4';

    for (const paramName of params) {
      const before = await staking[paramName]();
      assert.notStrictEqual(before.toString(), value);

      const param = StakingUintParamType[paramName];
      await staking.updateUintParameters(param, value, { from: governanceContract });

      const actual = await staking[paramName]();
      assert.strictEqual(actual.toString(), value);
    }

  });

});
