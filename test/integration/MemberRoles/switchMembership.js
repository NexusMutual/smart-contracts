const { accounts } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { buyCover } = require('../utils').buyCover;
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { Role } = require('../utils').constants;
const { MAX_UINT256 } = require('@openzeppelin/test-helpers').constants;

const [, member1, member2, nonMember1, nonMember2] = accounts;
const coverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

describe('switchMembership', function () {
  it('switches membership for current member', async function () {
    const { mr: memberRoles, tk: token } = this.contracts;

    const members = [member1, member2];
    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
    await enrollMember(this.contracts, members);
    const nxmBalanceBefore = await token.balanceOf(member1);

    const newMemberAddress = nonMember1;

    await token.approve(memberRoles.address, MAX_UINT256, { from: member1 });
    await memberRoles.switchMembership(newMemberAddress, { from: member1 });
    const oldAddressHasRole = await memberRoles.checkRole(member1, Role.Member);
    assert(!oldAddressHasRole);
    const newAddressHasRole = await memberRoles.checkRole(newMemberAddress, Role.Member);
    assert(newAddressHasRole);

    // number of members stays the same
    const { memberArray } = await memberRoles.members(Role.Member);
    assert.equal(memberArray.length, members.length + membersBefore.length);

    const oldAddressWhitelisted = await token.whiteListed(member1);
    assert(!oldAddressWhitelisted);
    const oldAddressBalance = await token.balanceOf(member1);
    assert.equal(oldAddressBalance.toString(), '0');

    const whitelisted = await token.whiteListed(newMemberAddress);
    assert(whitelisted);
    const nxmBalanceAfter = await token.balanceOf(newMemberAddress);
    assert.equal(nxmBalanceAfter.toString(), nxmBalanceBefore.toString());
  });

  it('reverts when switching membership for non-member', async function () {
    const { mr: memberRoles } = this.contracts;

    await expectRevert.unspecified(memberRoles.switchMembership(nonMember2, { from: nonMember1 }));
  });

  it("reverts when switching membership to an address that's already a member", async function () {
    const { mr: memberRoles } = this.contracts;

    await enrollMember(this.contracts, [member1, member2]);
    await expectRevert.unspecified(memberRoles.switchMembership(member2, { from: member1 }));
  });
});
