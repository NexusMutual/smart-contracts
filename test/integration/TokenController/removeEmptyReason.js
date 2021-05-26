const { accounts, web3 } = require('hardhat');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;

const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');

const [, member1, member2, member3, coverHolder] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '3000000000000000', // 0.003 eth
  priceNXM: '1000000000000000000', // 1 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
};

const getReason = async (tc, member, index) => {
  const zeroPaddedReason = await tc.lockReason(member, index);
  return zeroPaddedReason.replace(/(00)+$/, '');
};

describe('removeEmptyReason', async function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);
  });

  it('removes the reason after a successful claim', async function () {

    const { cd, cl, qd, tc, master } = this.contracts;
    const cover = { ...coverTemplate };

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const reason = await getReason(tc, coverHolder, '0');

    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);
    await cl.submitCAVote(claimId, '1', { from: member1 });

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));
    await master.closeClaim(claimId);

    const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(claimStatus.toNumber(), 14, 'claim status should be 14 (accepted, payout done)');

    await tc.removeEmptyReason(coverHolder, reason, '0');

    // should have no reason at this index, reverts with out of bounds array read
    await expectRevert.assertion(
      tc.lockReason(coverHolder, '0'),
    );
  });

  it('removes the reason after two denied claims', async function () {

    const { cd, cl, qd, tc, master } = this.contracts;
    const cover = { ...coverTemplate };

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    const reason = await getReason(tc, coverHolder, '0');

    // raise 2 claims and vote deny
    for (let i = 0; i < 2; i++) {

      await cl.submitClaim(coverId, { from: coverHolder });
      const claimId = (await cd.actualClaimLength()).subn(1);
      await cl.submitCAVote(claimId, toBN('-1'), { from: member1 });

      const minVotingTime = await cd.minVotingTime();
      await time.increase(minVotingTime.addn(1));
      await master.closeClaim(claimId);

      const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
      assert.strictEqual(claimStatus.toNumber(), 6, `claim status should be 6 (denied) on claim #${claimId}`);
    }

    await tc.removeEmptyReason(coverHolder, reason, '0');

    // should have no reason at this index, reverts with out of bounds array read
    await expectRevert.assertion(
      tc.lockReason(coverHolder, '0'),
    );
  });

});
