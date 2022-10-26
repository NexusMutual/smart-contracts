const { ethers } = require('hardhat');
const { expect } = require('chai');
const { arrayify } = ethers.utils;

describe('submitFraud', function () {
  it('can only be called by governance contract', async function () {
    const { assessment } = this.contracts;
    const [user] = this.accounts.members;
    const [governance] = this.accounts.governanceContracts;
    const merkleTreeRootMock = arrayify('0x1111111111111111111111111111111111111111111111111111111111111111');
    await expect(assessment.connect(user).submitFraud(merkleTreeRootMock)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(assessment.connect(governance).submitFraud(merkleTreeRootMock)).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('should store the merkle tree root', async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const merkleTreeRoot = '0x1111111111111111111111111111111111111111111111111111111111111111';

    await assessment.connect(governance).submitFraud(arrayify(merkleTreeRoot));

    expect(await assessment.fraudResolution(0)).to.be.equal(merkleTreeRoot);
  });

  it('should emit the event FraudSubmitted', async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const merkleTreeRoot = '0x1111111111111111111111111111111111111111111111111111111111111111';

    await expect(assessment.connect(governance).submitFraud(arrayify(merkleTreeRoot)))
      .to.emit(assessment, 'FraudSubmitted')
      .withArgs(merkleTreeRoot);
  });

  it("should allow adding another root even if the existing fraud tree hasn't been processed", async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const merkleTreeRoot1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const merkleTreeRoot2 = '0x1111111111111111111111111111111111111111111111111111111111111112';

    await assessment.connect(governance).submitFraud(arrayify(merkleTreeRoot1));
    await assessment.connect(governance).submitFraud(arrayify(merkleTreeRoot2));

    expect(await assessment.fraudResolution(0)).to.be.equal(merkleTreeRoot1);
    expect(await assessment.fraudResolution(1)).to.be.equal(merkleTreeRoot2);
  });
});
