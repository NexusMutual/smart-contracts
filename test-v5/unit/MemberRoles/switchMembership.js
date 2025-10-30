const { ethers } = require('hardhat');
const { Role } = require('../utils').constants;
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { formatBytes32String } = ethers.utils;

describe('switchMembership', function () {
  it('grants the member role to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const hasMemberRole = await memberRoles.checkRole(nonMembers[0].address, Role.Member);

    expect(hasMemberRole).to.be.equal(true);
  });

  it('grants the AB member role to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { nonMembers, advisoryBoardMembers } = fixture.accounts;

    await nxm.connect(advisoryBoardMembers[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(advisoryBoardMembers[0]).switchMembership(nonMembers[0].address);
    const hasABMemberRole = await memberRoles.checkRole(nonMembers[0].address, Role.AdvisoryBoard);

    expect(hasABMemberRole).to.be.equal(true);
  });

  it('removes the member role from the initial address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const hasMemberRole = await memberRoles.checkRole(members[0].address, Role.Member);

    expect(hasMemberRole).to.be.equal(false);
  });

  it('whitelists the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, tokenController } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const addToWhitelistLastCalledWtih = await tokenController.addToWhitelistLastCalledWtih();

    expect(addToWhitelistLastCalledWtih).to.be.equal(nonMembers[0].address);
  });

  it('removes the initial address from the whitelist', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, tokenController } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const removeFromWhitelistLastCalledWtih = await tokenController.removeFromWhitelistLastCalledWtih();

    expect(removeFromWhitelistLastCalledWtih).to.be.equal(members[0].address);
  });

  it('keeps the number of members the same', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    const membersBefore = await memberRoles.numberOfMembers(Role.Member);
    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const membersAfter = await memberRoles.numberOfMembers(Role.Member);

    expect(membersBefore).to.be.equal(membersAfter);
  });

  it('reverts when switching membership to another member address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(memberRoles.connect(members[0]).switchMembership(members[1].address)).to.be.revertedWithCustomError(
      memberRoles,
      'NewAddressIsAlreadyMember',
    );
  });

  it('reverts when switching membership of non-member address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { nonMembers, members } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(
      memberRoles.connect(nonMembers[0]).switchMembership(nonMembers[1].address),
    ).to.be.revertedWithCustomError(memberRoles, 'OnlyMember');
  });

  it('reverts when member tokens are locked', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
    } = fixture.accounts;

    await nxm.setLock(member.address, 1000);
    await expect(memberRoles.connect(member).switchMembership(nonMember.address)).to.be.revertedWithCustomError(
      memberRoles,
      'LockedForVoting',
    );
  });

  it('reverts when member has tokens locked for claim assessment', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
    } = fixture.accounts;

    await tokenController.setTokensLocked(member.address, formatBytes32String('CLA'), 100);
    await expect(memberRoles.connect(member).switchMembership(nonMember.address)).to.be.revertedWithCustomError(
      memberRoles,
      'HasNXMStakedInClaimAssessmentV1',
    );
  });

  it('reverts when member has tokens staked for assessment', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, assessment } = fixture.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
    } = fixture.accounts;

    await assessment.setStakeOf(member.address, 100);
    await expect(memberRoles.connect(member).switchMembership(nonMember.address)).to.be.revertedWithCustomError(
      memberRoles,
      'MemberHasAssessmentStake',
    );
  });

  it('reverts when member has pending rewards in TokenController', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
    } = fixture.accounts;

    await tokenController.setPendingRewards(member.address, 100);
    await expect(memberRoles.connect(member).switchMembership(nonMember.address)).to.be.revertedWithCustomError(
      memberRoles,
      'MemberHasPendingRewardsInTokenController',
    );
  });

  it('reverts when member system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, master } = fixture.contracts;
    const {
      members: [member],
      nonMembers: [nonMember],
    } = fixture.accounts;

    await master.pause();

    await expect(memberRoles.connect(member).switchMembership(nonMember.address)).to.be.revertedWithCustomError(
      memberRoles,
      'Paused',
    );
  });

  it('transfers the NXM balance amount to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    const initialAddressBalance = await nxm.balanceOf(members[0].address);
    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const newAddressBalance = await nxm.balanceOf(nonMembers[0].address);

    expect(newAddressBalance).to.be.equal(initialAddressBalance);
  });
});
