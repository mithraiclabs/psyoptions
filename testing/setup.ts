import TestHelper, { LOCALNET_URL } from "./testHelper";

declare global {
  var solanaTestHelper: TestHelper;
}

global.solanaTestHelper = new TestHelper();

beforeAll(async () => {
  solanaTestHelper.establishConnection(LOCALNET_URL);
  await solanaTestHelper.createAccounts();
  await solanaTestHelper.deployContracts();
  if (Object.keys(solanaTestHelper.programs).length === 0) {
    console.warn('No programs were deployed. Try building your program with `yarn build`');
  }
});
