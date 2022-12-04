const { ethers } = require('hardhat');
const { expect, assert } = require('chai');
const { stake } = require('../utils/staking');
const { Role } = require('../utils').constants;
const { parseEther } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const daysToSeconds = days => days * 24 * 60 * 60;

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

    await expect(
      memberRoles.connect(nonMember1).switchMembershipAndAssets(nonMember2.address, [], [], []),
    ).to.be.reverted;
  });

  it("reverts when switching membership to an address that's already a member", async function () {
    const { mr: memberRoles } = this.contracts;
    const {
      members: [member1, member2],
    } = this.accounts;

    await expect(
      memberRoles.connect(member1).switchMembershipAndAssets(member2.address, [], [], [])
    ).to.be.reverted;
  });

  it('transfers the provided covers to the new address', async function () {
    const { contracts } = this;
    const { mr: memberRoles, tk: token, cover, coverNFT, stakingPool0 } = contracts;
    const {
      members: [member1, staker1],
      nonMembers: [nonMember1],
    } = this.accounts;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = daysToSeconds(30);
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    for (let i = 0; i < 3; i++) {
      const expectedPremium = parseEther('1');
      await cover.buyCover(
        {
          coverId: MaxUint256,
          owner: member1.address,
          productId,
          coverAsset: 0,
          amount: parseEther('100'),
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: ethers.constants.AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        { value: expectedPremium },
      );
    }

    await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);
    {
      const ownershipArr = await Promise.all([0, 1, 2].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr.every(x => x === member1.address));
    }

    const newMemberAddress = nonMember1.address;
    await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [0, 2], [], []);
    {
      const ownershipArr = await Promise.all([0, 1, 2].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr[1] === member1.address);
      assert(ownershipArr[0] === newMemberAddress);
      assert(ownershipArr[2] === newMemberAddress);
    }
  });

  it('transfers all staking LP shares of the provided staking pools', async function () {
    const { mr: memberRoles, tk: token, stakingPool0, stakingPool1, stakingPool2 } = this.contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = this.accounts;

    await stakingPool0.connect(member1).stake(parseEther('1000'));
    await stakingPool1.connect(member1).stake(parseEther('10'));
    await stakingPool2.connect(member1).stake(parseEther('100'));
    await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);

    const newMemberAddress = nonMember1.address;
    await memberRoles
      .connect(member1)
      .switchMembershipAndAssets(newMemberAddress, [], [0, 2], [[0], [0]]);

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
