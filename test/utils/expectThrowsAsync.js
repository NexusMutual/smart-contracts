const { expect } = require('chai');

const expectThrowsAsync = async (method, errorReason) => {
  let error = null;
  try {
    await method();
  } catch (err) {
    error = err;
  }
  expect(error).to.be.an('Error');
  if (errorReason) {
    expect(error.reason).to.equal(errorReason);
  }
};

module.exports = {
  expectThrowsAsync,
};
