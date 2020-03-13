const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const { ParamType } = require('../utils/constants');
const setup = require('../utils/setup');

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBordMembers: [advisoryBordMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

describe('updateParameter', function () {

  beforeEach(setup);

  it('should revert when called by non governance addresses', async function () {
    const { staking } = this;
    const param = ParamType.MIN_DEPOSIT_AMOUNT;
    const nonGov = [nonMember, member, advisoryBordMember, internalContract];

    for (const address of nonGov) {
      await expectRevert(
        staking.updateParameter(param, 0, { from: address }),
        'Caller is not authorized to govern',
      );
    }

  });

  it('should correctly update the parameters', async function () {
    const { staking } = this;
    const params = Object.keys(ParamType);

    // chosen by fair dice roll
    // guaranteed to be random
    const value = '4';

    for (const paramName of params) {
      const before = await staking[paramName]();
      assert.notStrictEqual(before.toString(), value);

      const param = ParamType[paramName];
      await staking.updateParameter(param, value, { from: governanceContract });
      const actual = await staking[paramName]();
      assert.strictEqual(actual.toString(), value);
    }

  });

});
