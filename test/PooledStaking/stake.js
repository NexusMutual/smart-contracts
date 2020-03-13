const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');

const {
  nonMembers: [nonMember],
  // members: [member],
  // advisoryBordMembers: [advisoryBordMember],
  // internalContracts: [internalContract],
  // governanceContracts: [governanceContract],
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

});
