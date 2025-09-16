const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { Role } = require('../utils').constants;

describe('switchMembershipAndAssets', function () {
  it('grants the member role to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembershipAndAssets(nonMembers[0].address, [], []);
    const hasMemberRole = await memberRoles.checkRole(nonMembers[0].address, Role.Member);

    expect(hasMemberRole).to.be.equal(true);
  });

  it('removes the member role from the initial address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembershipAndAssets(nonMembers[0].address, [], []);
    const hasMemberRole = await memberRoles.checkRole(members[0].address, Role.Member);

    expect(hasMemberRole).to.be.equal(false);
  });

  it('whitelists the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, tokenController } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembershipAndAssets(nonMembers[0].address, [], []);
    const addToWhitelistLastCalledWtih = await tokenController.addToWhitelistLastCalledWtih();

    expect(addToWhitelistLastCalledWtih).to.be.equal(nonMembers[0].address);
  });

  it('removes the initial address from the whitelist', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, tokenController } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembershipAndAssets(nonMembers[0].address, [], []);
    const removeFromWhitelistLastCalledWtih = await tokenController.removeFromWhitelistLastCalledWtih();

    expect(removeFromWhitelistLastCalledWtih).to.be.equal(members[0].address);
  });

  it('keeps the number of members the same', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    const membersBefore = await memberRoles.numberOfMembers(Role.Member);
    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembershipAndAssets(nonMembers[0].address, [], []);
    const membersAfter = await memberRoles.numberOfMembers(Role.Member);

    expect(membersBefore).to.be.equal(membersAfter);
  });

  it('reverts when switching membership to another member address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(
      memberRoles.connect(members[0]).switchMembershipAndAssets(members[1].address, [], []),
    ).to.be.revertedWithCustomError(memberRoles, 'NewAddressIsAlreadyMember');
  });

  it('reverts when switching membership of non-member address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { nonMembers, members } = fixture.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(
      memberRoles.connect(nonMembers[0]).switchMembershipAndAssets(nonMembers[1].address, [], []),
    ).to.be.revertedWithCustomError(memberRoles, 'OnlyMember');
  });

  it('transfers the NXM balance amount to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    const initialAddressBalance = await nxm.balanceOf(members[0].address);
    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembershipAndAssets(nonMembers[0].address, [], []);
    const newAddressBalance = await nxm.balanceOf(nonMembers[0].address);

    expect(newAddressBalance).to.be.equal(initialAddressBalance);
  });

  it('transfers the provided covers to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, cover, coverNFT } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;

    for (let i = 0; i < 3; i++) {
      await cover.createMockCover(member.address);
    }

    await nxm.connect(member).approve(memberRoles.address, ethers.constants.MaxUint256);
    await coverNFT.connect(member).setApprovalForAll(memberRoles.address, true);

    {
      const ownershipArr = await Promise.all([1, 2, 3].map(x => coverNFT.ownerOf(x)));
      expect(ownershipArr[0]).to.be.equal(member.address);
      expect(ownershipArr[1]).to.be.equal(member.address);
      expect(ownershipArr[2]).to.be.equal(member.address);
    }

    const newMemberAddress = nonMember.address;
    await memberRoles.connect(member).switchMembershipAndAssets(newMemberAddress, [1, 3], []);
    {
      const ownershipArr = await Promise.all([1, 2, 3].map(x => coverNFT.ownerOf(x)));
      expect(ownershipArr[0]).to.be.equal(newMemberAddress);
      expect(ownershipArr[1]).to.be.equal(member.address);
      expect(ownershipArr[2]).to.be.equal(newMemberAddress);
    }
  });

  it('transfers all staking NFTs to the new address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, stakingNFT } = fixture.contracts;
    const [member, otherMember] = fixture.accounts.members;
    const [newMember] = fixture.accounts.nonMembers;

    await stakingNFT.mint(member.address);
    await stakingNFT.mint(otherMember.address);
    await stakingNFT.mint(member.address);

    await nxm.connect(member).approve(memberRoles.address, ethers.constants.MaxUint256);
    await stakingNFT.connect(member).setApprovalForAll(memberRoles.address, true);

    const coverIds = [];
    const stakingNFTIds = [1, 3];
    await memberRoles.connect(member).switchMembershipAndAssets(newMember.address, coverIds, stakingNFTIds);

    expect(await stakingNFT.ownerOf(1)).to.be.equal(newMember.address);
    expect(await stakingNFT.ownerOf(2)).to.be.equal(otherMember.address);
    expect(await stakingNFT.ownerOf(3)).to.be.equal(newMember.address);
  });

  it('reverts when trying to transfer staking nfts of another member', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, stakingNFT } = fixture.contracts;
    const [member, otherMember] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;

    await stakingNFT.mint(otherMember.address);
    await stakingNFT.mint(member.address);
    await stakingNFT.mint(otherMember.address);

    await nxm.connect(member).approve(memberRoles.address, ethers.constants.MaxUint256);
    await stakingNFT.connect(member).setApprovalForAll(memberRoles.address, true);

    const newMemberAddress = nonMember.address;
    const coverIds = [];
    const stakingNFTIds = [1];

    await expect(
      memberRoles.connect(member).switchMembershipAndAssets(newMemberAddress, coverIds, stakingNFTIds),
    ).to.be.revertedWith('WRONG_FROM');
  });

  it('reverts when trying to transfer cover nfts of another member', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm, cover } = fixture.contracts;
    const [member, otherMember] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;

    for (let i = 0; i < 3; i++) {
      await cover.createMockCover(otherMember.address);
    }

    const newMemberAddress = nonMember.address;
    await nxm.connect(member).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(
      memberRoles.connect(member).switchMembershipAndAssets(newMemberAddress, [1, 3], []),
    ).to.be.revertedWith('WRONG_FROM');
  });
});
