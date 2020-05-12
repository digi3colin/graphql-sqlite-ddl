const {uid} = require('../index');

describe('features', () => {
  test('uid', ()=>{
    const record = uid();
    expect(record).not.toBe(0);
  })
});