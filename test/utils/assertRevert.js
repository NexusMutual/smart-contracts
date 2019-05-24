async function assertRevert(promise) {
  try {
    await promise;
    throw null;
  } catch (error) {
    assert(error, `Expected an error but did not get one`);
    assert(
      error.message.includes('revert'),
      `Expected an error containing "revert" but got "${error.message}" instead`
    );
  }
}

module.exports = {
  assertRevert
};
