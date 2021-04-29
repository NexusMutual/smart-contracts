const { accounts } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { buyCover } = require('../utils/buyCover');
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { Role } = require('../utils').constants;

const [, member1, member2, nonMember1] = accounts;
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

describe('withdrawMembership', function () {

  it('withdraws membership for current member', async function () {
    const { mr: memberRoles, tk: token } = this.contracts;

    const members = [member1, member2];
    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
    await enrollMember(this.contracts, members);

    await memberRoles.withdrawMembership({ from: member1 });
    const hasRole = await memberRoles.checkRole(member1, Role.Member);
    assert(!hasRole);
    const { memberArray } = await memberRoles.members(Role.Member);
    assert.equal(memberArray.length, members.length - 1 + membersBefore.length);

    const whitelisted = await token.whiteListed(member1);
    assert(!whitelisted);
    const balance = await token.balanceOf(member1);
    assert.equal(balance.toString(), '0');
  });

  it('reverts when withdrawing membership for non-member', async function () {
    const { mr: memberRoles } = this.contracts;
    await expectRevert.unspecified(memberRoles.withdrawMembership({ from: nonMember1 }));
  });

  it('reverts when withdrawing membership for member with active covers', async function () {
    const { mr: memberRoles } = this.contracts;

    const member = member1;
    await enrollMember(this.contracts, [member]);
    await buyCover({ ...this.contracts, cover: coverTemplate, coverHolder: member });

    await expectRevert.unspecified(memberRoles.withdrawMembership({ from: member }));
  });

});
