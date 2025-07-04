const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { signJoinMessage } = nexus.membership;
const { PauseTypes } = nexus.constants;
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

    // eslint-disable-next-line no-unused-expressions
    expect(await registry.isMember(alice)).to.be.false;

    expect(await registry.getMemberCount()).to.equal(initialMemberCount - 1n);
    expect(await registry.getLastMemberId()).to.equal(initialLastMemberId);
    expect(await registry.getMemberId(alice)).to.equal(0n);
    expect(await registry.getMemberAddress(initialLastMemberId)).to.equal(ZeroAddress);
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
