// setup @setup.js
//   - add assessors to a new group
//   - set assessment data for product type

// // Phase 1: Initial validation & DENIED claims flow
// submitClaim (ETH claim)
//   - should not be able to submitClaim if not a member
//   - become a member, but not coverNFT owner - should fail
//   - member + coverNFT owner - should succeed (ETH cover)

// castVote - DENIED outcome
//   - majority against votes (with some for votes)
//   - advance time to end of cooldown period
//   - verify status is DENIED

// // Phase 2: USDC claims flow with fraud detection
// submitClaim (USDC claim - immediate re-submission after DENIED)
//   - claimant should be able to re-submit immediately after DENIED
//   - create USDC cover, submit USDC claim

// castVote - inconclusive initially
//   - some support for, some against (not decisive - maybe 2 for, 2 against)
//   - advance time to end of voting period (enters cooldown)

// cooldown period with fraud detection
//   - assessors should not be able to vote
//   - claimant should not be able to redeemPayout
//   - fraud discovered: undoVotes for specific fraudulent assessors
//   - remove fraudulent assessor from group
//   - add new assessors to group
//   - extendVotingPeriod to allow new assessors to vote

// castVote with new assessors
//   - newly added assessors vote (majority for)
//   - advance time to end of new voting period, then cooldown period

// // Phase 3: Pause functionality testing
// pause claims payout
//   - attempt redeemClaimPayout on USDC claim - should fail when paused

// unpause claims payout
//   - redeemClaimPayout should now succeed (USDC payout + ETH deposit returned)

// // Phase 4: ETH claims with redemption period expiry
// submitClaim / castVote (new ETH claim)
//   - claimant creates new ETH cover and submits claim
//   - majority for votes (with some against votes)
//   - advance time to end of voting and cooldown periods

// redemption period expiry
//   - advance time past redemption period without redeeming
//   - attempt redeemClaimPayout - should fail (redemption period expired)

// // Phase 5: Final successful ETH redemption
// submitClaim / castVote again (final ETH claim)
//   - claimant should be able to re-submit since previous redemption period expired
//   - majority for votes, advance through voting and cooldown periods

// redeemClaimPayout (ETH)
//   - claimant should be able to redeem ETH claim payout + deposit returned