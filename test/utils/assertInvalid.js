async function assertInvalid(promise) {
    try {
      await promise;
      throw null;
    } catch (error) {
      assert(error, `Expected an error but did not get one`);
      assert(
        error.message.includes('invalid') || error.message.includes('INVALID'),
        `Expected an error containing "invalid" but got "${error.message}" instead`
      );
    }
  }
  
  module.exports = {
    assertInvalid
  };
  