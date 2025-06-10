const { ethers } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');
const { hashMessage, recoverAddress } = ethers;

const SIGNER_TYPE = {
  LOCAL: 'local',
  AWS_KMS: 'aws-kms',
};

const getSigner = async (kind = SIGNER_TYPE.LOCAL) => {
  if (kind === SIGNER_TYPE.LOCAL) {
    const [signer] = await ethers.getSigners();
    return signer;
  }

  const provider = ethers.provider;
  const { AWS_KMS_KEY_ID, AWS_REGION } = process.env;

  if (kind === SIGNER_TYPE.AWS_KMS) {
    return new AwsKmsSigner(AWS_KMS_KEY_ID, AWS_REGION, provider);
  }

  throw new Error(`Invalid signer type: ${kind}`);
};

module.exports = { SIGNER_TYPE, getSigner };

if (require.main === module) {
  (async () => {
    const testMessage = 'Hello, mutants!';

    // get signer and sign message
    const signer = await getSigner(SIGNER_TYPE.AWS_KMS);
    const [signature, ethAddress] = await Promise.all([signer.signMessage(testMessage), signer.getAddress()]);

    // recover address from signature
    const eip191Hash = hashMessage(testMessage);
    const recoveredAddress = recoverAddress(eip191Hash, signature);

    if (recoveredAddress !== ethAddress) {
      throw new Error(`Address mismatch: expected ${ethAddress}, got ${recoveredAddress}`);
    }

    console.log('Signature verification successful!');
  })().catch(console.error);
}