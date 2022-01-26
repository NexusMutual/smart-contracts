const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;

describe('getIncidentsCount', function () {
  it('returns the total number of incidents', async function () {
    const { incidents } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const count = await incidents.getIncidentsCount();
      expect(count).to.be.equal(0);
    }

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const productId = 2;
    await incidents
      .connect(advisoryBoard)
      .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), '');

    {
      const count = await incidents.getIncidentsCount();
      expect(count).to.be.equal(1);
    }

    for (let i = 0; i < 6; i++) {
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), '');
    }

    {
      const count = await incidents.getIncidentsCount();
      expect(count).to.be.equal(7);
    }
  });
});
