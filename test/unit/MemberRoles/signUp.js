const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseUnits } = require('ethers/lib/utils');
const {
  formatBytes32String,
  defaultAbiCoder,
  arrayify,
  hexConcat,
  hexZeroPad,
  splitSignature,
  keccak256,
} = ethers.utils;

const JOINING_FEE = parseUnits('0.002');
const MEMBERSHIP_APPROVAL = formatBytes32String('MEMBERSHIP_APPROVAL');

const approveMembership = async ({ nonce, address, kycAuthSigner }) => {
  const message = defaultAbiCoder.encode(['bytes32', 'uint256', 'address'], [MEMBERSHIP_APPROVAL, nonce, address]);
  const hash = keccak256(message);
  const signature = await kycAuthSigner.signMessage(arrayify(hash));
  const { compact: compactSignature } = splitSignature(signature);
  return hexConcat([hexZeroPad(nonce, 32), compactSignature]);
};

describe('signUp', function () {
  it('reverts when reusing the same nonce', async function () {
    const { memberRoles } = this.contracts;
    const { nonMembers, defaultSender: kycAuthSigner } = this.accounts;

    const membershipApprovalData0 = await approveMembership({
      nonce: 0,
      address: nonMembers[0].address,
      kycAuthSigner,
    });

    await memberRoles.signUp(nonMembers[0].address, arrayify(membershipApprovalData0), {
      value: JOINING_FEE,
    });
    await memberRoles.connect(nonMembers[0]).switchMembership(nonMembers[1].address);
    await expect(
      memberRoles.signUp(nonMembers[0].address, arrayify(membershipApprovalData0), {
        value: JOINING_FEE,
      }),
    ).to.be.revertedWith('MemberRoles: Nonce already used for this address');

    const membershipApprovalData1 = await approveMembership({
      nonce: 1,
      address: nonMembers[0].address,
      kycAuthSigner,
    });
    await expect(
      memberRoles.signUp(nonMembers[0].address, arrayify(membershipApprovalData1), {
        value: JOINING_FEE,
      }),
    ).not.to.be.revertedWith('MemberRoles: Nonce already used for this address');
  });
});
