const { buildSchema } = require('graphql');
const {parse, schemaHeader} = require('../index');

describe('test schema to DDL', () => {
  test('simple schema', ()=>{
    const schema = buildSchema(`
type Persons {
    first_name: String!
    last_name: String!
    phone: String
    email: String
}`);

    const sql = parse(schema);
    const target = `
CREATE TABLE persons(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    first_name TEXT NOT NULL ,
    last_name TEXT NOT NULL ,
    phone TEXT ,
    email TEXT
);
CREATE TRIGGER persons_updated_at AFTER UPDATE ON persons WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE persons SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
`

    expect(sql).toBe(target);

  })

  test('default directive', ()=>{
    const schema = buildSchema(schemaHeader + `
type Blogs{
    name: String
    content: String
    handle: String
    title: String @default(value: "foo")
    description: String

    comments_enabled: Boolean! @default(value: true)
    moderated: Boolean! @default(value: true)
}`);

    const sql = parse(schema);
    const target = `
CREATE TABLE blogs(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    name TEXT ,
    content TEXT ,
    handle TEXT ,
    title TEXT DEFAULT "foo" ,
    description TEXT ,
    comments_enabled BOOLEAN DEFAULT TRUE NOT NULL ,
    moderated BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE TRIGGER blogs_updated_at AFTER UPDATE ON blogs WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE blogs SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
`
    expect(sql).toBe(target);
  })

  test('index directive', ()=>{
    const schema = buildSchema(schemaHeader + `
type Blogs{
    handle: String @index
}
`);

    const sql = parse(schema, false);
    const target = `
CREATE TABLE blogs(
    handle TEXT
);
CREATE INDEX idx_blogs_handle ON blogs (handle);
`
    expect(sql).toBe(target);
  })

  test('unique directive', ()=>{
    const schema = buildSchema(schemaHeader + `
type Blogs{
    handle: String @unique 
}
`);

    const sql = parse(schema, false);
    const target = `
CREATE TABLE blogs(
    handle TEXT UNIQUE
);
`
    expect(sql).toBe(target);
  })

  test('unique index directive', ()=>{
    const schema = buildSchema(schemaHeader + `
type Blogs{
    handle: String @unique @index 
}
`);

    const sql = parse(schema, false);
    const target = `
CREATE TABLE blogs(
    handle TEXT UNIQUE
);
CREATE UNIQUE INDEX idx_blogs_handle ON blogs (handle);
`
    expect(sql).toBe(target);
  })

  test('belongsTo', () => {
    const schema = buildSchema(schemaHeader + `
type Users{
    name: String
}

type Blogs{
    handle: String 
    belongsTo: Users
}
`);
    const sql = parse(schema);
    const target = `
CREATE TABLE users(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    name TEXT
);
CREATE TRIGGER users_updated_at AFTER UPDATE ON users WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;


CREATE TABLE blogs(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    handle TEXT ,
    user_id INTEGER NOT NULL ,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TRIGGER blogs_updated_at AFTER UPDATE ON blogs WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE blogs SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
`
    expect(sql).toBe(target);

  })
});