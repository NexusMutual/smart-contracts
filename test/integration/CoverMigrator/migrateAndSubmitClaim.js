const { ethers } = require('hardhat');
const { expect } = require('chai');
const { toBytes4 } = require('../utils').helpers;

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('migrateAndSubmitClaim', function () {
  it('should migrate cover from v1 to v2 and submit claim', async function () {
    const { qd, tk, cl: coverMigrator, coverNFT } = this.contracts;
    const coverOwner = this.accounts.members[1];

    const amountNXM = parseEther('10000');
    const period = 30;
    const amount = 100;
    const scAddress = '0x11111254369792b2Ca5d084aB5eEA397cA8fa48B';
    const premium = 0;
    const premiumNXM = 0;

    await tk.transfer(coverOwner.address, amountNXM);
    const v1CoverTx = await qd
      .connect(coverOwner)
      .addV1Cover(period, amount, coverOwner.address, toBytes4('ETH'), scAddress, premium, premiumNXM);

    const { events } = await v1CoverTx.wait();
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
