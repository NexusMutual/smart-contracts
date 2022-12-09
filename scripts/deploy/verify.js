const path = require('path');
const { tenderly } = require('hardhat');

async function main() {
  console.log('Performing tenderly contract verifications');
  const contractPath = path.resolve('/tmp/contractList.json');
  const contractList = require(contractPath);

  for (const contract of contractList) {
    console.log('---------------------');
    const libraries = Object.entries(contract.libraries || {}).map(([name, address]) => ({ name, address }));
    console.log('Verifying: ', [...libraries, contract]);
    await tenderly.verify(...libraries, contract);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('An unexpected error encountered:', error);
      process.exit(1);
    });
}

module.exports = main;
