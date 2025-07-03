const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ZeroAddress } = require('ethers');

const { setup } = require('./setup');
const { signJoinMessage } = nexus.membership;

const joinFixture = async () => {
  const setupFixture = await loadFixture(setup);
  const { registry, governor } = setupFixture;

  const [kycAuth] = await ethers.getSigners(); // default sender
  await registry.connect(governor).setKycAuthAddress(kycAuth);

  return { ...setupFixture, kycAuth };
};

describe('membership', () => {
  it('should be able to join', async () => {
    const { registry, tokenController, kycAuth, alice, bob } = await loadFixture(joinFixture);
    const initialMemberCount = await registry.getMemberCount();

    // eslint-disable-next-line no-unused-expressions
    expect(await registry.isMember(alice)).to.be.false;

    const expectedMemberId = initialMemberCount + 1n;
    const signature = await signJoinMessage(kycAuth, alice, registry);

    // called using bob's address to verify that msg.sender is not used anywhere
    await expect(registry.connect(bob).join(alice, signature))
      // Registry emits the event
      .to.emit(registry, 'MembershipChanged')
      .withArgs(expectedMemberId, ZeroAddress, alice)
      .to.emit(tokenController, 'AddToWhitelistCalled')
      .withArgs(alice);

    // eslint-disable-next-line no-unused-expressions
    expect(await registry.isMember(alice)).to.be.true;
    expect(await registry.getLastMemberId()).to.equal(expectedMemberId);
    expect(await registry.getMemberId(alice)).to.equal(expectedMemberId);
    expect(await registry.getMemberAddress(expectedMemberId)).to.equal(alice);

    const expectedMemberCount = initialMemberCount + 1n;
    expect(await registry.getMemberCount()).to.equal(expectedMemberCount);
  });

  it('should revert if the user is already a member', async () => {
    const { registry, kycAuth, alice } = await loadFixture(joinFixture);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature);

    await expect(registry.connect(alice).join(alice, signature)) // repeated join
      .to.be.revertedWithCustomError(registry, 'AlreadyMember');
  });

  it('should revert if the signature is created by the wrong signer', async () => {
    const { registry, mallory } = await loadFixture(joinFixture);

    // self signed
    const signature = await signJoinMessage(/* signer: */ mallory, mallory, registry);

    await expect(registry.connect(mallory).join(mallory, signature)) // attempt join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is for a different address', async () => {
    const { registry, kycAuth, alice, mallory } = await loadFixture(joinFixture);
    const signature = await signJoinMessage(kycAuth, alice, registry); // signed for alice

    await expect(registry.connect(alice).join(mallory, signature)) // call from alice
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');

    await expect(registry.connect(mallory).join(mallory, signature)) // call from mallory
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is malformed', async () => {
    const { registry, alice } = await loadFixture(joinFixture);

    const malformedSignature = '0x' + '00'.repeat(64) + '1b'; // v = 27 = 0x1b

    await expect(registry.connect(alice).join(alice, malformedSignature)) // passing malformed signature
      .to.be.revertedWith('ECDSA: invalid signature');
  });

  it('should revert when attempting to join with the same address after leaving', async () => {
    const { registry, kycAuth, alice } = await loadFixture(joinFixture);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature);
    await registry.connect(alice).leave(alice);

    await expect(registry.connect(alice).join(alice, signature)) // attempt to rejoin
      .to.be.revertedWithCustomError(registry, 'AddressAlreadyUsedForJoining');
  });

  it('should revert when attempting to join with the same address after switching', async () => {
    const { registry, kycAuth, alice, bob } = await loadFixture(joinFixture);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature);
    await registry.connect(alice).switchTo(bob);

    // eslint-disable-next-line no-unused-expressions
    expect(await registry.isMember(alice)).to.be.false;

    // eslint-disable-next-line no-unused-expressions
    expect(await registry.isMember(bob)).to.be.true;

    await expect(registry.connect(alice).join(alice, signature)) // attempt to rejoin
      .to.be.revertedWithCustomError(registry, 'AddressAlreadyUsedForJoining');
  });

  it('should revert if the signature is created with the wrong domain name', async () => {
    const { registry, kycAuth, alice } = await loadFixture(joinFixture);

    const signatureOptions = { name: 'WrongContract' };
    const signature = await signJoinMessage(kycAuth, alice, registry, signatureOptions);

    await expect(registry.connect(alice).join(alice, signature)) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is created with the wrong domain version', async () => {
    const { registry, kycAuth, alice } = await loadFixture(joinFixture);

    const signatureOptions = { version: '1.0.1' };
    const signature = await signJoinMessage(kycAuth, alice, registry, signatureOptions);

    await expect(registry.connect(alice).join(alice, signature)) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is created with the wrong chainId', async () => {
    const { registry, kycAuth, alice } = await loadFixture(joinFixture);

    const signatureOptions = { chainId: 42 }; // wrong chainId
    const signature = await signJoinMessage(kycAuth, alice, registry, signatureOptions);

    await expect(registry.connect(alice).join(alice, signature)) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  // technically same as being signed by the wrong address but here for completeness
  it('should reject signatures signed by previous kycAuth addresses', async () => {
    const { registry, kycAuth, alice, bob, governor } = await loadFixture(joinFixture);

    const kycAuthSignature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(governor).setKycAuthAddress(bob);

    await expect(registry.connect(alice).join(alice, kycAuthSignature)) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');

    const bobSignature = await signJoinMessage(bob, alice, registry);
    await expect(registry.connect(alice).join(alice, bobSignature)) // should work
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, ZeroAddress, alice);
  });
});
