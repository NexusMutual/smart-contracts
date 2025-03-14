const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { Role } = require('../utils').constants;

const { AddressZero } = ethers.constants;

describe('state management', function () {
  it('should return all members', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      members,
      advisoryBoardMembers: [abMember],
    } = fixture.accounts;
    const membersCount = members.length + 1; // additional AB member

    const { memberArray } = await memberRoles.members(Role.Member);
    expect(memberArray.length).to.be.equal(membersCount);
    members.forEach(member => expect(memberArray).to.include(member.address));
    expect(memberArray).to.include(abMember.address);
  });

  it('should return all roles for a member', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const [member] = fixture.accounts.members;

    // functions returns an array of the same length as the number of roles
    // non-zero elements represent the role id
    // for a member, it will return the role id Member (2) and two additional zero items
    const expectedRolesArray = [Role.Member, 0, 0];
    const actualRoles = await memberRoles.roles(member.address);

    expect(actualRoles).to.be.deep.equal(expectedRolesArray);
  });

  it('should return authorized address for role', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;

    const authorizedAddress = await memberRoles.authorized(Role.Member);
    expect(authorizedAddress).to.be.equal(AddressZero);
  });

  it('should return length of all roles', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { members } = fixture.accounts;
    const actualLengths = await memberRoles.getMemberLengthForAllRoles();
    const membersCount = members.length + 1; // additional AB member

    // unassigned length (0), ab array length, member array length
    const expectedLengths = [0, 1, membersCount];

    expect(actualLengths).to.be.deep.equal(expectedLengths);
  });

  it('should return members length', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { members } = fixture.accounts;
    const membersLength = await memberRoles.membersLength(Role.Member);
    const membersCount = members.length + 1; // additional AB member
    expect(membersLength).to.be.equal(membersCount);
  });

  it('should return member at index', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const [memberAddress, isActive] = await memberRoles.memberAtIndex(Role.Member, 0);
    expect(memberAddress).to.be.equal(member.address);
    expect(isActive).to.be.equal(true);
  });

  it('should check the role of a member', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
      advisoryBoardMembers: [advisoryBoardMember],
    } = fixture.accounts;

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
