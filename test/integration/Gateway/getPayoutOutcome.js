const { accounts, web3 } = require('hardhat');
const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { addIncident } = require('../utils/incidents');
const { hex } = require('../utils').helpers;
const { daiCoverTemplate, ethCoverTemplate } = require('./utils');
const { buyCoverWithDai, buyCover } = require('../utils/buyCover');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const { toBN } = Web3.utils;

const [owner, coverHolder, member1, member2, member3] = accounts;

let cover;
const productId = daiCoverTemplate.contractAddress;
let ybDAI;
const EMPTY_DATA = web3.eth.abi.encodeParameters([], []);

async function voteOnClaim ({ verdict, claimId, master, cd, cl }) {
  await cl.submitCAVote(claimId, verdict, { from: member1 });

  const minVotingTime = await cd.minVotingTime();
  await time.increase(minVotingTime.addn(1));

  const voteStatusBefore = await cl.checkVoteClosing(claimId);
  assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

  await master.closeClaim(claimId);
  const voteStatusAfter = await cl.checkVoteClosing(claimId);
  assert(voteStatusAfter.eqn(-1), 'voting should be closed');
}

describe.only('getPayoutOutcome', function () {
  it('return the sum assured for regular covers', async function () {
    await enrollMember(this.contracts, [
      coverHolder,
      member1,
      member2,
      member3,
    ]);
    const { gateway } = this.contracts;

    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);

    const coverData = { ...ethCoverTemplate };

    await buyCover({
      ...this.contracts,
      cover: coverData,
      coverHolder: coverHolder,
    });
    const expectedCoverId = 1;
    {
      await gateway.submitClaim(expectedCoverId, EMPTY_DATA, {
        from: coverHolder,
      });
      const claimId = 1;
      await voteOnClaim({ ...this.contracts, claimId, verdict: toBN('1') });
    }

    {
      await gateway.submitClaim(expectedCoverId, EMPTY_DATA, {
        from: coverHolder,
      });
      const claimId = 2;
      await voteOnClaim({ ...this.contracts, claimId, verdict: toBN('1') });
    }

    await gateway.submitClaim(expectedCoverId, EMPTY_DATA, {
      from: coverHolder,
    });

    const [status, amountPaid, coverAsset] = await gateway.getPayoutOutcome(1);
    console.log({ status, amountPaid, coverAsset });
  });

  it.only('return the incident payout amount for token covers', async function () {
    const { gateway, dai, incidents } = this.contracts;
    await enrollMember(this.contracts, [coverHolder]);
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);
    await dai.mint(coverHolder, ether('10000000'));
    await ybDAI.mint(coverHolder, ether('10000000'));
    await ybDAI.approve(incidents.address, ether('10000000'), {
      from: coverHolder,
    });
    await buyCoverWithDai({
      ...this.contracts,
      cover: { ...daiCoverTemplate, asset: dai.address },
      coverHolder: coverHolder,
    });

    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // 2 DAI per ybDAI
    await addIncident(
      this.contracts,
      [owner],
      productId,
      incidentDate,
      priceBefore,
    );

    const expectedCoverId = 1;

    await gateway.claimTokens(
      expectedCoverId,
      0,
      ether('99') /* partial amount of 99 ybDAI out of 500 ybDAI claimable */,
      {
        from: coverHolder,
      },
    );

    const [status, amountPaid, coverAsset] = gateway.getPayoutOutcome(1);
    console.log({ status, amountPaid, coverAsset });
  });
});
