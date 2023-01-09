const { ethers } = require('hardhat');
const { expect } = require('chai');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

function zeroPadRight(bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

describe('migrateAndSubmitClaim', function () {
  it('should migrate cover from v1 to v2 and submit claim', async function () {
    const { qd, tk, cl: coverMigrator, coverNFT } = this.contracts;
    const coverOwner = this.accounts.members[1];

    const ETH = zeroPadRight(Buffer.from('ETH'), 4);
    const amountNXM = parseEther('10000');
    const period = 30;
    const amount = 100;
    const scAddress = '0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633';
    const premium = 0;
    const premiumNXM = 0;

    await tk.transfer(coverOwner.address, amountNXM);
    const mockCoverTx = await qd
      .connect(coverOwner)
      .addCoverMock(period, amount, coverOwner.address, ETH, scAddress, premium, premiumNXM);

    const { events } = await mockCoverTx.wait();
    const coverDetailsEvent = events.filter(e => e.event === 'CoverDetailsEvent').pop();
    const v1CoverId = coverDetailsEvent.args.cid;

    const claimAmount = parseEther('100');
    const tx = await coverMigrator
      .connect(coverOwner)
      .migrateAndSubmitClaim(v1CoverId, 0, claimAmount, '', { value: parseEther('1') });

    const expectedV2CoverId = 0;
    await expect(tx).to.emit(coverNFT, 'Transfer').withArgs(AddressZero, coverOwner.address, expectedV2CoverId);
    await expect(tx).to.emit(coverMigrator, 'CoverMigrated').withArgs(v1CoverId, expectedV2CoverId, coverOwner.address);

    const newCoverOwner = await coverNFT.ownerOf(expectedV2CoverId);
    expect(newCoverOwner).to.be.equal(coverOwner.address);
  });
});
