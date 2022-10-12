const { web3, ethers,
  network
} = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers').constants;
const { toBN } = web3.utils;
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

const approveMembership = async ({ nonce, address, chainId, kycAuthSigner }) => {
  const message = defaultAbiCoder.encode(
    ['bytes32', 'uint256', 'address', 'uint256'],
    [MEMBERSHIP_APPROVAL, nonce, address, chainId || network.config.chainId],
  );
  const hash = keccak256(message);
  const signature = await kycAuthSigner.signMessage(arrayify(hash));
  const { compact: compactSignature } = splitSignature(signature);

  return hexConcat([hexZeroPad(nonce, 32), compactSignature]);
};

async function enrollMember ({ mr, tk, tc }, members, kycAuthSigner, options = {}) {
  const { initialTokens = ether('2500') } = options;

  for (const member of members) {

    const membershipApprovalData0 = await approveMembership({
      nonce: 0,
      address: member.address,
      kycAuthSigner,
      chainId: network.config.chainId,
    });

    await mr.signUp(member.address, membershipApprovalData0, {
      value: JOINING_FEE,
    });

    await tk.approve(tc.address, MAX_UINT256, { from: member.address });
    await tk.transfer(member.address, toBN(initialTokens));
  }
}

async function enrollClaimAssessor ({ tc }, assessors, options = {}) {
  const { lockTokens = ether('2000'), validity = 180 * 24 * 60 * 60 } = options;

  for (const member of assessors) {
    // [todo] All assessors will be unlocked
    // await tc.lockClaimAssessmentTokens(toBN(lockTokens), toBN(validity), { from: member });
  }
}

module.exports = {
  enrollMember,
  enrollClaimAssessor,
};
