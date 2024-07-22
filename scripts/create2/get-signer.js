const { ethers } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');

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
    const eip191Hash = ethers.utils.hashMessage(testMessage);
    const recoveredAddress = ethers.utils.recoverAddress(eip191Hash, signature);

    if (recoveredAddress !== ethAddress) {
      throw new Error(`Recovered address ${recoveredAddress} does not match signer address ${ethAddress}`);
    }

    console.log(`Recovered address matches signature address (${recoveredAddress})`);
    process.exit();
  })().catch(console.error);
}
