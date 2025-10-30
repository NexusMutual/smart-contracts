const { network, ethers } = require('hardhat');
const { parseUnits } = require('ethers/lib/utils');
const { Role } = require('../../../lib/constants');
const { signMembershipApproval } = require('.').membership;
const { impersonateAccount, setEtherBalance } = require('.').evm;
const {
  utils: { parseEther },
} = ethers;

const JOINING_FEE = parseUnits('0.002');

async function enrollMember({ mr, tk, tc }, members, kycAuthSigner, options = {}) {
  const { initialTokens = ethers.utils.parseEther('2500') } = options;

  for (const member of members) {
    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: member.address,
      kycAuthSigner,
      chainId: network.config.chainId,
    });

    await mr.join(member.address, 0, membershipApprovalData0, {
      value: JOINING_FEE,
    });

    if (initialTokens && initialTokens.gt(0)) {
      await tk.connect(member).approve(tc.address, ethers.constants.MaxUint256);
      await tk.transfer(member.address, initialTokens);
    }
  }
}
async function enrollABMember({ mr, gv }, members) {
  await impersonateAccount(gv.address);
  await setEtherBalance(gv.address, parseEther('1000'));
  const governanceSigner = await ethers.getSigner(gv.address);
  for (const member of members) {
    await mr.connect(governanceSigner).updateRole(member.address, Role.AdvisoryBoard, true);
  }
}

async function getGovernanceSigner(gv) {
  await impersonateAccount(gv.address);
  await setEtherBalance(gv.address, parseEther('1000'));
  return ethers.getSigner(gv.address);
}

// TODO: remove eslint disable once the function is implemented
// eslint-disable-next-line no-unused-vars
async function enrollClaimAssessor({ tc: _unusedTc }, assessors, options = {}) {
  // eslint-disable-next-line no-unused-vars
  const { lockTokens = parseEther('2000'), validity = 180 * 24 * 60 * 60 } = options;

  // eslint-disable-next-line no-unused-vars
  for (const member of assessors) {
    // [todo] All assessors will be unlocked
    // await tc.lockClaimAssessmentTokens(toBN(lockTokens), toBN(validity), { from: member });
  }
}

module.exports = {
  enrollMember,
  enrollABMember,
  enrollClaimAssessor,
  getGovernanceSigner,
};
