const { accounts, contract, web3 } = require('@openzeppelin/test-environment');
const { BN, constants, expectEvent, expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { Role, ParamType } = require('../utils/constants');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');

const [
  nonMember,
  member,
  abMember,
  internal,
  governance,
] = accounts;

describe('updateParameter', function () {

  beforeEach(async function () {
    const master = await MasterMock.new();
    const staking = await PooledStaking.new();

    await master.enrollMember(member, Role.Member);
    await master.enrollMember(abMember, Role.AdvisoryBord);
    await master.enrollInternal(internal);
    await master.enrollGovernance(governance);

    await staking.initialize(master.address);

    this.master = master;
    this.staking = staking;
  });

  it('should revert when called by non governance addresses', async function () {
    const { staking } = this;
    const param = ParamType.MIN_DEPOSIT_AMOUNT;
    const nonGov = [nonMember, member, abMember, internal];

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
      await staking.updateParameter(param, value, { from: governance });
      const actual = await staking[paramName]();
      assert.strictEqual(actual.toString(), value);
    }

  });

});
