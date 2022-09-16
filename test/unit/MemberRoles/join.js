const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { parseUnits } = require('ethers/lib/utils');
const { arrayify, splitSignature } = ethers.utils;
const { signMembershipApproval } = require('../utils').membership;
const JOINING_FEE = parseUnits('0.002');

describe('join', function () {
  it('reverts when using a signature from another chain', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

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
    ).to.be.revertedWith('MemberRoles: Signature is invalid');

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
    ).to.be.revertedWith('MemberRoles: Signature is invalid');

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
    ).not.to.be.revertedWith('MemberRoles: Signature is invalid');
  });

  it('reverts when reusing the same nonce', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

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
    ).to.be.revertedWith('MemberRoles: Signature already used');

    const membershipApprovalData1 = await signMembershipApproval({
      nonce: 1,
      address: nonMembers[0].address,
      kycAuthSigner,
    });
    await expect(
      memberRoles.join(nonMembers[0].address, 1, arrayify(membershipApprovalData1), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWith('MemberRoles: Signature already used');
  });

  it('reverts when using the signature of another address', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join(nonMembers[1].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWith('MemberRoles: Signature is invalid');

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWith('MemberRoles: Signature is invalid');
  });

  it('reverts when trying to sign up the 0 address', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join('0x0000000000000000000000000000000000000000', 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWith('MemberRoles: Address 0 cannot be used');

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWith('MemberRoles: Address 0 cannot be used');
  });

  it('reverts when the address is already a member', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

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
    ).to.be.revertedWith('MemberRoles: This address is already a member');
  });

  it('reverts when the system is paused', async function () {
    // [todo]
  });

  it('reverts when the value sent is different than the joining fee', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE.sub('1'),
      }),
    ).to.be.revertedWith('MemberRoles: The transaction value should equal to the joining fee');
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE.add('1'),
      }),
    ).to.be.revertedWith('MemberRoles: The transaction value should equal to the joining fee');
    await expect(memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0))).to.be.revertedWith(
      'MemberRoles: The transaction value should equal to the joining fee',
    );
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWith('MemberRoles: The transaction value should equal to the joining fee');
  });

  it('reverts when the signature is invalid', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers } = this.accounts;

    const allZeroesSignature = '0x' + '0'.repeat(192);
    const allOnesSignature = '0x' + '0'.repeat(64) + '1'.repeat(128);

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(allZeroesSignature), { value: JOINING_FEE }),
    ).to.be.revertedWith('ECDSA: invalid signature');

    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(allOnesSignature), { value: JOINING_FEE }),
    ).to.be.revertedWith('ECDSA: invalid signature');
  });

  it('reverts when provided compact signature', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    const { compact } = await splitSignature(membershipApprovalData0);

    await expectRevert(
      memberRoles.join(nonMembers[0].address, 0, arrayify(compact), {
        value: JOINING_FEE,
      }),
      'ECDSA: invalid signature length',
    );
  });

  it('reverts if the transfer of the joining fee to the pool fails', async function () {
    const { memberRoles, pool } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await pool.setRevertOnTransfers(true);
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWith('MemberRoles: The joining fee transfer to the pool failed');

    await pool.setRevertOnTransfers(false);
    await expect(
      memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWith('MemberRoles: The joining fee transfer to the pool failed');
  });

  it('transfers the joining fee to the pool', async function () {
    const { memberRoles, pool } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

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
    const { memberRoles, tokenController } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

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

  it('assigns the member role to the address', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });
    const isMemberBefore = await memberRoles.isMember(nonMembers[0].address);
    expect(isMemberBefore).to.be.equal(false);

    await memberRoles.join(nonMembers[0].address, 0, arrayify(membershipApprovalData0), {
      value: JOINING_FEE,
    });

    const isMemberAfter = await memberRoles.isMember(nonMembers[0].address);
    expect(isMemberAfter).to.be.equal(true);
  });
});
