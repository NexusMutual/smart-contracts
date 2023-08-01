const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

const uintParams = {
  targetLiquidity: 0,
  twapDuration: 1,
  aggressiveLiqSpeed: 2,
  oracleBuffer: 3,
};

describe('updateUintParameters', function () {
  it('should revert to update the config parameters if it is not done by governance', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const newTargetLiquidity = parseEther('3000');
    const newAggressiveLiqSpeed = parseEther('250');

    await expect(
      ramm
        .connect(member)
        .updateUintParameters(
          [uintParams.targetLiquidity, uintParams.aggressiveLiqSpeed],
          [newTargetLiquidity, newAggressiveLiqSpeed],
        ),
    ).to.be.revertedWith('Caller is not authorized to govern');
  });

  it('should update the config parameters', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const {
      governanceContracts: [governance],
    } = fixture.accounts;

    const newTargetLiquidity = parseEther('3000');
    const newAggressiveLiqSpeed = parseEther('250');

    await ramm
      .connect(governance)
      .updateUintParameters(
        [uintParams.targetLiquidity, uintParams.aggressiveLiqSpeed],
        [newTargetLiquidity, newAggressiveLiqSpeed],
      );

    const { targetLiquidity, aggressiveLiqSpeed } = await ramm.config();

    expect(targetLiquidity).to.be.equal(newTargetLiquidity);
    expect(aggressiveLiqSpeed).to.be.equal(newAggressiveLiqSpeed);
  });
});
