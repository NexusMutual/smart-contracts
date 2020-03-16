const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [member],
  // advisoryBoardMembers: [advisoryBoardMember],
  // internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

describe('stake', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.stake(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert if staked amount is less than MIN_DEPOSIT_AMOUNT', async function () {

    const { staking } = this;

    await staking.updateParameter(
      ParamType.MIN_DEPOSIT_AMOUNT,
      ether('10'),
      { from: governanceContract },
    );

    await expectRevert(
      staking.stake(ether('1'), { from: member }),
      'Amount is less than minimum allowed',
    );

  });

  it('should add the staked amount to the total user stake', async function () {

    const { staking } = this;
    const { staked: stakedBefore } = await staking.stakers(member, { from: member });
    const stakedAmount = ether('1');

    assert(stakedBefore.eqn(0), 'initial amount should be 0');

    await staking.stake(stakedAmount, { from: member });
    const { staked: stakedAfter } = await staking.stakers(member, { from: member });

    assert(stakedAfter.eq(stakedAmount), 'final amount should be equal to staked amount');
  });

});
