
<p style="text-align: justify-all;">

<h2>NEXUS MUTUAL</h2>
Nexus Mutual uses blockchain technology to bring the mutual ethos back to insurance by creating aligned incentives through smart contract code on the Ethereum blockchain.
<h3>Description</h3>
Nexus Mutual is built on the Ethereum blockchain and uses a modular system for grouping of Ethereum smart contracts, allowing logical components of the system to be upgraded without effecting the other components. Following are the key modules of Nexus Mutual.
<h4>Token Module</h4>
Token contracts maintain details of NXM Members and the NXM Tokens held by each of them. NXM tokens can be used to purchase a cover, submit a claim, assess a claim, participate in Surplus Distribution or transfer tokens to other addresses.
<p><u>Core Contracts</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/NXMToken.sol" style="text-decoration: none;">NXMToken.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/NXMToken2.sol" style="text-decoration: none;">NXMToken2.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/NXMToken3.sol" style="text-decoration: none;">NXMToken3.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/NXMTokenData.sol" style="text-decoration: none;">NXMTokenData.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>lockCN : Tokens are locked against a cover note, at the time of cover generation. These can be used to submit a claim and unused tokens can be unlocked for general use once the cover expires.</li>
<li>depositCN: Tokens are deposited while submitting a claim against a cover. These are eventually burnt in case of denial and unlocked in case of claim acceptance.</li> 
<li>lockCA: NXM members can lock available NXM tokens for claims assessment.</li>
<li>lockSD: NXM members can lock available NXM tokens to participate in surplus distribution.</li>
</ol>
<img src="https://nexusmutual.io/img/readme/Token.png" style="height: 300px;"> 

<h4>Quotation Module</h4>
Quotation contracts contain all logic associated with creating and expiring of quotations and covers. A member can create a quotation, which leads to cover generation, subject to the premium amount funded. Quotation contracts interact with Token Contracts to lock NXM tokens against a cover. 
<p><u>Core Contracts</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/quotation.sol" style="text-decoration: none;">quotation.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/quotation2.sol" style="text-decoration: none;">quotation2.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/quotationData.sol" style="text-decoration: none;">quotationData.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>addQuote : Creates a new Quotation.</li>
<li>calPremium : Calculates the Premium of the Quotation generated.</li>
<li>fundQuote: A user funding the Quotation in order to generate a cover.</li>
<li>makeCover: Creates a cover note based on the quotation funded and allocates and locks NXM tokens to the owner.</li>
</ol>
 <img src="https://nexusmutual.io/img/readme/Quotation.png" style="height: 300px;"> 

<h4>Claim Module</h4>
Claim contracts contain functions for submitting a claim against a cover note or taking part in claims assessment. 
<p><u>Core Contracts</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/claims.sol" style="text-decoration: none;">claims.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/claims2.sol" style="text-decoration: none;">claims2.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/claimsData.sol" style="text-decoration: none;">claimsData.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>submitClaim: Submits a claim against a cover note.</li>
<li>submitCAVote : Members who have tokens locked under Claims Assessment, can assess a claim, i.e., accept/deny a claim using the locked tokens.</li>
<li>submitMemberVote: Submits a member vote for assessing a claim.</li>
<li>escalateClaim: Escalates a specified claim id. In case a claim is denied by claim assessors, the user can use this method to escalate a claim for member voting.</li>
</ol>
 <img src="https://nexusmutual.io/img/readme/Claim.png" style="height: 300px;">

<h4>Claim Reward Module</h4>
Claims Reward Contract contains the methods for rewarding or punishing the Claim assessors/Members based on the vote cast and the final verdict.
<p><u>Core Contract</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/claims_Reward.sol" style="text-decoration: none;">claims_Reward.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>changeClaimStatus: Decides the next/final status of a claim. Decision is taken based on the current state and the votes cast.</li>
<li>rewardAgainstClaim: Rewards/Punishes users who  participated in claims assessment. NXM tokens are allocated as a reward for assessors who voted with the consensus. NXM tokens are locked as a punishment for assessors who voted against the consensus.</li>
 </ol>
 <img src="https://nexusmutual.io/img/readme/ClaimsReward.png" style="height: 300px;">

<h4>Pool Module</h4>
Pool contracts contain all logic associated with calling External oracles through Oraclize and processing the results retrieved from the same.
<p><u>Core Contract</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/pool.sol" style="text-decoration: none;">pool.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/pool2.sol" style="text-decoration: none;">pool2.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/poolData1.sol" style="text-decoration: none;">poolData1.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>closeProposalOraclise: Closes Proposal’s voting.
<li>closeQuotationOraclise: Expires a quotation.</li>
<li>closeCoverOraclise: Expires a cover.</li>
<li>callQuotationOracalise: Fetches the risk cost for a given latitude and longitude.</li>
<li>versionOraclise: Updates the version of contracts.</li>
<li>MCROraclise: Initiates Minimum Capital Requirement (MCR) calculation.</li>
<li>closeClaimsOraclise: Closes Claim’s voting.</li>
</ol>

<h4>MCR Module</h4>
MCR contracts contain functions for recording the Minimum Capital Requirement (MCR) of the system, each day, thus determining the NXM token price and initiating Surplus distribution whenever applicable.
<p><u>Core Contract</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/MCR.sol" style="text-decoration: none;">MCR.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/MCRData.sol" style="text-decoration: none;">MCRData.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>pushMCRData: Records details of (Minimum Capital Requirement)MCR for each day.</li>
<li>calculateTokenPrice: Calculates the NXM Token Price of a currency.</li>
</ol> 
 <img src="https://nexusmutual.io/img/readme/MCR.png" style="height: 300px;">

<h4>Governance Module:</h4>
Governance contracts contain all logic associated with creating, editing, categorizing and voting of proposals. 
<p><u>Core Contract</u></p>
<ol>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/governance.sol" style="text-decoration: none;">governance.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/governance2.sol" style="text-decoration: none;">governance2.sol</a></li>
<li><a href="https://github.com/support-somish/NexusMutual/blob/master/governanceData.sol" style="text-decoration: none;">governanceData.sol</a></li>
</ol>
<p><u>Some important functions</u></p>
<ol>
<li>addProposal : Creates a New Proposal</li>
<li>categorizeProposal: Allows advisory board members to categorize a  proposal.</li>
<li>editProposal: Edits a proposal and uncategorizes it. Only owner of the proposal can edit it.</li>
<li>voteABProposal: Advisory Board(AB) Members can cast their votes, either in favor or against a Proposal.</li>
<li>voteMember: After AB accepting a proposal, members (NXM tokens holders) can cast their votes, either in favor or against a Proposal.</li>
</ol> 
 <img src="https://nexusmutual.io/img/readme/Governance.png" style="height: 300px;">

</p>



