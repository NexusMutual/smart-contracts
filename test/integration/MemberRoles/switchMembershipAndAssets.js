const { ethers } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { Role } = require('../utils').constants;

describe.only('switchMembershipAndAssets', function () {
  it('switches membership from one address to another', async function () {
    const { contracts, accounts } = this.withEthers;
    const { mr: memberRoles, tk: token } = contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = accounts;

    {
      const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
      const nxmBalanceBefore = await token.balanceOf(member1.address);

      const newMemberAddress = nonMember1.address;
      await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);
      await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [], []);
      const oldAddressHasRole = await memberRoles.checkRole(member1.address, Role.Member);
      assert(!oldAddressHasRole);
      const newAddressHasRole = await memberRoles.checkRole(newMemberAddress, Role.Member);
      assert(newAddressHasRole);

      // number of members stays the same
      const { memberArray } = await memberRoles.members(Role.Member);
      assert.equal(memberArray.length, membersBefore.length);

      const oldAddressWhitelisted = await token.whiteListed(member1.address);
      assert(!oldAddressWhitelisted);
      const oldAddressBalance = await token.balanceOf(member1.address);
      assert.equal(oldAddressBalance.toString(), '0');

      const whitelisted = await token.whiteListed(newMemberAddress);
      assert(whitelisted);
      const nxmBalanceAfter = await token.balanceOf(newMemberAddress);
      assert.equal(nxmBalanceAfter.toString(), nxmBalanceBefore.toString());
    }
  });

  it('reverts when switching membership for non-member', async function () {
    const { mr: memberRoles } = this.withEthers.contracts;
    const {
      nonMembers: [nonMember1, nonMember2],
    } = this.withEthers.accounts;

    await expectRevert.unspecified(
      memberRoles.connect(nonMember1).switchMembershipAndAssets(nonMember2.address, [], []),
    );
  });

  it("reverts when switching membership to an address that's already a member", async function () {
    const { mr: memberRoles } = this.withEthers.contracts;
    const {
      members: [member1, member2],
    } = this.withEthers.accounts;

    await expectRevert.unspecified(memberRoles.connect(member1).switchMembershipAndAssets(member2.address, [], []));
  });

  it.only('transfers the provided covers to the new address', async function () {
    const { contracts, accounts } = this.withEthers;
    const { mr: memberRoles, tk: token, cover } = contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = accounts;

    {
      await cover.buyCover([member1, 0, 0, parseEther('100'), daysToSeconds(30), parseEther('1'), 0, false], []);
      const newMemberAddress = nonMember1.address;
      await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);
      await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [], []);
      const oldAddressHasRole = await memberRoles.checkRole(member1.address, Role.Member);
      assert(!oldAddressHasRole);
      const newAddressHasRole = await memberRoles.checkRole(newMemberAddress, Role.Member);
      assert(newAddressHasRole);

      // number of members stays the same
      const { memberArray } = await memberRoles.members(Role.Member);
      assert.equal(memberArray.length, membersBefore.length);

      const oldAddressWhitelisted = await token.whiteListed(member1.address);
      assert(!oldAddressWhitelisted);
      const oldAddressBalance = await token.balanceOf(member1.address);
      assert.equal(oldAddressBalance.toString(), '0');

      const whitelisted = await token.whiteListed(newMemberAddress);
      assert(whitelisted);
      const nxmBalanceAfter = await token.balanceOf(newMemberAddress);
      assert.equal(nxmBalanceAfter.toString(), nxmBalanceBefore.toString());
    }
  });
});
