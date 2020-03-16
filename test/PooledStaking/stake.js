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

  it('should revert when staking without allowance', async function () {

    const { staking, token } = this;
    const stakeAmount = ether('1');

    await token.transfer(member, stakeAmount);

    await expectRevert(
      staking.stake(stakeAmount, { from: member }),
      'ERC20: transfer amount exceeds allowance.',
    );
  });

  it('should add the staked amount to the total user stake', async function () {

    const { staking, token } = this;
    const { staked: stakedBefore } = await staking.stakers(member, { from: member });
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    assert(stakedBefore.eqn(0), 'initial amount should be 0');

    // fund account
    await token.transfer(member, totalAmount);

    // stake 1 nxm
    await token.approve(staking.address, ether('1'), { from: member });
    await staking.stake(stakeAmount, { from: member });

    // check first stake
    const { staked: firstAmount } = await staking.stakers(member, { from: member });
    assert(firstAmount.eq(stakeAmount), 'amount should be equal to staked amount');

    // stake 1 nxm
    await token.approve(staking.address, ether('1'), { from: member });
    await staking.stake(stakeAmount, { from: member });

    // check final stake
    const { staked: finalAmount } = await staking.stakers(member, { from: member });
    assert(totalAmount.eq(finalAmount), 'final amount should be equal to total staked amount');
  });

  it('should move the tokens from the member to the pooled staking contract', async function () {

    const { staking, token } = this;
    const stakeAmount = ether('1');

    // fund account, approve and stake
    await token.transfer(member, stakeAmount);
    await token.approve(staking.address, ether('1'), { from: member });
    await staking.stake(stakeAmount, { from: member });

    // get member balance
    const memberBalance = await token.balanceOf(member);
    assert(memberBalance.eqn(0), 'member balance should be 0');

    // get staking contract balance
    const stakingContractBalance = await token.balanceOf(staking.address);
    assert(stakingContractBalance.eq(stakeAmount), 'staking contract balance should be 0');
  });

});
