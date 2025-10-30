const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const {
  loadFixture,
  impersonateAccount,
  setNextBlockBaseFeePerGas,
} = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { signJoinMessage } = nexus.signing;
const { PauseTypes } = nexus.constants;
const { toBytes2 } = nexus.helpers;
const { ZeroAddress } = ethers;

const JOINING_FEE = ethers.parseEther('0.002');

describe('leave', () => {
  it('should allow leaving', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const initialMemberCount = await registry.getMemberCount();
    const initialLastMemberId = await registry.getLastMemberId();

    await expect(registry.connect(alice).leave())
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, alice, ZeroAddress);

    expect(await registry.isMember(alice)).to.be.false;
    expect(await registry.getMemberCount()).to.equal(initialMemberCount - 1n);
    expect(await registry.getLastMemberId()).to.equal(initialLastMemberId);
    expect(await registry.getMemberId(alice)).to.equal(0n);
    expect(await registry.getMemberAddress(initialLastMemberId)).to.equal(ZeroAddress);
  });

  it('should revert when the user is an advisory board member', async () => {
    const { registry, master, kycAuth, advisoryBoardMembers } = await loadFixture(setup);
    const [abMember] = advisoryBoardMembers;

    for (const ab of advisoryBoardMembers) {
      const signature = await signJoinMessage(kycAuth, ab, registry);
      await registry.connect(ab).join(ab, signature, { value: JOINING_FEE });
    }

    // todo: use DisposableRegistry in the future
    const mrAddress = await master.getLatestAddress(toBytes2('MR'));
    await impersonateAccount(mrAddress);
    const mrSigner = await ethers.getSigner(mrAddress);
    await setNextBlockBaseFeePerGas(0);
    await registry.connect(mrSigner).migrateAdvisoryBoardMembers(
      advisoryBoardMembers,
      { maxPriorityFeePerGas: 0 }, // overrides
    );

    await expect(registry.connect(abMember).leave()) // should revert
      .to.be.revertedWithCustomError(registry, 'AdvisoryBoardMemberCannotLeave');
  });

  it('should revert if the user is not a member', async () => {
    const { registry, alice } = await loadFixture(setup);
    await expect(registry.connect(alice).leave()).to.be.revertedWithCustomError(registry, 'NotMember');
  });

  it('should not allow leaving when PAUSE_MEMBERSHIP is active', async () => {
    const { registry, ea1, ea2, alice, kycAuth } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    await expect(registry.connect(alice).leave()) // attempt to leave
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);
  });

  it('should not allow leaving when PAUSE_GLOBAL is active', async () => {
    const { registry, ea1, ea2, alice, kycAuth } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(registry.connect(alice).leave()) // attempt to leave
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);
  });

  it('should allow leaving when other kinds of pauses are active', async () => {
    const { registry, ea1, ea2, alice, kycAuth } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const allOn = 2n ** 48n - 1n;
    const allButGlobalAndMembership = allOn & ~PauseTypes.PAUSE_GLOBAL & ~PauseTypes.PAUSE_MEMBERSHIP;

    await registry.connect(ea1).proposePauseConfig(allButGlobalAndMembership);
    await registry.connect(ea2).confirmPauseConfig(allButGlobalAndMembership);

    await expect(registry.connect(alice).leave()) // attempt to leave
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, alice, ZeroAddress);
  });
});
