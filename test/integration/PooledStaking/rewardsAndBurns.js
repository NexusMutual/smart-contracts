// const { accounts, ethers } = require('hardhat');
// const { assert, expect } = require('chai');
// const { BigNumber, provider } = ethers;
// const { parseEther } = ethers.utils;
//
// const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
// const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
// const setup = require('../setup');
// const { increaseTime } = require('../utils/').evm;
// const { buyCover } = require('../utils').buyCover;
// const { hex } = require('../utils').helpers;
//
// // const [
// //   ,
// //   /* owner */ member1,
// //   member2,
// //   member3,
// //   staker1,
// //   staker2,
// //   staker3,
// //   staker4,
// //   staker5,
// //   staker6,
// //   staker7,
// //   staker8,
// //   staker9,
// //   staker10,
// //   coverHolder,
// // ] = accounts;
//
// const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
// const stakers = [staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10];
// const tokensLockedForVoting = parseEther('200');
//
// async function submitMemberVotes({ cd, cl, voteValue, maxVotingMembers }) {
//   const claimId = (await cd.actualClaimLength()) - 1;
//   const initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
//   const baseMembers = [member1, member2, member3];
//   const voters = maxVotingMembers ? baseMembers.slice(0, maxVotingMembers) : baseMembers;
//
//   for (const member of voters) {
//     await cl.submitCAVote(claimId, voteValue, { from: member });
//   }
//
//   const finalCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
//   const actualVoteTokensDiff = finalCAVoteTokens[1] - initialCAVoteTokens[1];
//   const expectedVoteTokensDiff = tokensLockedForVoting * voters.length;
//   assert.equal(actualVoteTokensDiff, expectedVoteTokensDiff);
//
//   const allVotes = await cd.getAllVotesForClaim(claimId);
//   const expectedVotes = allVotes[1].length;
//   assert.equal(voters.length, expectedVotes);
// }
//
// async function closeClaim({ cl, cd, cr, expectedClaimStatusNumber }) {
//   const claimId = (await cd.actualClaimLength()) - 1;
//   const minVotingTime = await cd.minVotingTime();
//
//   await increaseTime(minVotingTime);
//
//   const actualVoteClosingBefore = await cl.checkVoteClosing(claimId);
//   assert.equal(actualVoteClosingBefore.toString(), '1');
//
//   await cr.closeClaim(claimId); // trigger changeClaimStatus
//   const newCStatus = await cd.getClaimStatusNumber(claimId);
//   assert.equal(newCStatus[1].toString(), expectedClaimStatusNumber);
//
//   const actualVoteClosingAfter = await cl.checkVoteClosing(claimId);
//   assert.equal(actualVoteClosingAfter.toString(), '-1');
// }
// const lastBlockTimestamp = async () =>
//   (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
//
// describe.skip('burns', function () {
//   let fixture;
//   beforeEach(async function () {
//     fixture = await loadFixture(setup);
//     const members = [member1, member2, member3, ...stakers, coverHolder];
//     await enrollMember(fixture.contracts, members);
//     await enrollClaimAssessor(fixture.contracts, members, { lockTokens: tokensLockedForVoting });
//   });
//
//   it('claim is accepted for contract whose staker that staked on multiple contracts', async function () {
//     const { ps, tk, qd, cl, tc, p1 } = fixture.contracts;
//
//     const currency = hex('ETH');
//     const cover = {
//       amount: 1,
//       price: '3362445813369838',
//       priceNXM: '744892736679184',
//       expireTime: '7972408607',
//       generationTime: '7972408607001',
//       currency,
//       period: 63,
//       contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
//     };
//
//     const secondCoveredAddress = '0xd01236c54dbc68db5db3a091b171a77407ff7234';
//     const stakeTokens = parseEther('20');
//
//     await tk.approve(tc.address, stakeTokens, { from: staker1 });
//     await ps.depositAndStake(
//       stakeTokens,
//       [cover.contractAddress, secondCoveredAddress],
//       [stakeTokens, stakeTokens], {
//        from: staker1,
//       },
//     );
//
//     await buyCover({ ...fixture.contracts, cover, coverHolder });
//
//     await increaseTime(await ps.REWARD_ROUND_DURATION());
//
//     await ps.pushRewards([cover.contractAddress]);
//     assert(await ps.hasPendingActions());
//
//     const stakerRewardPreProcessing = await ps.stakerReward(staker1);
//     await ps.processPendingActions('100');
//     const stakerRewardPostProcessing = await ps.stakerReward(staker1);
//
//     const rewardValue = stakerRewardPostProcessing.sub(stakerRewardPreProcessing);
//     const stakerRewardPercentage = 50;
//     const coverPrice = cover.priceNXM;
//
//     const expectedTotalReward = coverPrice.mul(stakerRewardPercentage).div(100);
//
//     assert.equal(rewardValue.toString(), expectedTotalReward.toString());
//
//     const staked = await ps.contractStake('0xd0a6E6C54DbC68Db5db3A091B171A77407Ff7ccf');
//     const coverID = await qd.getAllCoversOfUser(coverHolder);
//     await cl.submitClaim(coverID[0], { from: coverHolder });
//
//     const now = await lastBlockTimestamp();
//     await submitMemberVotes({ ...fixture.contracts, voteValue: 1 });
//
//     const balanceBefore = await tk.balanceOf(ps.address);
//     await closeClaim({ ...fixture.contracts, now, expectedClaimStatusNumber: '14' });
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//
//     const balanceAfter = await tk.balanceOf(ps.address);
//     const tokenPrice = await p1.getTokenPrice(ETH);
//     const totalBurn = balanceBefore.sub(balanceAfter);
//     const sumAssured = parseEther(cover.amount.toString());
//     const sumAssuredInNxm = sumAssured.mul(parseEther('1')).div(tokenPrice);
//     const expectedBurnedNXMAmount = staked.lt(sumAssuredInNxm) ? staked : sumAssuredInNxm;
//
//     assert.equal(
//       totalBurn.toString(),
//       expectedBurnedNXMAmount.toString(),
//       `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
//     );
//   });
//
//   it('claim is accepted for 10 stakers', async function () {
//     const currency = hex('ETH');
//
//     const cover = {
//       amount: 1,
//       price: '3362445813369838',
//       priceNXM: '744892736679184',
//       expireTime: '7972408607',
//       generationTime: '7972408607001',
//       currency,
//       period: 63,
//       contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
//     };
//
//     const stakeTokens = parseEther('20');
//     const { ps, tk, qd, cl, p1, tc } = fixture.contracts;
//
//     for (const staker of stakers) {
//       await tk.approve(tc.address, stakeTokens, {
//         from: staker,
//       });
//       await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
//         from: staker,
//       });
//     }
//
//     await buyCover({ ...fixture.contracts, cover, coverHolder });
//     await increaseTime(await ps.REWARD_ROUND_DURATION());
//     await ps.pushRewards([cover.contractAddress]);
//
//     const stakerRewardPreProcessing = await ps.stakerReward(staker1);
//     await ps.processPendingActions('100');
//     const stakerRewardPostProcessing = await ps.stakerReward(staker1);
//
//     const rewardValue = stakerRewardPostProcessing.sub(stakerRewardPreProcessing);
//     const stakerRewardPercentage = 50;
//     const coverPrice = cover.priceNXM;
//     const expectedRewardPerStaker = coverPrice.mul(stakerRewardPercentage).div(100).div(stakers.length);
//
//     assert.equal(rewardValue.toString(), expectedRewardPerStaker.toString());
//
//     const coverID = await qd.getAllCoversOfUser(coverHolder);
//     await cl.submitClaim(coverID[0], { from: coverHolder });
//
//     const now = await lastBlockTimestamp();
//     await submitMemberVotes({ ...fixture.contracts, voteValue: 1 });
//
//     const balanceBefore = await tk.balanceOf(ps.address);
//     await closeClaim({ ...fixture.contracts, now, expectedClaimStatusNumber: '14' });
//     await ps.processPendingActions('100');
//     const balanceAfter = await tk.balanceOf(ps.address);
//
//     const tokenPrice = await p1.getTokenPrice(ETH);
//     const sumAssured = parseEther(cover.amount);
//     const actualBurn = balanceBefore.sub(balanceAfter);
//
//     const pushedBurnAmount = sumAssured.mul(parseEther('1')).div(tokenPrice);
//     const stakedOnContract = await ps.contractStake(cover.contractAddress);
//     let expectedBurnedNXMAmount = parseEther('0');
//
//     for (const staker of stakers) {
//       const stakerStake = await ps.stakerContractStake(staker, cover.contractAddress);
//       const stakerBurn = stakerStake.mul(pushedBurnAmount).div(stakedOnContract);
//       expectedBurnedNXMAmount = expectedBurnedNXMAmount.add(stakerBurn);
//     }
//
//     assert.equal(
//       actualBurn.toString(),
//       expectedBurnedNXMAmount.toString(),
//       `Total burn: ${actualBurn}, expected: ${expectedBurnedNXMAmount}`,
//     );
//   });
//
//   it('claim is rejected', async function () {
//     const { ps, tk, qd, cl, tc } = fixture.contracts;
//     const currency = hex('ETH');
//
//     const cover = {
//       amount: 1,
//       price: '3362445813369838',
//       priceNXM: '744892736679184',
//       expireTime: '7972408607',
//       generationTime: '7972408607001',
//       currency,
//       period: 63,
//       contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
//     };
//
//     const stakeTokens = parseEther('20');
//
//     await tk.approve(tc.address, stakeTokens, { from: staker1 });
//     await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });
//
//     await buyCover({ ...fixture.contracts, cover, coverHolder });
//     await increaseTime(await ps.REWARD_ROUND_DURATION());
//     await ps.pushRewards([cover.contractAddress]);
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//
//     const coverID = await qd.getAllCoversOfUser(coverHolder);
//     await cl.submitClaim(coverID[0], { from: coverHolder });
//
//     const now = await lastBlockTimestamp();
//     await submitMemberVotes({ ...fixture.contracts, voteValue: -1 });
//
//     const balanceBefore = await tk.balanceOf(ps.address);
//     await closeClaim({ ...fixture.contracts, now, expectedClaimStatusNumber: '6' });
//
//     await ps.processPendingActions('100');
//     const balanceAfter = await tk.balanceOf(ps.address);
//     await ps.processPendingActions('100');
//
//     const totalBurn = balanceBefore.sub(balanceAfter);
//
//     assert.equal(totalBurn.toString(), '0', `Total burn: ${totalBurn}, expected: ${0}`);
//   });
//
//   it('claim is accepted and burn happens after an unprocessed unstake request by staker', async function () {
//     const { p1, ps, tk, qd, cl, tc } = fixture.contracts;
//     const currency = hex('ETH');
//
//     const cover = {
//       amount: 1,
//       price: '3362445813369838',
//       priceNXM: '744892736679184',
//       expireTime: '7972408607',
//       generationTime: '7972408607001',
//       currency,
//       period: 63,
//       contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
//     };
//
//     const stakeTokens = parseEther('20');
//     await tk.approve(tc.address, stakeTokens, { from: staker1 });
//     await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });
//
//     await buyCover({ ...fixture.contracts, cover, coverHolder });
//     await increaseTime(await ps.REWARD_ROUND_DURATION());
//     await ps.pushRewards([cover.contractAddress]);
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//
//     const coverID = await qd.getAllCoversOfUser(coverHolder);
//     await cl.submitClaim(coverID[0], { from: coverHolder });
//
//     const now = await lastBlockTimestamp();
//     await submitMemberVotes({ ...fixture.contracts, voteValue: 1 });
//     const balanceBefore = await tk.balanceOf(ps.address);
//     await closeClaim({ ...fixture.contracts, now, expectedClaimStatusNumber: '14' });
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//     assert.isFalse(await ps.hasPendingActions());
//
//     const tokenPrice = await p1.getTokenPrice(ETH);
//     const sumAssured = parseEther(cover.amount);
//     const expectedBurnedNXMAmount = sumAssured.mul(parseEther('1')).div(tokenPrice);
//
//     const balanceAfter = await tk.balanceOf(ps.address);
//     const totalBurn = balanceBefore.sub(balanceAfter);
//
//     assert.equal(
//       totalBurn.toString(),
//       expectedBurnedNXMAmount.toString(),
//       `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
//     );
//   });
//
//   it('claim is accepted and burn happens when the final vote is submitted', async function () {
//     const { ps, tk, cd, qd, cl, p1, tc } = fixture.contracts;
//     const currency = hex('ETH');
//
//     const cover = {
//       amount: 1,
//       price: '3362445813369838',
//       priceNXM: '744892736679184',
//       expireTime: '7972408607',
//       generationTime: '7972408607001',
//       currency,
//       period: 120,
//       contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
//     };
//
//     const stakeTokens = parseEther('20');
//     await tk.approve(tc.address, stakeTokens, { from: staker1 });
//     await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });
//
//     await buyCover({ ...fixture.contracts, cover, coverHolder });
//     await increaseTime(await ps.REWARD_ROUND_DURATION());
//     await ps.pushRewards([cover.contractAddress]);
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//
//     const coverID = await qd.getAllCoversOfUser(coverHolder);
//     await cl.submitClaim(coverID[0], { from: coverHolder });
//
//     const minVotingTime = await cd.minVotingTime();
//     await increaseTime(minVotingTime);
//
//     const balanceBefore = await tk.balanceOf(ps.address);
//     await submitMemberVotes({ ...fixture.contracts, voteValue: 1, maxVotingMembers: 1 });
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//     const balanceAfter = await tk.balanceOf(ps.address);
//
//     const claimId = (await cd.actualClaimLength()) - 1;
//     const actualVoteClosing = await cl.checkVoteClosing(claimId);
//     assert.equal(actualVoteClosing.toString(), '-1');
//
//     const claimStatus = await cd.getClaimStatusNumber(claimId);
//     assert.equal(claimStatus.statno.toString(), '14');
//
//     const tokenPrice = await p1.getTokenPrice(ETH);
//     const sumAssured = parseEther(cover.amount);
//     const expectedBurnedNXMAmount = sumAssured.mul(parseEther('1')).div(tokenPrice);
//
//     const totalBurn = balanceBefore.sub(balanceAfter);
//
//     assert.equal(
//       totalBurn.toString(),
//       expectedBurnedNXMAmount.toString(),
//       `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
//     );
//   });
//
//   it('claim is accepted and burn happens after an unstake request by staker is processed', async function () {
//     const { ps, tk, qd, cl, qt, p1 } = fixture.contracts;
//     const currency = hex('ETH');
//
//     const cover = {
//       amount: 1,
//       price: '3362445813369838',
//       priceNXM: '744892736679184',
//       expireTime: '7972408607',
//       generationTime: '7972408607001',
//       currency,
//       period: 120,
//       contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
//     };
//     const stakeTokens = parseEther('20');
//
//     await tk.approve(ps.address, stakeTokens, { from: staker1 });
//     await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });
//
//     await buyCover({ cover, coverHolder, qt, p1 });
//     await increaseTime(await ps.REWARD_ROUND_DURATION());
//     await ps.pushRewards([cover.contractAddress]);
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//
//     const unstakeRequest = await ps.requestUnstake([cover.contractAddress], [stakeTokens], 0, { from: staker1 });
//     const { timestamp: unstakeRequestedAt } = await provider.getBlock(unstakeRequest.receipt.blockNumber);
//
//     const unstakeLockTime = await ps.UNSTAKE_LOCK_TIME();
//     const expectedUnstakeTime = BigNumber.from(unstakeRequestedAt).add(unstakeLockTime);
//
//     expect(unstakeRequest).to.emit(ps, 'UnstakeRequested').withArgs(staker1, stakeTokens, expectedUnstakeTime);
//
//     await increaseTime(unstakeLockTime);
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//
//     const hasPendingRequests = await ps.hasPendingUnstakeRequests();
//     assert.isFalse(hasPendingRequests);
//
//     const currentTotalStake = await ps.contractStake(cover.contractAddress);
//     assert.equal(currentTotalStake.toString(), '0');
//
//     const coverID = await qd.getAllCoversOfUser(coverHolder);
//     await cl.submitClaim(coverID[0], { from: coverHolder });
//
//     const now = await lastBlockTimestamp();
//     await submitMemberVotes({ ...fixture.contracts, voteValue: 1 });
//
//     const balanceBefore = await tk.balanceOf(ps.address);
//     await closeClaim({ ...fixture.contracts, now, expectedClaimStatusNumber: '14' });
//
//     assert(await ps.hasPendingActions());
//     await ps.processPendingActions('100');
//     const balanceAfter = await tk.balanceOf(ps.address);
//
//     const totalBurn = balanceBefore.sub(balanceAfter);
//     assert.equal(totalBurn.toString(), '0');
//   });
// });
