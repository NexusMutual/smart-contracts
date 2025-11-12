const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { PauseTypes } = require('../../../lib/constants');
const { mintNxmTo } = require('../utils/helpers');

const { ZeroAddress } = ethers;

describe('leave', function () {
  it('should successfully leave with real TokenController and NXMToken integration', async function () {
    const fixture = await loadFixture(setup);
    const { registry, token } = fixture.contracts;
    const [, member] = fixture.accounts.members;

    const memberId = await registry.getMemberId(member.address);
    const initialMemberCount = await registry.getMemberCount();

    // before
    expect(await registry.isMember(member.address)).to.be.true;
    expect(await registry.getMemberId(member.address)).to.not.equal(0);
    expect(await token.whiteListed(member.address)).to.be.true;
    expect(await token.balanceOf(member.address)).to.equal(0);

    // leave
    const leaveTx = await registry.connect(member).leave();

    // after
    expect(await registry.isMember(member.address)).to.be.false;
    expect(await registry.getMemberId(member.address)).to.equal(0);
    expect(await registry.getMemberAddress(memberId)).to.equal(ZeroAddress);
    expect(await registry.getMemberCount()).to.equal(initialMemberCount - 1n);
    expect(await token.whiteListed(member.address)).to.be.false;

    await expect(leaveTx)
      .to.emit(registry, 'MembershipChanged')
      .withArgs(memberId, member.address, ZeroAddress)
      .to.emit(token, 'BlackListed')
      .withArgs(member.address);
  });

  it('should prevent leaving when member has NXM token balance', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController, token } = fixture.contracts;
    const [, member] = fixture.accounts.members;

    // mint NXM
    const nxmAmount = ethers.parseEther('10');
    await mintNxmTo(member.address, nxmAmount, tokenController, token);
    expect(await token.balanceOf(member.address)).to.equal(nxmAmount);

    // leave fail (non-zero balance)
    const leaveTx = registry.connect(member).leave();
    await expect(leaveTx).to.be.revertedWithCustomError(tokenController, 'MemberBalanceNotZero');

    expect(await registry.isMember(member.address)).to.be.true;
    expect(await token.whiteListed(member.address)).to.be.true;
    expect(await token.balanceOf(member.address)).to.equal(nxmAmount);
  });

  it('should allow leaving after burning all NXM tokens', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController, token } = fixture.contracts;
    const [, member] = fixture.accounts.members;

    // mint NXM
    const nxmAmount = ethers.parseEther('10');
    await mintNxmTo(member.address, nxmAmount, tokenController, token);
    expect(await token.balanceOf(member.address)).to.equal(nxmAmount);

    // leave fail (non-zero balance)
    const leaveFailTx = registry.connect(member).leave();
    await expect(leaveFailTx).to.be.revertedWithCustomError(tokenController, 'MemberBalanceNotZero');
    expect(await registry.isMember(member.address)).to.be.true;
    expect(await token.whiteListed(member.address)).to.be.true;

    // burn
    await token.connect(member).burn(nxmAmount);
    expect(await token.balanceOf(member.address)).to.equal(0);

    // leave success
    const leaveTx = await registry.connect(member).leave();

    expect(await registry.isMember(member.address)).to.be.false;
    expect(await token.whiteListed(member.address)).to.be.false;

    await expect(leaveTx).to.emit(token, 'BlackListed').withArgs(member.address);
  });

  it('should prevent leaving during global pause', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [, member] = fixture.accounts.members;

    expect(await registry.isMember(member.address)).to.be.true;

    // set global pause
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    // leave fail
    await expect(registry.connect(member).leave())
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(member.address)).to.be.true;
  });

  it('should prevent staking pool manager from leaving', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController, token } = fixture.contracts;
    const [stakingPoolManager] = fixture.accounts.stakingPoolManagers;

    const poolIds = await tokenController.getManagerStakingPools(stakingPoolManager.address);

    expect(poolIds).to.be.lengthOf.greaterThan(0);
    expect(await registry.isMember(stakingPoolManager.address)).to.be.true;
    expect(await tokenController.isStakingPoolManager(stakingPoolManager.address)).to.be.true;

    // burn all NXM tokens before leaving
    const balance = await token.balanceOf(stakingPoolManager.address);
    await token.connect(stakingPoolManager).burn(balance);
    expect(await token.balanceOf(stakingPoolManager.address)).to.equal(0);

    // manager cannot leave
    const leaveFailTx = registry.connect(stakingPoolManager).leave();
    await expect(leaveFailTx).to.be.revertedWithCustomError(tokenController, 'MemberHasStakingPools');

    // still a member
    expect(await registry.isMember(stakingPoolManager.address)).to.be.true;
    expect(await token.whiteListed(stakingPoolManager.address)).to.be.true;
    expect(await tokenController.isStakingPoolManager(stakingPoolManager.address)).to.be.true;
  });

  it('should prevent advisory board member from leaving', async function () {
    const fixture = await loadFixture(setup);
    const { registry, token } = fixture.contracts;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    expect(await registry.isMember(abMember.address)).to.be.true;
    expect(await registry.isAdvisoryBoardMember(abMember.address)).to.be.true;

    // burn all NXM tokens before leaving
    const balance = await token.balanceOf(abMember.address);
    await token.connect(abMember).burn(balance);
    expect(await token.balanceOf(abMember.address)).to.equal(0);

    // AB leave fail
    const leaveFailTx = registry.connect(abMember).leave();
    await expect(leaveFailTx).to.be.revertedWithCustomError(registry, 'AdvisoryBoardMemberCannotLeave');

    // still a member
    expect(await registry.isMember(abMember.address)).to.be.true;
    expect(await registry.isAdvisoryBoardMember(abMember.address)).to.be.true;
  });

  it('should revert when non-member tries to leave', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;

    expect(await registry.isMember(nonMember.address)).to.be.false;

    await expect(registry.connect(nonMember).leave()).to.be.revertedWithCustomError(registry, 'NotMember');
  });
});
