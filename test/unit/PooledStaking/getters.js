const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { accounts, constants, helpers } = require('../utils');
const setup = require('../setup');
const { ParamType } = constants;
const { parseLogs } = helpers;

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree],
  governanceContracts: [governanceContract],
  internalContracts: [internalContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';
const fourthContract = '0x0000000000000000000000000000000000000004';

async function fundAndApprove (token, staking, amount, member) {
  const maxExposure = '2';
  await staking.updateParameter(ParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

async function setLockTime (staking, lockTime) {
  return staking.updateParameter(ParamType.UNSTAKE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('getters', function () {

  beforeEach(setup);

  it('stakerProcessedDeposit', async function () {

    const { staking, token } = this;
    const amount = ether('10');

    await fundAndApprove(token, staking, amount, memberOne);
    await fundAndApprove(token, staking, amount, memberTwo);
    await fundAndApprove(token, staking, amount, memberThree);

    // Stake
    await staking.depositAndStake(ether('6'), [firstContract], [ether('6')], { from: memberOne });
    await staking.depositAndStake(
      ether('10'),
      [firstContract, secondContract, thirdContract],
      [ether('4'), ether('5'), ether('10')],
      { from: memberTwo },
    );
    await staking.depositAndStake(
      ether('7'),
      [firstContract, thirdContract],
      [ether('5'), ether('7')],
      { from: memberThree },
    );

    const totalStakedFirstContract = await staking.contractStake(firstContract);

    // Burn firstContract for 12
    const burnAmount = ether('12');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });

    // Check stakerProcessedDeposit for memberOne
    const stakerProcessedStakeOne = await staking.stakerProcessedDeposit(memberOne, { from: internalContract });
    const expectedDepositOne = ether('6').sub(burnAmount.mul(ether('6')).div(totalStakedFirstContract));
    assert(stakerProcessedStakeOne.eq(expectedDepositOne));

    // Check stakerProcessedDeposit for memberTwo
    const stakerProcessedStakeTwo = await staking.stakerProcessedDeposit(memberTwo, { from: internalContract });
    const expectedDepositTwo = ether('10').sub(burnAmount.mul(ether('4')).div(totalStakedFirstContract));
    assert(stakerProcessedStakeTwo.eq(expectedDepositTwo));

    // Check stakerProcessedDeposit for memberThree
    const stakerProcessedStakeThree = await staking.stakerProcessedDeposit(memberThree, { from: internalContract });
    const expectedDepositThree = ether('7').sub(burnAmount.mul(ether('5')).div(totalStakedFirstContract));
    assert(stakerProcessedStakeThree.eq(expectedDepositThree));
  });

  it('stakerContractStake', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndApprove(token, staking, ether('300'), memberOne);
    await staking.depositAndStake(ether('300'), [firstContract], [ether('300')], { from: memberOne });

    const contracts = [firstContract, secondContract, thirdContract, fourthContract];
    const amounts = [ether('300'), ether('50'), ether('100'), ether('120')];
    await staking.depositAndStake(ether('0'), contracts, amounts, { from: memberOne });

    // Push a burn of 200
    await staking.pushBurn(firstContract, ether('200'), { from: internalContract });
    await staking.processPendingActions();

    // Check no stake is greater than the deposit
    const deposit = await staking.stakerDeposit(memberOne);
    for (let i = 0; i < contracts.length; i++) {
      const stake = await staking.stakerContractStake(memberOne, contracts[i]);
      assert(stake.lte(deposit));
    }
  });
});
