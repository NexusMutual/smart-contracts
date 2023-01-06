const { Role } = require('../utils').constants;
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AddressZero } = ethers.constants;

describe('state management', function () {
  let membersCount;
  const rolesCount = 3;
  before(function () {
    const { members } = this.accounts;
    membersCount = members.length + 1; // additional AB member
  });

  it('should return all members', async function () {
    const { memberRoles } = this.contracts;
    const {
      members,
      advisoryBoardMembers: [abMember],
    } = this.accounts;

    const { memberArray } = await memberRoles.members(Role.Member);
    expect(memberArray.length).to.be.equal(membersCount);
    members.forEach(member => {
      expect(memberArray).to.include(member.address);
    });
    expect(memberArray).to.include(abMember.address);
  });

  it('should return all roles for a member', async function () {
    const { memberRoles } = this.contracts;
    const [member] = this.accounts.members;

    const assignedRolesMember = await memberRoles.roles(member.address);
    expect(assignedRolesMember[0]).to.be.equal(Role.Member);
    expect(assignedRolesMember.length).to.be.equal(rolesCount);
  });

  it('should return authorized address for role', async function () {
    const { memberRoles } = this.contracts;

    const authorizedAddress = await memberRoles.authorized(Role.Member);
    expect(authorizedAddress).to.be.equal(AddressZero);
  });

  it('should return length of all roles', async function () {
    const { memberRoles } = this.contracts;

    const [unAssignedMembersLength, advisoryBoardMembersLength, membersMembersLength] =
      await memberRoles.getMemberLengthForAllRoles();
    expect(unAssignedMembersLength).to.be.equal(0);
    expect(advisoryBoardMembersLength).to.be.equal(1);
    expect(membersMembersLength).to.be.equal(membersCount);
  });

  it('should return members length', async function () {
    const { memberRoles } = this.contracts;

    const membersLength = await memberRoles.membersLength(Role.Member);
    expect(membersLength).to.be.equal(membersCount);
  });

  it('should return member at index', async function () {
    const { memberRoles } = this.contracts;
    const {
      members: [member],
    } = this.accounts;

    const [memberAddress, isActive] = await memberRoles.memberAtIndex(Role.Member, 0);
    expect(memberAddress).to.be.equal(member.address);
    expect(isActive).to.be.equal(true);
  });

  it('should clear storage', async function () {
    const { memberRoles } = this.contracts;
    await expect(memberRoles.storageCleanup()).to.not.be.reverted;
  });

  it('should check the role of a member', async function () {
    const { memberRoles } = this.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
      advisoryBoardMembers: [advisoryBoardMember],
    } = this.accounts;

    // test non-member assigned roles
    expect(await memberRoles.checkRole(nonMember.address, Role.Unassigned)).to.be.equal(true);
    expect(await memberRoles.checkRole(nonMember.address, Role.Member)).to.be.equal(false);
    expect(await memberRoles.checkRole(nonMember.address, Role.AdvisoryBoard)).to.be.equal(false);

    // test member assigned roles
    // checkRole always returns true when the target role is Unassigned
    expect(await memberRoles.checkRole(member.address, Role.Unassigned)).to.be.equal(true);
    expect(await memberRoles.checkRole(member.address, Role.Member)).to.be.equal(true);
    expect(await memberRoles.checkRole(member.address, Role.AdvisoryBoard)).to.be.equal(false);

    // test ab assigned roles
    expect(await memberRoles.checkRole(advisoryBoardMember.address, Role.Unassigned)).to.be.equal(true);
    expect(await memberRoles.checkRole(advisoryBoardMember.address, Role.Member)).to.be.equal(true);
    expect(await memberRoles.checkRole(advisoryBoardMember.address, Role.AdvisoryBoard)).to.be.equal(true);
  });
});
