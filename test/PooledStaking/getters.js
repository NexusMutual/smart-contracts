const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');
const { parseLogs } = require('../utils/helpers');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree],
  governanceContracts: [governanceContract],
  internalContracts: [internalContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndApprove (token, staking, amount, member) {
  const maxLeverage = '2';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

describe('getters', function () {

  beforeEach(setup);

  it('should calculate correctly stakerProcessedStake', async function () {

    const { staking, token } = this;
    const amount = ether('10');

    await fundAndApprove(token, staking, amount, memberOne);
    await fundAndApprove(token, staking, amount, memberTwo);
    await fundAndApprove(token, staking, amount, memberThree);

    // Stake
    await staking.stake(ether('6'), [firstContract], [ether('6')], { from: memberOne });
    await staking.stake(
      ether('10'),
      [firstContract, secondContract, thirdContract],
      [ether('4'), ether('5'), ether('10')],
      { from: memberTwo },
    );
    await staking.stake(
      ether('7'),
      [firstContract, thirdContract],
      [ether('5'), ether('7')],
      { from: memberThree },
    );

    const totalAllocatedFirstContract = await staking.contractStake(firstContract);

    // Burn firstContract for 12
    const burnAmount = ether('12');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });

    // Check stakerProcessedStake for memberOne
    const stakerProcessedStakeOne = await staking.stakerProcessedStake(memberOne, { from: internalContract });
    const expectedStakeOne = ether('6').sub(burnAmount.mul(ether('6')).div(totalAllocatedFirstContract));
    assert(stakerProcessedStakeOne.eq(expectedStakeOne));

    // Check stakerProcessedStake for memberTwo
    const stakerProcessedStakeTwo = await staking.stakerProcessedStake(memberTwo, { from: internalContract });
    const expectedStakeTwo = ether('10').sub(burnAmount.mul(ether('4')).div(totalAllocatedFirstContract));
    assert(stakerProcessedStakeTwo.eq(expectedStakeTwo));

    // Check stakerProcessedStake for memberThree
    const stakerProcessedStakeThree = await staking.stakerProcessedStake(memberThree, { from: internalContract });
    const expectedStakeThree = ether('7').sub(burnAmount.mul(ether('5')).div(totalAllocatedFirstContract));
    assert(stakerProcessedStakeTwo.eq(expectedStakeTwo));
  });
});
