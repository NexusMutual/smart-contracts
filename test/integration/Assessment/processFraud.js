const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getProof, submitFraud } = require('../../unit/Assessment/helpers');
const { calculateFirstTrancheId } = require('../utils/staking');
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance } = require('../../utils/evm');
const { parseEther } = ethers.utils;
const { MaxUint256 } = ethers.constants;

async function processFraudSetup() {
  const fixture = await setup();
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

  // buy cover
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

  return {
    ...fixture,
    amount,
  };
}

describe('processFraud', function () {
  it.skip('consumes less gas to process than the summed fees of the fraudulent voting transactions', async function () {
    const fixture = await loadFixture(processFraudSetup);
    const { as: assessment, ic: individualClaims, gv: governanceContact } = fixture.contracts;
    const governance = await ethers.getImpersonatedSigner(governanceContact.address);
    const [fraudulentMember] = fixture.accounts.members;
    await setEtherBalance(governance.address, parseEther('1000'));

    await assessment.connect(fraudulentMember).stake(fixture.amount.mul(100));
    await individualClaims.submitClaim(1, 0, fixture.amount, '', { value: fixture.amount });
    await assessment.connect(fraudulentMember).castVotes([0], [true], ['Assessment data hash'], 0);
    const merkleTree = await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [fixture.amount],
    });

    const proof = getProof({
      address: fraudulentMember.address,
      lastFraudulentVoteIndex: 0,
      amount: fixture.amount,
      fraudCount: 0,
      merkleTree,
    });

    const tx = await assessment.processFraud(0, proof, fraudulentMember.address, 0, fixture.amount, 0, 100);
    const receipt = await tx.wait();
    // TODO: this is a temporary value..what fees should be summed?
    expect(receipt.gasUsed).to.be.eq(92691);
  });
});
