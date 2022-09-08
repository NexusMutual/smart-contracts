const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;

describe('withdrawAsset', function () {
  it('transfers the specified amount of a given asset to the destination address', async function () {
    const { yieldTokenIncidents, ybDai } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const [nonMember] = this.accounts.nonMembers;

    ybDai.mint(yieldTokenIncidents.address, parseEther('1000'));

    await yieldTokenIncidents.connect(governance).withdrawAsset(ybDai.address, nonMember.address, parseEther('500'));
    const nonMemberBalance = await ybDai.balanceOf(nonMember.address);
    expect(nonMemberBalance).to.be.equal(parseEther('500'));

    const yieldTokenIncidentsBalance = await ybDai.balanceOf(yieldTokenIncidents.address);
    expect(yieldTokenIncidentsBalance).to.be.equal(parseEther('500'));
  });

  it('transfers the maximum available amount when it exceeds the contract balance', async function () {
    const { yieldTokenIncidents, ybDai } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const [nonMember] = this.accounts.nonMembers;

    ybDai.mint(yieldTokenIncidents.address, parseEther('10'));

    await expect(
      yieldTokenIncidents.connect(governance).withdrawAsset(ybDai.address, nonMember.address, parseEther('1000')),
    ).to.not.be.reverted;

    const nonMemberBalance = await ybDai.balanceOf(nonMember.address);
    expect(nonMemberBalance).to.be.equal(parseEther('10'));

    const yieldTokenIncidentsBalance = await ybDai.balanceOf(yieldTokenIncidents.address);
    expect(yieldTokenIncidentsBalance).to.be.equal(parseEther('0'));
  });
});
