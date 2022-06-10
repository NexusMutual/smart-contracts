const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { submitProposal } = require('../utils').governance;
const { buyCover, coverToCoverDetailsArray } = require('../utils').buyCover;
const { getQuoteSignature } = require('../utils').getQuote;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { toBN } = web3.utils;

const MCR = artifacts.require('MCR');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const PooledStaking = artifacts.require('LegacyPooledStaking');
const NXMaster = artifacts.require('NXMaster');

const [owner, emergencyAdmin, unknown, member1, member2, member3, coverHolder] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
  asset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  type: 0,
};

describe('submitClaim', function () {
  it('submits claim and approves claim', async function () {

  });
});
