const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Decimal = require('decimal.js');

const { PROVIDER_URL } = process.env;
const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const getContractFactory = async providerOrSigner => {
  const data = await fetch(VERSION_DATA_URL).then(r => r.json());
  const abis = data.mainnet.abis
    .map(item => ({ ...item, abi: JSON.parse(item.contractAbi) }))
    .reduce((data, item) => ({ ...data, [item.code]: item }), {});

  return async code => {
    const { abi, address } = abis[code];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

const ROLE_MEMBER = 2;

async function getWithdrawableCoverNotes(i, qt, mr) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

  if (!active) {
    return { member, withdrawableAmount: '0' };
  }

  const withdrawableAmount = await qt.getWithdrawableCoverNotesAmount(member);
  return {
    withdrawableAmount: withdrawableAmount.toString(),
    member,
  };
}

async function main(provider) {
  const factory = await getContractFactory(provider);
  const ps = await factory('PS');

  const ftx = '0xC57d000000000000000000000000000000000011';

  const totalStake = await ps.contractStake(ftx);

  console.log({
    totalStake: totalStake.toString(),
  });

  console.log('Fetching ftx stakes...');

  const stakers = await ps.contractStakersArray(ftx);
  console.log({
    stakers,
  });

  const allStakes = {};

  let stakeSummedUp = Decimal(0);
  for (const staker of stakers) {
    const ftxStake = await ps.stakerContractStake(staker, ftx);

    const decimalStake = Decimal(ftxStake.toString());
    allStakes[staker] = decimalStake.div(1e18).toString();
    stakeSummedUp = stakeSummedUp.add(decimalStake);
  }

  console.log({
    stakeSummedUp,
  });

  console.log(allStakes);
}

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  main(provider)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
