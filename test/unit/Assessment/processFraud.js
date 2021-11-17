const { ethers } = require('hardhat');
const { expect, assert } = require('chai');
const { submitFraud, getProof } = require('./helpers');
const { daysToSeconds, setTime } = require('./helpers');
const { parseEther } = ethers.utils;

describe('processFraud', function () {
  it('reverts if the proof is invalid', async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember, honestMember] = this.accounts.members;
    await assessment.connect(fraudulentMember).stake(parseEther('100'));
    await claims.submitClaim(0, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(0, true);
    const merkleTree = await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [parseEther('100')],
    });

    {
      const proof = getProof({
        address: honestMember.address,
        lastFraudulentVoteIndex: 0,
        amount: parseEther('100'),
        fraudCount: 0,
        merkleTree,
      });
      await expect(
        assessment.processFraud(0, proof, honestMember.address, 0, parseEther('100'), 0, 100),
      ).to.be.revertedWith('Invalid merkle proof');
    }

    {
      const proof = getProof({
        address: fraudulentMember.address,
        lastFraudulentVoteIndex: 0,
        amount: parseEther('200'),
        fraudCount: 0,
        merkleTree,
      });
      await expect(
        assessment.processFraud(0, proof, fraudulentMember.address, 0, parseEther('200'), 0, 100),
      ).to.be.revertedWith('Invalid merkle proof');
    }

    {
      const proof = getProof({
        address: fraudulentMember.address,
        lastFraudulentVoteIndex: 0,
        amount: parseEther('100'),
        fraudCount: 1,
        merkleTree,
      });
      await expect(
        assessment.processFraud(0, proof, fraudulentMember.address, 1, parseEther('100'), 0, 100),
      ).to.be.revertedWith('Invalid merkle proof');
    }

    {
      const proof = getProof({
        address: fraudulentMember.address,
        lastFraudulentVoteIndex: 0,
        amount: parseEther('100'),
        fraudCount: 0,
        merkleTree,
      });
      await expect(
        assessment.processFraud(0, proof, fraudulentMember.address, 0, parseEther('100'), 0, 100),
      ).not.to.be.revertedWith('Invalid merkle proof');
    }
  });

  it("cancels the staker's votes starting from the last vote where the reward was withdrawn until lastFraudulentVoteIndex", async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember, otherMember1, otherMember2] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));
    await assessment.connect(otherMember1).stake(parseEther('50'));
    await assessment.connect(otherMember2).stake(parseEther('10'));

    await claims.submitClaim(0, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(0, true);

    await claims.submitClaim(1, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(1, true);

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + daysToSeconds(30));
    await assessment.withdrawRewards(fraudulentMember.address, 0);

    // Fraudulent claim
    await claims.submitClaim(2, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(2, true);
    await assessment.connect(otherMember1).castVote(2, false);
    await assessment.connect(otherMember2).castVote(2, false);

    await claims.submitClaim(3, parseEther('100'), '');
    await assessment.connect(otherMember1).castVote(3, true);
    await assessment.connect(otherMember2).castVote(3, true);
    await assessment.connect(fraudulentMember).castVote(3, false);

    await claims.submitClaim(4, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(4, true);
    await assessment.connect(otherMember1).castVote(4, true);
    await assessment.connect(otherMember2).castVote(4, true);

    const stake = await assessment.stakeOf(fraudulentMember.address);
    expect(stake.rewardsWithdrawableFromIndex).to.be.equal(2);

    const firstFraudulentAssessmentBefore = await assessment.assessments(2);
    const firstFraudulentVote = await assessment.votesOf(fraudulentMember.address, 2);
    expect(firstFraudulentAssessmentBefore.poll.accepted).to.be.equal(parseEther('100'));
    expect(firstFraudulentAssessmentBefore.poll.denied).to.be.equal(parseEther('60'));

    const secondFraudulentAssessmentBefore = await assessment.assessments(3);
    const secondFraudulentVote = await assessment.votesOf(fraudulentMember.address, 3);
    expect(secondFraudulentAssessmentBefore.poll.accepted).to.be.equal(parseEther('60'));
    expect(secondFraudulentAssessmentBefore.poll.denied).to.be.equal(parseEther('100'));

    const firstHonestAssessmentBefore = await assessment.assessments(0);
    const secondHonestAssessmentBefore = await assessment.assessments(1);
    const thirdHonestAssessmentBefore = await assessment.assessments(4);

    const burnAmount = parseEther('100');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      lastFraudulentVoteIndexes: [3],
      amounts: [burnAmount],
    });

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      3, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      100, // Maximum iterations per tx
    );

    const firstFraudulentAssessmentAfter = await assessment.assessments(2);
    expect(firstFraudulentAssessmentAfter.poll.accepted).to.be.equal(
      firstFraudulentAssessmentBefore.poll.accepted.sub(firstFraudulentVote.stakedAmount),
    );
    expect(firstFraudulentAssessmentAfter.poll.denied).to.be.equal(firstFraudulentAssessmentBefore.poll.denied);

    const secondFraudulentAssessmentAfter = await assessment.assessments(3);
    expect(secondFraudulentAssessmentAfter.poll.denied).to.be.equal(
      secondFraudulentAssessmentBefore.poll.denied.sub(secondFraudulentVote.stakedAmount),
    );
    expect(secondFraudulentAssessmentAfter.poll.accepted).to.be.equal(secondFraudulentAssessmentBefore.poll.accepted);

    // Leaves the assessments where the reward have been already withdrawn untouched
    const firstHonestAssessmentAfter = await assessment.assessments(0);
    expect(firstHonestAssessmentBefore.poll.accepted).to.be.equal(firstHonestAssessmentAfter.poll.accepted);
    expect(firstHonestAssessmentBefore.poll.denied).to.be.equal(firstHonestAssessmentAfter.poll.denied);

    const secondHonestAssessmentAfter = await assessment.assessments(1);
    expect(secondHonestAssessmentBefore.poll.accepted).to.be.equal(secondHonestAssessmentAfter.poll.accepted);
    expect(secondHonestAssessmentBefore.poll.denied).to.be.equal(secondHonestAssessmentAfter.poll.denied);

    // Leaves the assessments after lastFraudulentVoteIndex (3) intact
    const thirdHonestAssessmentAfter = await assessment.assessments(4);
    expect(thirdHonestAssessmentBefore.poll.accepted).to.be.equal(thirdHonestAssessmentAfter.poll.accepted);
    expect(thirdHonestAssessmentBefore.poll.denied).to.be.equal(thirdHonestAssessmentAfter.poll.denied);
  });

  it("cancels the staker's votes in batches", async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await Promise.all(
      Array(10)
        .fill('')
        .map((_, i) => claims.submitClaim(i, parseEther('100'), '')),
    );
    await Promise.all(
      Array(10)
        .fill('')
        .map((_, i) => assessment.connect(fraudulentMember).castVote(i, true)),
    );

    const burnAmount = parseEther('50');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      lastFraudulentVoteIndexes: [9],
      amounts: [burnAmount],
    });

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      9, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      2, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(2);
    }

    for (const i of [0, 1]) {
      const fraudulentAssessment = await assessment.assessments(i);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(0);
      expect(fraudulentAssessment.poll.denied).to.be.equal(0);
    }

    for (const i of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const fraudulentAssessment = await assessment.assessments(i);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(parseEther('100'));
      expect(fraudulentAssessment.poll.denied).to.be.equal(0);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      9, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      3, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(5);
    }

    for (const i of [2, 3, 4]) {
      const fraudulentAssessment = await assessment.assessments(i);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(0);
      expect(fraudulentAssessment.poll.denied).to.be.equal(0);
    }

    for (const i of [5, 6, 7, 8, 9]) {
      const fraudulentAssessment = await assessment.assessments(i);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(parseEther('100'));
      expect(fraudulentAssessment.poll.denied).to.be.equal(0);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      9, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      5, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(10);
    }

    for (const i of [5, 6, 7, 8, 9]) {
      const fraudulentAssessment = await assessment.assessments(i);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(0);
      expect(fraudulentAssessment.poll.denied).to.be.equal(0);
    }
  });

  it('skips polls that are outside the cooldown period', async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember, otherMember1, otherMember2] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));
    await assessment.connect(otherMember1).stake(parseEther('100'));
    await assessment.connect(otherMember2).stake(parseEther('200'));

    await claims.submitClaim(0, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(0, true);

    await claims.submitClaim(1, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(1, true);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setTime(timestamp + daysToSeconds(3) - 2);
    }

    // Increases the poll end by 1 day
    await assessment.connect(otherMember1).castVote(1, false);
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setTime(timestamp + daysToSeconds(1) - 2);
    }

    // Increases the poll end by 1 day
    await assessment.connect(otherMember2).castVote(1, false);
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setTime(timestamp + daysToSeconds(2) - 2);
    }

    const burnAmount = parseEther('100');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [burnAmount],
    });

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      1, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      100, // Maximum iterations per tx
    );

    {
      const outsideOfCooldownPeriodAssessment = await assessment.assessments(0);
      expect(outsideOfCooldownPeriodAssessment.poll.accepted).to.be.equal(parseEther('100'));
      expect(outsideOfCooldownPeriodAssessment.poll.denied).to.be.equal(0);
    }

    {
      const fraudulentAssessment = await assessment.assessments(1);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(0);
      expect(fraudulentAssessment.poll.denied).to.be.equal(parseEther('300'));
    }
  });

  it('extends the poll voting period by a maximum of 24h if it ends in less than 24h', async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await claims.submitClaim(0, parseEther('100'), '');
    await assessment.connect(fraudulentMember).castVote(0, true);

    {
      const fraudulentAssessment = await assessment.assessments(0);
      await setTime(fraudulentAssessment.poll.end);
    }

    const burnAmount = parseEther('100');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [burnAmount],
    });

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      0, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      100, // Maximum iterations per tx
    );
    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      const fraudulentAssessment = await assessment.assessments(0);
      expect(fraudulentAssessment.poll.end).to.be.equal(timestamp + daysToSeconds(1));
    }
  });

  it('emits a FraudResolution event for every cancelled vote', async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember1, fraudulentMember2] = this.accounts.members;

    await assessment.connect(fraudulentMember1).stake(parseEther('100'));
    await assessment.connect(fraudulentMember2).stake(parseEther('50'));

    await claims.submitClaim(0, parseEther('100'), '');
    await claims.submitClaim(1, parseEther('1000'), '');

    await assessment.connect(fraudulentMember1).castVote(0, true);
    await assessment.connect(fraudulentMember1).castVote(1, true);

    await assessment.connect(fraudulentMember2).castVote(0, true);
    await assessment.connect(fraudulentMember2).castVote(1, true);

    const { poll: poll1 } = await assessment.assessments(0);
    const { poll: poll2 } = await assessment.assessments(1);

    const merkleTree = await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember1.address, fraudulentMember2.address],
      amounts: [parseEther('100'), parseEther('50')],
    });

    {
      const proof = getProof({
        address: fraudulentMember1.address,
        lastFraudulentVoteIndex: 1,
        amount: parseEther('100'),
        fraudCount: 0,
        merkleTree,
      });
      const tx = await assessment.processFraud(
        0, // Index of the merkle tree root hash
        proof,
        fraudulentMember1.address, // The address of the fraudulent assessor
        1, // The index of the last vote that is considered to be fraudulent
        parseEther('100'), // The amount of stake to be burned
        0, // The count of previous fraud attempts by this assessor
        100, // Maximum iterations per tx
      );
      const { events } = await tx.wait();
      expect(events[0].args.assessmentId).to.be.equal(0);
      expect(events[0].args.assessor).to.be.equal(fraudulentMember1.address);
      expect(events[0].args.poll.accepted).to.be.equal(parseEther('50'));
      expect(events[0].args.poll.denied).to.be.equal(parseEther('0'));
      expect(events[0].args.poll.start).to.be.equal(poll1.start);
      expect(events[0].args.poll.end).to.be.equal(poll1.end);

      expect(events[1].args.assessmentId).to.be.equal(1);
      expect(events[1].args.assessor).to.be.equal(fraudulentMember1.address);
      expect(events[1].args.poll.accepted).to.be.equal(parseEther('50'));
      expect(events[1].args.poll.denied).to.be.equal(parseEther('0'));
      expect(events[1].args.poll.start).to.be.equal(poll2.start);
      expect(events[1].args.poll.end).to.be.equal(poll2.end);
    }

    {
      const proof = getProof({
        address: fraudulentMember2.address,
        lastFraudulentVoteIndex: 1,
        amount: parseEther('50'),
        fraudCount: 0,
        merkleTree,
      });
      const tx = await assessment.processFraud(
        0, // Index of the merkle tree root hash
        proof,
        fraudulentMember2.address, // The address of the fraudulent assessor
        1, // The index of the last vote that is considered to be fraudulent
        parseEther('50'), // The amount of stake to be burned
        0, // The count of previous fraud attempts by this assessor
        100, // Maximum iterations per tx
      );
      const { events } = await tx.wait();
      expect(events[0].args.assessmentId).to.be.equal(0);
      expect(events[0].args.assessor).to.be.equal(fraudulentMember2.address);
      expect(events[0].args.poll.accepted).to.be.equal(parseEther('0'));
      expect(events[0].args.poll.denied).to.be.equal(parseEther('0'));
      expect(events[0].args.poll.start).to.be.equal(poll1.start);
      expect(events[0].args.poll.end).to.be.equal(poll1.end);

      expect(events[1].args.assessmentId).to.be.equal(1);
      expect(events[1].args.assessor).to.be.equal(fraudulentMember2.address);
      expect(events[1].args.poll.accepted).to.be.equal(parseEther('0'));
      expect(events[1].args.poll.denied).to.be.equal(parseEther('0'));
      expect(events[1].args.poll.start).to.be.equal(poll2.start);
      expect(events[1].args.poll.end).to.be.equal(poll2.end);
    }
  });

  it("burns the fraudulent member's stake by burnAmount", async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await claims.submitClaim(0, parseEther('100'), '');

    await assessment.connect(fraudulentMember).castVote(0, true);

    const burnAmount = parseEther('33');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [burnAmount],
    });

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('100'));
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [],
      fraudulentMember.address, // The address of the fraudulent assessor
      0, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      100, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('67'));
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(1);
    }
  });

  it('allows vote correction without burning stake', async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await claims.submitClaim(0, parseEther('100'), '');

    await assessment.connect(fraudulentMember).castVote(0, true);

    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      amounts: [0],
    });

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('100'));
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [],
      fraudulentMember.address, // The address of the fraudulent assessor
      0, // The index of the last vote that is considered to be fraudulent
      parseEther('0'), // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      100, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('100'));
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(1);
      const fraudulentAssessment = await assessment.assessments(0);
      expect(fraudulentAssessment.poll.accepted).to.be.equal(0);
      expect(fraudulentAssessment.poll.denied).to.be.equal(0);
    }
  });

  it("skips burning if the provided fraudCount doesn't match the staker's fraudCount", async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await Promise.all(
      Array(10)
        .fill('')
        .map((_, i) => claims.submitClaim(i, parseEther('100'), '')),
    );
    await Promise.all(
      Array(10)
        .fill('')
        .map((_, i) => assessment.connect(fraudulentMember).castVote(i, true)),
    );

    const burnAmount = parseEther('50');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      lastFraudulentVoteIndexes: [4],
      amounts: [burnAmount],
    });

    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      lastFraudulentVoteIndexes: [9],
      amounts: [burnAmount],
    });

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('100'));
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(0);
      expect(stake.fraudCount).to.be.equal(0);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      4, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      2, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('50'));
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(2);
      expect(stake.fraudCount).to.be.equal(1);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      4, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      3, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('50'));
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(5);
    }

    await assessment.processFraud(
      1, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      9, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      5, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.amount).to.be.equal(parseEther('50'));
      expect(stake.rewardsWithdrawableFromIndex).to.be.equal(10);
    }
  });

  it("increases the fraudulent staker's fraudCount on the first call", async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await Promise.all(
      Array(2)
        .fill('')
        .map((_, i) => claims.submitClaim(i, parseEther('100'), '')),
    );
    await Promise.all(
      Array(2)
        .fill('')
        .map((_, i) => assessment.connect(fraudulentMember).castVote(i, true)),
    );

    const burnAmount = parseEther('50');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      lastFraudulentVoteIndexes: [1],
      amounts: [burnAmount],
    });

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.fraudCount).to.be.equal(0);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      1, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      1, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.fraudCount).to.be.equal(1);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      1, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      1, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.fraudCount).to.be.equal(1);
    }
  });

  it('sets rewardsWithdrawableFromIndex to the last cancelled vote', async function () {
    const { assessment, claims } = this.contracts;
    const governance = this.accounts.governanceContracts[0];
    const [fraudulentMember] = this.accounts.members;

    await assessment.connect(fraudulentMember).stake(parseEther('100'));

    await Promise.all(
      Array(2)
        .fill('')
        .map((_, i) => claims.submitClaim(i, parseEther('100'), '')),
    );
    await Promise.all(
      Array(2)
        .fill('')
        .map((_, i) => assessment.connect(fraudulentMember).castVote(i, true)),
    );

    const burnAmount = parseEther('50');
    await submitFraud({
      assessment,
      signer: governance,
      addresses: [fraudulentMember.address],
      lastFraudulentVoteIndexes: [1],
      amounts: [burnAmount],
    });

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.fraudCount).to.be.equal(0);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      1, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      1, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.fraudCount).to.be.equal(1);
    }

    await assessment.processFraud(
      0, // Index of the merkle tree root hash
      [], // Proof, empty beacuse the root is also the only leaf
      fraudulentMember.address, // The address of the fraudulent assessor
      1, // The index of the last vote that is considered to be fraudulent
      burnAmount, // The amount of stake to be burned
      0, // The count of previous fraud attempts by this assessor
      1, // Maximum iterations per tx
    );

    {
      const stake = await assessment.stakeOf(fraudulentMember.address);
      expect(stake.fraudCount).to.be.equal(1);
    }
  });

  it.skip('consumes less gas to process than the summed fees of the fraudulent voting transactions', async function () {
    // [todo] Move this to integration tests instead
  });
});
