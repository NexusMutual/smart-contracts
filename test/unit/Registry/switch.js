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
const JOINING_FEE = ethers.parseEther('0.002');

describe('switch', () => {
  it('correctly handles member id changes when switching', async () => {
    const { registry, kycAuth, alice, bob } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const initialMemberCount = await registry.getMemberCount();
    const initialMemberId = await registry.getMemberId(alice);

    await expect(registry.connect(alice).switchTo(bob)) // attempt switch
      .to.emit(registry, 'MembershipChanged')
      .withArgs(initialMemberId, alice, bob);

    expect(await registry.isMember(alice)).to.be.false;
    expect(await registry.isMember(bob)).to.be.true;

    const finalMemberId = await registry.getMemberId(bob);
    expect(finalMemberId).to.equal(initialMemberId);

    expect(await registry.getMemberId(alice)).to.equal(0n);
    expect(await registry.getMemberAddress(initialMemberId)).to.equal(bob);
    expect(await registry.getMemberCount()).to.equal(initialMemberCount);
    expect(await registry.getLastMemberId()).to.equal(initialMemberId);
  });

  it('calls TokenController.SwitchMembershipCalledWith', async () => {
    const { registry, tokenController, kycAuth, alice, bob } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    await expect(registry.connect(alice).switchTo(bob))
      .to.emit(tokenController, 'SwitchMembershipCalledWith')
      .withArgs(alice, bob, true);
  });

  it('should prevent switching from an address that is not a member', async () => {
    const { registry, alice, bob } = await loadFixture(setup);

    expect(await registry.isMember(alice)).to.be.false;

    await expect(registry.connect(alice).switchTo(alice, bob)) // attempt switch
      .to.be.revertedWithCustomError(registry, 'NotMember');
  });

  it('should prevent switching to an address that is already a member', async () => {
    const { registry, kycAuth, alice, bob } = await loadFixture(setup);

    const aliceSignature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, aliceSignature, { value: JOINING_FEE });

    const bobSignature = await signJoinMessage(kycAuth, bob, registry);
    await registry.connect(bob).join(bob, bobSignature, { value: JOINING_FEE });

    await expect(registry.connect(alice).switchTo(bob)) // attempt switch
      .to.be.revertedWithCustomError(registry, 'AlreadyMember');
  });

  it('should prevent switching to the same address', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const aliceSignature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, aliceSignature, { value: JOINING_FEE });

    await expect(registry.connect(alice).switchTo(alice)) // attempt switch
      .to.be.revertedWithCustomError(registry, 'AlreadyMember');
  });

  it('should allow switchFor calls only from MR', async () => {
    const { registry, master, kycAuth, alice, bob, mallory } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const mrAddress = await master.getLatestAddress(toBytes2('MR'));
    await impersonateAccount(mrAddress);
    const mrSigner = await ethers.getSigner(mrAddress);

    await expect(registry.connect(mallory).switchFor(alice, bob)) // attempt switch
      .to.be.revertedWithCustomError(registry, 'NotMemberRoles');

    await setNextBlockBaseFeePerGas(0);
    await expect(registry.connect(mrSigner).switchFor(alice, bob, { gasPrice: 0 }))
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, alice, bob);

    expect(await registry.isMember(alice)).to.be.false;
    expect(await registry.isMember(bob)).to.be.true;
  });

  it('should not allow switching when PAUSE_MEMBERSHIP is active', async () => {
    const { registry, master, ea1, ea2, alice, bob, kycAuth } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    await expect(registry.connect(alice).switchTo(bob)) // attempt switch
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);

    const mrAddress = await master.getLatestAddress(toBytes2('MR'));
    await impersonateAccount(mrAddress);
    const mrSigner = await ethers.getSigner(mrAddress);

    await setNextBlockBaseFeePerGas(0);
    await expect(registry.connect(mrSigner).switchFor(alice, bob, { gasPrice: 0 }))
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);
  });

  it('should not allow switching when PAUSE_GLOBAL is active', async () => {
    const { registry, master, ea1, ea2, alice, bob } = await loadFixture(setup);

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(registry.connect(alice).switchTo(bob)) // attempt switch
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);

    const mrAddress = await master.getLatestAddress(toBytes2('MR'));
    await impersonateAccount(mrAddress);
    const mrSigner = await ethers.getSigner(mrAddress);

    await setNextBlockBaseFeePerGas(0);
    await expect(registry.connect(mrSigner).switchFor(alice, bob, { gasPrice: 0 }))
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);
  });

  it('should allow switching when other kinds of pauses are active', async () => {
    const { registry, master, ea1, ea2, alice, bob, kycAuth } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const allOn = 2n ** 48n - 1n;
    const allButGlobalAndMembership = allOn & ~PauseTypes.PAUSE_GLOBAL & ~PauseTypes.PAUSE_MEMBERSHIP;

    await registry.connect(ea1).proposePauseConfig(allButGlobalAndMembership);
    await registry.connect(ea2).confirmPauseConfig(allButGlobalAndMembership);

    await expect(registry.connect(alice).switchTo(bob)) // attempt switch
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, alice, bob);

    const mrAddress = await master.getLatestAddress(toBytes2('MR'));
    await impersonateAccount(mrAddress);
    const mrSigner = await ethers.getSigner(mrAddress);

    await setNextBlockBaseFeePerGas(0);
    await expect(registry.connect(mrSigner).switchFor(bob, alice, { gasPrice: 0 }))
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, bob, alice);
  });
});
