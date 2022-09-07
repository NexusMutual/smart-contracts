const { accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { addIncident } = require('../utils/incidents');
const { bnEqual } = require('../utils').helpers;
const { daiCoverTemplate, ethCoverTemplate, buyCover } = require('./utils');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const { toBN } = web3.utils;

const [owner, coverHolder, member] = accounts;

const productId = daiCoverTemplate.contractAddress;
let ybDAI;
const EMPTY_DATA = web3.eth.abi.encodeParameters([], []);

async function voteOnClaim({ verdict, claimId, cd, cl, cr }) {
  await cl.submitCAVote(claimId, verdict, { from: member });

  const minVotingTime = await cd.minVotingTime();
  await time.increase(minVotingTime.addn(1));

  const voteStatusBefore = await cl.checkVoteClosing(claimId);
  assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

  await cr.closeClaim(claimId);
  const voteStatusAfter = await cl.checkVoteClosing(claimId);
  assert(voteStatusAfter.eqn(-1), 'voting should be closed');
}

describe('getPayoutOutcome', function () {
  it('return the sum assured for regular covers', async function () {
    await enrollMember(this.contracts, [coverHolder, member]);
    const { gateway } = this.contracts;

    await enrollClaimAssessor(this.contracts, [member]);

    const coverData = { ...ethCoverTemplate };
    await buyCover({ ...this.contracts, coverData, coverHolder });
    const expectedCoverId = 1;

    await gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: coverHolder });
    const claimId = 1;
    await voteOnClaim({ ...this.contracts, claimId, verdict: toBN('1') });

    const { amountPaid } = await gateway.getPayoutOutcome(1);
    bnEqual(amountPaid, ethCoverTemplate.amount);
  });

  it('return the incident payout amount for token covers', async function () {
    const { gateway, dai, incidents } = this.contracts;
    await enrollMember(this.contracts, [coverHolder, member]);
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);
    await dai.mint(coverHolder, ether('10000000'));
    await ybDAI.mint(coverHolder, ether('10000000'));
    await ybDAI.approve(gateway.address, ether('10000000'), { from: coverHolder });
    await incidents.addProducts([productId], [ybDAI.address], [dai.address], { from: owner });
    await buyCover({
      ...this.contracts,
      coverData: { ...daiCoverTemplate, asset: dai.address },
      coverHolder,
    });

    const incidentDate = await time.latest();
    const priceBefore = ether('2'); // 2 DAI per ybDAI
    await addIncident(this.contracts, [owner], productId, incidentDate, priceBefore);

    // partial amount of 99 ybDAI out of 500 ybDAI claimable
    const coverAmount = ether('99');
    const expectedCoverId = 1;

    await gateway.claimTokens(expectedCoverId, 0, coverAmount, ybDAI.address, { from: coverHolder });

    const { amountPaid } = await gateway.getPayoutOutcome(1);

    const basisPrecision = toBN('10000');
    const deductibleRatio = await incidents.DEDUCTIBLE_RATIO();
    const fullAmount = coverAmount.mul(priceBefore).div(ether('1'));
    const expectedDeductible = fullAmount.mul(deductibleRatio).div(basisPrecision);

    bnEqual(amountPaid, expectedDeductible);
  });
});
