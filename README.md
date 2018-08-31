[![Build Status](https://travis-ci.org/somish/NexusMutual.svg?branch=revise-token-module)](https://travis-ci.org/somish/NexusMutual)

[![Coverage Status](https://coveralls.io/repos/github/somish/NexusMutual/badge.svg?branch=unit-test)](https://coveralls.io/github/somish/NexusMutual?branch=unit-test)

<h1><a id="NEXUS_MUTUAL_0"></a>NEXUS MUTUAL</h1>
<p>Nexus Mutual uses blockchain technology to bring the mutual ethos back to insurance by creating aligned incentives through smart contract code on the Ethereum blockchain.</p>
<h2><a id="Description_3"></a>Description</h2>
<p>Nexus Mutual is built on the Ethereum blockchain and uses a modular system for grouping of Ethereum smart contracts, allowing logical components of the system to be upgraded without effecting the other components. Following are the key modules of Nexus Mutual.</p>
<h3><a id="Token_Module_6"></a>Token Module</h3>
<p>Token contracts maintain details of NXM Members and the NXM Tokens held by each of them. NXM tokens can be used to purchase a cover, submit a claim, underwrite smart contracts,  assess a claim or transfer tokens to other addresses.</p>
<h4><a id="Core_Contracts_9"></a>Core Contracts</h4>
<ul>
<li>nxmToken.sol</li>
<li>nxmToken2.sol</li>
<li>nxmTokenData.sol</li>
</ul>
<blockquote>
<p>Note: The smart contracts of this module had to be split in multiple smart contracts to cater to the Ethereum Gas limits. The above mentioned contracts need to be seen in conjunction</p>
</blockquote>
<h5><a id="Some_important_functions_21"></a>Some important functions</h5>
<ul>
<li>lockCN : Tokens are locked against a cover note, at the time of cover generation. These can be used to submit a claim and unused tokens can be unlocked for general use once the cover expires.</li>
<li>depositCN: Tokens are deposited while submitting a claim against a cover. These are eventually burnt in case of denial and unlocked in case of claim acceptance.</li>
<li>lock: Locks a specified amount of tokens against an address for a specified purpose and time</li>
<li>addStake: Add amount of token for staking on smart contract.</li>
</ul>
<img src="https://nexusmutual.io/img/readme/Token.png" style="height: 300px;"> 

<h3><a id="Quotation_Module_28"></a>Quotation Module</h3>
<p>Quotation contracts contain all logic associated with creating and expiring covers. Smart contract cover is the first insurance product supported by the mutual. A member can generate a quotation offchain , and fund the same via NXM tokens / currency assets(currently ETH and DAI). This creates a cover on-chain. Quotation contracts interact with Token Contracts to lock NXM tokens against a cover which are then used at the time of claim submission.</p>
<h4><a id="Core_Contracts_31"></a>Core Contracts</h4>
<ul>
<li>quotation2.sol</li>
<li>quotationData.sol</li>
</ul>
<h5><a id="Some_important_functions_40"></a>Some important functions</h5>
<ul>
<li>makeCover : Create cover of the quotation, change the status of the quotation, update the total sum assured and lock the tokens of the cover of a quote from Quote member Ethereum address</li>
<li>makeCoverUsingNXMTokens : Make Cover using NXM tokens.</li>
</ul>
<h3><a id="Claim_Module_45"></a>Claim Module</h3>
<p>Claim contracts manages the entire claim lifecycle starting from submitting a claim against a cover note to taking part in claims assessment to closing a claim. </p>
<h4><a id="Core_Contracts_49"></a>Core Contracts</h4>
<ul>
<li>claims.sol</li>
<li>claimsData.sol</li>
</ul>
<h5><a id="Some_important_functions_58"></a>Some important functions</h5>
<ul>
<li>submitClaim: Submits a claim against a cover note.</li>
<li>submitCAVote : Members who have tokens locked under Claims Assessment, can assess a claim, i.e., accept/deny a claim while  the locked tokens.</li>
<li>submitMemberVote: Submits a member vote for assessing a claim.</li>
</ul>
<img src="https://nexusmutual.io/img/readme/Claim.png" style="height: 300px;">

<h3><a id="Claim_Reward_Module_64"></a>Claim Reward Module</h3>
<p>Claims Reward Contract contains the methods for rewarding or punishing the Claim assessors/Members based on the vote cast and the final verdict.</p>
<h4><a id="Core_Contract_67"></a>Core Contract</h4>
<ul>
<li>claimsReward.sol</li>
</ul>
<h5><a id="Some_important_functions_73"></a>Some important functions</h5>
<ul>
<li>changeClaimStatus: Decides the next/final status of a claim. Decision is taken based on the current state and the votes cast.</li>
<li>rewardAgainstClaim: Rewards/Punishes users who participated in claims assessment. NXM tokens are allocated as a reward for assessors who voted with the consensus. NXM tokens are locked as a punishment for assessors who voted against the consensus.</li>
</ul>
<img src="https://nexusmutual.io/img/readme/ClaimsReward.png" style="height: 300px;">

<h3><a id="Pool_Module_78"></a>Pool Module</h3>
<p>Pool contracts contain all logic associated with calling External oracles through <a href="manages the entire claim lifecycle">Oraclize</a> and processing the results retrieved from the same. The module also encompasses on-chain investment asset management using <a href="https://0xproject.com/">0x-protocol</a>.</p>
<h4><a id="Core_Contract_81"></a>Core Contract</h4>
<ul>
<li>pool.sol</li>
<li>pool2.sol</li>
<li>poolData.sol</li>
</ul>
<blockquote>
<p>Note: The smart contracts of this module had to be split in multiple smart contracts to cater to the Ethereum Gas limits. The above mentioned contracts need to be seen in conjunction</p>
</blockquote>
<h5><a id="Some_important_functions_92"></a>Some important functions</h5>
<ul>
<li>closeProposalOraclise: Closes Proposal’s voting.</li>
<li>closeEmergencyPause: Close Emergency Pause.</li>
<li>closeCoverOraclise: Expires a cover.</li>
<li>versionOraclise: Updates the version of contracts.</li>
<li>MCROraclise: Initiates Minimum Capital Requirement (MCR) calculation.</li>
<li>closeClaimsOraclise: Closes Claim’s voting.</li>
</ul>
<h3><a id="MCR_Module_101"></a>MCR Module</h3>
<p>MCR contracts contain functions for recording the Minimum Capital Requirement (MCR) of the system, each day, thus determining the NXM token price.</p>
<h4><a id="Core_Contract_104"></a>Core Contract</h4>
<ul>
<li>mcr.sol</li>
<li>mcrData.sol</li>
</ul>
<h5><a id="Some_important_function_112"></a>Some important function</h5>
<ul>
<li>pushMCRData: Records details of (Minimum Capital Requirement)MCR for each day.<br>
calculateTokenPrice: Calculates the NXM Token Price of a currency.</li>
</ul>
<h3><a id="Governance_Module_117"></a>Governance Module:</h3>
<p>Governance contracts contain the logic for creating, editing, categorizing and voting on proposals followed by action implementation, code upgradability. These governance contracts are generated by using the <a href="https://govblocks.io/">GovBlocks Protocol</a>.</p>
