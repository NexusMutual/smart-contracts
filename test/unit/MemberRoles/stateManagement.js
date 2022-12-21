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

    // checkRole automatically returns true when the target role is UnAssigned
    const isMemberMember = await memberRoles.checkRole(member.address, Role.Member);
    const isMemberNonMember = await memberRoles.checkRole(member.address, Role.UnAssigned);
    const isMemberABMember = await memberRoles.checkRole(member.address, Role.AdvisoryBoard);

    expect(isMemberMember).to.be.equal(true);
    expect(isMemberNonMember).to.be.equal(true);
    expect(isMemberABMember).to.be.equal(false);

    const isNonMemberMember = await memberRoles.checkRole(nonMember.address, Role.Member);
    const isNonMemberNonMember = await memberRoles.checkRole(nonMember.address, Role.UnAssigned);
    const isNonMemberABMember = await memberRoles.checkRole(nonMember.address, Role.AdvisoryBoard);

    expect(isNonMemberMember).to.be.equal(false);
    expect(isNonMemberNonMember).to.be.equal(true);
    expect(isNonMemberABMember).to.be.equal(false);

    const isABMemberMember = await memberRoles.checkRole(advisoryBoardMember.address, Role.Member);
    const isABMemberNonMember = await memberRoles.checkRole(advisoryBoardMember.address, Role.UnAssigned);
    const isABMemberABMember = await memberRoles.checkRole(advisoryBoardMember.address, Role.AdvisoryBoard);

    expect(isABMemberMember).to.be.equal(true);
    expect(isABMemberNonMember).to.be.equal(true);
    expect(isABMemberABMember).to.be.equal(true);
  });
});
