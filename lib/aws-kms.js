const { AwsKmsSigner } = require('@nexusmutual/ethers-v6-aws-kms-signer');

const getSigner = provider => {
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    kmsKeyId: process.env.AWS_KMS_KEY_ID,
    region: process.env.AWS_REGION,
  };
  return new AwsKmsSigner(credentials, provider);
};

module.exports = { getSigner };
