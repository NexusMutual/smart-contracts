const { ethers } = require('hardhat');
const { expect, assert } = require('chai');
const { stake } = require('../utils/staking');
const { Role } = require('../utils').constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;
const { calculateFirstTrancheId } = require('../utils/staking');

describe('switchMembershipAndAssets', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('switches membership from one address to another', async function () {
    const { mr: memberRoles, tk: token } = this.contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = this.accounts;

    {
      const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
      const nxmBalanceBefore = await token.balanceOf(member1.address);

      const newMemberAddress = nonMember1.address;

      await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);
      await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [], [], []);
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
    const { mr: memberRoles } = this.contracts;
    const {
      nonMembers: [nonMember1, nonMember2],
    } = this.accounts;

    await expect(memberRoles.connect(nonMember1).switchMembershipAndAssets(nonMember2.address, [], [], [])).to.be
      .reverted;
  });

  it("reverts when switching membership to an address that's already a member", async function () {
    const { mr: memberRoles } = this.contracts;
    const {
      members: [member1, member2],
    } = this.accounts;

    await expect(memberRoles.connect(member1).switchMembershipAndAssets(member2.address, [], [], [])).to.be.reverted;
  });

  it('transfers the provided covers to the new address', async function () {
    const { mr: memberRoles, tk: token, cover, coverNFT, stakingPool0 } = this.contracts;
    const [member, staker] = this.accounts.members;
    const [nonMember] = this.accounts.nonMembers;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = daysToSeconds(30);
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker, gracePeriod, period, productId });

    for (let i = 0; i < 3; i++) {
      const expectedPremium = parseEther('1');
      await cover.buyCover(
        {
          coverId: MaxUint256,
          owner: member.address,
          productId,
          coverAsset: 0,
          amount: parseEther('1'),
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: ethers.constants.AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount, allocationId: MaxUint256 }],
        { value: expectedPremium },
      );
    }

    await token.connect(member).approve(memberRoles.address, ethers.constants.MaxUint256);
    {
      const ownershipArr = await Promise.all([0, 1, 2].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr.every(x => x === member.address));
    }

    const newMemberAddress = nonMember.address;
    await memberRoles.connect(member).switchMembershipAndAssets(newMemberAddress, [0, 2], [], []);
    {
      const ownershipArr = await Promise.all([0, 1, 2].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr[1] === member.address);
      assert(ownershipArr[0] === newMemberAddress);
      assert(ownershipArr[2] === newMemberAddress);
    }
  });

  it.skip('transfers all staking LP shares of the provided staking pools', async function () {
    const { mr: memberRoles, tk: token, stakingPool0, stakingPool1, stakingPool2 } = this.contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = this.accounts;

    const stakingPoolsAndAmounts = [
      [stakingPool0, parseEther('1000')],
      [stakingPool1, parseEther('10')],
      [stakingPool2, parseEther('10')],
    ];

    const lastBlock = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(lastBlock, daysToSeconds(30), daysToSeconds(30));

    for (const [stakingPool, stakingAmount] of stakingPoolsAndAmounts) {
      // Stake to open up capacity
      await stakingPool.connect(member1).depositTo([
        {
          amount: stakingAmount,
          trancheId: firstTrancheId,
          tokenId: 0, // new position
          destination: AddressZero,
        },
      ]);
    }

    await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);

    const newMemberAddress = nonMember1.address;
    await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [], [0, 2], [[1], [1]]);

    {
      const balance = await stakingPool0.balanceOf(member1.address);
      expect(balance).to.be.equal(0);
    }
    {
      const balance = await stakingPool1.balanceOf(member1.address);
      expect(balance).to.be.equal(1);
    }
    {
      const balance = await stakingPool2.balanceOf(member1.address);
      expect(balance).to.be.equal(0);
    }

    {
      const balance = await stakingPool0.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(1);
    }
    {
      const balance = await stakingPool1.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(0);
    }
    {
      const balance = await stakingPool2.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(1);
    }
  });
});
