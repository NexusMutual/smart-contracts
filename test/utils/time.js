const { mineNextBlock, increaseTime: increaseTimeBy, setNextBlockTime } = require('./evm');

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const increaseTime = async timeIncrease => {
  await increaseTimeBy(timeIncrease);
  await mineNextBlock();
};

module.exports = {
  increaseTime,
  setTime,
};
