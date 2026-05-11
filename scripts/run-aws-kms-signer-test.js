const { ethers, nexus } = require('hardhat');

const main = async () => {
  const testMessage = 'I, hereby verify that I am the owner/creator of the address [0xcAFeAA466736ac01e0AC9Ca72644beF348694731]';

  // get signer and sign message
  console.log('Getting signer and signing message...');
  const signer = nexus.awsKms.getSigner(ethers.provider);
  const [signature, ethAddress] = await Promise.all([signer.signMessage(testMessage), signer.getAddress()]);
  console.log('Signature:', signature);
  console.log('ETH Address:', ethAddress);

  // recover address from signature
  console.log('Recovering address from signature...');
  const eip191Hash = ethers.hashMessage(testMessage);
  const recoveredAddress = ethers.recoverAddress(eip191Hash, signature);

  if (recoveredAddress !== ethAddress) {
    throw new Error(`Recovered address ${recoveredAddress} does not match signer address ${ethAddress}`);
  }

  console.log(`Recovered address matches signature address (${recoveredAddress})`);
};

main();
