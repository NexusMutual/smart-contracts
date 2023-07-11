const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('getIncidentsCount', function () {
  it('returns the total number of incidents', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    {
      const count = await yieldTokenIncidents.getIncidentsCount();
      expect(count).to.be.equal(0);
    }

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const productId = 2;
    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), '');

    {
      const count = await yieldTokenIncidents.getIncidentsCount();
      expect(count).to.be.equal(1);
    }

    for (let i = 0; i < 6; i++) {
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), '');
    }

    {
      const count = await yieldTokenIncidents.getIncidentsCount();
      expect(count).to.be.equal(7);
    }
  });
});
