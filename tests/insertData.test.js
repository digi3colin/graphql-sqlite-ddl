const {insert} = require('../index');

describe('insert test data', () => {
  test('parse map to sql', ()=>{
    const data = require('./data');
    const sql = insert(data);
    expect(sql).toBe(
`INSERT INTO persons (id, first_name, last_name) VALUES ('1', 'Alice', 'Lee'),
('2', 'Bob', 'Chan');`);
  })


});