const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('CoverBroker - switchMembership', function () {
  it('should switch membership', async function () {
    const fixture = await loadFixture(setup);
    const { cover, mr, coverBroker } = fixture.contracts;
    const newCoverBroker = await ethers.deployContract('CoverBroker', [cover.address, mr.address]);

    await coverBroker.switchMembership(newCoverBroker.address);

    const check = await mr.isMember(newCoverBroker.address);
    expect(check).to.be.equal(true);
  });

  it('should fail to switch membership if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { cover, mr, coverBroker } = fixture.contracts;
    const { members } = fixture.accounts;
    const newCoverBroker = await ethers.deployContract('CoverBroker', [cover.address, mr.address]);

    await expect(coverBroker.connect(members[0]).switchMembership(newCoverBroker.address)).to.revertedWith(
      'Ownable: caller is not the owner',
    );
  });
});
