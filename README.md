# graphql-sqlite-ddl
parse graphQL type to SQLite DDL
```
const schema = buildSchema(`

type Persons {
    first_name: String!
    last_name: String!
    phone: String
    email: String
}

`);

const sql = parse(schema);

```

result will be
```
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
```

### Supported Directives
- default(value: "")
- unique
- index
- primary
- autoIncrement

### ORM
belongsTo, hasAndBelongsToMany
- foreignKey(value: """)

defines belongsTo, hasAndBelongsToMany relationship
```
type Users{
    name: String
}

type Blogs{
    handle: String
    belongsTo: Users
}
```

transform to SQL
```
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
```
