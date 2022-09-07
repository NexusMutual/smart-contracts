const { ethers } = require('hardhat');
const { Role } = require('../utils').constants;
const { expect } = require('chai');

describe('switchMembership', function () {
  it('grants the member role to the new address', async function () {
    const { memberRoles, nxm } = this.contracts;
    const { members, nonMembers } = this.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const hasMemberRole = await memberRoles.checkRole(nonMembers[0].address, Role.Member);

    expect(hasMemberRole).to.be.equal(true);
  });

  it('removes the member role from the initial address', async function () {
    const { memberRoles, nxm } = this.contracts;
    const { members, nonMembers } = this.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const hasMemberRole = await memberRoles.checkRole(members[0].address, Role.Member);

    expect(hasMemberRole).to.be.equal(false);
  });

  it('whitelists the new address', async function () {
    const { memberRoles, nxm, tokenController } = this.contracts;
    const { members, nonMembers } = this.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const addToWhitelistLastCalledWtih = await tokenController.addToWhitelistLastCalledWtih();

    expect(addToWhitelistLastCalledWtih).to.be.equal(nonMembers[0].address);
  });

  it('removes the initial address from the whitelist', async function () {
    const { memberRoles, nxm, tokenController } = this.contracts;
    const { members, nonMembers } = this.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const removeFromWhitelistLastCalledWtih = await tokenController.removeFromWhitelistLastCalledWtih();

    expect(removeFromWhitelistLastCalledWtih).to.be.equal(members[0].address);
  });

  it('keeps the number of members the same', async function () {
    const { memberRoles, nxm } = this.contracts;
    const { members, nonMembers } = this.accounts;

    const membersBefore = await memberRoles.numberOfMembers(Role.Member);
    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const membersAfter = await memberRoles.numberOfMembers(Role.Member);

    expect(membersBefore).to.be.equal(membersAfter);
  });

  it('reverts when switching membership to another member address', async function () {
    const { memberRoles, nxm } = this.contracts;
    const { members } = this.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(memberRoles.connect(members[0]).switchMembership(members[1].address)).to.be.revertedWith(
      'The new address is already a member',
    );
  });

  it('reverts when switching membership of non-member address', async function () {
    const { memberRoles, nxm } = this.contracts;
    const { nonMembers, members } = this.accounts;

    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await expect(memberRoles.connect(nonMembers[0]).switchMembership(nonMembers[1].address)).to.be.revertedWith(
      'The current address is not a member',
    );
  });

  it('transfers the NXM balance amount to the new address', async function () {
    const { memberRoles, nxm } = this.contracts;
    const { members, nonMembers } = this.accounts;

    const initialAddressBalance = await nxm.balanceOf(members[0].address);
    await nxm.connect(members[0]).approve(memberRoles.address, ethers.constants.MaxUint256);
    await memberRoles.connect(members[0]).switchMembership(nonMembers[0].address);
    const newAddressBalance = await nxm.balanceOf(nonMembers[0].address);

    expect(newAddressBalance).to.be.equal(initialAddressBalance);
  });
});
