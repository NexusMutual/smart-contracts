const { accounts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { toBN } = web3.utils;

const tokensLockedForVoting = ether('2000');
const validity = 360 * 24 * 60 * 60; // 360 days
const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);
const initialMemberFunds = ether('2500');

async function initMembers () {

  const { mr, tk, tc } = this.contracts;
  const [, member1, member2, member3, coverHolder] = accounts;
  const members = [member1, member2, member3, coverHolder];

  for (const member of members) {
    await mr.payJoiningFee(member, { from: member, value: ether('0.002') });
    await mr.kycVerdict(member, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
    await tk.transfer(member, initialMemberFunds);
  }

  for (const member of [member1, member2, member3]) {
    await tc.lock(hex('CLA'), tokensLockedForVoting, validity, { from: member });
  }
}

describe('Claim payout address', function () {

  beforeEach(initMembers);

  require('./membership');
  require('./payouts');

});
