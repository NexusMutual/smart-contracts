const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const { ParamType } = require('../utils/constants');
const setup = require('../utils/setup');

const {
  nonMembers: [nonMember],
  members: [member],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';

async function stake (token, staking, stakes, maxLeverage) {

  const value = maxLeverage || 1000 * 100;

  await staking.updateParameter(
    ParamType.MAX_LEVERAGE, value, { from: governanceContract },
  );

  for (const { member, amount } of stakes) {
    await token.transfer(member, amount); // fund account
    await token.approve(staking.address, amount, { from: member });
    await staking.stake(amount, { from: member });
  }
}

describe('requestDeallocation', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.requestDeallocation(firstContract, 1, { from: nonMember }),
      'Caller is not a member',
    );
  });

  it.only('should revert when requested deallocation is greater than allocated', async function () {

    const { staking, token } = this;
    const stakes = [{ member, amount: ether('10') }];
    await stake(token, staking, stakes, 1000 * 100);

    await expectRevert(
      staking.requestDeallocation(firstContract, 10 * 100, { from: member }),
      'Cannot deallocate more than allocated',
    );

    const contracts = [firstContract, secondContract];
    const allocations = [10, 20].map(i => i * 100);
    const deallocations = [20, 30].map(i => i * 100);

    await staking.setAllocations(contracts, allocations, { from: member });

    await expectRevert(
      staking.requestDeallocation(contracts, deallocations, { from: member }),
      'Final allocation cannot be negative',
    );
  });

});
