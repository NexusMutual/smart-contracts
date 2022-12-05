const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getCoverSegment } = require('../../unit/IndividualClaims/helpers');

const { parseEther } = ethers.utils;

function zeroPadRight(bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

describe('migrateAndSubmitClaim', function () {
  let coverOwner;
  let coverId;
  before(async function () {
    const { qd, tk: token } = this.contracts;
    coverOwner = this.accounts.members[1];

    const ETH = zeroPadRight(Buffer.from('ETH'), 4);
    const amountNXM = parseEther('10000');
    const period = 30;
    const amount = 100;
    const scAddress = '0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633';
    const premium = 0;
    const premiumNXM = 0;

    await token.connect(this.accounts.defaultSender).transfer(coverOwner.address, amountNXM);

    const tx = await qd
      .connect(coverOwner)
      .addCoverMock(period, amount, coverOwner.address, ETH, scAddress, premium, premiumNXM);
    const res = await tx.wait();
    const cover = res.events.filter(({ event }) => event === 'CoverDetailsEvent').pop();
    coverId = cover.args.cid;
  });

  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('should migrate cover from v1 to v2 and submit claim', async function () {
    const { coverNFT, cover } = this.contracts;
    const segment = await getCoverSegment();

    const tx = await cover.connect(coverOwner).migrateAndSubmitClaim(coverId, 0, segment.amount, '', {
      value: parseEther('1'),
    });
    expect(tx).to.emit(coverNFT, 'Transfer');
    expect(tx).to.emit(cover, 'CoverMigrated');

    const eventFilterTransfer = coverNFT.filters.Transfer();
    const {
      args: [, to, newCoverId],
    } = (await coverNFT.queryFilter(eventFilterTransfer)).pop();
    expect(to).to.be.equal(coverOwner.address);

    const newCoverOwner = await coverNFT.ownerOf(newCoverId);
    expect(newCoverOwner).to.be.equal(coverOwner.address);
  });
});
