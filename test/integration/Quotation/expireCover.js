const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { buyCover } = require('../utils/buyCover');
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

describe('expireCover', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, claimAssessor]);
    await enrollClaimAssessor(this.contracts, [claimAssessor], { lockTokens: ether('2000') });
  });

  it('does not allow cover expiration before cover period end', async function () {

    const { qt, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    await setNextBlockTime(coverExpirationDate.subn(1).toNumber());

    await expectRevert(
      qt.expireCover(coverId),
      'Quotation: cover is not due to expire',
    );
  });

  it('allows cover expiration after cover period end', async function () {

    const { qt, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover(coverId);

    const actualCoverStatus = await qd.getCoverStatusNo(coverId);
    const expectedCoverStatus = CoverStatus.CoverExpired;
    assert.strictEqual(actualCoverStatus.toNumber(), expectedCoverStatus);
  });

  it('allows cover expiration after cover period end', async function () {

    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);
    await claimAndVote(this.contracts, coverId, member1, claimAssessor, true);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM).muln(5).divn(100);

    // check that half of the initial CN deposit was returned
    assert(
      balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter),
      'balanceBefore + coverNote != balanceAfter',
    );
  });

});
