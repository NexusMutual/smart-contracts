const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { signJoinMessage } = nexus.signing;
const { PauseTypes, ContractIndexes } = nexus.constants;

const { ZeroAddress } = ethers;
const JOINING_FEE = ethers.parseEther('0.002');

describe('join', () => {
  it('should be able to join', async () => {
    const { registry, tokenController, kycAuth, alice, bob } = await loadFixture(setup);
    const initialMemberCount = await registry.getMemberCount();

    expect(await registry.isMember(alice)).to.be.false;

    const expectedMemberId = initialMemberCount + 1n;
    const signature = await signJoinMessage(kycAuth, alice, registry);

    const recoveredAddress = await nexus.signing.recoverSignerTypedData(
      signature,
      alice.address,
      kycAuth,
      registry,
      // { chainId },
    );
    console.log('recoveredAddress: ', recoveredAddress, kycAuth.address);

    // called using bob's address to verify that msg.sender is not used anywhere
    await expect(registry.connect(bob).join(alice, signature, { value: JOINING_FEE }))
      // Registry emits the event
      .to.emit(registry, 'MembershipChanged')
      .withArgs(expectedMemberId, ZeroAddress, alice)
      .to.emit(tokenController, 'AddToWhitelistCalled')
      .withArgs(alice);

    expect(await registry.isMember(alice)).to.be.true;
    expect(await registry.getLastMemberId()).to.equal(expectedMemberId);
    expect(await registry.getMemberId(alice)).to.equal(expectedMemberId);
    expect(await registry.getMemberAddress(expectedMemberId)).to.equal(alice);

    const expectedMemberCount = initialMemberCount + 1n;
    expect(await registry.getMemberCount()).to.equal(expectedMemberCount);
  });

  it('should send the joining fee to the pool', async () => {
    const { registry, pool, kycAuth, alice } = await loadFixture(setup);
    const signature = await signJoinMessage(kycAuth, alice, registry);

    const initialBalance = await ethers.provider.getBalance(pool);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });
    const finalBalance = await ethers.provider.getBalance(pool);

    const expectedBalance = initialBalance + JOINING_FEE;
    expect(finalBalance).to.equal(expectedBalance);
  });

  it('should revert if the user is already a member', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    await expect(registry.connect(alice).join(alice, signature)) // repeated join
      .to.be.revertedWithCustomError(registry, 'AlreadyMember');
  });

  it('should revert if the signature is created by the wrong signer', async () => {
    const { registry, mallory } = await loadFixture(setup);

    // self signed
    const signature = await signJoinMessage(/* signer: */ mallory, mallory, registry);

    await expect(registry.connect(mallory).join(mallory, signature, { value: JOINING_FEE })) // attempt join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is for a different address', async () => {
    const { registry, kycAuth, alice, mallory } = await loadFixture(setup);
    const signature = await signJoinMessage(kycAuth, alice, registry); // signed for alice

    await expect(registry.connect(alice).join(mallory, signature, { value: JOINING_FEE })) // call from alice
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');

    await expect(registry.connect(mallory).join(mallory, signature, { value: JOINING_FEE })) // call from mallory
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is malformed', async () => {
    const { registry, alice } = await loadFixture(setup);

    const malformedSignature = '0x' + '00'.repeat(64) + '1b'; // v = 27 = 0x1b

    await expect(registry.connect(alice).join(alice, malformedSignature, { value: JOINING_FEE })) // malformed signature
      .to.be.revertedWith('ECDSA: invalid signature');
  });

  it('should have signature malleability protection', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const validSignature = await signJoinMessage(kycAuth, alice, registry);
    const r = '0x' + validSignature.slice(2, 66);
    const s = '0x' + validSignature.slice(66, 130);
    const v = parseInt(validSignature.slice(130, 132), 16);

    // secp256k1 curve order
    const n = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

    // create malleable signature by flipping s to n - s
    const sBigInt = BigInt(s);
    const malleableS = (n - sBigInt).toString(16).padStart(64, '0');
    const malleableV = v === 27 ? 28 : 27; // flip v
    const malleableSignature = r + malleableS + malleableV.toString(16);

    await expect(registry.connect(alice).join(alice, malleableSignature, { value: JOINING_FEE })) // pass malleable sig
      .to.be.revertedWith("ECDSA: invalid signature 's' value");
  });

  it('should revert when attempting to join with the same address after leaving', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });
    await registry.connect(alice).leave(alice);

    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // attempt to rejoin
      .to.be.revertedWithCustomError(registry, 'AddressAlreadyUsedForJoining');
  });

  it('should revert when attempting to join with the same address after switching', async () => {
    const { registry, kycAuth, alice, bob } = await loadFixture(setup);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });
    await registry.connect(alice).switchTo(bob);

    expect(await registry.isMember(alice)).to.be.false;
    expect(await registry.isMember(bob)).to.be.true;

    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // attempt to rejoin
      .to.be.revertedWithCustomError(registry, 'AddressAlreadyUsedForJoining');
  });

  it('should revert if the signature is created with the wrong domain name', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const signatureOptions = { name: 'WrongContract' };
    const signature = await signJoinMessage(kycAuth, alice, registry, signatureOptions);

    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is created with the wrong domain version', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const signatureOptions = { version: '1.0.1' };
    const signature = await signJoinMessage(kycAuth, alice, registry, signatureOptions);

    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  it('should revert if the signature is created with the wrong chainId', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);

    const signatureOptions = { chainId: 42 }; // wrong chainId
    const signature = await signJoinMessage(kycAuth, alice, registry, signatureOptions);

    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');
  });

  // technically same as being signed by the wrong address but here for completeness
  it('should reject signatures signed by previous kycAuth addresses', async () => {
    const { registry, kycAuth, alice, bob, governor } = await loadFixture(setup);

    const kycAuthSignature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(governor).setKycAuthAddress(bob);

    await expect(registry.connect(alice).join(alice, kycAuthSignature, { value: JOINING_FEE })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidSignature');

    const bobSignature = await signJoinMessage(bob, alice, registry);
    await expect(registry.connect(alice).join(alice, bobSignature, { value: JOINING_FEE })) // should work
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, ZeroAddress, alice);
  });

  it('should revert if the join fee is not correct', async () => {
    const { registry, kycAuth, alice } = await loadFixture(setup);
    const signature = await signJoinMessage(kycAuth, alice, registry);

    const zeroFee = 0n;
    const insufficientFee = JOINING_FEE - 1n;
    const exceededFee = JOINING_FEE + 1n;

    await expect(registry.connect(alice).join(alice, signature, { value: zeroFee })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidJoinFee');

    await expect(registry.connect(alice).join(alice, signature, { value: insufficientFee })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidJoinFee');

    await expect(registry.connect(alice).join(alice, signature, { value: exceededFee })) // join
      .to.be.revertedWithCustomError(registry, 'InvalidJoinFee');
  });

  it('should revert if the join fee cannot be sent to the pool', async () => {
    const { registry, kycAuth, alice, governor } = await loadFixture(setup);
    const signature = await signJoinMessage(kycAuth, alice, registry);

    const feeRejecter = await ethers.deployContract('EtherRejecterMock');
    await registry.connect(governor).upgradeContract(ContractIndexes.C_POOL, feeRejecter);

    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // join
      .to.be.revertedWithCustomError(registry, 'FeeTransferFailed');
  });

  it('should not allow joining when PAUSE_MEMBERSHIP is active', async () => {
    const { registry, ea1, ea2, alice } = await loadFixture(setup);

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    await expect(registry.connect(alice).join(alice, '0x', { value: JOINING_FEE })) // attempt join
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);
  });

  it('should not allow joining when PAUSE_GLOBAL is active', async () => {
    const { registry, ea1, ea2, alice } = await loadFixture(setup);

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(registry.connect(alice).join(alice, '0x', { value: JOINING_FEE })) // attempt join
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);
  });

  it('should allow joining when other kinds of pauses are active', async () => {
    const { registry, ea1, ea2, alice, kycAuth } = await loadFixture(setup);

    const allOn = 2n ** 48n - 1n;
    const allButGlobalAndMembership = allOn & ~PauseTypes.PAUSE_GLOBAL & ~PauseTypes.PAUSE_MEMBERSHIP;

    await registry.connect(ea1).proposePauseConfig(allButGlobalAndMembership);
    await registry.connect(ea2).confirmPauseConfig(allButGlobalAndMembership);

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await expect(registry.connect(alice).join(alice, signature, { value: JOINING_FEE })) // attempt join
      .to.emit(registry, 'MembershipChanged')
      .withArgs(1n, ZeroAddress, alice);
  });
});
