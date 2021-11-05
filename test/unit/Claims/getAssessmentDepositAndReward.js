const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther, formatEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('getAssessmentDepositAndReward', function () {
  it('returns a total reward no greater than config.maxRewardNXM', async function () {
    assert(false, '[todo]');
  });

  it('returns a deposit of at least a fraction of 1 ETH calculated using config.minAssessmentDepositRatio', async function () {
    assert(false, '[todo]');
  });
});
