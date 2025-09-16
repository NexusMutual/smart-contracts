const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getProof, submitFraud } = require('../../unit/Assessment/helpers');
const { calculateFirstTrancheId } = require('../utils/staking');
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance, increaseTime } = require('../../utils/evm');
const { parseEther } = ethers.utils;
const { MaxUint256 } = ethers.constants;

async function processFraudSetup() {
  const fixture = await loadFixture(setup);
  // stake and buy cover
  const { stakingPool1, cover, tk: nxm, tc: tokenController } = fixture.contracts;
  const staker = fixture.accounts.defaultSender;

  // stake
  const firstTrancheId = calculateFirstTrancheId(
    await ethers.provider.getBlock('latest'),
    daysToSeconds(30),
    daysToSeconds(30),
  );
  await nxm.connect(staker).approve(tokenController.address, MaxUint256);
  await stakingPool1
    .connect(staker)
    .depositTo(parseEther('1000'), firstTrancheId + 1, 0 /* new stake */, staker.address);

  // buy multiple covers
  const amount = parseEther('1');

  await cover.buyCover(
    {
      coverId: 0,
      owner: staker.address,
      productId: 0,
      coverAsset: 0b0,
      amount,
      period: daysToSeconds(30),
      maxPremiumInAsset: MaxUint256,
      paymentAsset: 0b0,
      commissionRatio: 0,
      commissionDestination: staker.address,
      ipfsData: 'ipfs data',
    },
    [{ poolId: 1, coverAmountInAsset: amount }],
    { value: amount },
  );

  await cover.buyCover(
    {
      coverId: 0,
      owner: staker.address,
      productId: 0,
      coverAsset: 0b0,
      amount,
      period: daysToSeconds(30),
      maxPremiumInAsset: MaxUint256,
      paymentAsset: 0b0,
      commissionRatio: 0,
      commissionDestination: staker.address,
      ipfsData: 'ipfs data',
    },
    [{ poolId: 1, coverAmountInAsset: amount }],
    { value: amount },
  );

  return {
    ...fixture,
    amount,
  };
}

describe('processFraud', function () {
  it('should not reset index when process fraud is called again after good vote', async function () {
    const fixture = await loadFixture(processFraudSetup);
    const { as: assessment, ci: individualClaims, gv: governanceContact } = fixture.contracts;
    const governance = await ethers.getImpersonatedSigner(governanceContact.address);
    const [fraudulentMember] = fixture.accounts.members;
    await setEtherBalance(governance.address, parseEther('1000'));
    await assessment.connect(fraudulentMember).stake(fixture.amount.mul(100));
    const minVotingPeriod = (await assessment.getMinVotingPeriod()).toNumber();
    const payoutCooldown = (await assessment.getPayoutCooldown()).toNumber();

    // Fraudulent vote
    await individualClaims.submitClaim(1, fixture.amount, '', { value: fixture.amount });
    await assessment.connect(fraudulentMember).castVotes([0], [true], ['Assessment data hash'], 0);
    const merkleTree = await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [fixture.amount],
    });
    const { rewardsWithdrawableFromIndex: indexAtStart } = await assessment.stakeOf(fraudulentMember.address);
    expect(indexAtStart).to.be.eq(0);

    const proof = getProof({
      address: fraudulentMember.address,
      lastFraudulentVoteIndex: 0,
      amount: fixture.amount,
      fraudCount: 0,
      merkleTree,
    });

    await assessment.processFraud(0, proof, fraudulentMember.address, 0, fixture.amount, 0, 100);
    const { rewardsWithdrawableFromIndex: indexAfterFraudProcess } = await assessment.stakeOf(fraudulentMember.address);
    expect(indexAfterFraudProcess).to.be.eq(1);

    // Good vote
    await individualClaims.submitClaim(2, fixture.amount, '', { value: fixture.amount });
    await assessment.connect(fraudulentMember).castVotes([1], [true], ['Assessment data hash'], 0);

    await increaseTime(minVotingPeriod + payoutCooldown + 1);
    await assessment.withdrawRewards(fraudulentMember.address, 1);
    const { rewardsWithdrawableFromIndex: indexAfterGoodVote } = await assessment.stakeOf(fraudulentMember.address);
    expect(indexAfterGoodVote).to.be.eq(2);

    await assessment.processFraud(0, proof, fraudulentMember.address, 0, fixture.amount, 0, 100);
    const { rewardsWithdrawableFromIndex: indexAfterSameFraudProcess } = await assessment.stakeOf(
      fraudulentMember.address,
    );
    expect(indexAfterSameFraudProcess).to.be.eq(2);
  });
});
