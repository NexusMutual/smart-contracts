const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther, formatEther } = ethers.utils;

describe('withdrawAsset', function () {
  it('transfers the specified amount of a given asset to the destination address', async function () {
    const { incidents, ybDai } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const [nonMember] = this.accounts.nonMembers;

    ybDai.mint(incidents.address, parseEther('1000'));

    await incidents.connect(governance).withdrawAsset(ybDai.address, nonMember.address, parseEther('500'));
    const nonMemberBalance = await ybDai.balanceOf(nonMember.address);
    expect(nonMemberBalance).to.be.equal(parseEther('500'));

    const incidentsBalance = await ybDai.balanceOf(incidents.address);
    expect(incidentsBalance).to.be.equal(parseEther('500'));
  });

  it('transfers the maximum available amount when it exceeds the contract balance', async function () {
    const { incidents, ybDai } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const [nonMember] = this.accounts.nonMembers;

    ybDai.mint(incidents.address, parseEther('10'));

    await expect(incidents.connect(governance).withdrawAsset(ybDai.address, nonMember.address, parseEther('1000'))).to
      .not.be.reverted;

    const nonMemberBalance = await ybDai.balanceOf(nonMember.address);
    expect(nonMemberBalance).to.be.equal(parseEther('10'));

    const incidentsBalance = await ybDai.balanceOf(incidents.address);
    expect(incidentsBalance).to.be.equal(parseEther('0'));
  });
});
