const { ethers } = require('hardhat');
const { expect, assert } = require('chai');
const { stake } = require('../utils/staking');
const { Role } = require('../utils').constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;
const { calculateFirstTrancheId } = require('../utils/staking');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

async function switchMembershipAndAssetsSetup() {
  const fixture = await loadFixture(setup);
  const { tk } = fixture.contracts;

  const members = fixture.accounts.members.slice(0, 5);
  const amount = parseEther('10000');
  for (const member of members) {
    await tk.connect(fixture.accounts.defaultSender).transfer(member.address, amount);
  }

  return fixture;
}

describe('switchMembershipAndAssets', function () {
  it('switches membership from one address to another', async function () {
    const fixture = await loadFixture(switchMembershipAndAssetsSetup);
    const { mr: memberRoles, tk: token } = fixture.contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
    } = fixture.accounts;

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

  it('switches membership and transfers manager staking pools from one address to another', async function () {
    const fixture = await loadFixture(switchMembershipAndAssetsSetup);
    const { mr: memberRoles, tk: token, tc: tokenController } = fixture.contracts;
    const {
      nonMembers: [newMember],
      stakingPoolManagers: [stakingPoolManager],
    } = fixture.accounts;

    {
      const newMemberAddress = newMember.address;
      const poolIds = await tokenController.getManagerStakingPools(stakingPoolManager.address);

      await token.connect(stakingPoolManager).approve(memberRoles.address, ethers.constants.MaxUint256);
      await memberRoles.connect(stakingPoolManager).switchMembershipAndAssets(newMemberAddress, [], [], []);

      // check old manager address is removed
      const managerPoolsOld = await tokenController.getManagerStakingPools(stakingPoolManager.address);
      expect(managerPoolsOld).to.be.deep.equal([]);
      expect(await tokenController.isStakingPoolManager(stakingPoolManager.address)).to.be.equal(false);

      // check that new manager address is added
      expect(await tokenController.isStakingPoolManager(newMemberAddress)).to.be.equal(true);
      expect(await tokenController.getManagerStakingPools(newMemberAddress)).to.be.deep.equal(poolIds);
      expect(await tokenController.getStakingPoolManager(poolIds[0])).to.be.equal(newMemberAddress);
    }
  });

  it('reverts when switching membership for non-member', async function () {
    const fixture = await loadFixture(switchMembershipAndAssetsSetup);
    const { mr: memberRoles } = fixture.contracts;
    const {
      nonMembers: [nonMember1, nonMember2],
    } = fixture.accounts;

    await expect(memberRoles.connect(nonMember1).switchMembershipAndAssets(nonMember2.address, [], [], [])).to.be
      .reverted;
  });

  it("reverts when switching membership to an address that's already a member", async function () {
    const fixture = await loadFixture(switchMembershipAndAssetsSetup);
    const { mr: memberRoles } = fixture.contracts;
    const {
      members: [member1, member2],
    } = fixture.accounts;

    await expect(memberRoles.connect(member1).switchMembershipAndAssets(member2.address, [], [], [])).to.be.reverted;
  });

  it('transfers the provided covers to the new address', async function () {
    const fixture = await loadFixture(switchMembershipAndAssetsSetup);
    const { mr: memberRoles, tk: token, cover, coverNFT, stakingPool1 } = fixture.contracts;
    const [member, staker] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = daysToSeconds(30);
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ contracts: fixture.contracts, stakingPool: stakingPool1, staker, gracePeriod, period, productId });

    for (let i = 0; i < 3; i++) {
      const expectedPremium = parseEther('1');
      await cover.buyCover(
        {
          coverId: 0,
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
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: expectedPremium },
      );
    }

    await token.connect(member).approve(memberRoles.address, ethers.constants.MaxUint256);
    await coverNFT.connect(member).setApprovalForAll(memberRoles.address, true);

    {
      const ownershipArr = await Promise.all([1, 2, 3].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr.every(x => x === member.address));
    }

    const newMemberAddress = nonMember.address;
    await memberRoles.connect(member).switchMembershipAndAssets(newMemberAddress, [1, 3], [], []);
    {
      const ownershipArr = await Promise.all([1, 2, 3].map(x => coverNFT.ownerOf(x)));
      assert(ownershipArr[1] === member.address);
      assert(ownershipArr[0] === newMemberAddress);
      assert(ownershipArr[2] === newMemberAddress);
    }
  });

  it('transfers all staking LP shares of the provided staking pools', async function () {
    const fixture = await loadFixture(switchMembershipAndAssetsSetup);
    const { mr: memberRoles, tk: token, stakingPool1, stakingPool2, stakingPool3, stakingNFT } = fixture.contracts;
    const {
      members: [member1],
      nonMembers: [nonMember1],
      defaultSender: staker,
    } = fixture.accounts;

    const stakingPoolsAndAmounts = [
      [stakingPool1, parseEther('1000')],
      [stakingPool2, parseEther('10')],
      [stakingPool3, parseEther('10')],
    ];

    const lastBlock = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(lastBlock, daysToSeconds(30), daysToSeconds(30));

    // Give tokens to member
    await token.connect(staker).transfer(member1.address, parseEther('10000'));

    // Stake to open up capacity
    await token.connect(member1).approve(fixture.contracts.tc.address, ethers.constants.MaxUint256);
    for (const [stakingPool, stakingAmount] of stakingPoolsAndAmounts) {
      await stakingPool
        .connect(member1)
        .depositTo(stakingAmount, firstTrancheId, 0 /* new position */, AddressZero /* destination */);
    }

    // approve tokens
    await token.connect(member1).approve(memberRoles.address, ethers.constants.MaxUint256);
    await stakingNFT.connect(member1).setApprovalForAll(memberRoles.address, true);

    // switch membership
    const newMemberAddress = nonMember1.address;
    await memberRoles.connect(member1).switchMembershipAndAssets(newMemberAddress, [], [1, 3]);

    // check old member address balances
    {
      const balance = await stakingNFT.balanceOf(member1.address);
      expect(balance).to.be.equal(1);
      expect(await stakingNFT.ownerOf(2)).to.be.equal(member1.address);
    }

    // check new member address balances
    {
      const balance = await stakingNFT.balanceOf(newMemberAddress);
      expect(balance).to.be.equal(2);
      expect(await stakingNFT.ownerOf(1)).to.be.equal(newMemberAddress);
      expect(await stakingNFT.ownerOf(3)).to.be.equal(newMemberAddress);
    }

    // check staking pool id links
    expect(await stakingNFT.stakingPoolOf(1)).to.be.equal(await stakingPool1.getPoolId());
    expect(await stakingNFT.stakingPoolOf(2)).to.be.equal(await stakingPool2.getPoolId());
    expect(await stakingNFT.stakingPoolOf(3)).to.be.equal(await stakingPool3.getPoolId());
  });
});
