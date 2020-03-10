const { accounts, contract, web3 } = require('@openzeppelin/test-environment');
const { BN, constants, expectEvent, expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { Role } = require('../utils/constants');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');

const [
  nonMember,
  member,
  abMember,
  internal,
  governance,
] = accounts;

const MIN_DEPOSIT_AMOUNT = ether('1');
const MIN_STAKE_PERCENTAGE = '1000'; // 10 percent with 2 decimals
const MAX_LEVERAGE = '100000'; // 1000 percent with 2 decimals
const UNSTAKE_LOCK_TIME = 90 * 24 * 3600; // 90 days

describe('stake', function () {

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

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    // console.log(await master.isMember(Role.NonMember));
    // console.log(typeof await master.isMember(Role.NonMember));

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.stake(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

});
