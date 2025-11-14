const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getFundedSigner } = require('../utils');

describe('switch', function () {
  it('should switchTo with real TokenController integration and NXM token transfer', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController, token } = fixture.contracts;
    const [fromUser] = fixture.accounts.members;
    const [toUser] = fixture.accounts.nonMembers;

    // before
    const memberId = await registry.getMemberId(fromUser.address);
    const nxmBalanceBefore = await token.balanceOf(fromUser.address);

    expect(await registry.isMember(fromUser.address)).to.be.true;
    expect(await registry.isMember(toUser.address)).to.be.false;
    expect(await registry.getMemberAddress(memberId)).to.equal(fromUser.address);
    expect(nxmBalanceBefore).to.be.greaterThan(0n); // fromUser already has NXM tokens
    expect(await token.balanceOf(toUser.address)).to.equal(0n);

    // switch
    await token.connect(fromUser).approve(tokenController.target, nxmBalanceBefore);
    const switchTx = await registry.connect(fromUser).switchTo(toUser.address);

    // after
    expect(await registry.isMember(fromUser.address)).to.be.false;
    expect(await registry.isMember(toUser.address)).to.be.true;
    expect(await registry.getMemberId(fromUser.address)).to.equal(0n);
    expect(await registry.getMemberId(toUser.address)).to.equal(memberId);
    expect(await registry.getMemberAddress(memberId)).to.equal(toUser.address);

    expect(await token.balanceOf(fromUser.address)).to.equal(0n);
    expect(await token.balanceOf(toUser.address)).to.equal(nxmBalanceBefore);

    await expect(switchTx).to.emit(registry, 'MembershipChanged').withArgs(memberId, fromUser.address, toUser.address);
  });

  it('should successfully switchFor with no NXM token transfer', async function () {
    const fixture = await loadFixture(setup);
    const { registry, token, memberRoles } = fixture.contracts;
    const [fromUser] = fixture.accounts.members;
    const [toUser] = fixture.accounts.nonMembers;

    // before
    const memberId = await registry.getMemberId(fromUser.address);
    const nxmBalanceBefore = await token.balanceOf(fromUser.address);
    expect(await registry.isMember(fromUser.address)).to.be.true;
    expect(await registry.isMember(toUser.address)).to.be.false;
    expect(await token.balanceOf(fromUser.address)).to.be.greaterThan(0n);
    expect(await token.balanceOf(toUser.address)).to.equal(0n);

    // switchFor
    const memberRolesSigner = await getFundedSigner(memberRoles.target, ethers.parseEther('1'));

    const switchTx = await registry.connect(memberRolesSigner).switchFor(fromUser.address, toUser.address);

    // after
    expect(await registry.isMember(fromUser.address)).to.be.false;
    expect(await registry.isMember(toUser.address)).to.be.true;
    expect(await registry.getMemberId(fromUser.address)).to.equal(0n);
    expect(await registry.getMemberId(toUser.address)).to.equal(memberId);
    expect(await registry.getMemberAddress(memberId)).to.equal(toUser.address);

    // should not transfer NXM
    expect(await token.balanceOf(fromUser.address)).to.equal(nxmBalanceBefore);
    expect(await token.balanceOf(toUser.address)).to.equal(0n);

    await expect(switchTx).to.emit(registry, 'MembershipChanged').withArgs(memberId, fromUser.address, toUser.address);
  });

  it('should transfer staking pool manager ownership when switching membership', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController, token } = fixture.contracts;
    const [stakingPoolManager] = fixture.accounts.stakingPoolManagers;
    const [newManager] = fixture.accounts.nonMembers;

    // before
    const memberId = await registry.getMemberId(stakingPoolManager.address);
    const nxmBalanceBefore = await token.balanceOf(stakingPoolManager.address);
    const poolIdsBefore = await tokenController.getManagerStakingPools(stakingPoolManager.address);
    const [poolId] = poolIdsBefore;

    expect(poolId).to.be.greaterThan(0);
    expect(await registry.isMember(stakingPoolManager.address)).to.be.true;
    expect(await registry.isMember(newManager.address)).to.be.false;
    expect(await tokenController.isStakingPoolManager(stakingPoolManager.address)).to.be.true;
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.false;
    expect(await tokenController.getStakingPoolManager(poolId)).to.equal(stakingPoolManager.address);

    // switch
    await token.connect(stakingPoolManager).approve(tokenController.target, nxmBalanceBefore);
    const switchTx = await registry.connect(stakingPoolManager).switchTo(newManager.address);

    // after - membership
    expect(await registry.isMember(stakingPoolManager.address)).to.be.false;
    expect(await registry.isMember(newManager.address)).to.be.true;
    expect(await registry.getMemberId(stakingPoolManager.address)).to.equal(0n);
    expect(await registry.getMemberId(newManager.address)).to.equal(memberId);
    expect(await registry.getMemberAddress(memberId)).to.equal(newManager.address);

    // after - tokens
    expect(await token.balanceOf(stakingPoolManager.address)).to.equal(0n);
    expect(await token.balanceOf(newManager.address)).to.equal(nxmBalanceBefore);

    // after - staking pool manager ownership
    const poolIdsOld = await tokenController.getManagerStakingPools(stakingPoolManager.address);
    const poolIdsNew = await tokenController.getManagerStakingPools(newManager.address);

    expect(poolIdsOld.length).to.equal(0);
    expect(poolIdsNew).to.deep.equal(poolIdsBefore);
    expect(await tokenController.isStakingPoolManager(stakingPoolManager.address)).to.be.false;
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.true;
    expect(await tokenController.getStakingPoolManager(poolId)).to.equal(newManager.address);

    await expect(switchTx)
      .to.emit(registry, 'MembershipChanged')
      .withArgs(memberId, stakingPoolManager.address, newManager.address);
  });

  it('should revert when non-member tries to switch', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [nonMember1, nonMember2] = fixture.accounts.nonMembers;

    expect(await registry.isMember(nonMember1.address)).to.be.false;

    const switchToFailTx = registry.connect(nonMember1).switchTo(nonMember2.address);
    await expect(switchToFailTx).to.be.revertedWithCustomError(registry, 'NotMember');
  });

  it('should revert when switching to an address that is already a member', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [member1, member2] = fixture.accounts.members;

    expect(await registry.isMember(member1.address)).to.be.true;
    expect(await registry.isMember(member2.address)).to.be.true;

    const switchToFailTx = registry.connect(member1).switchTo(member2.address);
    await expect(switchToFailTx).to.be.revertedWithCustomError(registry, 'AlreadyMember');
  });
});
