const { ethers } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');
const { Role } = require('../utils').constants;
const { parseEther } = ethers.utils;
const { daysToSeconds } = require('../../utils/helpers');

describe('switchMembershipAndAssets', function () {
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

  it('transfers the provided covers to the new address', async function () {
    const { contracts, accounts } = this.withEthers;
    const { mr: memberRoles, tk: token, cover, coverNFT } = contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = accounts;

    for (let i = 0; i < 3; i++) {
      await cover.buyCover(
        [
          member1.address,
          0,
          0,
          parseEther('100'),
          daysToSeconds(30),
          parseEther('1'),
          0,
          false,
          0,
          ethers.constants.AddressZero,
        ],
        [[0, parseEther('100')]],
        { value: parseEther('1') },
      );
    }

    await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);
    {
      const ownershipArr = await Promise.all([0, 1, 2].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr.every(x => x === member1.address));
    }

    const newMemberAddress = nonMember1.address;
    await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [0, 2], []);
    {
      const ownershipArr = await Promise.all([0, 1, 2].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr[1] === member1.address);
      assert(ownershipArr[0] === newMemberAddress);
      assert(ownershipArr[2] === newMemberAddress);
    }
  });

  it('transfers all staking LP shares of the provided staking pools', async function () {
    const { contracts, accounts } = this.withEthers;
    const { mr: memberRoles, tk: token, stakingPool0, stakingPool1, stakingPool2 } = contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = accounts;

    await stakingPool0.connect(member1).stake(parseEther('1000'));
    await stakingPool1.connect(member1).stake(parseEther('10'));
    await stakingPool2.connect(member1).stake(parseEther('100'));
    await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);

    const newMemberAddress = nonMember1.address;
    await memberRoles
      .connect(member1)
      .switchMembershipAndAssets(newMemberAddress, [], [stakingPool0.address, stakingPool2.address]);

    {
      const balance = await stakingPool0.balanceOf(member1.address);
      expect(balance).to.be.equal(0);
    }
    {
      const balance = await stakingPool1.balanceOf(member1.address);
      expect(balance).to.be.equal(parseEther('10'));
    }
    {
      const balance = await stakingPool2.balanceOf(member1.address);
      expect(balance).to.be.equal(0);
    }

    {
      const balance = await stakingPool0.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(parseEther('1000'));
    }
    {
      const balance = await stakingPool1.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(0);
    }
    {
      const balance = await stakingPool2.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(parseEther('100'));
    }
  });
});
