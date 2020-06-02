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

  test('default value with different types', ()=>{
        const schema = buildSchema(schemaHeader + `
type Foos{
    title: String @default(value: "foo")
    comments_enabled: Boolean! @default(value: true)
    auto_enabled: Boolean! @default(value: false)
    count: Int! @default(value: 0)
    price: Float! @default(value: 1.5)
}`);

        const sql = parse(schema, false);
        const target = `
CREATE TABLE foos(
    title TEXT DEFAULT "foo" ,
    comments_enabled BOOLEAN DEFAULT TRUE NOT NULL ,
    auto_enabled BOOLEAN DEFAULT FALSE NOT NULL ,
    count INTEGER DEFAULT 0 NOT NULL ,
    price REAL DEFAULT 1.5 NOT NULL
);
`
        expect(sql).toBe(target);
    })

  test('skip default fields', ()=>{
    const schema = buildSchema(schemaHeader + `
          type Students{
              id: Int
              created_at: Date
              updated_at: Date
              name: String!
          }
      `);

    const sql = parse(schema);
    expect(sql).toBe(
      `
CREATE TABLE students(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    name TEXT NOT NULL
);
CREATE TRIGGER students_updated_at AFTER UPDATE ON students WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE students SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
`
    )
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

  test('belongsTo with custom foreign key', () => {
    const schema = buildSchema(schemaHeader + `
type Users{
    name: String
}

type Blogs{
    handle: String 
    belongsTo: Users @foreignKey(value: "owner")
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
    owner INTEGER NOT NULL ,
    FOREIGN KEY (owner) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TRIGGER blogs_updated_at AFTER UPDATE ON blogs WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE blogs SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
`
    expect(sql).toBe(target);
  });

  test('associateTo', () => {
    const schema = buildSchema(schemaHeader + `
type Users{
    name: String
}

type Blogs{
    handle: String 
    associateTo: Users
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
    user_id INTEGER ,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TRIGGER blogs_updated_at AFTER UPDATE ON blogs WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE blogs SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
`
    expect(sql).toBe(target);
  })

  test('hasAndBelongsToMany', () => {
    const schema = buildSchema(schemaHeader + `
type Tags{
    name: String!
}

type Articles{
    content: String 
    hasAndBelongsToMany: Tags
}
`);
    const sql = parse(schema);
    const target = `
CREATE TABLE tags(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    name TEXT NOT NULL
);
CREATE TRIGGER tags_updated_at AFTER UPDATE ON tags WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE tags SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;


CREATE TABLE articles(
    id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL ,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL ,
    content TEXT
);
CREATE TRIGGER articles_updated_at AFTER UPDATE ON articles WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE articles SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
CREATE TABLE article_tags(
    article_id INTEGER NOT NULL ,
    tag_id INTEGER NOT NULL ,
    weight REAL ,
    FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE ,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);
`
    expect(sql).toBe(target);
  })

  test('primary key', ()=>{
    const schema = buildSchema(schemaHeader + `
type Persons {
    id: Int! @primary
    name: String
}`);

    const sql = parse(schema, false);
    const target = `
CREATE TABLE persons(
    id INTEGER NOT NULL ,
    PRIMARY KEY (id) ,
    name TEXT
);
`

    expect(sql).toBe(target);

  })

  test('auto increment', ()=>{
    const schema = buildSchema(schemaHeader + `
type Persons {
    id: Int! @primary @autoIncrement
    name: String
}`);

    const sql = parse(schema, false);
    const target = `
CREATE TABLE persons(
    id INTEGER NOT NULL AUTO_INCREMENT ,
    PRIMARY KEY (id) ,
    name TEXT
);
`

    expect(sql).toBe(target);
  });

  test('schema is singluar', ()=>{
    const schema = buildSchema(schemaHeader + `
type Person {
    id: Int! @primary @autoIncrement
    name: String
}`);

    const sql = parse(schema, false);
    const target = `
CREATE TABLE persons(
    id INTEGER NOT NULL AUTO_INCREMENT ,
    PRIMARY KEY (id) ,
    name TEXT
);
`

    expect(sql).toBe(target);
  })

  test('json type', () => {
    const schema = buildSchema(schemaHeader + `
type Person {
  meta: JSON
  name: String
}`)
    const sql = parse(schema, false);
    const target = `
CREATE TABLE persons(
    meta JSON ,
    name TEXT
);
`

    expect(sql).toBe(target);
  })

  test('belongsTo singular type name', () => {
    const schema = buildSchema(schemaHeader + `
type User{
    name: String
}

type Blog{
    handle: String 
    belongsTo: User
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