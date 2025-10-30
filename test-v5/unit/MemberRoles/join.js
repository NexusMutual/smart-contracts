const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { signMembershipApproval } = require('../utils').membership;
const { setCode } = require('../utils').evm;

const { arrayify, parseUnits, splitSignature } = ethers.utils;
const JOINING_FEE = parseUnits('0.002');

describe('join', function () {
  it('reverts when using a signature from another chain', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
      chainId: network.config.chainId + 1,
    });

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'InvalidSignature');

    const membershipApprovalData1 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
      chainId: network.config.chainId + 2,
    });
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData1), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'InvalidSignature');

    const membershipApprovalData2 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
      chainId: network.config.chainId,
    });
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData2), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWithCustomError(memberRoles, 'InvalidSignature');
  });

  it('reverts when reusing the same nonce', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
      value: JOINING_FEE,
    });
    await memberRoles.connect(nonMembers[0]).switchMembership(nonMembers[1].address);
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'SignatureAlreadyUsed');

    const membershipApprovalData1 = await signMembershipApproval({
      nonce: 1,
      address: nonMembers[0].address,
      kycAuthSigner,
    });
    await expect(
      memberRoles.join(nonMembers[0].address, 1, arrayify(membershipApprovalData1), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWithCustomError(memberRoles, 'SignatureAlreadyUsed');
  });

  it('reverts when using the signature of another address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join(nonMembers[1].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'InvalidSignature');

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWithCustomError(memberRoles, 'InvalidSignature');
  });

  it('reverts when trying to sign up the 0 address', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join('0x0000000000000000000000000000000000000000', 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'UserAddressCantBeZero');

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWithCustomError(memberRoles, 'UserAddressCantBeZero');
  });

  it('reverts when the address is already a member', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
      value: JOINING_FEE,
    });
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'AddressIsAlreadyMember');
  });

  it('reverts when the system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, master } = fixture.contracts;

    await master.pause();
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'Paused');
  });

  it('reverts when the value sent is different than the joining fee', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE.sub('1'),
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'TransactionValueDifferentFromJoiningFee');
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE.add('1'),
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'TransactionValueDifferentFromJoiningFee');
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0)),
    ).to.be.revertedWithCustomError(memberRoles, 'TransactionValueDifferentFromJoiningFee');
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWithCustomError(memberRoles, 'TransactionValueDifferentFromJoiningFee');
  });

  it('reverts when the signature is invalid', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers } = fixture.accounts;

    const allZeroesSignature = '0x' + '0'.repeat(192);
    const allOnesSignature = '0x' + '0'.repeat(64) + '1'.repeat(128);

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(allZeroesSignature), { value: JOINING_FEE }),
    ).to.be.revertedWith('ECDSA: invalid signature length');

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(allOnesSignature), { value: JOINING_FEE }),
    ).to.be.revertedWith('ECDSA: invalid signature length');
  });

  it('reverts when provided compact signature', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    const { compact } = await splitSignature(membershipApprovalData0);

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(compact), { value: JOINING_FEE }),
    ).to.be.revertedWith('ECDSA: invalid signature length');
  });

  it('reverts if the transfer of the joining fee to the pool fails', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, pool } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    const { deployedBytecode: ethRejecterBytecode } = await artifacts.readArtifact('PoolEtherRejecterMock');
    await setCode(pool.address, ethRejecterBytecode);
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWithCustomError(memberRoles, 'TransferToPoolFailed');

    const { deployedBytecode: poolMockBytecode } = await artifacts.readArtifact('PoolMock');
    await setCode(pool.address, poolMockBytecode);
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWithCustomError(memberRoles, 'TransferToPoolFailed');
  });

  it('transfers the joining fee to the pool', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, pool } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    const balanceBefore = await ethers.provider.getBalance(pool.address);
    await memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
      value: JOINING_FEE,
    });
    const balanceAfter = await ethers.provider.getBalance(pool.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(JOINING_FEE));
  });

  it('whitelists the address through token controller to allow it to transfer tokens', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });
    const addToWhitelistLastCalledWtihBefore = await tokenController.addToWhitelistLastCalledWtih();
    expect(addToWhitelistLastCalledWtihBefore).to.be.equal('0x0000000000000000000000000000000000000000');

    await memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
      value: JOINING_FEE,
    });

    const addToWhitelistLastCalledWtihAfter = await tokenController.addToWhitelistLastCalledWtih();
    expect(addToWhitelistLastCalledWtihAfter).to.be.equal(nonMembers[0].address);
  });

  it('assigns the member role to the address and emits MemberJoined event', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = fixture.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });
    const isMemberBefore = await memberRoles.isMember(nonMembers[0].address);
    expect(isMemberBefore).to.be.equal(false);

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    )
      .to.emit(memberRoles, 'MemberJoined')
      .withArgs(nonMembers[0].address, 0);

    const isMemberAfter = await memberRoles.isMember(nonMembers[0].address);
    expect(isMemberAfter).to.be.equal(true);
  });
});
