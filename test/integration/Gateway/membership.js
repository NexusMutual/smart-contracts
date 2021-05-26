const { accounts, web3 } = require('hardhat');
const { enrollMember } = require('../utils/enroll');
const { Role } = require('../utils').constants;
const { MAX_UINT256 } = require('@openzeppelin/test-helpers').constants;

const [, member1, nonMember1] = accounts;

describe('membership', function () {

  it('switches membership', async function () {
    const { qd, p1: pool, tk: token, mr: memberRoles, gateway } = this.contracts;

    const members = [member1];
    await enrollMember(this.contracts, members);

    const newMemberAddress = nonMember1;

    await token.approve(gateway.address, MAX_UINT256, { from: member1 });
    await gateway.switchMembership(newMemberAddress, { from: member1 });
    const oldAddressHasRole = await memberRoles.checkRole(member1, Role.Member);
    assert(!oldAddressHasRole);
    const newAddressHasRole = await memberRoles.checkRole(newMemberAddress, Role.Member);
    assert(newAddressHasRole);
  });
});
