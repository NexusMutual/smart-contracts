const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { buyCover } = require('../utils').buyCover;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { CoverStatus } = require('../utils').constants;

const { toBN } = web3.utils;
const [, member1, member2, claimAssessor] = accounts;

const coverTemplate = {
  amount: 1, // 100 ETH
  price: ether('0.01'),
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 30,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const claimAndVote = async (contracts, coverId, member, assessor, accept) => {

  const { cl, cd, master } = contracts;

  await cl.submitClaim(coverId, { from: member });
  const claimId = (await cd.actualClaimLength()).subn(1);
  const submittedAt = await cd.getClaimDateUpd(claimId);
  const verdict = accept ? '1' : '-1';
  await cl.submitCAVote(claimId, verdict, { from: assessor });

  const maxVotingTime = await cd.maxVotingTime();
  await setNextBlockTime(submittedAt.add(maxVotingTime).toNumber());
  await master.closeClaim(claimId);

  const { statno: status } = await cd.getClaimStatusNumber(claimId);
  const expectedStatus = accept ? 14 : 6;
  assert(status.eqn(expectedStatus), `expected claim status ${expectedStatus}, got ${status}`);
};

describe('getWithdrawableCoverNoteCoverIds', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, claimAssessor]);
    await enrollClaimAssessor(this.contracts, [claimAssessor], { lockTokens: ether('2000') });
  });

  it('returns no ids when owner has no covers', async function () {

    const { qt } = this.contracts;
    const { expiredCoverIds, lockReasons } = await qt.getWithdrawableCoverNoteCoverIds(member1);

    assert.equal(expiredCoverIds.length, '0');
    assert.equal(lockReasons.length, '0');
  });

  it('returns ids for expired covers along with lock reasons', async function () {
    const { qt, qd, tc } = this.contracts;

    const cover1 = { ...coverTemplate };
    const cover2 = { ...coverTemplate, generationTime: coverTemplate.generationTime + 1 };
    await buyCover({ ...this.contracts, cover: cover1, coverHolder: member1 });
    await buyCover({ ...this.contracts, cover: cover2, coverHolder: member1 });
    const coverIds = ['1', '2'];

    const coverExpirationDate = await qd.getValidityOfCover(coverIds[0]);
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    for (const coverId of coverIds) {
      await qt.expireCover(coverId);
    }

    const gracePeriod = await tc.claimSubmissionGracePeriod();
    await time.increase(gracePeriod);

    const { expiredCoverIds, lockReasons } = await qt.getWithdrawableCoverNoteCoverIds(member1);

    assert.equal(expiredCoverIds.length, coverIds.length);
    assert.equal(lockReasons.length, coverIds.length);

    for (let i = 0; i < expiredCoverIds.length; i++) {
      assert.equal(expiredCoverIds[i].toString(), coverIds[i]);
    }

    for (let i = 0; i < lockReasons.length; i++) {
      const reason = web3.utils.soliditySha3(hex('CN'), member1, expiredCoverIds[i]);
      assert.equal(lockReasons[i], reason.toString());
    }
  });
});
