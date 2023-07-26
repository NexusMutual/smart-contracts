const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('withdrawAsset', function () {
  it('transfers the specified amount of a given asset to the destination address', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, ybDai } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const [nonMember] = fixture.accounts.nonMembers;

    ybDai.mint(yieldTokenIncidents.address, parseEther('1000'));

    await yieldTokenIncidents.connect(governance).withdrawAsset(ybDai.address, nonMember.address, parseEther('500'));
    const nonMemberBalance = await ybDai.balanceOf(nonMember.address);
    expect(nonMemberBalance).to.be.equal(parseEther('500'));

    const yieldTokenIncidentsBalance = await ybDai.balanceOf(yieldTokenIncidents.address);
    expect(yieldTokenIncidentsBalance).to.be.equal(parseEther('500'));
  });

  it('transfers the maximum available amount when it exceeds the contract balance', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, ybDai } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const [nonMember] = fixture.accounts.nonMembers;

    ybDai.mint(yieldTokenIncidents.address, parseEther('10'));

    await expect(
      yieldTokenIncidents.connect(governance).withdrawAsset(ybDai.address, nonMember.address, parseEther('1000')),
    ).to.not.be.reverted;

    const nonMemberBalance = await ybDai.balanceOf(nonMember.address);
    expect(nonMemberBalance).to.be.equal(parseEther('10'));

    const yieldTokenIncidentsBalance = await ybDai.balanceOf(yieldTokenIncidents.address);
    expect(yieldTokenIncidentsBalance).to.be.equal(parseEther('0'));
  });

  it('should revert if caller is not governance', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, ybDai } = fixture.contracts;
    const [nonMember1, nonMember2] = fixture.accounts.nonMembers;

    ybDai.mint(yieldTokenIncidents.address, parseEther('10'));

    await expect(
      yieldTokenIncidents.connect(nonMember1).withdrawAsset(ybDai.address, nonMember2.address, parseEther('1000')),
    ).to.be.revertedWith('Caller is not authorized to govern');
  });
});
